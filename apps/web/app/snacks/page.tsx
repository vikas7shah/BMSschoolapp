'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { SNACK_NOTE, formatShort } from '@bms/shared';
import Link from 'next/link';
import { ApiError, api, type SnackBoard, type Slot } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Shell } from '@/components/shell';
import { SnackCalendar } from '@/components/snack-calendar';
import { Banner, EmptyState, PageHeader, Skeleton } from '@/components/ui';

export default function SnacksPage() {
  const { me } = useSession();
  // Reminders link to /snacks?date=…, so open that day rather than dropping
  // the parent on the current month and making them find it.
  const [linkedDate] = useState(() => {
    if (typeof window === 'undefined') return null;
    const d = new URLSearchParams(window.location.search).get('date');
    return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
  });
  const [board, setBoard] = useState<SnackBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [busyDate, setBusyDate] = useState<string | null>(null);
  /**
   * Parents choose a *child*; the classroom follows, because siblings are
   * never in the same room. Staff have no children, so they choose a room.
   */
  const [childId, setChildId] = useState<string | null>(null);
  const [staffRoom, setStaffRoom] = useState<string | null>(null);
  /**
   * Set when the API says it needs to know which child a day is for — a parent
   * with two children in the room, or staff choosing from the class roster.
   */
  const [askChildren, setAskChildren] =
    useState<{ childId: string; firstName: string; lastName?: string }[] | null>(null);
  /** The server said the child already holds a day this month; offer a switch. */
  const [serverSwitch, setServerSwitch] =
    useState<{ date: string; existingDate: string; childName: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await api.get<SnackBoard>('/api/snacks');
      setBoard(next);
      setStaffRoom((current) => current ?? next.classrooms[0]?.classroomId ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the calendar.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const act = async (
    slot: Slot, action: 'claim' | 'release', forChildId?: string, switchFrom?: string,
  ) => {
    setBusyDate(slot.date);
    setError(null);
    setFlash(null);
    const chosen = forChildId ?? activeChild?.childId;
    try {
      await api.post(`/api/snacks/${action}`, {
        classroomId: slot.classroomId, date: slot.date,
        ...(action === 'claim' && chosen ? { childId: chosen } : {}),
        ...(action === 'claim' && switchFrom ? { switchFrom } : {}),
      });
      setFlash(action === 'claim'
        ? switchFrom
          ? `Switched${activeChild ? ` ${activeChild.firstName}` : ''} from ${formatShort(switchFrom)} to ${formatShort(slot.date)}.`
          : `You're bringing snacks${activeChild ? ` for ${activeChild.firstName}` : ''} on ${formatShort(slot.date)}.`
        : `Released ${formatShort(slot.date)}.`);
      setAskChildren(null);
      setServerSwitch(null);
      await load();
    } catch (err) {
      if (err instanceof ApiError) {
        // Not a failure: the day just needs a child chosen before it can be taken.
        if (err.code === 'CHILD_REQUIRED') {
          setAskChildren(err.body.children as typeof askChildren);
          setBusyDate(null);
          return;
        }
        // One day a month: not a failure, a question — switch or keep?
        if (err.code === 'MONTH_TAKEN') {
          setServerSwitch({
            date: slot.date,
            existingDate: err.body.existingDate as string,
            childName: err.body.childName as string,
          });
          setBusyDate(null);
          return;
        }
        // A 409 means another family got there first — refresh so the board is honest.
        if (err.status === 409) await load();
      }
      setError(err instanceof ApiError ? err.message : 'That did not work. Please try again.');
    } finally {
      setBusyDate(null);
    }
  };

  const children = me?.children ?? [];
  const isParent = children.length > 0;
  const activeChild = isParent
    ? children.find((c) => c.childId === childId) ?? children[0]!
    : null;
  const classroomId = activeChild ? activeChild.classroomId : staffRoom;

  // What the day panel may assign the day to. A parent's chosen child is
  // passed explicitly; staff pick from the roster the API returns.
  const childOptions = useMemo(() => {
    if (askChildren) return askChildren;
    if (activeChild) return [{ childId: activeChild.childId, firstName: activeChild.firstName }];
    return [];
  }, [askChildren, activeChild]);

  const multiRoom = (board?.classrooms.length ?? 0) > 1;
  const hasSlots = (board?.slots.length ?? 0) > 0;

  // The day this child already holds in a given month, if any — known up
  // front for parents, so the panel can offer a switch before they tap.
  const existingFor = (date: string): string | null => {
    if (serverSwitch?.date === date) return serverSwitch.existingDate;
    if (!activeChild || !board) return null;
    const month = date.slice(0, 7);
    return board.slots.find((s) =>
      s.status === 'CLAIMED'
      && s.claimedForChildId === activeChild.childId
      && s.date.slice(0, 7) === month
      && s.date !== date,
    )?.date ?? null;
  };
  const room = board?.classrooms.find((c) => c.classroomId === classroomId);
  const locked = !!room?.full && !board?.isAdmin;

  return (
    <Shell>
      <PageHeader title="Snack days" subtitle="Tap a day your family can bring snacks." />

      {isParent && children.length > 1 && (
        <div role="tablist" aria-label="Which child" className="mb-4 flex gap-1.5 rounded-full bg-black/5 p-1">
          {children.map((c) => {
            const on = c.childId === activeChild?.childId;
            const roomLabel = board?.classrooms.find((r) => r.classroomId === c.classroomId)?.name;
            return (
              <button
                key={c.childId}
                role="tab"
                aria-selected={on}
                onClick={() => { setChildId(c.childId); setAskChildren(null); setServerSwitch(null); }}
                className={`flex flex-1 flex-col items-center rounded-full px-3 py-1.5 leading-tight
                            transition-colors ${on ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}
              >
                <span className="text-sm font-semibold">{c.firstName}</span>
                {roomLabel && (
                  <span className={`text-[11px] ${on ? 'text-muted' : 'text-muted/70'}`}>{roomLabel}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {isParent && children.length === 1 && multiRoom && (
        <p className="mb-4 text-sm text-muted">
          {room?.name}
        </p>
      )}

      {!isParent && multiRoom && (
        <select
          aria-label="Classroom"
          className="mb-4 w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-sm"
          value={staffRoom ?? ''}
          onChange={(e) => { setStaffRoom(e.target.value || null); setAskChildren(null); setServerSwitch(null); }}
        >
          {board?.classrooms.map((c) => (
            <option key={c.classroomId} value={c.classroomId}>{c.name}</option>
          ))}
        </select>
      )}

      {locked && (
        <div className="mb-4">
          <Banner tone="info">
            Every snack day is taken — thank you. The calendar is now locked;
            please contact the office if you need to swap.
          </Banner>
        </div>
      )}

      {flash && <div className="mb-4"><Banner tone="success">{flash}</Banner></div>}
      {error && <div className="mb-4"><Banner tone="error">{error}</Banner></div>}

      {loading ? (
        <Skeleton className="h-80" />
      ) : !hasSlots ? (
        <EmptyState
          title="No snack days yet"
          body="The school has not published snack days for this period yet."
        />
      ) : (
        <SnackCalendar
          today={board!.today}
          slots={board!.slots}
          classroomId={classroomId}
          busyDate={busyDate}
          childOptions={childOptions}
          canClaim={!!activeChild}
          initialDate={linkedDate}
          classroomFull={!!room?.full}
          isAdmin={!!board?.isAdmin}
          forChildName={activeChild?.firstName ?? null}
          onClaim={(slot, childId, switchFrom) => act(slot, 'claim', childId, switchFrom)}
          onRelease={(slot) => act(slot, 'release')}
          existingThisMonth={existingFor}
        />
      )}

      <Link
        href="/what-to-bring/"
        className="mt-8 flex items-center gap-3 rounded-2xl bg-sun-soft px-4 py-3.5
                   transition-colors hover:bg-[#fbecd0]"
      >
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-[#8a6414]">What to bring</h2>
          <p className="mt-1 text-sm leading-relaxed text-[#8a6414]/90">{SNACK_NOTE}</p>
          <p className="mt-1.5 text-sm font-medium text-[#8a6414] underline underline-offset-4">
            See the suggested snacks
          </p>
        </div>
        <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-[#8a6414]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="m9 18 6-6-6-6" />
        </svg>
      </Link>

      <p className="mt-4 px-1 text-xs text-muted">
        Can&apos;t make your day? Open it and tap &ldquo;I can&apos;t do this day&rdquo; so
        another family can pick it up.
      </p>
    </Shell>
  );
}
