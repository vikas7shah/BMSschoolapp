'use client';

import { useCallback, useEffect, useState } from 'react';
import { CLASS_CURRICULUM_AREAS, monthLabel, monthOf, todayIn, type Newsletter } from '@bms/shared';
import { ApiError, api, type CurriculumItem } from '@/lib/api';
import { CurriculumCard, groupMatches } from './newsletter';
import { Banner, Button, Card, Skeleton, inputClass } from './ui';

/**
 * A curriculum group's month: the newsletter's areas as the office wrote them,
 * then what the teachers or the office added, which can be added to, edited
 * and removed here. Additions sit beside the newsletter's; they never replace it.
 */
export function CurriculumManager({ groups, initialGroup }: {
  /** The groups this person may add to. */
  groups: string[];
  initialGroup?: string | null;
}) {
  const [newsletters, setNewsletters] = useState<Newsletter[] | null>(null);
  const [items, setItems] = useState<CurriculumItem[] | null>(null);
  const [group, setGroup] = useState<string | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setItems((await api.get<{ items: CurriculumItem[] }>('/api/curriculum')).items);
  }, []);

  useEffect(() => {
    void load().catch(() => setItems([]));
    api.get<{ newsletters: Newsletter[] }>('/api/newsletters')
      .then((r) => setNewsletters(r.newsletters))
      .catch(() => setNewsletters([]));
  }, [load]);

  // Additions belong to a newsletter's month; before the first letter there is
  // only this month to add to.
  const months = newsletters?.length ? newsletters.map((n) => n.month) : [monthOf(todayIn('America/New_York'))];
  const activeMonth = month && months.includes(month) ? month : months[0]!;
  const activeGroup = group && groups.includes(group)
    ? group
    : groups.find((g) => initialGroup && groupMatches(g, initialGroup)) ?? groups[0] ?? null;

  if (!groups.length) {
    return <p className="px-1 text-sm text-muted">Choose a group above to see and add to its curriculum.</p>;
  }
  if (!newsletters || !activeGroup) return <Skeleton className="h-60" />;

  const letterGroup = newsletters.find((n) => n.month === activeMonth)?.curriculum
    .find((g) => groupMatches(g.group, activeGroup));
  const added = (items ?? []).filter((i) => groupMatches(i.group, activeGroup) && i.month === activeMonth);
  const short = (m: string) => monthLabel(m).replace(/ \d{4}$/, '');

  async function remove(item: CurriculumItem) {
    if (!window.confirm(`Remove “${item.text}”?`)) return;
    try {
      await api.del(`/api/curriculum/${item.month}/${item.itemId}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove that.');
    }
  }

  return (
    <div className="space-y-4">
      {groups.length > 1 && (
        <div role="tablist" aria-label="Group" className="flex flex-wrap gap-2">
          {groups.map((g) => (
            <button
              key={g}
              role="tab"
              aria-selected={g === activeGroup}
              onClick={() => { setGroup(g); setEditing(null); }}
              className={`rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors
                          ${g === activeGroup ? 'bg-sage text-white' : 'bg-black/5 text-muted'}`}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      {months.length > 1 && (
        <select
          aria-label="Month"
          className={`${inputClass} py-2.5 text-sm`}
          value={activeMonth}
          onChange={(e) => { setMonth(e.target.value); setEditing(null); }}
        >
          {months.map((m) => <option key={m} value={m}>{monthLabel(m)} newsletter</option>)}
        </select>
      )}

      {error && <Banner tone="error">{error}</Banner>}

      {letterGroup ? (
        <div>
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
            From the {short(activeMonth)} newsletter
          </p>
          <CurriculumCard group={letterGroup} month={activeMonth} />
        </div>
      ) : (
        <p className="px-1 text-sm text-muted">
          The {short(activeMonth)} newsletter has no {activeGroup} curriculum. Anything added here still shows with the newsletter.
        </p>
      )}

      <div>
        <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">Added by the teachers</p>
        {items === null ? <Skeleton className="h-20" /> : (
          <ul className="space-y-2">
            {added.map((i) => (
              <li key={i.itemId}>
                <Card className="!p-4">
                  {editing === i.itemId ? (
                    <CurriculumForm
                      group={activeGroup}
                      month={activeMonth}
                      item={i}
                      onDone={() => { setEditing(null); void load(); }}
                      onCancel={() => setEditing(null)}
                    />
                  ) : (
                    <>
                      <p className="text-[10.5px] font-bold uppercase tracking-wide text-sage-dark">{i.area}</p>
                      <p className="mt-0.5 whitespace-pre-line text-sm text-ink">{i.text}</p>
                      <div className="mt-2 flex items-center gap-4 text-xs">
                        <span className="text-muted">Added by {i.addedByName}</span>
                        <button type="button" onClick={() => setEditing(i.itemId)} className="font-medium text-sage underline underline-offset-2">Edit</button>
                        <button type="button" onClick={() => void remove(i)} className="font-medium text-clay underline underline-offset-2">Remove</button>
                      </div>
                    </>
                  )}
                </Card>
              </li>
            ))}
            {!added.length && <li className="px-1 text-sm text-muted">Nothing added yet.</li>}
          </ul>
        )}
      </div>

      <Card className="!p-4">
        <h3 className="font-semibold text-ink">Add to {activeGroup} · {short(activeMonth)}</h3>
        <p className="mt-0.5 text-xs text-muted">Parents see it with the newsletter&apos;s curriculum. Add as many as you like.</p>
        <CurriculumForm key={`${activeGroup}-${activeMonth}`} group={activeGroup} month={activeMonth} onDone={() => void load()} />
      </Card>
    </div>
  );
}

function CurriculumForm({ group, month, item, onDone, onCancel }: {
  group: string;
  month: string;
  item?: CurriculumItem;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const [area, setArea] = useState(item?.area ?? '');
  const [text, setText] = useState(item?.text ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (item) await api.put(`/api/curriculum/${item.month}/${item.itemId}`, { area, text });
      else await api.post('/api/curriculum', { group, month, area, text });
      if (!item) { setArea(''); setText(''); }
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="mt-3 space-y-2.5">
      <select
        aria-label="Area"
        className={`${inputClass} py-2.5 text-sm`}
        value={area}
        onChange={(e) => setArea(e.target.value)}
        required
      >
        <option value="">Choose an area…</option>
        {CLASS_CURRICULUM_AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
      </select>
      <textarea
        aria-label="What the class is working on"
        className={`${inputClass} min-h-20 py-2.5 text-sm`}
        placeholder="e.g. Golden beads: building numbers to 1,000"
        maxLength={300}
        value={text}
        onChange={(e) => setText(e.target.value)}
        required
      />
      {error && <Banner tone="error">{error}</Banner>}
      <div className="flex gap-2">
        <Button size="sm" type="submit" loading={busy}>{item ? 'Save' : 'Add'}</Button>
        {onCancel && <Button size="sm" variant="ghost" type="button" onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  );
}
