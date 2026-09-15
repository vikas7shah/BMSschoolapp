'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  SCHOOL_EVENTS, formatShort, monthLabel, monthOf, relativeLabel, type Newsletter,
} from '@bms/shared';
import { api, type Notification, type OverviewData, type Slot } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Shell } from '@/components/shell';
import { InstallCard } from '@/components/install-card';
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
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = me?.role === 'ADMIN';
  // An admin's Home is the school, not a family: the parent cards only appear
  // if this admin also has children on the roster.
  const isParent = !isAdmin || (me?.children.length ?? 0) > 0;

  const load = useCallback(async () => {
    const [m, notes, news] = await Promise.all([
      api.get<MineResponse>('/api/snacks/mine'),
      api.get<{ unread: number; notifications: Notification[] }>('/api/notifications'),
      api.get<{ newsletters: Newsletter[] }>('/api/newsletters').catch(() => ({ newsletters: [] })),
    ]);
    setMine(m);
    setUnread(notes.unread);
    setNewsletters(news.newsletters);
    setLoading(false);
  }, []);

  const loadOverview = useCallback(async () => {
    setOverview(await api.get<OverviewData>('/api/admin/overview'));
  }, []);

  useEffect(() => { if (isAdmin) void loadOverview().catch(() => undefined); }, [isAdmin, loadOverview]);

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
  const myCurriculum = latest
    ? latest.curriculum.filter((g) => [...myClassrooms.keys()].some((n) => groupMatches(g.group, n)))
    : [];
  const tagFor = (group: string) =>
    [...myClassrooms.entries()].find(([n]) => groupMatches(group, n))?.[1];


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

        {latest && myCurriculum.map((g) => (
          <CurriculumCard key={g.group} group={g} month={latest.month} tag={tagFor(g.group)} tile />
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

      <div className="mt-4"><InstallCard dismissible /></div>
    </Shell>
  );
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
