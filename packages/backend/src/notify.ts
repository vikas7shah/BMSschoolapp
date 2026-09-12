import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { ulid } from 'ulid';
import webpush from 'web-push';
import type { Channel, ComposedMessage, DeliveryResult, NotificationRecord, User } from '@bms/shared';
import { env } from './env.js';
import { getSecretJson } from './secrets.js';
import { getAppUrl } from './appUrl.js';
import {
  claimDedupeKey, deletePushSubscription, listPushSubscriptions, putNotification,
} from './repo.js';

const sns = new SNSClient({});
const ses = new SESv2Client({});

let vapidReady: Promise<{ publicKey: string; privateKey: string } | null> | null = null;

async function ensureVapid() {
  if (!env.vapidSecretArn) return null;
  vapidReady ??= (async () => {
    try {
      const keys = await getSecretJson<{ publicKey: string; privateKey: string }>(env.vapidSecretArn);
      webpush.setVapidDetails(
        (await getAppUrl()) || 'https://example.invalid',
        keys.publicKey,
        keys.privateKey,
      );
      return keys;
    } catch (err) {
      console.error('VAPID keys unavailable; web push disabled', err);
      return null;
    }
  })();
  return vapidReady;
}

export async function getVapidPublicKey(): Promise<string | null> {
  return (await ensureVapid())?.publicKey ?? null;
}

async function absolute(link: string | undefined): Promise<string> {
  const base = await getAppUrl();
  if (!link) return base;
  return link.startsWith('http') ? link : `${base}${link}`;
}

/* ------------------------------------------------------------------ senders */

async function sendSms(user: User, msg: ComposedMessage): Promise<DeliveryResult> {
  try {
    // Links are appended here rather than in the template so the URL is always current.
    const body = msg.sms.endsWith(': ') ? `${msg.sms}${await absolute(msg.link)}` : msg.sms;
    await sns.send(new PublishCommand({
      PhoneNumber: user.phone,
      Message: body,
      MessageAttributes: {
        'AWS.SNS.SMS.SMSType': { DataType: 'String', StringValue: 'Transactional' },
        ...(env.smsSenderId
          ? { 'AWS.SNS.SMS.SenderID': { DataType: 'String', StringValue: env.smsSenderId } }
          : {}),
      },
    }));
    return 'SENT';
  } catch (err) {
    // In the SNS sandbox this fails for any unverified number — log loudly but
    // never let one channel's failure block the others.
    console.error(`SMS failed for ${user.userId}`, err);
    return 'FAILED';
  }
}

async function sendEmail(user: User, msg: ComposedMessage): Promise<DeliveryResult> {
  if (!user.email || !env.fromEmail) return 'SKIPPED';
  try {
    const link = await absolute(msg.link);
    const base = await getAppUrl();
    await ses.send(new SendEmailCommand({
      FromEmailAddress: env.schoolName ? `${env.schoolName} <${env.fromEmail}>` : env.fromEmail,
      ...(env.sesConfigSet ? { ConfigurationSetName: env.sesConfigSet } : {}),
      Destination: { ToAddresses: [user.email] },
      Content: {
        Simple: {
          Subject: { Data: msg.emailSubject, Charset: 'UTF-8' },
          Body: {
            Text: { Data: `${expand(msg.emailText, base)}\n\n${link}`, Charset: 'UTF-8' },
            Html: { Data: emailHtml({ ...msg, emailText: expand(msg.emailText, base) }, link), Charset: 'UTF-8' },
          },
        },
      },
    }));
    return 'SENT';
  } catch (err) {
    console.error(`Email failed for ${user.userId}`, err);
    return 'FAILED';
  }
}

/** Message templates carry {{APP}} because the URL is only known at send time. */
function expand(text: string, base: string): string {
  return text.replaceAll('{{APP}}', base);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

function emailHtml(msg: ComposedMessage, link: string): string {
  const paragraphs = msg.emailText
    .split('\n\n')
    .map((p) => `<p style="margin:0 0 16px;line-height:1.6">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
  return `<!doctype html><html><body style="margin:0;background:#f6f5f2;padding:24px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#2c2a26">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:32px">
<h1 style="margin:0 0 20px;font-size:20px">${escapeHtml(msg.title)}</h1>
${paragraphs}
<p style="margin:28px 0 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#3f6f52;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600">Open the app</a></p>
</div></body></html>`;
}

async function sendPush(user: User, msg: ComposedMessage): Promise<DeliveryResult> {
  const keys = await ensureVapid();
  if (!keys) return 'SKIPPED';

  const subs = await listPushSubscriptions(user.userId);
  if (!subs.length) return 'SKIPPED';

  const payload = JSON.stringify({
    title: msg.title, body: msg.body, url: await absolute(msg.link), tag: msg.type,
  });

  const results = await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
      );
      return true;
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      // 404/410 mean the browser dropped the subscription — clean it up.
      if (code === 404 || code === 410) await deletePushSubscription(s.userId, s.endpointId);
      else console.error(`Push failed for ${user.userId}`, err);
      return false;
    }
  }));

  return results.some(Boolean) ? 'SENT' : 'FAILED';
}

/* ------------------------------------------------------------------ dispatch */

export interface DeliverOptions {
  /** Skip the dedupe check — used for confirmations the parent just triggered. */
  force?: boolean;
  /** Ignore stored preferences (never used for marketing-style nudges). */
  channelsOverride?: Channel[];
}

/**
 * Delivers one message to one parent across every channel they've opted into.
 * Returns null when the message was suppressed as a duplicate.
 */
export async function deliver(
  user: User,
  msg: ComposedMessage,
  opts: DeliverOptions = {},
): Promise<NotificationRecord | null> {
  if (user.status === 'DISABLED') return null;

  if (!opts.force) {
    const first = await claimDedupeKey(msg.dedupeKey);
    if (!first) return null;
  }

  const enabled: Channel[] = opts.channelsOverride
    ?? (['sms', 'email', 'push'] as Channel[]).filter((c) => user.prefs[c]);

  const channelResults: Partial<Record<Channel, DeliveryResult>> = {};
  await Promise.all(enabled.map(async (channel) => {
    if (channel === 'sms') channelResults.sms = await sendSms(user, msg);
    else if (channel === 'email') channelResults.email = await sendEmail(user, msg);
    else if (channel === 'push') channelResults.push = await sendPush(user, msg);
  }));

  // The in-app inbox is always written: it is the audit trail and the fallback
  // for a parent whose SMS bounced.
  const record: NotificationRecord = {
    userId: user.userId,
    notificationId: ulid(),
    type: msg.type,
    title: msg.title,
    body: msg.body,
    link: msg.link,
    createdAt: new Date().toISOString(),
    channelResults: { ...channelResults, inApp: 'SENT' },
  };
  await putNotification(record);
  return record;
}
