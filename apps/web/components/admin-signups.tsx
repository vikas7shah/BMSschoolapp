'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { addMinutes, clockRange, formatShort } from '@bms/shared';
import { ApiError, api, type Signup } from '@/lib/api';
import { shownSignup } from '@/lib/features';
import { Button, Card, Skeleton, inputClass } from './ui';

type Room = { classroomId: string; name: string };

const STATUS: Record<Signup['status'], { label: string; cls: string }> = {
  DRAFT: { label: 'Draft', cls: 'bg-black/5 text-muted' },
  OPEN: { label: 'Open', cls: 'bg-sage-soft text-sage-dark' },
  CLOSED: { label: 'Closed', cls: 'bg-black/5 text-muted' },
};

const SLOT_MINUTES = 20;
const FAMILIES_PER_TIME = 5;

const booked = (s: Signup) => s.slots.reduce((n, x) => n + x.booked, 0);
const seats = (s: Signup) => s.slots.reduce((n, x) => n + x.capacity, 0);
const dayRange = (days: string[]) => (!days.length ? 'No days yet'
  : days.length === 1 ? formatShort(days[0]!) : `${formatShort(days[0]!)} – ${formatShort(days.at(-1)!)}`);

/**
 * Admin → Sign-ups: one parent observation per classroom. The list is the
 * classrooms; each opens one screen with its days, times and bookings.
 */
export function AdminSignups({ classrooms, onChanged, onError }: {
  classrooms: Room[];
  onChanged: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [list, setList] = useState<Signup[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setList((await api.get<{ signups: Signup[] }>('/api/signups')).signups.filter(shownSignup));
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Could not load sign-ups.');
    }
  }, [onError]);
  useEffect(() => { void load(); }, [load]);

  const [asking, setAsking] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  /** A classroom's sign-ups, soonest first; ones with no days yet at the end. */
  const forRoom = (id: string) => (list ?? [])
    .filter((s) => s.classroomIds.includes(id))
    .sort((x, y) => (x.days[0] ?? '9999').localeCompare(y.days[0] ?? '9999'));
  /** Still to come: not closed, and its last day hasn't passed. */
  const upcoming = (s: Signup) => s.status !== 'CLOSED' && (!s.days.length || s.days.at(-1)! >= today);

  async function create(room: Room, from?: Signup): Promise<string | null> {
    try {
      const r = await api.post<{ eventId: string }>('/api/admin/signups', {
        kind: 'OBSERVATION', title: 'Parent observation', slotMinutes: SLOT_MINUTES,
        capacity: from?.capacity ?? FAMILIES_PER_TIME, classroomIds: [room.classroomId], location: 'In person',
      });
      if (from) await api.put(`/api/admin/signups/${r.eventId}/schedule`, { days: from.days, times: from.times });
      await load();
      return r.eventId;
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Could not create it.');
      return null;
    }
  }

  const current = list?.find((s) => s.eventId === openId);
  if (current) {
    return (
      <Editor
        signup={current}
        rooms={classrooms}
        reload={load}
        onCopy={async (room) => {
          const id = await create(room, current);
          if (id) onChanged(`Copied to ${room.name} as a draft.`);
        }}
        onBack={() => setOpenId(null)}
        onChanged={onChanged}
        onError={onError}
      />
    );
  }

  async function add(room: Room) {
    const id = await create(room);
    if (id) { setAsking(null); setOpenId(id); }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="px-1 font-semibold text-ink">Parent observations</h2>
        <p className="mt-0.5 px-1 text-sm text-muted">
          Each classroom can have one for each time of year. Families see it once you publish.
        </p>
      </div>
      {!list ? <Skeleton className="h-40" /> : classrooms.map((room) => {
        const signups = forRoom(room.classroomId);
        const existing = signups.find(upcoming);
        return (
          <section key={room.classroomId}>
            <h3 className="mb-2 px-1 text-sm font-semibold text-ink">{room.name}</h3>
            <ul className="space-y-2">
              {signups.map((s) => {
                const past = s.days.length > 0 && s.days.at(-1)! < today;
                return (
                  <li key={s.eventId}>
                    <button type="button" onClick={() => setOpenId(s.eventId)} className="w-full text-left">
                      <Card className={`!p-4 transition-colors hover:border-sage ${past || s.status === 'CLOSED' ? 'opacity-70' : ''}`}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium text-ink">{dayRange(s.days)}</p>
                            <p className="text-sm text-muted">
                              {s.status === 'DRAFT' ? 'Not published yet' : `${booked(s)} of ${seats(s)} booked`}
                            </p>
                          </div>
                          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS[s.status].cls}`}>
                            {past && s.status === 'OPEN' ? 'Done' : STATUS[s.status].label}
                          </span>
                        </div>
                      </Card>
                    </button>
                  </li>
                );
              })}
            </ul>

            {asking === room.classroomId && existing ? (
              <div className="mt-2 rounded-2xl bg-sun-soft p-4 text-sm text-[#8a6414]">
                <p>
                  {room.name} already has a sign-up {existing.days.length ? `for ${dayRange(existing.days)}` : 'in progress'}.
                  Open it to change its days or times — or add another for a different time of year.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => { setAsking(null); setOpenId(existing.eventId); }}>Open it</Button>
                  <Button size="sm" variant="secondary" onClick={() => void add(room)}>Add another</Button>
                  <Button size="sm" variant="ghost" onClick={() => setAsking(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => (existing ? setAsking(room.classroomId) : void add(room))}
                className="mt-2 px-1 text-sm font-semibold text-sage underline underline-offset-2"
              >
                + Add sign-up
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Editor({ signup, rooms, reload, onCopy, onBack, onChanged, onError }: {
  signup: Signup;
  rooms: Room[];
  reload: () => Promise<void>;
  onCopy: (room: Room) => Promise<void>;
  onBack: () => void;
  onChanged: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [newDay, setNewDay] = useState('');
  const [newTime, setNewTime] = useState('');
  const [busy, setBusy] = useState(false);
  const base = `/api/admin/signups/${signup.eventId}`;
  const roomName = signup.classroomIds.map((id) => rooms.find((r) => r.classroomId === id)?.name ?? 'Classroom').join(', ');
  const cell = (date: string, start: string) => signup.slots.find((s) => s.date === date && s.start === start);
  const otherRooms = rooms.filter((r) => !signup.classroomIds.includes(r.classroomId));
  const families = signup.slots.reduce((n, x) => n + x.booked, 0);

  async function run(fn: () => Promise<unknown>, done?: string): Promise<boolean> {
    setBusy(true);
    try {
      await fn();
      await reload();
      if (done) onChanged(done);
      return true;
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'That did not work.');
      return false;
    } finally {
      setBusy(false);
    }
  }
  const schedule = (days: string[], times: string[]) => run(() => api.put(`${base}/schedule`, { days, times }));

  const chip = 'inline-flex items-center gap-1.5 rounded-full bg-sage-soft px-3 py-1.5 text-sm font-medium text-sage-dark';
  const remove = 'text-sage-dark/60 hover:text-clay disabled:opacity-40';

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="text-sm text-muted underline underline-offset-4">← Sign-ups</button>

      <Card className="!p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">Parent observation</h2>
            <p className="text-sm text-muted">{roomName}</p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS[signup.status].cls}`}>{STATUS[signup.status].label}</span>
        </div>

        <h3 className="mt-5 text-sm font-semibold text-ink">Days</h3>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {signup.days.map((d) => (
            <span key={d} className={chip}>
              {formatShort(d)}
              <button type="button" aria-label={`Remove ${formatShort(d)}`} disabled={busy} className={remove}
                onClick={() => void schedule(signup.days.filter((x) => x !== d), signup.times)}>✕</button>
            </span>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input aria-label="Day to add" type="date" value={newDay} onChange={(e) => setNewDay(e.target.value)}
            className={`${inputClass} min-w-0 flex-1 px-3 py-2 text-sm`} />
          <Button size="sm" variant="secondary" className="shrink-0" disabled={!newDay || busy}
            onClick={async () => { if (await schedule([...signup.days, newDay], signup.times)) setNewDay(''); }}>
            + Add day
          </Button>
        </div>

        <h3 className="mt-5 text-sm font-semibold text-ink">Times <span className="font-normal text-muted">· {signup.slotMinutes} minutes each, every day</span></h3>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {signup.times.map((t) => (
            <span key={t} className={chip}>
              {clockRange(t, addMinutes(t, signup.slotMinutes))}
              <button type="button" aria-label={`Remove ${t}`} disabled={busy} className={remove}
                onClick={() => void schedule(signup.days, signup.times.filter((x) => x !== t))}>✕</button>
            </span>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input aria-label="Start time to add" type="time" step={300} value={newTime} onChange={(e) => setNewTime(e.target.value)}
            className={`${inputClass} min-w-0 flex-1 px-3 py-2 text-sm`} />
          <Button size="sm" variant="secondary" className="shrink-0" disabled={!newTime || busy}
            onClick={async () => { if (await schedule(signup.days, [...signup.times, newTime])) setNewTime(''); }}>
            + Add time
          </Button>
        </div>

        <h3 className="mt-5 text-sm font-semibold text-ink">Families per time</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <button key={n} type="button" disabled={busy}
              onClick={() => n !== signup.capacity && void run(() => api.patch(base, { capacity: n }), `Up to ${n} ${n === 1 ? 'family' : 'families'} per time.`)}
              className={`size-9 rounded-full text-sm font-semibold ${n === signup.capacity ? 'bg-sage text-white' : 'bg-black/5 text-muted hover:text-ink'}`}>
              {n}
            </button>
          ))}
        </div>

        {signup.days.length > 0 && signup.times.length > 0 && (
          <>
            <h3 className="mt-5 text-sm font-semibold text-ink">Bookings</h3>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="p-2" />
                    {signup.days.map((d) => <th key={d} className="whitespace-nowrap p-2 text-left font-medium text-muted">{formatShort(d)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {signup.times.map((t) => (
                    <tr key={t} className="border-t border-line">
                      <th className="whitespace-nowrap p-2 text-left font-medium text-ink">{clockRange(t, addMinutes(t, signup.slotMinutes))}</th>
                      {signup.days.map((d) => {
                        const s = cell(d, t);
                        return (
                          <td key={d} className={`whitespace-nowrap p-2 ${s && s.booked >= s.capacity ? 'font-semibold text-sage-dark' : 'text-muted'}`}>
                            {s ? `${s.booked} of ${s.capacity}` : '—'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      <Card className="!p-5">
        {signup.status === 'DRAFT' ? (
          <>
            <p className="text-sm text-muted">
              {signup.slots.length
                ? `Publishing shows it to ${roomName} families and teachers. Sign-ups close ${signup.closesOn ? formatShort(signup.closesOn) : 'the day before the first day'}.`
                : 'Add at least one day and one time, then publish.'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button loading={busy} disabled={!signup.slots.length}
                onClick={() => window.confirm(`Publish and email every ${roomName} parent now?`)
                  && void run(async () => {
                    const r = await api.post<{ announced: number }>(`${base}/publish`, {
                      announce: true,
                      title: 'Parent observation sign-ups are open',
                      message: `Pick a ${signup.slotMinutes}-minute time to visit your child's classroom (${roomName}) in the BMS Families app.`,
                    });
                    onChanged(`Published. Emailed ${r.announced} ${r.announced === 1 ? 'parent' : 'parents'}.`);
                  })}>
                Publish and email parents
              </Button>
              <Button variant="ghost" disabled={busy || !signup.slots.length}
                onClick={() => void run(() => api.post(`${base}/publish`, { announce: false }), 'Published without an email.')}>
                Publish only
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted">
              {signup.status === 'CLOSED' ? 'Closed — families can no longer book.'
                : signup.open ? `Open. Families can book until ${signup.closesOn ? formatShort(signup.closesOn) : 'you close it'}.`
                  : 'The last day to sign up has passed.'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={`/signups/?event=${signup.eventId}`}><Button size="sm">Open the sheet</Button></Link>
              <Button size="sm" variant="secondary" loading={busy}
                onClick={() => void run(() => api.patch(base, { status: signup.status === 'OPEN' ? 'CLOSED' : 'OPEN' }),
                  signup.status === 'OPEN' ? 'Sign-ups closed.' : 'Sign-ups reopened.')}>
                {signup.status === 'OPEN' ? 'Close sign-ups' : 'Reopen'}
              </Button>
            </div>
          </>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3 text-sm">
          {signup.slots.length > 0 && otherRooms.map((r) => (
            <button key={r.classroomId} type="button" disabled={busy} onClick={() => void onCopy(r)}
              className="font-medium text-sage underline underline-offset-2">
              Copy to {r.name}
            </button>
          ))}
          <button type="button" disabled={busy}
            onClick={() => window.confirm(families
              ? `Delete this sign-up? ${families} ${families === 1 ? 'family is' : 'families are'} booked and will lose ${families === 1 ? 'its' : 'their'} time. They are not emailed.`
              : 'Delete this sign-up?')
              && void run(async () => { await api.del(base); onBack(); }, 'Sign-up deleted.')}
            className="ml-auto font-medium text-clay underline underline-offset-2">
            Delete sign-up
          </button>
        </div>
      </Card>
    </div>
  );
}
