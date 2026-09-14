'use client';

import { useState } from 'react';
import { monthLabel } from '@bms/shared';
import { ApiError, api } from '@/lib/api';
import { Button, Card } from './ui';
import type { OverviewData } from './admin-overview';

type Room = OverviewData['byClassroom'][number];

interface Props {
  overview: OverviewData;
  /** Show one classroom only; omit for all of them. */
  classroomId?: string | null;
  onChanged: (msg: string) => void;
  onError: (msg: string) => void;
}

/**
 * This month and next, per classroom: how many days are covered, how many
 * families have nothing booked, and a button to remind exactly those families
 * now. The same card sits on the admin Home and at the top of Overview.
 */
export function Coverage({ overview, classroomId, onChanged, onError }: Props) {
  const rooms = overview.byClassroom.filter((r) => !classroomId || r.classroomId === classroomId);
  if (!rooms.length) return null;
  return (
    <div className="space-y-4">
      {rooms.map((room) => (
        <RoomCard key={room.classroomId} room={room} onChanged={onChanged} onError={onError} />
      ))}
    </div>
  );
}

function RoomCard({ room, onChanged, onError }: {
  room: Room; onChanged: (msg: string) => void; onError: (msg: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sentToday, setSentToday] = useState(room.nudgedToday);
  const n = room.unbookedFamilies;

  async function remind() {
    setBusy(true);
    try {
      const r = await api.post<{ sent: number; families: number }>(`/api/admin/classrooms/${room.classroomId}/nudge`);
      onChanged(`Reminded ${r.families} ${r.families === 1 ? 'family' : 'families'} in ${room.name}.`);
      setSentToday(true);
      setConfirming(false);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Could not send the reminder.');
    } finally { setBusy(false); }
  }

  return (
    <Card>
      <h2 className="font-semibold text-ink">{room.name}</h2>

      <dl className="mt-3 space-y-3">
        {room.months.map((m) => {
          const pct = m.slots ? Math.round((m.filled / m.slots) * 100) : 0;
          return (
            <div key={m.month}>
              <div className="flex items-baseline justify-between text-sm">
                <dt className="font-medium text-ink">{monthLabel(m.month).replace(/ \d{4}$/, '')}</dt>
                <dd className="text-muted">
                  {m.slots === 0 ? 'No snack days' : (
                    <>
                      <span className="font-semibold text-sage-dark">{m.filled}</span> of {m.slots} filled
                      {m.open > 0 && <span className="text-clay"> · {m.open} open</span>}
                    </>
                  )}
                </dd>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-sage transition-all" style={{ width: `${pct}%` }}
                  role="img" aria-label={`${pct} percent of ${monthLabel(m.month)} filled`} />
              </div>
            </div>
          );
        })}
      </dl>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {room.families === 0 ? 'No families in this classroom yet.'
            : n === 0 ? 'Every family has a day booked.'
            : `${n} ${n === 1 ? 'family has' : 'families have'} nothing booked.`}
        </p>
        {n > 0 && !confirming && (
          <Button size="sm" variant="secondary" disabled={sentToday} onClick={() => setConfirming(true)}>
            {sentToday ? 'Reminded today' : 'Remind them'}
          </Button>
        )}
      </div>

      {confirming && (
        <div className="mt-3 rounded-xl bg-sage-soft p-3 text-sm text-sage-dark">
          <p>
            Send the open-days reminder now to the {n} {n === 1 ? 'family' : 'families'} in {room.name} with
            nothing booked? It goes even while reminders are paused.
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" loading={busy} onClick={() => void remind()}>Send now</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Not now</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
