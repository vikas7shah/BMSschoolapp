import { randomInt } from 'node:crypto';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import type { CreateAuthChallengeTriggerHandler } from 'aws-lambda';

const sns = new SNSClient({});
const ses = new SESv2Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const LOGIN_CHANNEL_TABLE = process.env.TABLE_LOGIN_CHANNEL || '';

const SCHOOL_NAME = process.env.SCHOOL_NAME || 'Your school';
const SENDER_ID = process.env.SMS_SENDER_ID || '';
const FROM_EMAIL = process.env.FROM_EMAIL || '';
const SES_CONFIG_SET = process.env.SES_CONFIG_SET || '';
export const handler: CreateAuthChallengeTriggerHandler = async (event) => {
  if (event.request.challengeName !== 'CUSTOM_CHALLENGE') return event;

  const prior = event.request.session ?? [];
  // Re-use the code across retries so a mistyped digit doesn't cost another send.
  const previous = prior.length
    ? (prior[prior.length - 1]?.challengeMetadata ?? '').replace('CODE-', '')
    : '';

  const code = /^\d{6}$/.test(previous)
    ? previous
    : String(randomInt(0, 1_000_000)).padStart(6, '0');

  if (!previous) {
    // Cognito passes ClientMetadata to this trigger only on
    // RespondToAuthChallenge, never on the InitiateAuth that creates the
    // challenge — so the API leaves the destination in DynamoDB instead. It is
    // resolved server-side from the roster, never from anything the browser sent.
    const hint = await readLoginChannel(event.userName);
    const channel = hint?.channel === 'EMAIL' ? 'EMAIL' : 'SMS';
    const to = hint?.to || event.request.userAttributes.phone_number || '';
    const name = hint?.name || 'there';

    if (to) {
      try {
        if (channel === 'EMAIL') await sendEmail(to, name, code);
        else await sendSms(to, code);
      } catch (err) {
        // Log loudly but let the challenge stand: the code is still retrievable
        // from CloudWatch during setup, and failing here would lock everyone out.
        console.error(`Failed to send sign-in code by ${channel}`, err);
      }
    }
    // Visible only in CloudWatch, which requires AWS credentials to read.
    console.log(`Sign-in code issued for ${event.userName} via ${channel}: ${code}`);
  }

  event.response.publicChallengeParameters = {};
  event.response.privateChallengeParameters = { secretCode: code };
  event.response.challengeMetadata = `CODE-${code}`;
  return event;
};

interface LoginChannel { channel: 'SMS' | 'EMAIL'; to: string; name: string }

async function readLoginChannel(username: string): Promise<LoginChannel | null> {
  if (!LOGIN_CHANNEL_TABLE) return null;
  try {
    const r = await ddb.send(new GetCommand({
      TableName: LOGIN_CHANNEL_TABLE, Key: { username },
    }));
    return (r.Item as LoginChannel) ?? null;
  } catch (err) {
    // Fall back to SMS rather than blocking sign-in entirely.
    console.error('Could not read login channel', err);
    return null;
  }
}

async function sendSms(phone: string, code: string): Promise<void> {
  await sns.send(new PublishCommand({
    PhoneNumber: phone,
    Message: `${code} is your ${SCHOOL_NAME} sign-in code. It expires in 5 minutes.`,
    MessageAttributes: {
      'AWS.SNS.SMS.SMSType': { DataType: 'String', StringValue: 'Transactional' },
      ...(SENDER_ID
        ? { 'AWS.SNS.SMS.SenderID': { DataType: 'String', StringValue: SENDER_ID } }
        : {}),
    },
  }));
}

async function sendEmail(to: string, name: string, code: string): Promise<void> {
  if (!FROM_EMAIL) throw new Error('FROM_EMAIL is not configured');

  await ses.send(new SendEmailCommand({
    // A display name helps mail clients file this under the school rather
    // than an unknown address.
    FromEmailAddress: `${SCHOOL_NAME} <${FROM_EMAIL}>`,
    ...(SES_CONFIG_SET ? { ConfigurationSetName: SES_CONFIG_SET } : {}),
    Destination: { ToAddresses: [to] },
    Content: {
      Simple: {
        Subject: { Data: `${SCHOOL_NAME} sign-in code: ${code}`, Charset: 'UTF-8' },
        Body: {
          Text: {
            Data: `Hi ${name},\n\nYour ${SCHOOL_NAME} sign-in code is ${code}.\n\n`
              + 'It expires in 5 minutes. If you did not ask to sign in, you can '
              + 'ignore this email — nobody can use the code without it.\n',
            Charset: 'UTF-8',
          },
          Html: { Data: codeEmailHtml(name, code), Charset: 'UTF-8' },
        },
      },
    },
  }));
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

function codeEmailHtml(name: string, code: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f6f5f2;padding:24px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#2c2a26">
<div style="max-width:440px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;text-align:center">
<p style="margin:0 0 8px;font-size:14px;color:#6f6a61">Hi ${escapeHtml(name)},</p>
<h1 style="margin:0 0 20px;font-size:18px;font-weight:600">Your ${escapeHtml(SCHOOL_NAME)} sign-in code</h1>
<p style="margin:0 0 20px;font-size:38px;font-weight:700;letter-spacing:10px;color:#3f6f52">${escapeHtml(code)}</p>
<p style="margin:0;font-size:13px;line-height:1.6;color:#6f6a61">It expires in 5 minutes. If you didn&#39;t ask to sign in, you can ignore this email — the code is useless on its own.</p>
</div></body></html>`;
}
