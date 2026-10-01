'use client';

import { useCallback, useEffect, useState } from 'react';
import { addDays, formatLong, todayIn } from '@bms/shared';
import { ApiError, api, type Alert } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Shell } from '@/components/shell';
import { ALERT_KINDS, AlertCard } from '@/components/alert-card';
import { Banner, Button, Card, EmptyState, PageHeader, Skeleton, inputClass } from '@/components/ui';

type Kind = Alert['kind'];

/** Each kind starts from words for tomorrow; the sender edits before sending. */
function template(kind: Kind): { title: string; message: string } {
  const tomorrow = formatLong(addDays(todayIn('America/New_York'), 1));
  switch (kind) {
    case 'CLOSURE': return {
      title: 'School closed tomorrow — snow day',
      message: `School is closed tomorrow, ${tomorrow}, because of snow. Stay safe and warm!`,
    };
    case 'EARLY_DISMISSAL': return {
      title: 'Half day tomorrow',
      message: `Tomorrow, ${tomorrow}, is a half day. Please pick up your child at 12:00 pm.`,
    };
    case 'REMINDER': return { title: 'Reminder for tomorrow', message: `A reminder for tomorrow, ${tomorrow}: ` };
    default: return { title: '', message: '' };
  }
}

/**
 * Alerts from the school: every family sees those for the whole school and
 * for their children's classrooms. A teacher can alert their own class; the
 * office can alert the whole school or chosen classrooms.
 */
export default function AlertsPage() {
  const { me } = useSession();
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [composing, setComposing] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canSend = me?.role === 'ADMIN' || me?.role === 'TEACHER';

  const load = useCallback(async () => {
    try {
      setAlerts((await api.get<{ alerts: Alert[] }>('/api/alerts')).alerts);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load alerts.');
      setAlerts([]);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <Shell>
      <PageHeader
        title="Alerts"
        subtitle={canSend ? 'Closures, half days and reminders, sent straight to families.' : 'Closures, half days and reminders from the school.'}
      />

      {flash && <div className="mb-4"><Banner tone="success">{flash}</Banner></div>}
      {error && <div className="mb-4"><Banner tone="error">{error}</Banner></div>}

      {canSend && me && (composing ? (
        <Composer
          me={me}
          onSent={(msg) => { setComposing(false); setFlash(msg); setError(null); void load(); }}
          onCancel={() => setComposing(false)}
        />
      ) : (
        <Button className="mb-5 w-full" onClick={() => { setComposing(true); setFlash(null); }}>
          Send an alert
        </Button>
      ))}

      {alerts === null ? (
        <Skeleton className="h-40" />
      ) : alerts.length === 0 ? (
        <EmptyState title="No alerts" body="When the school sends an alert — a snow day, a half day — it shows here." />
      ) : (
        <ul className="space-y-3">
          {alerts.map((a) => (
            <li key={a.alertId}><AlertCard alert={a} classroomNames={me?.classroomNames ?? {}} /></li>
          ))}
        </ul>
      )}
    </Shell>
  );
}

function Composer({ me, onSent, onCancel }: {
  me: NonNullable<ReturnType<typeof useSession>['me']>;
  onSent: (msg: string) => void;
  onCancel: () => void;
}) {
  const isAdmin = me.role === 'ADMIN';
  // A teacher alerts the rooms they teach; the office starts at the whole school.
  const rooms = isAdmin ? Object.keys(me.classroomNames) : (me.teaches ?? []);
  const [kind, setKind] = useState<Kind>('CLOSURE');
  const [title, setTitle] = useState(() => template('CLOSURE').title);
  const [message, setMessage] = useState(() => template('CLOSURE').message);
  const [audience, setAudience] = useState<'SCHOOL' | 'CLASSROOMS'>(isAdmin ? 'SCHOOL' : 'CLASSROOMS');
  const [classroomIds, setClassroomIds] = useState<string[]>(isAdmin ? [] : rooms);
  const [count, setCount] = useState<{ parents: number; teachers: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCount(null);
    if (audience === 'CLASSROOMS' && !classroomIds.length) return;
    const q = new URLSearchParams({ audience, classroomIds: classroomIds.join(',') });
    api.get<{ parents: number; teachers: number }>(`/api/alerts/recipients?${q}`)
      .then(setCount)
      .catch(() => undefined);
  }, [audience, classroomIds]);

  function pick(k: Kind) {
    setKind(k);
    const t = template(k);
    setTitle(t.title);
    setMessage(t.message);
  }

  const toggleRoom = (id: string) => {
    setAudience('CLASSROOMS');
    setClassroomIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  };

  const people = count ? count.parents + count.teachers : 0;
  const summary = count
    ? `${count.parents} ${count.parents === 1 ? 'parent' : 'parents'}${count.teachers ? ` and ${count.teachers} ${count.teachers === 1 ? 'teacher' : 'teachers'}` : ''}`
    : null;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!window.confirm(`Send “${title}” to ${summary ?? 'everyone selected'} now?`)) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ alert: Alert }>('/api/alerts', { kind, title, message, audience, classroomIds });
      onSent(`Sent to ${r.alert.recipients} ${r.alert.recipients === 1 ? 'person' : 'people'}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send the alert.');
      setBusy(false);
    }
  }

  const chip = (on: boolean) => `rounded-full px-3 py-1.5 text-sm font-medium transition-colors
    ${on ? 'bg-sage text-white' : 'bg-black/5 text-muted hover:text-ink'}`;

  return (
    <Card className="mb-5 !p-4">
      <form onSubmit={send} className="space-y-4">
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-ink">What is it?</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(ALERT_KINDS) as Kind[]).map((k) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => pick(k)} className={chip(kind === k)}>
                <span aria-hidden className="mr-1">{ALERT_KINDS[k].icon}</span>{k === 'GENERAL' ? 'Other' : ALERT_KINDS[k].label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-ink">Send to</legend>
          <div className="flex flex-wrap gap-2">
            {isAdmin && (
              <button
                type="button"
                aria-pressed={audience === 'SCHOOL'}
                onClick={() => { setAudience('SCHOOL'); setClassroomIds([]); }}
                className={chip(audience === 'SCHOOL')}
              >
                Whole school
              </button>
            )}
            {rooms.map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={audience === 'CLASSROOMS' && classroomIds.includes(id)}
                onClick={() => toggleRoom(id)}
                className={chip(audience === 'CLASSROOMS' && classroomIds.includes(id))}
              >
                {me.classroomNames[id] ?? 'Classroom'}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">Title</span>
          <input className={`${inputClass} py-2.5 text-sm`} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} required />
        </label>
        <label className="block">
          <span className="mb-1.5 flex justify-between text-sm font-medium text-ink">
            Message <span className="text-xs font-normal text-muted">{message.length}/600</span>
          </span>
          <textarea
            className={`${inputClass} min-h-28 py-2.5 text-sm`}
            value={message}
            maxLength={600}
            onChange={(e) => setMessage(e.target.value)}
            required
          />
        </label>

        <p className="text-xs text-muted">
          {audience === 'CLASSROOMS' && !classroomIds.length
            ? 'Choose who to send it to.'
            : summary
              ? `Goes to ${summary}, in the app and by email.`
              : 'Counting who it goes to…'}
        </p>
        {error && <Banner tone="error">{error}</Banner>}

        <div className="flex gap-2">
          <Button type="submit" loading={busy} disabled={!people}>Send alert</Button>
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </form>
    </Card>
  );
}
