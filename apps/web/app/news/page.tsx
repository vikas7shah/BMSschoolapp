'use client';

import { useEffect, useMemo, useState } from 'react';
import { monthLabel, monthOf, type Newsletter } from '@bms/shared';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Shell } from '@/components/shell';
import { NewsletterArticle, myClassroomsOf } from '@/components/newsletter';
import { Card, EmptyState, PageHeader, Skeleton } from '@/components/ui';

export default function NewsPage() {
  const { me } = useSession();
  const [list, setList] = useState<Newsletter[] | null>(null);
  const [month, setMonth] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('month'));

  useEffect(() => {
    api.get<{ newsletters: Newsletter[] }>('/api/newsletters')
      .then((r) => setList(r.newsletters))
      .catch(() => setList([]));
  }, []);

  const current = useMemo(() => {
    if (!list?.length) return null;
    return list.find((n) => n.month === month) ?? list[0]!;
  }, [list, month]);

  // The month after the latest one, shown greyed so parents know one is coming.
  const upcoming = list?.length ? monthOf(nextMonthOf(list[0]!.month)) : null;
  const myClassrooms = myClassroomsOf(me);

  return (
    <Shell>
      <PageHeader title="Newsletter" subtitle="From the school office, once a month." />

      {list === null ? (
        <Skeleton className="h-40" />
      ) : !list.length ? (
        <EmptyState title="No newsletter yet" body="The school's first monthly letter will appear here." />
      ) : (
        <>
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Month">
            {list.map((n) => (
              <button
                key={n.month}
                role="tab"
                aria-selected={current?.month === n.month}
                onClick={() => setMonth(n.month)}
                className={`shrink-0 rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors
                            ${current?.month === n.month ? 'bg-sage text-white' : 'bg-black/5 text-muted'}`}
              >
                {monthLabel(n.month)}
              </button>
            ))}
            {upcoming && (
              <span className="shrink-0 rounded-full bg-black/5 px-3.5 py-2 text-[13px] text-muted/60">
                {monthLabel(upcoming).replace(/ \d{4}$/, '')} · arrives on the 1st
              </span>
            )}
          </div>
          {current && <NewsletterArticle newsletter={current} myClassrooms={myClassrooms} />}
        </>
      )}

      {list?.length ? (
        <Card className="mt-6 bg-transparent border-0 p-0">
          <p className="px-1 text-xs text-muted">Wording is the school’s own; only the headings are the app’s.</p>
        </Card>
      ) : null}
    </Shell>
  );
}

function nextMonthOf(month: string): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
}
