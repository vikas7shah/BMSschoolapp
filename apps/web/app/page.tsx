'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  SCHOOL_EVENTS, formatLong, formatShort, monthLabel, monthOf, relativeLabel, type Newsletter,
} from '@bms/shared';
import { api, type Notification, type OverviewData, type Slot } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Shell } from '@/components/shell';
import { InstallCard } from '@/components/install-card';
import { Banner, Button, Card, EmptyState, Skeleton } from '@/components/ui';
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

  // Home is a dashboard in rows: coverage (admins), then the family's snack
  // days across the full width, then the newsletter beside the calendar.
  // Within a row, cards sit side by side where the screen allows and fold
  // underneath each other on a phone.
  const row = 'flex flex-wrap items-start gap-4';
  const col = 'min-w-0 flex-[1_1_300px]';

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

      <div className="space-y-6">
        {isAdmin && (
          <section aria-labelledby="coverage-heading">
            <p id="coverage-heading" className="mb-3 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
              Snack day coverage
            </p>
            {overview
              ? <Coverage overview={overview} row onChanged={(m) => { setFlash(m); setError(null); void loadOverview(); }} onError={setError} />
              : <Skeleton className="h-40" />}
          </section>
        )}

        {isParent && (
          <section aria-labelledby="days-heading">
            <p id="days-heading" className="mb-3 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
              Snack days
            </p>
            {loading ? (
              <Skeleton className="h-40" />
            ) : next ? (
              <>
                <ul className={row}>
                  {/* Every booked day this month and next, each naming the child. */}
                  {soon.map((slot, i) => {
                    const soonest = i === 0;
                    const who = slot.claimedForChildName;
                    // relativeLabel falls back to the date beyond a week, which
                    // would repeat the full date on the line below.
                    const rel = relativeLabel(slot.date, mine!.today);
                    const showRel = rel !== formatShort(slot.date);
                    return (
                      <li
                        key={`${slot.classroomId}-${slot.date}`}
                        className={`${col} ${soonest
                          ? 'rounded-2xl bg-sage p-5 text-white shadow-sm'
                          : 'rounded-2xl border border-line bg-surface p-4'}`}
                      >
                        <p className={`text-xl font-bold ${soonest ? '' : 'text-ink'}`}>
                          {who ? `${who}` : 'Snacks'}
                          {showRel && (
                            <span className={`ml-2 text-base font-medium ${soonest ? 'text-white/80' : 'text-muted'}`}>
                              {rel}
                            </span>
                          )}
                        </p>
                        <p className={`mt-0.5 text-sm ${soonest ? 'text-white/85' : 'text-muted'}`}>
                          {formatLong(slot.date)}
                          {slot.classroomName ? ` · ${slot.classroomName}` : ''}
                        </p>
                        {soonest && (
                          <p className="mt-4 inline-flex rounded-full bg-white/15 px-3 py-1.5 text-sm font-medium">
                            Dry snack and fruit
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {later > 0 && (
                  <p className="mt-3 px-1 text-xs text-muted">
                    {later} more {later === 1 ? 'day' : 'days'} later in the year — they&apos;ll show here as
                    their month comes round.
                  </p>
                )}
              </>
            ) : (
              <EmptyState
                title={later > 0 ? 'Nothing this month or next' : 'No snack day booked'}
                body={later > 0
                  ? `Your ${later === 1 ? 'day is' : 'days are'} later in the year — ${later === 1 ? 'it' : 'they'}'ll show here as the month comes round.`
                  : 'Families take turns bringing a dry snack and fruit. Pick a day that works for you.'}
                action={<Link href="/snacks/"><Button>{later > 0 ? 'See the calendar' : 'Find a day'}</Button></Link>}
              />
            )}
          </section>
        )}

        <div className={row}>
        {latest && (
          <section aria-labelledby="month-heading" className={col}>
            <p id="month-heading" className="mb-3 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
              Newsletter
            </p>
            <div className="space-y-3">
              <NewsletterDeck newsletter={latest} />
              {myCurriculum.map((g) => (
                <CurriculumCard key={g.group} group={g} month={latest.month} tag={tagFor(g.group)} />
              ))}
            </div>
          </section>
        )}

        <section aria-labelledby="up-heading" className={col}>
          <p id="up-heading" className="mb-3 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
            Calendar
          </p>
          <div className="space-y-3">
            {events.length > 0 && (
              <Card>
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="font-semibold text-ink">
                    {eventMonth === thisMonth ? 'At school' : `${monthLabel(eventMonth).replace(/ \d{4}$/, '')} at school`}
                  </h2>
                  <Link href="/calendar/" className="text-xs text-muted underline underline-offset-2">Full calendar</Link>
                </div>
                <div className="mt-2"><EventList events={events} today={today} /></div>
              </Card>
            )}
            {unread > 0 && (
              <Card className="flex items-center justify-between gap-4">
                <p className="text-sm text-ink">
                  You have {unread} unread {unread === 1 ? 'message' : 'messages'}.
                </p>
                <Link href="/me/"><Button size="sm" variant="ghost">Read</Button></Link>
              </Card>
            )}
            <InstallCard dismissible />
          </div>
        </section>
        </div>
      </div>
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
