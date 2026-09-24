'use client';

import { useMemo, useState } from 'react';
import {
  addDays, closureDates, closureReason, formatLong, formatShort, releaseBlockedReason,
  RELEASE_BLOCK_MESSAGE, SCHOOL_YEAR, type CivilDate,
} from '@bms/shared';
import { monthLabel, monthOf, monthWeeks } from '@/lib/calendar';
import type { Slot } from '@/lib/api';
import { Button } from './ui';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

// The calendar pages through the school year and no further: sign-up ends
// with the last day of school, and the months either side are just grey.
const FIRST_MONTH = monthOf(SCHOOL_YEAR.start);
const LAST_MONTH = monthOf(SCHOOL_YEAR.end);
const clampMonth = (m: string) => (m < FIRST_MONTH ? FIRST_MONTH : m > LAST_MONTH ? LAST_MONTH : m);

/** Why a weekday has no snack day, when it is not a closure. */
function outOfYear(date: CivilDate): string | null {
  if (date < SCHOOL_YEAR.start) return 'Before school starts';
  if (date > SCHOOL_YEAR.end) return 'School year over';
  return null;
}

/** "Oct 22" — for buttons, where "Thu, Oct 22" wraps on a phone. */
const shortDay = (d: CivilDate) => formatShort(d).replace(/^\w+, /, '');

export interface CalendarProps {
  today: CivilDate;
  slots: Slot[];
  /** Which classroom the grid is showing, so a claim knows where to land. */
  classroomId: string | null;
  busyDate: string | null;
  onClaim: (slot: Slot, childId?: string, switchFrom?: string) => void;
  onRelease: (slot: Slot) => void;
  /** The day the child already holds in this date's month, if any. */
  existingThisMonth: (date: CivilDate) => CivilDate | null;
  /**
   * Who the day can be assigned to. A parent's own children, or — once the API
   * has asked — the whole class roster for staff.
   */
  childOptions: { childId: string; firstName: string; lastName?: string }[];
  canClaim: boolean;
  /** Opens straight to this day — reminders deep-link to /snacks?date=… */
  initialDate?: CivilDate | null;
  /** Every upcoming day in this classroom is taken. */
  classroomFull: boolean;
  isAdmin: boolean;
  /** The child a parent is booking for; names them on the button. */
  forChildName?: string | null;
}

export function SnackCalendar({
  today, slots, classroomId, busyDate, onClaim, onRelease, childOptions, canClaim, initialDate,
  classroomFull, isAdmin, forChildName, existingThisMonth,
}: CalendarProps) {
  const [month, setMonth] = useState(clampMonth(monthOf(initialDate ?? today)));
  const [selected, setSelected] = useState<CivilDate | null>(initialDate ?? null);
  const [childId, setChildId] = useState<string | null>(null);

  const byDate = useMemo(() => {
    const m = new Map<string, Slot>();
    for (const s of slots) {
      if (!classroomId || s.classroomId === classroomId) m.set(s.date, s);
    }
    return m;
  }, [slots, classroomId]);

  const weeks = useMemo(() => monthWeeks(month), [month]);
  // Built once: a blank cell should say *why* there is no snack day.
  const closures = useMemo(() => closureDates(), []);
  const selectedSlot = selected ? byDate.get(selected) : undefined;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          aria-label="Previous month"
          disabled={month <= FIRST_MONTH}
          onClick={() => setMonth(clampMonth(monthOf(addDays(`${month}-01`, -1))))}
          className="flex size-10 items-center justify-center rounded-full text-muted hover:bg-black/5 disabled:opacity-30"
        >
          <Chevron dir="left" />
        </button>
        <h2 className="text-base font-semibold text-ink">{monthLabel(month)}</h2>
        <button
          type="button"
          aria-label="Next month"
          disabled={month >= LAST_MONTH}
          onClick={() => setMonth(clampMonth(monthOf(addDays(`${month}-28`, 7))))}
          className="flex size-10 items-center justify-center rounded-full text-muted hover:bg-black/5 disabled:opacity-30"
        >
          <Chevron dir="right" />
        </button>
      </div>

      <div className="grid grid-cols-5 gap-1 text-center text-[11px] font-medium text-muted">
        {WEEKDAYS.map((d) => <div key={d} className="pb-1">{d}</div>)}
      </div>

      <div className="grid grid-cols-5 gap-1">
        {weeks.flat().map((date) => {
          const inMonth = monthOf(date) === month;
          const slot = byDate.get(date);
          const isToday = date === today;
          const past = date < today;
          const closed = !slot && closures.has(date);
          const outside = !slot && !closed && outOfYear(date);
          const name = slot?.claimedForChildName ?? slot?.claimedByName;

          return (
            <button
              key={date}
              type="button"
              disabled={!slot}
              aria-label={`${formatLong(date)}${slot ? '' : ` — ${closed ? closureReason(date) : outside ?? 'no snack day'}`}`}
              aria-current={isToday ? 'date' : undefined}
              onClick={() => { setSelected(date); setChildId(null); }}
              className={[
                'flex min-h-16 flex-col items-center justify-start gap-0.5 rounded-xl px-1 py-1.5',
                'text-center transition-colors',
                !inMonth || outside ? 'opacity-35' : '',
                !slot ? `cursor-default ${closed ? 'bg-clay-soft/50' : 'bg-transparent'}`
                  : slot.isMine ? 'bg-sage text-white'
                  : slot.status === 'CLAIMED' ? 'bg-sage-soft text-sage-dark'
                  : past ? 'bg-black/5 text-muted'
                  : 'border border-dashed border-line bg-surface hover:border-sage',
                selected === date ? 'ring-2 ring-sage ring-offset-1' : '',
              ].join(' ')}
            >
              <span
                className={`text-xs font-semibold tabular-nums
                  ${isToday && !slot?.isMine ? 'text-clay' : ''}`}
              >
                {Number(date.slice(8))}
              </span>
              {slot ? (
                name
                  ? <span className="w-full truncate text-[10px] leading-tight">{name}</span>
                  : <span className="text-[10px] leading-tight text-muted">
                      {past ? '—' : 'Open'}
                    </span>
              ) : closed ? (
                // The reason itself, from the school calendar — "Thanksgiving",
                // not just "Closed". Long names wrap to three lines.
                <span className="line-clamp-3 w-full text-[10px] font-semibold leading-tight text-clay/90 [overflow-wrap:anywhere]">
                  {closureReason(date) ?? 'Closed'}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {selected && (
        <DayDetail
          date={selected}
          today={today}
          slot={selectedSlot}
          busy={busyDate === selected}
          canClaim={canClaim}
          childOptions={childOptions}
          childId={childId}
          onPickChild={setChildId}
          onClose={() => setSelected(null)}
          onClaim={(s, switchFrom) => onClaim(s, childId ?? undefined, switchFrom)}
          onRelease={onRelease}
          classroomFull={classroomFull}
          isAdmin={isAdmin}
          forChildName={forChildName ?? null}
          switchFrom={existingThisMonth(selected)}
        />
      )}
    </div>
  );
}

function DayDetail({
  date, today, slot, busy, canClaim, childOptions, childId, onPickChild, onClose, onClaim, onRelease,
  classroomFull, isAdmin, forChildName, switchFrom,
}: {
  date: CivilDate; today: CivilDate; slot?: Slot; busy: boolean; canClaim: boolean;
  forChildName: string | null;
  switchFrom: CivilDate | null;
  childOptions: { childId: string; firstName: string; lastName?: string }[];
  childId: string | null;
  onPickChild: (id: string) => void;
  onClose: () => void;
  onClaim: (slot: Slot, switchFrom?: string) => void;
  onRelease: (slot: Slot) => void;
  classroomFull: boolean;
  isAdmin: boolean;
}) {
  const past = date < today;
  const needsChoice = childOptions.length > 1;
  // The same rule the API enforces, so the screen never offers something the
  // server will refuse.
  const blocked = releaseBlockedReason({
    date, today, classroomHasOpenDay: !classroomFull, isAdmin,
  });
  // A switch gives up the old day, so the old day's notice rule decides it.
  const switchBlocked = switchFrom
    ? releaseBlockedReason({ date: switchFrom, today, classroomHasOpenDay: true, isAdmin })
    : null;

  return (
    <section
      aria-label={formatLong(date)}
      className="mt-4 rounded-2xl border border-line bg-surface p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-ink">{formatLong(date)}</h3>
          <p className="mt-0.5 text-sm text-muted">
            {!slot ? (closureReason(date) ?? outOfYear(date) ?? 'Not a snack day')
              : slot.status === 'CLAIMED'
                ? slot.isMine
                  ? `You ${past ? 'brought' : "'re bringing"} snacks${slot.claimedForChildName ? ` for ${slot.claimedForChildName}` : ''}`.replace('You \'re', "You're")
                  : `${slot.claimedForChildName ?? slot.claimedByName}'s family ${past ? 'brought' : 'is bringing'} snacks`
                : past ? 'Nobody signed up' : 'Nobody has signed up yet'}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mt-1 flex size-8 items-center justify-center rounded-full text-muted hover:bg-black/5"
        >
          ✕
        </button>
      </div>

      {slot && !past && (
        <div className="mt-4">
          {slot.isMine ? (
            <>
              <a
                href="/what-to-bring/"
                className="mb-3 flex items-center justify-between gap-2 rounded-xl bg-sun-soft
                           px-3.5 py-3 text-sm font-medium text-[#8a6414]"
              >
                See what to bring
                <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </a>
              {blocked ? (
                <p className="rounded-xl bg-black/5 px-3.5 py-3 text-sm leading-relaxed text-muted">
                  {RELEASE_BLOCK_MESSAGE[blocked]}
                </p>
              ) : (
                <Button variant="danger" loading={busy} className="w-full" onClick={() => onRelease(slot)}>
                  I can&apos;t do this day
                </Button>
              )}
            </>
          ) : slot.status === 'OPEN' && canClaim ? (
            <>
              {needsChoice && (
                <div className="mb-3">
                  <p className="mb-1.5 text-sm font-medium text-ink">Which child is this for?</p>
                  {/* A parent picks between two names; staff pick from a whole
                      class, where chips would be unusable. */}
                  {childOptions.length > 6 ? (
                    <select
                      aria-label="Child"
                      className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm"
                      value={childId ?? ''}
                      onChange={(e) => onPickChild(e.target.value)}
                    >
                      <option value="">Choose a child…</option>
                      {childOptions.map((c) => (
                        <option key={c.childId} value={c.childId}>
                          {c.firstName}{c.lastName ? ` ${c.lastName}` : ''}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {childOptions.map((c) => (
                        <button
                          key={c.childId}
                          type="button"
                          onClick={() => onPickChild(c.childId)}
                          className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors
                            ${childId === c.childId
                              ? 'bg-sage text-white'
                              : 'bg-black/5 text-muted hover:text-ink'}`}
                        >
                          {c.firstName}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {switchFrom ? (
                // One day a month: the child already has one. Offer to move it
                // rather than refuse; the old day is only released once the
                // new one is secured.
                <div className="rounded-xl bg-sun-soft p-3.5">
                  <p className="text-sm leading-relaxed text-[#8a6414]">
                    {forChildName ?? 'This child'} already has{' '}
                    <strong className="font-semibold">{formatShort(switchFrom)}</strong> this month.
                    {switchBlocked
                      ? ` ${RELEASE_BLOCK_MESSAGE[switchBlocked]}`
                      : ` Families take one day a month — switch to ${formatShort(date)} instead?`}
                  </p>
                  <div className="mt-3 flex flex-col gap-2">
                    <Button
                      loading={busy}
                      disabled={!!switchBlocked}
                      className="w-full"
                      onClick={() => onClaim(slot, switchFrom)}
                    >
                      Switch to {shortDay(date)}
                    </Button>
                    <Button variant="ghost" className="w-full" onClick={onClose}>
                      Keep {shortDay(switchFrom)}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  loading={busy}
                  disabled={needsChoice && !childId}
                  className="w-full"
                  onClick={() => onClaim(slot)}
                >
                  Assign this day to me{forChildName ? ` for ${forChildName}` : ''}
                </Button>
              )}
            </>
          ) : slot.status === 'OPEN' ? (
            <p className="rounded-xl bg-black/5 px-3.5 py-3 text-sm leading-relaxed text-muted">
              Only a parent of a child in this classroom can take a day.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={dir === 'left' ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} />
    </svg>
  );
}
