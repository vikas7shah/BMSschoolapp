'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  SCHOOL_EVENTS, formatShort, monthLabel, monthOf, relativeLabel, type Newsletter,
} from '@bms/shared';
import { api, type ClassList, type CurriculumItem, type Notification, type OverviewData, type Slot, type SnackBoard } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Shell } from '@/components/shell';
import { InstallPrompt } from '@/components/install-prompt';
import { Banner, Button, Skeleton, Tile } from '@/components/ui';
import { Coverage } from '@/components/coverage';
import { EventList } from '@/components/event-list';
import { CurriculumCard, groupMatches, myClassroomsOf } from '@/components/newsletter';
import { NewsletterDeck } from '@/components/newsletter-deck';


interface MineResponse { today: string; slots: Slot[] }

export default function HomePage() {
  const { me } = useSession();
  const [mine, setMine] = useState<MineResponse | null>(null);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [newsletters, setNewsletters] = useState<Newsletter[] | null>(null);
  const [extras, setExtras] = useState<CurriculumItem[]>([]);
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = me?.role === 'ADMIN';
  const isTeacher = me?.role === 'TEACHER';
  // An admin's or a teacher's Home is the school, not a family: the parent
  // cards only appear if they also have children on the roster.
  const isParent = me?.role === 'PARENT' || (me?.children.length ?? 0) > 0;
  const [classes, setClasses] = useState<ClassList[] | null>(null);
  const [board, setBoard] = useState<SnackBoard | null>(null);

  const load = useCallback(async () => {
    const [m, notes, news, added] = await Promise.all([
      api.get<MineResponse>('/api/snacks/mine'),
      api.get<{ unread: number; notifications: Notification[] }>('/api/notifications'),
      api.get<{ newsletters: Newsletter[] }>('/api/newsletters').catch(() => ({ newsletters: [] })),
      api.get<{ items: CurriculumItem[] }>('/api/curriculum').catch(() => ({ items: [] })),
    ]);
    setExtras(added.items);
    setMine(m);
    setUnread(notes.unread);
    setNewsletters(news.newsletters);
    setLoading(false);
  }, []);

  const loadOverview = useCallback(async () => {
    setOverview(await api.get<OverviewData>('/api/admin/overview'));
  }, []);

  useEffect(() => { if (isAdmin) void loadOverview().catch(() => undefined); }, [isAdmin, loadOverview]);

  // A teacher's Home leads with their class: who is in it, and whose turn
  // it is to bring snacks.
  useEffect(() => {
    if (!isTeacher) return;
    void Promise.all([
      api.get<{ classrooms: ClassList[] }>('/api/class').then((r) => setClasses(r.classrooms)),
      api.get<SnackBoard>('/api/snacks').then(setBoard),
    ]).catch(() => undefined);
  }, [isTeacher]);

  useEffect(() => { void load().catch(() => setLoading(false)); }, [load]);

  // Home is this month and next. Days further out exist (a family can book
  // as far as June) but are noise here; they surface as their month arrives.
  const today = mine?.today ?? new Date().toISOString().slice(0, 10);
  const nextMonth = monthOf(addMonths(today, 1));
  const window = new Set([monthOf(today), nextMonth]);
  const soon = mine?.slots.filter((s) => window.has(monthOf(s.date))) ?? [];
  const later = (mine?.slots.length ?? 0) - soon.length;
  const next = soon[0];

  // Everything on Home is one month, named once at the top. The calendar card
  // is that month's events, past ones included (dimmed); only when a month
  // has none at all does it show the next month's, and says so.
  const thisMonth = monthOf(today);
  const eventsIn = (month: string) => SCHOOL_EVENTS.filter((e) => monthOf(e.date) === month);
  const eventMonth = eventsIn(thisMonth).length ? thisMonth : nextMonth;
  const events = eventsIn(eventMonth);

  const myClassrooms = myClassroomsOf(me);
  const latest = newsletters?.[0] ?? null;
  // The latest letter's curriculum for each of my groups, with whatever the
  // teachers or the office added to that month alongside it.
  const curriculumCards = latest
    ? latest.curriculum
      .filter((g) => myClassrooms.has(g.group) || [...myClassrooms.keys()].some((n) => groupMatches(g.group, n)))
      .map((g) => ({
        group: g,
        tag: [...myClassrooms.entries()].find(([n]) => groupMatches(g.group, n))?.[1],
        extras: extras.filter((e) => groupMatches(e.group, g.group) && e.month === latest.month),
      }))
    : [];


  return (
    <Shell wide>
      <header className="mb-6">
        <p className="text-sm text-muted">{greeting()}, {me?.firstName}</p>
        <h1 className="font-serif text-[26px] font-semibold tracking-tight">
          {monthLabel(thisMonth).replace(/ \d{4}$/, '')} at BMS
        </h1>
      </header>

      {error && <div className="mb-3"><Banner tone="error">{error}</Banner></div>}
      {flash && <div className="mb-3"><Banner tone="success">{flash}</Banner></div>}

      {/* One grid, every tile the same box: columns to fit the screen, rows of
          a fixed height. Order: coverage (admins), snack days, newsletter,
          calendar, curriculum. A family with three children simply uses more
          tiles; nothing scrolls inside one. */}
      <div className="grid gap-4 [grid-auto-rows:236px] [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
        {isAdmin && (overview
          ? <Coverage overview={overview} tile onChanged={(m) => { setFlash(m); setError(null); void loadOverview(); }} onError={setError} />
          : <Skeleton className="h-full" />)}

        {isTeacher && (classes
          ? classes.map((room) => (
            <ClassTile
              key={room.classroomId}
              room={room}
              board={board}
              teachers={latest?.curriculum.find((g) => groupMatches(g.group, room.name))?.teachers}
            />
          ))
          : <Skeleton className="h-full" />)}

        {isParent && (loading ? (
          <Skeleton className="h-full" />
        ) : soon.length ? (
          // One tile for the family: every booked day this month and next,
          // one under the other, the soonest first and lifted.
          <Tile label="Snack days" tone="sage">
            <ul className="mt-1 flex min-h-0 flex-1 flex-col gap-2">
              {soon.slice(0, 3).map((slot, i) => {
                const rel = relativeLabel(slot.date, mine!.today);
                const showRel = rel !== formatShort(slot.date);
                return (
                  <li
                    key={`${slot.classroomId}-${slot.date}`}
                    className={`rounded-xl px-3 py-2 ${i === 0 ? 'bg-white/15' : 'bg-white/5'}`}
                  >
                    <p className={`font-bold ${i === 0 ? 'text-[19px]' : 'text-[16px]'}`}>
                      {slot.claimedForChildName ?? 'Snacks'}
                      {showRel && <span className="ml-2 text-[13px] font-medium text-white/75">{rel}</span>}
                    </p>
                    <p className="text-[13px] text-white/85">
                      {formatShort(slot.date)}{slot.classroomName ? ` · ${slot.classroomName}` : ''}
                    </p>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-[12px] text-white/70">
              {soon.length > 3 ? `+${soon.length - 3} more · ` : ''}Dry snack and fruit
            </p>
          </Tile>
        ) : (
          <Tile label="Snack days">
            <p className="mt-1 text-lg font-bold text-ink">{later > 0 ? 'Nothing this month or next' : 'No day booked yet'}</p>
            <p className="mt-1 text-sm text-muted">
              {later > 0
                ? `Your ${later === 1 ? 'day is' : 'days are'} later in the year.`
                : 'Families take turns bringing a dry snack and fruit.'}
            </p>
            <Link href="/snacks/" className="mt-auto self-start">
              <Button size="sm">{later > 0 ? 'See the calendar' : 'Find a day'}</Button>
            </Link>
          </Tile>
        ))}

        {latest && <NewsletterDeck newsletter={latest} tile />}

        {events.length > 0 && (
          <Tile label="Calendar">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-semibold text-ink">
                {eventMonth === thisMonth ? 'At school' : `${monthLabel(eventMonth).replace(/ \d{4}$/, '')} at school`}
              </h2>
              <Link href="/calendar/" className="text-xs text-muted underline underline-offset-2">Full calendar</Link>
            </div>
            <div className="mt-1 min-h-0 flex-1 overflow-hidden"><EventList events={events} today={today} compact /></div>
          </Tile>
        )}

        {latest && curriculumCards.map((c) => (
          <CurriculumCard
            key={c.group.group}
            group={c.group}
            month={latest.month}
            tag={c.tag}
            extras={c.extras}
            tile
            action={isTeacher && (
              <Link
                href={`/curriculum/?group=${encodeURIComponent(c.group.group)}`}
                className="shrink-0 text-xs font-medium text-sage underline underline-offset-2"
              >
                Add
              </Link>
            )}
          />
        ))}

        {unread > 0 && (
          <Tile label="Messages">
            <p className="mt-1 text-sm text-ink">You have {unread} unread {unread === 1 ? 'message' : 'messages'}.</p>
            <Link href="/me/" className="mt-auto self-start"><Button size="sm" variant="ghost">Read</Button></Link>
          </Tile>
        )}
      </div>

      {isParent && later > 0 && soon.length > 0 && (
        <p className="mt-3 px-1 text-xs text-muted">
          {later} more snack {later === 1 ? 'day' : 'days'} later in the year — {later === 1 ? 'it' : 'they'}&apos;ll show
          here as the month comes round.
        </p>
      )}

      <InstallPrompt />
    </Shell>
  );
}

/** A teacher's classroom on Home: who's in it, and the next snack days. */
function ClassTile({ room, board, teachers }: { room: ClassList; board: SnackBoard | null; teachers?: string }) {
  const parents = new Set(room.children.flatMap((k) => k.parents.map((p) => p.phone ?? p.email ?? p.firstName))).size;
  const upcoming = (board?.slots ?? [])
    .filter((s) => s.classroomId === room.classroomId && s.date >= board!.today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);
  const month = board ? monthOf(board.today) : null;
  const thisMonth = (board?.slots ?? []).filter((s) => s.classroomId === room.classroomId && monthOf(s.date) === month);
  const taken = thisMonth.filter((s) => s.status === 'CLAIMED').length;
  return (
    <>
      <Tile label="Your class" tone="sage">
        <p className="mt-1 font-serif text-[26px] font-semibold leading-tight">{room.name}</p>
        <p className="mt-1 text-[14px] text-white/85">
          {room.children.length} {room.children.length === 1 ? 'child' : 'children'} · {parents} {parents === 1 ? 'parent' : 'parents'}
        </p>
        {teachers && <p className="mt-0.5 truncate text-[13px] text-white/70">{teachers}</p>}
        {thisMonth.length > 0 && (
          <div className="mt-3">
            <p className="text-[12px] text-white/80">
              {monthLabel(month!).replace(/ \d{4}$/, '')} snack days: {taken} of {thisMonth.length} taken
            </p>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full bg-white" style={{ width: `${(taken / thisMonth.length) * 100}%` }} />
            </div>
          </div>
        )}
        <div className="mt-auto flex flex-wrap gap-2 pt-3">
          <Link href="/class/"><Button size="sm" variant="secondary">Class list</Button></Link>
        </div>
      </Tile>
      <Tile label="Snacks coming up">
        {!board ? (
          <Skeleton className="mt-2 flex-1" />
        ) : upcoming.length ? (
          <ul className="mt-2 flex min-h-0 flex-1 flex-col gap-1.5">
            {upcoming.map((s) => (
              <li key={s.date} className="flex items-baseline justify-between gap-3 rounded-xl bg-cream px-3 py-2">
                <span className="shrink-0 text-[13px] text-muted">{dayLabel(s.date, board.today)}</span>
                <span className={`truncate text-sm font-semibold ${s.status === 'CLAIMED' ? 'text-ink' : 'text-clay'}`}>
                  {s.status === 'CLAIMED' ? `${s.claimedForChildName ?? s.claimedByName}’s family` : 'Nobody yet'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-muted">No snack days coming up.</p>
        )}
        <Link href="/snacks/" className="mt-2 self-start text-xs text-muted underline underline-offset-2">Snack calendar</Link>
      </Tile>
    </>
  );
}

/** "Today", "Tomorrow", else "Tue, Oct 6". */
function dayLabel(date: string, today: string): string {
  const rel = relativeLabel(date, today);
  return rel === 'Today' || rel === 'Tomorrow' ? rel : formatShort(date);
}

/** First of the month `n` months after the given date's. */
function addMonths(date: string, n: number): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7)) - 1 + n;
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
