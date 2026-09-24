'use client';

import { useCallback, useEffect, useState } from 'react';
import { CHANNELS, type Channel } from '@bms/shared';
import { ApiError, api, type Notification } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Shell } from '@/components/shell';
import { InstallCard } from '@/components/install-card';
import { Banner, Button, Card, Field, PageHeader, inputClass } from '@/components/ui';
import { disablePush, enablePush, needsHomeScreenInstall, pushSupported } from '@/lib/push';

const CHANNEL_COPY: Record<Channel, { label: string; hint: string }> = {
  sms: {
    label: 'Text message',
    // This wording is the consent the carrier registration describes.
    // Carrier-reviewed consent wording: names SMS, what the texts are, and
    // how often. Change it and the toll-free registration must be updated.
    hint: 'Snack-day reminders and sign-in codes from Burlington Montessori School. About 2–4 texts a month. '
      + 'Msg & data rates may apply. Reply STOP to cancel, HELP for help.',
  },
  email: { label: 'Email', hint: 'A copy in your inbox.' },
  push: { label: 'Push notification', hint: 'Alerts on this device.' },
  inApp: { label: 'In the app', hint: 'Always kept — this is your message history.' },
};

export default function MePage() {
  const { me, reload } = useSession();
  const [prefs, setPrefs] = useState<Record<Channel, boolean> | null>(null);
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState<Notification[]>([]);
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (me) { setPrefs(me.prefs); setEmail(me.email ?? ''); }
  }, [me]);

  const loadNotes = useCallback(async () => {
    const r = await api.get<{ notifications: Notification[] }>('/api/notifications');
    setNotes(r.notifications);
    // Opening this page is the parent reading them.
    await Promise.all(
      r.notifications.filter((n) => !n.readAt).map((n) => api.post('/api/notifications/read', { sk: n.sk })),
    ).catch(() => undefined);
  }, []);

  useEffect(() => { void loadNotes().catch(() => undefined); }, [loadNotes]);

  async function toggle(channel: Channel, value: boolean) {
    if (!prefs) return;
    setStatus(null);

    // Push needs a browser permission prompt before the preference means anything.
    if (channel === 'push') {
      try {
        setSaving(true);
        if (value) await enablePush(); else await disablePush();
        setPrefs({ ...prefs, push: value });
        setStatus({ tone: 'success', text: value ? 'Push notifications are on.' : 'Push notifications are off.' });
        await reload();
      } catch (err) {
        setStatus({ tone: 'error', text: err instanceof Error ? err.message : 'Could not change that.' });
      } finally { setSaving(false); }
      return;
    }

    const next = { ...prefs, [channel]: value };
    setPrefs(next);
    await save(next, email);
  }

  async function save(next: Record<Channel, boolean>, nextEmail: string) {
    setSaving(true);
    setStatus(null);
    try {
      await api.patch('/api/me/prefs', { prefs: next, email: nextEmail });
      setStatus({ tone: 'success', text: 'Saved.' });
      await reload();
    } catch (err) {
      setStatus({ tone: 'error', text: err instanceof ApiError ? err.message : 'Could not save.' });
      if (me) setPrefs(me.prefs);
    } finally { setSaving(false); }
  }

  if (!me || !prefs) return <Shell><div /></Shell>;

  return (
    <Shell>
      <PageHeader title="You" subtitle={`${me.firstName} ${me.lastName} · ${me.phone}`} />

      <Card>
        <h2 className="font-semibold text-ink">Email &amp; reminders</h2>
        <p className="mt-1 text-sm text-muted">
          We&apos;ll tell you the day before your snack day, and when days still need a family.
        </p>

        <ul className="mt-4 divide-y divide-line">
          {CHANNELS.map((channel) => (
            <li key={channel} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{CHANNEL_COPY[channel].label}</p>
                <p className="text-xs text-muted">
                  {CHANNEL_COPY[channel].hint}
                  {channel === 'sms' && (
                    <> <a href="/sms-terms/" className="underline underline-offset-2">Terms</a> · <a href="/privacy/" className="underline underline-offset-2">Privacy</a></>
                  )}
                </p>
              </div>
              <Toggle
                label={CHANNEL_COPY[channel].label}
                checked={prefs[channel]}
                disabled={saving || channel === 'inApp'}
                onChange={(v) => void toggle(channel, v)}
              />
            </li>
          ))}
        </ul>

        <div className="mt-4">
          <Field
            label="Your email address"
            hint="Your sign-in code is sent here. Make sure it is yours and not a partner's."
          >
            <input
              className={inputClass}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => void save(prefs, email)}
              placeholder="you@example.com"
            />
          </Field>
        </div>

        {!pushSupported() && (
          <p className="mt-4 text-xs text-muted">
            Push notifications aren&apos;t available in this browser.
          </p>
        )}
        {pushSupported() && needsHomeScreenInstall() && !prefs.push && (
          <div className="mt-4">
            <Banner tone="warn">
              To get push notifications on iPhone, tap Share then &ldquo;Add to Home Screen&rdquo;,
              and open the app from there.
            </Banner>
          </div>
        )}
        {status && <div className="mt-4"><Banner tone={status.tone}>{status.text}</Banner></div>}
      </Card>

      <div className="mt-4"><InstallCard /></div>

      <Card className="mt-4">
        <h2 className="font-semibold text-ink">Your children</h2>
        <ul className="mt-3 space-y-1.5">
          {me.children.length === 0 && (
            <li className="text-sm text-muted">
              No children on file yet — ask the office to add them.
            </li>
          )}
          {me.children.map((c) => (
            <li key={c.childId} className="text-sm text-ink">{c.firstName} {c.lastName}</li>
          ))}
        </ul>
      </Card>

      <section className="mt-4">
        <h2 className="mb-3 px-1 font-semibold text-ink">Messages</h2>
        {notes.length === 0 ? (
          <Card><p className="text-sm text-muted">Nothing yet.</p></Card>
        ) : (
          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.notificationId} className="rounded-2xl border border-line bg-surface p-4">
                <p className="text-sm font-medium text-ink">{n.title}</p>
                <p className="mt-1 text-sm text-muted">{n.body}</p>
                <p className="mt-2 text-xs text-muted/70">
                  {new Date(n.createdAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

    </Shell>
  );
}

function Toggle({ label, checked, disabled, onChange }: {
  label: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors
                  focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage
                  disabled:opacity-40 ${checked ? 'bg-sage' : 'bg-line'}`}
    >
      <span
        className={`absolute left-0 top-0.5 size-6 rounded-full bg-white shadow transition-transform
                    ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`}
      />
    </button>
  );
}
