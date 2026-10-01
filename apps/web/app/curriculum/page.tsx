'use client';

import { useEffect, useState } from 'react';
import type { Newsletter } from '@bms/shared';
import { ApiError, api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Shell } from '@/components/shell';
import { CurriculumManager } from '@/components/curriculum-manager';
import { groupMatches } from '@/components/newsletter';
import { Banner, Card, PageHeader } from '@/components/ui';

/**
 * A teacher's curriculum: the newsletter groups they teach — chosen here, as
 * "Elementary" has no classroom — and, for each, the month's curriculum with
 * their own additions.
 */
export default function CurriculumPage() {
  const { me, reload } = useSession();
  const [initialGroup] = useState(() =>
    typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('group'));
  const [allGroups, setAllGroups] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ newsletters: Newsletter[] }>('/api/newsletters')
      .then((r) => setAllGroups([...new Set(r.newsletters.flatMap((n) => n.curriculum.map((g) => g.group)))]))
      .catch(() => undefined);
  }, []);

  const mine = me?.curriculumGroups ?? [];
  const choices = [...allGroups, ...mine.filter((g) => !allGroups.some((a) => groupMatches(a, g)))];
  const isMine = (g: string) => mine.some((m) => groupMatches(m, g));

  async function toggle(g: string) {
    setBusy(true);
    setError(null);
    try {
      const next = isMine(g) ? mine.filter((m) => !groupMatches(m, g)) : [...mine, g];
      await api.put('/api/me/curriculum-groups', { groups: next });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change that.');
    } finally {
      setBusy(false);
    }
  }

  if (me && me.role !== 'TEACHER') {
    return <Shell><Banner tone="info">The office adds to the curriculum from Admin → News.</Banner></Shell>;
  }

  return (
    <Shell>
      <PageHeader title="Curriculum" subtitle="The newsletter's curriculum for your groups, and what you add to it." />

      <Card className="mb-5 !p-4">
        <h2 className="text-sm font-semibold text-ink">Groups you teach</h2>
        <p className="mt-0.5 text-xs text-muted">Tap to add or remove. Your groups show on your Home.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {choices.map((g) => (
            <button
              key={g}
              type="button"
              aria-pressed={isMine(g)}
              disabled={busy}
              onClick={() => void toggle(g)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60
                          ${isMine(g) ? 'bg-sage text-white' : 'bg-black/5 text-muted hover:text-ink'}`}
            >
              {isMine(g) ? '✓ ' : ''}{g}
            </button>
          ))}
        </div>
        {error && <div className="mt-3"><Banner tone="error">{error}</Banner></div>}
      </Card>

      <CurriculumManager groups={mine} initialGroup={initialGroup} />
    </Shell>
  );
}
