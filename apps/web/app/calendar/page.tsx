'use client';

import { useMemo } from 'react';
import {
  SCHOOL_EVENTS, SCHOOL_YEAR, formatShort, monthLabel, monthOf, todayIn, type SchoolEvent,
} from '@bms/shared';
import { BottomNav } from '@/components/nav';
import { TopBar } from '@/components/top-bar';
import { EventList } from '@/components/event-list';
import { useSession } from '@/lib/session';
import { Card } from '@/components/ui';

/**
 * Readable without signing in, like the snack guide: it is school event
 * information, and "is there school tomorrow?" should never need a password.
 */
export default function CalendarPage() {
  const { me } = useSession();
  const today = todayIn('America/New_York');

  const months = useMemo(() => {
    const grouped = new Map<string, SchoolEvent[]>();
    for (const e of SCHOOL_EVENTS) {
      const key = monthOf(e.date);
      grouped.set(key, [...(grouped.get(key) ?? []), e]);
    }
    return [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, []);

  const next = SCHOOL_EVENTS.find((e) => (e.endDate ?? e.date) >= today);

  return (
    <>
      <TopBar />
      <main className={`mx-auto w-full max-w-lg px-5 pb-28 ${me ? 'pt-4' : 'pt-8'}`}>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-ink">School calendar</h1>
        <p className="mt-1 text-sm text-muted">
          {SCHOOL_YEAR.label} · {formatShort(SCHOOL_YEAR.start)} to {formatShort(SCHOOL_YEAR.end)}
        </p>
      </header>

      {next && (
        <section className="mb-5 rounded-2xl bg-sage p-5 text-white">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/70">Next up</p>
          <p className="mt-1.5 text-lg font-bold">{next.title}</p>
          <p className="mt-0.5 text-sm text-white/85">
            {formatShort(next.date)}
            {next.endDate && next.endDate !== next.date ? ` – ${formatShort(next.endDate)}` : ''}
            {next.time ? ` · ${next.time}` : ''}
          </p>
          {next.closed && (
            <p className="mt-3 inline-flex rounded-full bg-white/15 px-3 py-1 text-sm font-medium">
              No school
            </p>
          )}
        </section>
      )}

      <div className="space-y-4">
        {months.map(([month, events]) => {
          const done = events.every((e) => (e.endDate ?? e.date) < today);
          return (
            <Card key={month} className={done ? 'opacity-60' : ''}>
              <h2 className="font-semibold text-ink">{monthLabel(month)}</h2>
              <div className="mt-3"><EventList events={events} today={today} /></div>
            </Card>
          );
        })}
      </div>

      <p className="mt-6 px-1 text-xs text-muted">
        Snack days are never scheduled on a day the school is closed.
      </p>
      </main>
      {me && <BottomNav />}
    </>
  );
}
