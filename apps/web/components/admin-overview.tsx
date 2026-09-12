'use client';

import { useState } from 'react';
import { formatShort, relativeLabel } from '@bms/shared';
import { Card } from './ui';

export interface OverviewData {
  today: string;
  classrooms: { classroomId: string; name: string }[];
  totals: { slots: number; filled: number; open: number };
  byClassroom: {
    classroomId: string; name: string; slots: number; filled: number; open: number;
  }[];
  openSlots: { date: string; classroomId: string }[];
  childrenWithNothingBooked: { childName: string; classroomId?: string }[];
}

interface Props {
  overview: OverviewData;
  room: string | null;
  onRoom: (room: string) => void;
}

/** Long lists start trimmed; a school term is a lot of rows on a phone. */
const PREVIEW_ROWS = 10;

export function AdminOverview({ overview, room, onRoom }: Props) {
  const [showAllDays, setShowAllDays] = useState(false);

  // The tab always shows exactly one classroom; default to the first.
  const active = room ?? overview.classrooms[0]?.classroomId ?? null;

  const totals = overview.byClassroom.find((b) => b.classroomId === active)
    ?? { slots: 0, filled: 0, open: 0 };
  const coverage = totals.slots ? Math.round((totals.filled / totals.slots) * 100) : 0;

  const openDays = overview.openSlots.filter((s) => s.classroomId === active);
  const unassigned = overview.childrenWithNothingBooked.filter((c) => c.classroomId === active);
  const visibleDays = showAllDays ? openDays : openDays.slice(0, PREVIEW_ROWS);

  if (!active) {
    return (
      <Card>
        <p className="text-sm text-muted">
          No classrooms yet. Add one under <strong className="font-semibold">Set-up</strong>.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <select
        aria-label="Classroom"
        className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm font-medium"
        value={active}
        onChange={(e) => { onRoom(e.target.value); setShowAllDays(false); }}
      >
        {overview.classrooms.map((c) => (
          <option key={c.classroomId} value={c.classroomId}>{c.name}</option>
        ))}
      </select>

      <Card>
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold text-ink">Next 6 weeks</h2>
          <span className="text-sm text-muted">{totals.slots} days</span>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-sage transition-all"
            style={{ width: `${coverage}%` }}
            role="img"
            aria-label={`${coverage} percent of snack days filled`}
          />
        </div>
        <div className="mt-3 flex justify-between text-sm">
          <span className="font-semibold text-sage-dark">{totals.filled} filled</span>
          <span className="text-clay">{totals.open} still open</span>
        </div>
        <p className="mt-3 text-xs text-muted">
          One family per day, bringing both a dry snack and fruit.
        </p>
      </Card>

      <Card>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-semibold text-ink">Days needing snacks</h2>
          {openDays.length > 0 && (
            <span className="shrink-0 text-sm text-muted">{openDays.length}</span>
          )}
        </div>
        {openDays.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Everything is covered. Nice.</p>
        ) : (
          <>
            <ul className="mt-3 divide-y divide-line">
              {visibleDays.map((d) => {
                // relativeLabel falls back to the date itself beyond a week,
                // which would print the same thing twice on one row.
                const rel = relativeLabel(d.date, overview.today);
                return (
                  <li key={d.date} className="flex justify-between gap-3 py-2 text-sm">
                    <span className="text-ink">{formatShort(d.date)}</span>
                    {rel !== formatShort(d.date) && <span className="text-muted">{rel}</span>}
                  </li>
                );
              })}
            </ul>
            {openDays.length > PREVIEW_ROWS && (
              <button
                type="button"
                onClick={() => setShowAllDays((v) => !v)}
                className="mt-3 text-sm font-medium text-sage underline underline-offset-4"
              >
                {showAllDays ? 'Show fewer' : `Show all ${openDays.length}`}
              </button>
            )}
          </>
        )}
      </Card>

      <Card>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-semibold text-ink">Unassigned</h2>
          {unassigned.length > 0 && (
            <span className="shrink-0 text-sm text-muted">{unassigned.length}</span>
          )}
        </div>
        {unassigned.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Every family has taken a turn.</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted">
              Children with no snack day booked. Their families are nudged
              automatically once a week.
            </p>
            <ul className="mt-3 divide-y divide-line">
              {unassigned.map((c) => (
                <li key={c.childName} className="py-2 text-sm text-ink">{c.childName}</li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
