import { eventDates, formatShort, type SchoolEvent } from '@bms/shared';

/** "12" / "26–27" / "24 Dec – 1 Jan" depending on how far the event spans. */
export function dayLabel(event: SchoolEvent): string {
  if (!event.endDate || event.endDate === event.date) return String(Number(event.date.slice(8)));
  if (event.date.slice(0, 7) === event.endDate.slice(0, 7)) {
    return `${Number(event.date.slice(8))}–${Number(event.endDate.slice(8))}`;
  }
  return `${formatShort(event.date).replace(/^\w+, /, '')} – ${formatShort(event.endDate).replace(/^\w+, /, '')}`;
}

/** One month's school events, as on the Calendar page and the Home dashboard. */
export function EventList({ events, today, compact }: { events: SchoolEvent[]; today: string; compact?: boolean }) {
  return (
    <ul className="divide-y divide-line">
      {events.map((e) => (
        // Past events stay in the list, dimmed, so the month reads whole.
        <li key={`${e.date}-${e.title}`} className={`flex gap-3 ${compact ? 'py-1.5' : 'py-2.5'} ${(e.endDate ?? e.date) < today ? 'opacity-50' : ''}`}>
          <span
            className={`w-16 shrink-0 text-sm font-semibold tabular-nums
              ${eventDates(e).includes(today) ? 'text-clay' : 'text-muted'}`}
          >
            {dayLabel(e)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-ink">{e.title}{compact && e.time ? <span className="text-muted"> · {e.time}</span> : ''}</p>
            {!compact && e.time && <p className="text-xs text-muted">{e.time}</p>}
            <div className="mt-1 flex flex-wrap gap-1.5">
              {e.closed && <Tag tone="closed">No school</Tag>}
              {e.vacationCare && <Tag tone="info">Vacation care only</Tag>}
              {e.halfDay && <Tag tone="warn">Half day</Tag>}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Tag({ tone, children }: { tone: 'closed' | 'warn' | 'info'; children: React.ReactNode }) {
  const tones = {
    closed: 'bg-clay-soft text-clay',
    warn: 'bg-sun-soft text-[#8a6414]',
    info: 'bg-sage-soft text-sage-dark',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}
