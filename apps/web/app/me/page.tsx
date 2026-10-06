'use client';

import { useCallback, useEffect, useState } from 'react';
import { CHANNELS, type Channel } from '@bms/shared';
import { ApiError, api, type Notification } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Shell } from '@/components/shell';
import { InstallCard } from '@/components/install-card';
import { Banner, Button, Card, Field, PageHeader, inputClass } from '@/components/ui';
import { formatPhone } from '@/lib/phone';
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

// In-app is always on (it's the Messages list below), so there's no switch for it.
const SHOWN = CHANNELS.filter((c) => c !== 'inApp');
// Texts wait on the toll-free registration; the switch stays visible but can't be used yet.
const COMING_SOON: readonly Channel[] = ['sms'];

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
  const isTeacher = me.role === 'TEACHER';
  const isAdmin = me.role === 'ADMIN';
  // An admin is often not a parent; reminders only matter if they have children here.
  const getsReminders = !isTeacher && (!isAdmin || me.children.length > 0);

  return (
    <Shell>
      <PageHeader title="You" subtitle={[`${me.firstName} ${me.lastName}`, me.phone && formatPhone(me.phone)].filter(Boolean).join(' · ')} />

      {isAdmin && <AdminDetails me={me} onSaved={reload} />}

      {/* A teacher signs in with what the office set, and gets no reminders. */}
      {getsReminders && (
      <Card className="mb-4">
        <h2 className="font-semibold text-ink">Email &amp; reminders</h2>
        <p className="mt-1 text-sm text-muted">
          We&apos;ll remind you 2 days before your snack day, and at the start of the month if you haven&apos;t picked one.
        </p>

        <ul className="mt-4 divide-y divide-line">
          {SHOWN.map((channel) => (
            <li key={channel} className="py-3">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium text-ink">
                    {CHANNEL_COPY[channel].label}
                    {COMING_SOON.includes(channel) && (
                      <span className="rounded-full bg-sage-soft px-2 py-0.5 text-[11px] font-semibold text-sage-dark">Coming soon</span>
                    )}
                  </p>
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
                  disabled={saving || COMING_SOON.includes(channel)}
                  onChange={(v) => void toggle(channel, v)}
                />
              </div>
              {/* The address sits with its switch; sign-in codes use it too, so it shows even when email is off. */}
              {channel === 'email' && !isAdmin && (
                <div className="mt-3">
                  <Field label="Email address" hint="Your sign-in code is sent here.">
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
              )}
            </li>
          ))}
        </ul>

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
      )}

      <InstallCard />

      {isTeacher ? (
        <Card className="mt-4">
          <h2 className="font-semibold text-ink">Your {me.teaches && me.teaches.length > 1 ? 'classrooms' : 'classroom'}</h2>
          <ul className="mt-3 space-y-1.5">
            {(me.teaches ?? []).map((id) => (
              <li key={id} className="text-sm text-ink">{me.classroomNames[id]}</li>
            ))}
            {!me.teaches?.length && <li className="text-sm text-muted">None yet — ask the office to add yours.</li>}
          </ul>
          <p className="mt-3 text-xs text-muted">You can see your class and add to its curriculum. The office makes any other changes.</p>
        </Card>
      ) : getsReminders && (
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
      )}

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

/**
 * An admin keeps their own details current: what they sign in with, and how
 * the school reaches them. Parents' and teachers' are changed by the office.
 */
function AdminDetails({ me, onSaved }: {
  me: NonNullable<ReturnType<typeof useSession>['me']>;
  onSaved: () => Promise<void>;
}) {
  const [d, setD] = useState({
    firstName: me.firstName, lastName: me.lastName, phone: me.phone ? formatPhone(me.phone) : '', email: me.email ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const set = (patch: Partial<typeof d>) => { setD((v) => ({ ...v, ...patch })); setStatus(null); };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.patch('/api/me/contact', d);
      await onSaved();
      setStatus({ tone: 'success', text: 'Saved. Sign in with this mobile number or email from now on.' });
    } catch (err) {
      setStatus({ tone: 'error', text: err instanceof ApiError ? err.message : 'Could not save.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-4">
      <h2 className="font-semibold text-ink">Your details</h2>
      <p className="mt-1 text-sm text-muted">You sign in with your mobile number or email. Your sign-in code is sent by email.</p>
      <form onSubmit={save} className="mt-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name">
            <input className={inputClass} value={d.firstName} onChange={(e) => set({ firstName: e.target.value })} required />
          </Field>
          <Field label="Last name">
            <input className={inputClass} value={d.lastName} onChange={(e) => set({ lastName: e.target.value })} />
          </Field>
        </div>
        <Field label="Mobile number">
          <input className={inputClass} type="tel" inputMode="tel" autoComplete="tel" placeholder="(617) 555-0123"
            value={d.phone} onChange={(e) => set({ phone: e.target.value })} />
        </Field>
        <Field label="Email">
          <input className={inputClass} type="email" autoComplete="email" placeholder="you@example.com"
            value={d.email} onChange={(e) => set({ email: e.target.value })} />
        </Field>
        {status && <Banner tone={status.tone}>{status.text}</Banner>}
        <Button type="submit" loading={busy}>Save</Button>
      </form>
    </Card>
  );
}
