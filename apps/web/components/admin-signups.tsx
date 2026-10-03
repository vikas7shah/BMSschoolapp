'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { formatShort } from '@bms/shared';
import { ApiError, api, type Signup } from '@/lib/api';
import { clock } from '@/lib/time';
import { Banner, Button, Card, EmptyState, Skeleton, inputClass } from './ui';

const STATUS: Record<Signup['status'], { label: string; cls: string }> = {
  DRAFT: { label: 'Draft', cls: 'bg-black/5 text-muted' },
  OPEN: { label: 'Open', cls: 'bg-sage-soft text-sage-dark' },
  CLOSED: { label: 'Closed', cls: 'bg-black/5 text-muted' },
};

/** Admin → Sign-ups: conferences and observations, from draft to published. */
export function AdminSignups({ classrooms, onChanged, onError }: {
  classrooms: { classroomId: string; name: string }[];
  onChanged: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [list, setList] = useState<Signup[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setList((await api.get<{ signups: Signup[] }>('/api/signups')).signups);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Could not load sign-ups.');
    }
  }, [onError]);
  useEffect(() => { void load(); }, [load]);

  async function create(kind: Signup['kind']) {
    try {
      const r = await api.post<{ eventId: string }>('/api/admin/signups', kind === 'CONFERENCE'
        ? { kind, title: 'Parent–teacher conference', slotMinutes: 20, capacity: 1, classroomIds: classrooms.map((c) => c.classroomId), location: 'In person' }
        : { kind, title: 'Parent observation', slotMinutes: 20, capacity: 5, classroomIds: classrooms.map((c) => c.classroomId), location: 'In person' });
      await load();
      setOpenId(r.eventId);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Could not create it.');
    }
  }

  const current = list?.find((s) => s.eventId === openId);
  if (current) {
    return (
      <Editor
        signup={current}
        classrooms={classrooms}
        reload={load}
        onBack={() => setOpenId(null)}
        onChanged={onChanged}
        onError={onError}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => void create('CONFERENCE')}>+ Conference</Button>
        <Button className="flex-1" variant="secondary" onClick={() => void create('OBSERVATION')}>+ Observation</Button>
      </div>
      <p className="text-center text-xs text-muted">
        A new sign-up starts as a draft. Families and teachers see it once you publish.
      </p>
      {!list ? <Skeleton className="h-32" /> : !list.length ? (
        <EmptyState title="No sign-ups yet" body="Create a conference or observation sign-up to get started." />
      ) : (
        <ul className="space-y-2">
          {list.map((s) => {
            const seats = s.slots.reduce((n, x) => n + x.capacity, 0);
            const booked = s.slots.reduce((n, x) => n + x.booked, 0);
            const days = [...new Set(s.slots.map((x) => x.date))].sort();
            return (
              <li key={s.eventId}>
                <button type="button" onClick={() => setOpenId(s.eventId)} className="w-full text-left">
                  <Card className="!p-4 transition-colors hover:border-sage">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-ink">{s.title}</p>
                        <p className="text-xs text-muted">
                          {days.length ? `${formatShort(days[0]!)}${days.length > 1 ? ` – ${formatShort(days.at(-1)!)}` : ''}` : 'No times yet'}
                          {' · '}{s.classroomIds.length} {s.classroomIds.length === 1 ? 'classroom' : 'classrooms'}
                          {' · '}{s.capacity === 1 ? `${s.slotMinutes} min` : `${s.capacity} families per time`}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS[s.status].cls}`}>
                        {STATUS[s.status].label}{s.status !== 'DRAFT' ? ` · ${booked} of ${seats}` : ''}
                      </span>
                    </div>
                  </Card>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Editor({ signup, classrooms, reload, onBack, onChanged, onError }: {
  signup: Signup;
  classrooms: { classroomId: string; name: string }[];
  reload: () => Promise<void>;
  onBack: () => void;
  onChanged: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [title, setTitle] = useState(signup.title);
  const [closesOn, setClosesOn] = useState(signup.setClosesOn ?? '');
  const [roomIds, setRoomIds] = useState(signup.classroomIds);
  const [room, setRoom] = useState(signup.classroomIds[0] ?? '');
  const [hours, setHours] = useState({ date: '', start: '08:00', end: '11:00' });
  const [announce, setAnnounce] = useState(true);
  const [note, setNote] = useState(() => ({
    title: `${signup.title} sign-ups are open`,
    message: `Pick a ${signup.slotMinutes}-minute time for your child in the BMS Families app.`,
  }));
  const [busy, setBusy] = useState(false);
  const nameOf = (id: string) => classrooms.find((c) => c.classroomId === id)?.name ?? 'Classroom';
  const roomSlots = signup.slots.filter((s) => s.classroomId === room);
  const days = [...new Set(roomSlots.map((s) => s.date))].sort();

  async function run(fn: () => Promise<unknown>, done?: string) {
    setBusy(true);
    try {
      await fn();
      await reload();
      if (done) onChanged(done);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  }
  const base = `/api/admin/signups/${signup.eventId}`;

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="text-sm text-muted underline underline-offset-4">← All sign-ups</button>

      <Card className="!p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-ink">Details</h2>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS[signup.status].cls}`}>{STATUS[signup.status].label}</span>
        </div>
        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-medium text-muted">Name</span>
          <input className={`${inputClass} py-2 text-sm`} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <p className="mt-2 text-xs text-muted">
          {signup.slotMinutes}-minute times · {signup.capacity === 1 ? 'one family each' : `${signup.capacity} families each`} · {signup.location}
        </p>
        <span className="mb-1 mt-3 block text-xs font-medium text-muted">Classrooms</span>
        <div className="flex flex-wrap gap-2">
          {classrooms.map((c) => {
            const on = roomIds.includes(c.classroomId);
            return (
              <button
                key={c.classroomId}
                type="button"
                onClick={() => setRoomIds(on ? roomIds.filter((x) => x !== c.classroomId) : [...roomIds, c.classroomId])}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ${on ? 'bg-sage text-white' : 'bg-black/5 text-muted'}`}
              >
                {c.name}
              </button>
            );
          })}
        </div>
        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-medium text-muted">
            Last day to sign up {signup.closesOn && !closesOn ? `· ${formatShort(signup.closesOn)}, the day before the first time` : ''}
          </span>
          <input className={`${inputClass} py-2 text-sm`} type="date" value={closesOn} onChange={(e) => setClosesOn(e.target.value)} />
        </label>
        <Button
          size="sm"
          className="mt-3"
          loading={busy}
          onClick={() => void run(() => api.patch(base, { title, classroomIds: roomIds, closesOn }), 'Saved.')}
        >
          Save details
        </Button>
      </Card>

      <Card className="!p-4">
        <h2 className="font-semibold text-ink">Times</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {signup.classroomIds.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setRoom(id)}
              className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ${id === room ? 'bg-sage text-white' : 'bg-black/5 text-muted'}`}
            >
              {nameOf(id)} · {signup.slots.filter((s) => s.classroomId === id).length}
            </button>
          ))}
        </div>

        <div className="mt-3 space-y-2.5">
          {days.map((d) => (
            <div key={d}>
              <p className="text-xs font-semibold text-ink">{formatShort(d)}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {roomSlots.filter((s) => s.date === d).sort((a, b) => a.start.localeCompare(b.start)).map((s) => (
                  <span key={s.slotId} className="inline-flex items-center gap-1 rounded-full bg-sage-soft px-2.5 py-1 text-xs text-sage-dark">
                    {clock(s.start)}{s.booked ? ` · ${s.booked}` : ''}
                    <button
                      type="button"
                      aria-label={`Remove ${clock(s.start)}`}
                      disabled={busy}
                      onClick={() => void run(() => api.post(`${base}/remove-time`, { slotId: s.slotId }))}
                      className="ml-0.5 text-sage-dark/60 hover:text-clay"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ))}
          {!days.length && <p className="text-sm text-muted">No times for {nameOf(room)} yet.</p>}
        </div>

        <div className="mt-4 rounded-xl bg-black/[.03] p-3">
          <p className="text-xs font-medium text-ink">Add hours to {nameOf(room)}</p>
          <div className="mt-2 grid grid-cols-2 gap-2 [&>input]:min-w-0">
            <input aria-label="Day" type="date" className={`${inputClass} col-span-2 px-2 py-2 text-sm`} value={hours.date} onChange={(e) => setHours({ ...hours, date: e.target.value })} />
            <input aria-label="From" type="time" step={300} className={`${inputClass} px-2 py-2 text-sm`} value={hours.start} onChange={(e) => setHours({ ...hours, start: e.target.value })} />
            <input aria-label="To" type="time" step={300} className={`${inputClass} px-2 py-2 text-sm`} value={hours.end} onChange={(e) => setHours({ ...hours, end: e.target.value })} />
          </div>
          <p className="mt-1.5 text-[11px] text-muted">Makes back-to-back {signup.slotMinutes}-minute times. Leave a gap for lunch by adding two blocks.</p>
          <Button
            size="sm"
            className="mt-2"
            loading={busy}
            disabled={!hours.date}
            onClick={() => void run(async () => {
              const r = await api.post<{ added: number }>(`${base}/hours`, { classroomId: room, ...hours });
              onChanged(`Added ${r.added} ${r.added === 1 ? 'time' : 'times'} to ${nameOf(room)}.`);
            })}
          >
            Add times
          </Button>
        </div>

        {roomSlots.length > 0 && signup.classroomIds.length > 1 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted">Copy these times to</span>
            {signup.classroomIds.filter((id) => id !== room).map((id) => (
              <button
                key={id}
                type="button"
                disabled={busy}
                onClick={() => void run(async () => {
                  const r = await api.post<{ added: number }>(`${base}/copy-times`, { from: room, to: id });
                  onChanged(`Copied ${r.added} ${r.added === 1 ? 'time' : 'times'} to ${nameOf(id)}.`);
                })}
                className="rounded-full bg-black/5 px-2.5 py-1 font-medium text-ink hover:bg-black/10"
              >
                {nameOf(id)}
              </button>
            ))}
          </div>
        )}
      </Card>

      {signup.status === 'DRAFT' ? (
        <Card className="!p-4">
          <h2 className="font-semibold text-ink">Publish</h2>
          <p className="mt-0.5 text-sm text-muted">Parents and teachers will see it, and parents can book.</p>
          <label className="mt-3 flex items-start gap-2.5">
            <input type="checkbox" className="mt-1 size-4 accent-sage" checked={announce} onChange={(e) => setAnnounce(e.target.checked)} />
            <span className="text-sm text-ink">
              Send an announcement
              <span className="block text-xs text-muted">To every parent in these classrooms, in the app and by email.</span>
            </span>
          </label>
          {announce && (
            <div className="mt-3 space-y-2">
              <input className={`${inputClass} py-2 text-sm`} maxLength={80} value={note.title} onChange={(e) => setNote({ ...note, title: e.target.value })} />
              <textarea className={`${inputClass} min-h-20 py-2 text-sm`} maxLength={600} value={note.message} onChange={(e) => setNote({ ...note, message: e.target.value })} />
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              loading={busy}
              onClick={() => window.confirm(announce ? 'Publish and send the announcement now?' : 'Publish now?')
                && void run(async () => {
                  const r = await api.post<{ announced: number }>(`${base}/publish`, { announce, ...note });
                  onChanged(announce ? `Published. Announcement sent to ${r.announced} people.` : 'Published.');
                })}
            >
              {announce ? 'Publish and announce' : 'Publish'}
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => window.confirm('Delete this draft?') && void run(async () => { await api.del(base); onBack(); }, 'Draft deleted.')}
            >
              Delete
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="!p-4">
          <h2 className="font-semibold text-ink">{signup.status === 'OPEN' ? 'Published' : 'Closed'}</h2>
          <p className="mt-0.5 text-sm text-muted">
            {signup.status === 'OPEN'
              ? signup.open ? `Families can book until ${signup.closesOn ? formatShort(signup.closesOn) : 'you close it'}.` : 'The last day to sign up has passed.'
              : 'Families can no longer book. The office can still make changes on the sheet.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href={`/signups/?event=${signup.eventId}`}><Button size="sm">Open the sheet</Button></Link>
            <Button
              size="sm"
              variant="secondary"
              loading={busy}
              onClick={() => void run(() => api.patch(base, { status: signup.status === 'OPEN' ? 'CLOSED' : 'OPEN' }),
                signup.status === 'OPEN' ? 'Sign-ups closed.' : 'Sign-ups reopened.')}
            >
              {signup.status === 'OPEN' ? 'Close sign-ups' : 'Reopen'}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
