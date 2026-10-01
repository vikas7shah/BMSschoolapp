'use client';

import type { Alert } from '@/lib/api';

/** Each kind's colour and label: a closure has to stand out from a reminder. */
export const ALERT_KINDS: Record<Alert['kind'], { label: string; icon: string; box: string; chip: string }> = {
  CLOSURE: { label: 'School closed', icon: '❄️', box: 'border-clay/30 bg-clay-soft', chip: 'bg-clay text-white' },
  EARLY_DISMISSAL: { label: 'Early dismissal', icon: '⏰', box: 'border-[#e9c46a]/50 bg-sun-soft', chip: 'bg-[#8a6414] text-white' },
  REMINDER: { label: 'Reminder', icon: '📌', box: 'border-sage/25 bg-sage-soft', chip: 'bg-sage text-white' },
  GENERAL: { label: 'Message', icon: '📣', box: 'border-line bg-surface', chip: 'bg-black/10 text-ink' },
};

/** "Today 7:02 am", "Yesterday 6:45 pm", else "Mon, Oct 5". */
export function whenSent(iso: string): string {
  const d = new Date(iso);
  const day = (x: Date) => x.toDateString();
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  if (day(d) === day(now)) return `Today ${time}`;
  if (day(d) === day(new Date(now.getTime() - 864e5))) return `Yesterday ${time}`;
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

export function AlertCard({ alert, classroomNames, compact }: {
  alert: Alert;
  classroomNames: Record<string, string>;
  /** On Home: the message clamped, so a long one can't push the page down. */
  compact?: boolean;
}) {
  const k = ALERT_KINDS[alert.kind];
  const to = alert.audience === 'SCHOOL'
    ? 'Whole school'
    : alert.classroomIds.map((id) => classroomNames[id] ?? 'A classroom').join(', ');
  return (
    <article className={`rounded-2xl border p-4 ${k.box}`}>
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${k.chip}`}>
          <span aria-hidden className="mr-1">{k.icon}</span>{k.label}
        </span>
        <span className="truncate text-xs text-muted">{to}</span>
      </div>
      <h3 className="mt-2 font-semibold text-ink">{alert.title}</h3>
      <p className={`mt-1 whitespace-pre-line text-sm leading-relaxed text-ink ${compact ? 'line-clamp-3' : ''}`}>{alert.message}</p>
      <p className="mt-2 text-xs text-muted">{alert.sentByName} · {whenSent(alert.createdAt)}</p>
    </article>
  );
}
