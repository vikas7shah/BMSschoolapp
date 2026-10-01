'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CLASS_CURRICULUM_AREAS, monthLabel, monthOf, todayIn, type Newsletter,
} from '@bms/shared';
import { ApiError, api, type ClassList, type CurriculumItem } from '@/lib/api';
import { CurriculumCard, groupMatches } from '@/components/newsletter';
import { formatPhone } from '@/lib/phone';
import { Shell } from '@/components/shell';
import { Banner, Button, Card, EmptyState, PageHeader, Skeleton, inputClass } from '@/components/ui';

/**
 * A teacher's class: every child in their room, each parent and how to reach
 * them (read-only — the roster is the office's), and the class's curriculum,
 * which the teacher can add to beyond what the newsletter lists.
 */
export default function ClassPage() {
  const [view, setView] = useState<'CHILDREN' | 'CURRICULUM'>(() =>
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tab') === 'curriculum'
      ? 'CURRICULUM' : 'CHILDREN');
  const [rooms, setRooms] = useState<ClassList[] | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.get<{ classrooms: ClassList[] }>('/api/class')
      .then((r) => { setRooms(r.classrooms); setRoomId(r.classrooms[0]?.classroomId ?? null); })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load the class list.'));
  }, []);

  const room = rooms?.find((r) => r.classroomId === roomId) ?? null;
  const parentCount = room ? new Set(room.children.flatMap((k) => k.parents.map(contactKey))).size : 0;

  const shown = useMemo(() => {
    if (!room) return [];
    const q = query.trim().toLowerCase();
    if (!q) return room.children;
    return room.children.filter((k) =>
      `${k.firstName} ${k.lastName}`.toLowerCase().includes(q)
      || k.parents.some((p) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(q)));
  }, [room, query]);

  async function copyEmails() {
    if (!room) return;
    const emails = [...new Set(room.children.flatMap((k) => k.parents.map((p) => p.email)).filter(Boolean))];
    await navigator.clipboard.writeText(emails.join(', ')).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <Shell>
      <PageHeader
        title={room?.name ?? 'Your class'}
        subtitle={room ? `${plural(room.children.length, 'child', 'children')} · ${plural(parentCount, 'parent')}` : undefined}
      />

      {error && <Banner tone="error">{error}</Banner>}

      {rooms && rooms.length > 1 && (
        <div role="tablist" aria-label="Classroom" className="mb-4 flex gap-1.5 rounded-full bg-black/5 p-1">
          {rooms.map((r) => (
            <button
              key={r.classroomId}
              role="tab"
              aria-selected={r.classroomId === roomId}
              onClick={() => { setRoomId(r.classroomId); setQuery(''); }}
              className={`flex-1 rounded-full px-3 py-2 text-[13px] font-medium transition-colors
                          ${r.classroomId === roomId ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}

      {!rooms && !error ? (
        <Skeleton className="h-80" />
      ) : rooms && !rooms.length ? (
        <EmptyState
          title="No classroom yet"
          body="The office hasn't linked you to a classroom. Ask them to add it."
        />
      ) : room && (
        <>
          <div role="tablist" aria-label="View" className="mb-4 flex gap-1.5 rounded-full bg-black/5 p-1">
            {([['CHILDREN', 'Children'], ['CURRICULUM', 'Curriculum']] as const).map(([v, label]) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={`flex-1 rounded-full px-3 py-2 text-[13px] font-medium transition-colors
                            ${view === v ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {view === 'CURRICULUM' ? <ClassCurriculum room={room} /> : (
          <>
          <div className="mb-4 flex gap-2">
            <input
              className={`${inputClass} py-2.5 text-sm`}
              type="search"
              placeholder="Find a child or parent"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Button size="sm" variant="secondary" className="shrink-0 !min-h-11" onClick={() => void copyEmails()}>
              {copied ? 'Copied' : 'Copy emails'}
            </Button>
          </div>

          {shown.length === 0 ? (
            <p className="px-1 text-sm text-muted">Nobody matches &ldquo;{query}&rdquo;.</p>
          ) : (
            <ul className="space-y-2.5">
              {shown.map((k) => (
                <li key={k.childId}>
                  <Card className="!p-4">
                    <div className="flex items-center gap-3">
                      <div className="grid size-10 shrink-0 place-items-center rounded-full bg-sage-soft text-sm font-bold text-sage-dark">
                        {(k.firstName[0] ?? '') + (k.lastName[0] ?? '')}
                      </div>
                      <p className="min-w-0 truncate font-semibold text-ink">{k.firstName} {k.lastName}</p>
                    </div>
                    {k.parents.length === 0 ? (
                      <p className="mt-3 text-sm text-muted">No parent on file.</p>
                    ) : (
                      <ul className="mt-3 divide-y divide-line border-t border-line">
                        {k.parents.map((p) => (
                          <li key={contactKey(p)} className="flex items-center justify-between gap-3 py-2.5 last:pb-0">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-ink">{p.firstName} {p.lastName}</p>
                              {p.phone && <p className="truncate text-xs text-muted">{formatPhone(p.phone)}</p>}
                              {p.email && <p className="truncate text-xs text-muted">{p.email}</p>}
                              {!p.phone && !p.email && <p className="text-xs text-muted">No contact on file</p>}
                            </div>
                            <div className="flex shrink-0 gap-1.5">
                              {p.phone && <ContactButton href={`tel:${p.phone}`} label={`Call ${p.firstName}`}><PhoneIcon /></ContactButton>}
                              {p.phone && <ContactButton href={`sms:${p.phone}`} label={`Text ${p.firstName}`}><TextIcon /></ContactButton>}
                              {p.email && <ContactButton href={`mailto:${p.email}`} label={`Email ${p.firstName}`}><MailIcon /></ContactButton>}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-5 px-1 text-xs text-muted">
            A name or number wrong? The office keeps the roster — let them know and they&apos;ll fix it.
          </p>
          </>
          )}
        </>
      )}
    </Shell>
  );
}

/**
 * The class's curriculum for this month or next: the newsletter's six areas as
 * the office wrote them, then whatever the teachers add. Parents of the class
 * see the additions alongside the newsletter's.
 */
function ClassCurriculum({ room }: { room: ClassList }) {
  const thisMonth = monthOf(todayIn('America/New_York'));
  const nextMonth = monthOf(new Date(Date.UTC(Number(thisMonth.slice(0, 4)), Number(thisMonth.slice(5, 7)), 1)).toISOString().slice(0, 10));
  const [month, setMonth] = useState(thisMonth);
  const [newsletters, setNewsletters] = useState<Newsletter[]>([]);
  const [items, setItems] = useState<CurriculumItem[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await api.get<{ items: CurriculumItem[] }>('/api/curriculum');
    setItems(r.items);
  }, []);

  useEffect(() => {
    void load().catch(() => setItems([]));
    api.get<{ newsletters: Newsletter[] }>('/api/newsletters').then((r) => setNewsletters(r.newsletters)).catch(() => undefined);
  }, [load]);

  const letterGroup = newsletters.find((n) => n.month === month)?.curriculum.find((g) => groupMatches(g.group, room.name));
  const mine = (items ?? []).filter((i) => i.classroomId === room.classroomId && i.month === month);
  const short = (m: string) => monthLabel(m).replace(/ \d{4}$/, '');

  async function remove(item: CurriculumItem) {
    if (!window.confirm(`Remove “${item.text}”?`)) return;
    try {
      await api.del(`/api/curriculum/${item.month}/${item.classroomId}/${item.itemId}`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove that.');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {[thisMonth, nextMonth].map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => { setMonth(m); setEditing(null); }}
            className={`rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors
                        ${month === m ? 'bg-sage text-white' : 'bg-black/5 text-muted'}`}
          >
            {short(m)}
          </button>
        ))}
      </div>

      {error && <Banner tone="error">{error}</Banner>}

      {letterGroup ? (
        <div>
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">From the newsletter</p>
          <CurriculumCard group={letterGroup} month={month} />
        </div>
      ) : (
        <p className="px-1 text-sm text-muted">
          The {short(month)} newsletter isn&apos;t out yet. Anything you add shows to parents now.
        </p>
      )}

      <div>
        <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">Added by the teachers</p>
        {items === null ? <Skeleton className="h-20" /> : (
          <ul className="space-y-2">
            {mine.map((i) => (
              <li key={i.itemId}>
                <Card className="!p-4">
                  {editing === i.itemId ? (
                    <CurriculumForm
                      room={room}
                      month={month}
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
            {!mine.length && <li className="px-1 text-sm text-muted">Nothing added for {short(month)} yet.</li>}
          </ul>
        )}
      </div>

      <Card className="!p-4">
        <h3 className="font-semibold text-ink">Add to {short(month)}&apos;s curriculum</h3>
        <p className="mt-0.5 text-xs text-muted">Parents of {room.name} see this with the newsletter&apos;s curriculum.</p>
        <CurriculumForm key={month} room={room} month={month} onDone={() => void load()} />
      </Card>
    </div>
  );
}

function CurriculumForm({ room, month, item, onDone, onCancel }: {
  room: ClassList;
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
      if (item) await api.put(`/api/curriculum/${item.month}/${item.classroomId}/${item.itemId}`, { area, text });
      else await api.post('/api/curriculum', { classroomId: room.classroomId, month, area, text });
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

function ContactButton({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      aria-label={label}
      title={label}
      className="grid size-9 place-items-center rounded-full bg-sage-soft text-sage-dark transition-colors hover:bg-[#dae7dd]"
    >
      {children}
    </a>
  );
}

const contactKey = (p: { firstName: string; lastName: string; phone?: string; email?: string }) =>
  p.phone ?? p.email ?? `${p.firstName} ${p.lastName}`;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const icon = { viewBox: '0 0 24 24', className: 'size-4', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };

function PhoneIcon() {
  return <svg {...icon}><path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></svg>;
}
function TextIcon() {
  return <svg {...icon}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" /></svg>;
}
function MailIcon() {
  return <svg {...icon}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 6.5 8.5 6 8.5-6" /></svg>;
}
