'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { formatLong, formatShort, relativeLabel } from '@bms/shared';
import { api, type Notification, type Slot } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Shell } from '@/components/shell';
import { InstallCard } from '@/components/install-card';
import { Button, Card, EmptyState, Skeleton } from '@/components/ui';

interface MineResponse { today: string; slots: Slot[] }

export default function HomePage() {
  const { me } = useSession();
  const [mine, setMine] = useState<MineResponse | null>(null);
  const [openCount, setOpenCount] = useState<number | null>(null);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [m, board, notes] = await Promise.all([
      api.get<MineResponse>('/api/snacks/mine'),
      api.get<{ slots: Slot[] }>('/api/snacks'),
      api.get<{ unread: number; notifications: Notification[] }>('/api/notifications'),
    ]);
    setMine(m);
    setOpenCount(board.slots.filter((s) => s.status === 'OPEN').length);
    setUnread(notes.unread);
    setLoading(false);
  }, []);

  useEffect(() => { void load().catch(() => setLoading(false)); }, [load]);

  const next = mine?.slots[0];

  return (
    <Shell>
      <header className="mb-7">
        <p className="text-sm text-muted">{greeting()}</p>
        <h1 className="text-2xl font-bold tracking-tight">{me?.firstName}</h1>
      </header>

      {loading ? (
        <Skeleton className="h-40" />
      ) : next ? (
        <section aria-labelledby="days-heading">
          <p id="days-heading" className="mb-3 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
            Your snack days
          </p>
          <ul className="space-y-3">
            {/* Every booked day, each naming the child — a family with two
                children sees both, not the nearest one and a count. */}
            {mine!.slots.map((slot, i) => {
              const soonest = i === 0;
              const who = slot.claimedForChildName;
              // relativeLabel falls back to the date beyond a week, which
              // would repeat the full date on the line below.
              const rel = relativeLabel(slot.date, mine!.today);
              const showRel = rel !== formatShort(slot.date);
              return (
                <li
                  key={`${slot.classroomId}-${slot.date}`}
                  className={soonest
                    ? 'rounded-2xl bg-sage p-5 text-white shadow-sm'
                    : 'rounded-2xl border border-line bg-surface p-4'}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
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
                    </div>
                  </div>
                  {soonest && (
                    <p className="mt-4 inline-flex rounded-full bg-white/15 px-3 py-1.5 text-sm font-medium">
                      Dry snack and fruit
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <EmptyState
          title="No snack day booked"
          body="Families take turns bringing a dry snack and fruit. Pick a day that works for you."
          action={<Link href="/snacks/"><Button>Find a day</Button></Link>}
        />
      )}

      <div className="mt-4"><InstallCard dismissible /></div>

      {openCount !== null && openCount > 0 && (
        <Card className="mt-4 flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-ink">
              {openCount} {openCount === 1 ? 'day needs' : 'days need'} a family
            </p>
            <p className="mt-0.5 text-sm text-muted">In the next few weeks.</p>
          </div>
          <Link href="/snacks/"><Button size="sm" variant="secondary">View</Button></Link>
        </Card>
      )}

      {unread > 0 && (
        <Card className="mt-4 flex items-center justify-between gap-4">
          <p className="text-sm text-ink">
            You have {unread} unread {unread === 1 ? 'message' : 'messages'}.
          </p>
          <Link href="/me/"><Button size="sm" variant="ghost">Read</Button></Link>
        </Card>
      )}
    </Shell>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
