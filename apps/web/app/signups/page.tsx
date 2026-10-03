'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatLong, formatShort } from '@bms/shared';
import { ApiError, api, type Signup, type SignupSlotView } from '@/lib/api';
import { useSession } from '@/lib/session';
import { clockRange } from '@/lib/time';
import { shownSignup } from '@/lib/features';
import { Shell } from '@/components/shell';
import { Banner, Button, Card, EmptyState, PageHeader, Skeleton } from '@/components/ui';

const param = (k: string) => (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get(k));

/** Times grouped by day, in order. */
function byDay(slots: SignupSlotView[]): [string, SignupSlotView[]][] {
  const days = new Map<string, SignupSlotView[]>();
  for (const s of [...slots].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))) {
    days.set(s.date, [...(days.get(s.date) ?? []), s]);
  }
  return [...days.entries()];
}

/**
 * A sign-up: a family picks their child's time here; teachers and the office
 * see the whole sheet, and the office can seat, move and remove families.
 */
export default function SignupsPage() {
  const { me } = useSession();
  const [list, setList] = useState<Signup[] | null>(null);
  const [eventId] = useState(() => param('event'));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setList((await api.get<{ signups: Signup[] }>('/api/signups')).signups.filter(shownSignup));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load sign-ups.');
      setList([]);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const signup = list?.find((s) => s.eventId === eventId) ?? list?.find((s) => s.status !== 'DRAFT') ?? null;
  const isStaff = me?.role === 'ADMIN' || me?.role === 'TEACHER';

  return (
    <Shell>
      {error && <div className="mb-4"><Banner tone="error">{error}</Banner></div>}
      {list === null || !me ? (
        <Skeleton className="h-80" />
      ) : !signup ? (
        <>
          <PageHeader title="Sign-ups" />
          <EmptyState title="Nothing to sign up for" body="When the school opens conference or observation sign-ups, they show here." />
        </>
      ) : isStaff ? (
        <Sheet signup={signup} isAdmin={me.role === 'ADMIN'} rooms={me.role === 'ADMIN' ? signup.classroomIds : signup.classroomIds.filter((id) => me.teaches?.includes(id))} names={me.classroomNames} reload={load} />
      ) : (
        <Picker signup={signup} names={me.classroomNames} reload={load} />
      )}
    </Shell>
  );
}

/* --------------------------------------------------------- a family's view */

function Picker({ signup, names, reload }: { signup: Signup; names: Record<string, string>; reload: () => Promise<void> }) {
  const [childId, setChildId] = useState(() => param('child') ?? signup.children[0]?.childId ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const child = signup.children.find((k) => k.childId === childId) ?? signup.children[0];
  if (!child) {
    return <EmptyState title="Not for your classroom" body="This sign-up is for another classroom." />;
  }
  const slots = signup.slots.filter((s) => s.classroomId === child.classroomId);
  const held = slots.find((s) => s.slotId === child.slotId);
  const roomFull = slots.every((s) => s.booked >= s.capacity);
  const one = signup.capacity === 1;

  async function book(s: SignupSlotView) {
    const when = `${formatShort(s.date)} · ${clockRange(s.start, s.end)}`;
    if (!window.confirm(held ? `Switch ${child!.firstName} to ${when}?` : `Book ${when} for ${child!.firstName}?`)) return;
    setBusy(s.slotId);
    setError(null);
    setFlash(null);
    try {
      await api.post(`/api/signups/${signup.eventId}/book`, { slotId: s.slotId, childId: child!.childId });
      setFlash(`${child!.firstName} is booked for ${when}.`);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not book that time.');
      await reload();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        title={`${signup.kind === 'CONFERENCE' ? 'Conference' : 'Observation'} for ${child.firstName}`}
        subtitle={`${names[child.classroomId]} · ${signup.slotMinutes} minutes · ${signup.location}. One time per child.`}
      />
      {signup.children.length > 1 && (
        <div role="tablist" aria-label="Child" className="mb-4 flex gap-1.5 rounded-full bg-black/5 p-1">
          {signup.children.map((k) => (
            <button
              key={k.childId}
              role="tab"
              aria-selected={k.childId === child.childId}
              onClick={() => { setChildId(k.childId); setFlash(null); setError(null); }}
              className={`flex-1 rounded-full px-3 py-2 text-[13px] font-medium ${k.childId === child.childId ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}
            >
              {k.firstName}
            </button>
          ))}
        </div>
      )}

      {held && (
        <Card className="mb-4 !border-sage/30 !bg-sage-soft !p-4">
          <p className="text-xs font-semibold text-sage-dark">{child.firstName}&apos;s time</p>
          <p className="text-lg font-bold text-ink">{formatLong(held.date)}</p>
          <p className="font-semibold text-sage-dark">{clockRange(held.start, held.end)}</p>
        </Card>
      )}
      {flash && <div className="mb-3"><Banner tone="success">{flash}</Banner></div>}
      {error && <div className="mb-3"><Banner tone="error">{error}</Banner></div>}
      {!signup.open ? (
        <div className="mb-3"><Banner tone="info">Sign-ups have closed. Contact the school to make a change.</Banner></div>
      ) : held && roomFull ? (
        <div className="mb-3"><Banner tone="warn">Every time is taken. Contact the school to switch.</Banner></div>
      ) : signup.closesOn ? (
        <p className="mb-3 px-1 text-sm text-muted">
          {held ? 'Tap another time to switch.' : 'Tap a time to book it.'} Sign-ups close {formatShort(signup.closesOn)}.
        </p>
      ) : null}

      <div className="space-y-5">
        {byDay(slots).map(([day, times]) => (
          <section key={day}>
            <h2 className="mb-2 px-1 text-sm font-semibold text-ink">{formatLong(day)}</h2>
            <ul className="space-y-2">
              {times.map((s) => {
                const mine = s.slotId === child.slotId;
                const full = s.booked >= s.capacity;
                const can = signup.open && !mine && !full;
                return (
                  <li key={s.slotId}>
                    <button
                      type="button"
                      disabled={!can || !!busy}
                      onClick={() => void book(s)}
                      className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors
                        ${mine ? 'border-sage bg-sage-soft' : full ? 'border-line bg-black/[.03] text-muted' : 'border-line bg-surface hover:border-sage'}
                        disabled:cursor-default`}
                    >
                      <span className="font-medium">{clockRange(s.start, s.end)}</span>
                      <span className="text-sm">
                        {mine ? <span className="rounded-full bg-sage px-2.5 py-0.5 text-xs font-semibold text-white">Your time</span>
                          : full ? (one ? 'Taken' : 'Full')
                            : one ? <span className="text-sage-dark">Open</span>
                              : <span className="text-muted">{s.capacity - s.booked} of {s.capacity} left</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

/* ------------------------------------------------ teachers' and office view */

function Sheet({ signup, isAdmin, rooms, names, reload }: {
  signup: Signup; isAdmin: boolean; rooms: string[]; names: Record<string, string>; reload: () => Promise<void>;
}) {
  const [room, setRoom] = useState(() => (rooms.includes(param('room') ?? '') ? param('room')! : rooms[0] ?? ''));
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const slots = useMemo(() => signup.slots.filter((s) => s.classroomId === room), [signup, room]);
  const waiting = (signup.notBooked ?? []).filter((k) => k.classroomId === room);
  const booked = slots.reduce((n, s) => n + s.booked, 0);
  const seats = slots.reduce((n, s) => n + s.capacity, 0);

  async function act(path: string, body: unknown, done: string) {
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      await api.post(`/api/admin/signups/${signup.eventId}/${path}`, body);
      setFlash(done);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  }

  async function remind() {
    if (!window.confirm(`Remind the ${waiting.length} ${waiting.length === 1 ? 'family' : 'families'} in ${names[room]} who haven't booked?`)) return;
    setBusy(true);
    try {
      const r = await api.post<{ sent: number }>(`/api/signups/${signup.eventId}/remind`, { classroomId: room });
      setFlash(`Reminder sent to ${r.sent} ${r.sent === 1 ? 'parent' : 'parents'}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send the reminder.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title={signup.title}
        subtitle={`${names[room] ?? ''} · ${booked} of ${seats} booked${signup.open ? '' : ' · sign-ups closed'}`}
        action={<Button size="sm" variant="ghost" className="print:hidden" onClick={() => window.print()}>Print</Button>}
      />
      {rooms.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2 print:hidden">
          {rooms.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setRoom(id)}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${id === room ? 'bg-sage text-white' : 'bg-black/5 text-muted'}`}
            >
              {names[id]}
            </button>
          ))}
        </div>
      )}
      {flash && <div className="mb-3"><Banner tone="success">{flash}</Banner></div>}
      {error && <div className="mb-3"><Banner tone="error">{error}</Banner></div>}

      <div className="space-y-5">
        {byDay(slots).map(([day, times]) => (
          <section key={day}>
            <h2 className="mb-2 px-1 text-sm font-semibold text-ink">{formatLong(day)}</h2>
            <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
              {times.map((s) => (
                <li key={s.slotId} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium text-ink">{clockRange(s.start, s.end)}</span>
                    <span className={`text-xs ${s.booked >= s.capacity ? 'text-sage-dark' : 'text-muted'}`}>{s.booked} of {s.capacity}</span>
                  </div>
                  {(s.bookings ?? []).map((b) => (
                    <div key={b.childId} className="mt-1.5 flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate">
                        {b.parentName} <span className="text-muted">— {b.childName}</span>
                        {b.byOffice && <span className="ml-1.5 text-[11px] text-muted">(office)</span>}
                      </span>
                      <span className="flex shrink-0 items-center gap-3 text-xs print:hidden">
                        {b.email && <a href={`mailto:${b.email}`} className="text-sage underline underline-offset-2">Email</a>}
                        {isAdmin && (
                          <>
                            <select
                              aria-label={`Move ${b.childName}`}
                              disabled={busy}
                              className="max-w-24 rounded-lg border border-line bg-surface px-1.5 py-1 text-xs"
                              value=""
                              onChange={(e) => e.target.value && void act('book', { slotId: e.target.value, childId: b.childId }, `Moved ${b.childName}.`)}
                            >
                              <option value="">Move…</option>
                              {slots.filter((x) => x.slotId !== s.slotId).map((x) => (
                                <option key={x.slotId} value={x.slotId}>
                                  {formatShort(x.date)} {clockRange(x.start, x.end)}{x.booked >= x.capacity ? ' (full)' : ''}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => window.confirm(`Remove ${b.childName}'s booking?`) && void act('cancel', { childId: b.childId }, `Removed ${b.childName}'s booking.`)}
                              className="text-clay underline underline-offset-2"
                            >
                              Remove
                            </button>
                          </>
                        )}
                      </span>
                    </div>
                  ))}
                  {s.booked < s.capacity && s.capacity === 1 && <p className="mt-1 text-sm text-muted">Open</p>}
                  {isAdmin && (
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs print:hidden">
                      {waiting.length > 0 && (
                        <select
                          aria-label="Add a family"
                          disabled={busy}
                          className="rounded-lg border border-line bg-surface px-1.5 py-1 text-xs"
                          value=""
                          onChange={(e) => e.target.value && void act('book', { slotId: s.slotId, childId: e.target.value }, 'Family added.')}
                        >
                          <option value="">Add a family…</option>
                          {waiting.map((k) => <option key={k.childId} value={k.childId}>{k.name}</option>)}
                        </select>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void act('seats', { slotId: s.slotId, capacity: s.capacity + 1 }, 'Added a seat.')}
                        className="text-sage underline underline-offset-2"
                      >
                        + seat
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
        {!slots.length && <p className="px-1 text-sm text-muted">No times for this classroom yet.</p>}
      </div>

      <Card className="mt-5 !p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">Not booked yet · {waiting.length}</h2>
          {signup.open && waiting.length > 0 && (
            <Button size="sm" variant="secondary" loading={busy} className="print:hidden" onClick={() => void remind()}>Remind them</Button>
          )}
        </div>
        <p className="mt-1.5 text-sm text-muted">
          {waiting.length ? waiting.map((k) => k.name).join(', ') : 'Every family in this classroom has a time.'}
        </p>
      </Card>
    </>
  );
}
