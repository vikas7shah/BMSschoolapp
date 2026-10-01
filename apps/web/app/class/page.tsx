'use client';

import { useEffect, useMemo, useState } from 'react';
import { ApiError, api, type ClassList } from '@/lib/api';
import { formatPhone } from '@/lib/phone';
import { Shell } from '@/components/shell';
import { Banner, Button, Card, EmptyState, PageHeader, Skeleton, inputClass } from '@/components/ui';

/**
 * A teacher's class list: every child in their room, each parent, and how to
 * reach them. Read-only — changes to the roster go through the office.
 */
export default function ClassPage() {
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
    </Shell>
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
