'use client';

import { useCallback, useEffect, useState } from 'react';
import { SCHOOL_YEAR, formatLong } from '@bms/shared';
import { ApiError, api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Shell } from '@/components/shell';
import { Banner, Button, Card, Field, PageHeader, inputClass } from '@/components/ui';
import { RosterImport } from '@/components/roster-import';
import type { OverviewData } from '@/lib/api';
import { AdminFamilies, type Child, type Parent } from '@/components/admin-families';
import { NewsletterEditor } from '@/components/newsletter-editor';

type Tab = 'ROSTER' | 'IMPORT' | 'NEWS' | 'SETUP';

export default function AdminPage() {
  const { me } = useSession();
  const [tab, setTab] = useState<Tab>('ROSTER');
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [parents, setParents] = useState<Parent[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [o, p] = await Promise.all([
        api.get<OverviewData>('/api/admin/overview'),
        api.get<{ parents: Parent[]; children: Child[] }>('/api/admin/parents'),
      ]);
      setOverview(o);
      setParents(p.parents);
      setChildren(p.children ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (me && me.role !== 'ADMIN') {
    return <Shell><Banner tone="error">This area is for school staff.</Banner></Shell>;
  }

  return (
    <Shell>
      <PageHeader title="Admin" subtitle="Snack day coverage and the family roster" />

      <div role="tablist" className="mb-5 flex gap-1.5 rounded-full bg-black/5 p-1">
        {([
          ['ROSTER', 'Families'], ['IMPORT', 'Import'], ['NEWS', 'Newsletter'], ['SETUP', 'Set-up'],
        ] as const).map(
          ([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={`flex-1 rounded-full px-2 py-2 text-[13px] font-medium transition-colors
                          ${tab === value ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}
            >
              {label}
            </button>
          ),
        )}
      </div>

      {error && <div className="mb-4"><Banner tone="error">{error}</Banner></div>}
      {flash && <div className="mb-4"><Banner tone="success">{flash}</Banner></div>}


      {tab === 'ROSTER' && (
        <div className="space-y-4">
          <Button className="w-full" onClick={() => setAdding((v) => !v)}>
            {adding ? 'Cancel' : 'Add a child'}
          </Button>
          <p className="text-center text-xs text-muted">
            Adding a whole class? Use the <strong className="font-semibold">Import</strong> tab.
          </p>
          {adding && (
            <AddChildForm
              classrooms={overview?.classrooms ?? []}
              onChanged={(msg) => { setFlash(msg); setAdding(false); void load(); }}
              onError={setError}
            />
          )}
          <AdminFamilies
            parents={parents}
            children={children}
            classrooms={overview?.classrooms ?? []}
            onChanged={(msg) => { setFlash(msg); void load(); }}
            onError={setError}
          />
        </div>
      )}

      {tab === 'IMPORT' && (
        <RosterImport
          classrooms={overview?.classrooms ?? []}
          existingPhones={new Set(parents.map((p) => p.phone).filter((v): v is string => !!v))}
          existingEmails={new Set(parents.map((p) => p.email).filter((e): e is string => !!e))}
          onImported={(msg) => { setFlash(msg); void load(); }}
          onRefresh={load}
        />
      )}

      {tab === 'NEWS' && (
        <NewsletterEditor
          onChanged={(msg) => { setFlash(msg); setError(null); }}
          onError={setError}
        />
      )}

      {tab === 'SETUP' && (
        <SetupTab
          onChanged={(msg) => { setFlash(msg); void load(); }}
          onError={setError}
        />
      )}
    </Shell>
  );
}

type ParentDraft = { name: string; phone: string; email: string };
const emptyParent = (): ParentDraft => ({ name: '', phone: '', email: '' });

/**
 * Adds a child. The child is the unique thing here; each parent is looked up
 * by phone or email and linked if they already exist, so a second child for a
 * family on the roster is an ordinary case rather than a "parent exists" error.
 */
function AddChildForm({ classrooms, onChanged, onError }: {
  classrooms: { classroomId: string; name: string }[];
  onChanged: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [child, setChild] = useState({ firstName: '', lastName: '', classroomId: '' });
  const [parents, setParents] = useState<ParentDraft[]>([emptyParent()]);

  const setParent = (i: number, patch: Partial<ParentDraft>) =>
    setParents((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const filled = parents.filter((p) => p.name.trim() || p.phone.trim() || p.email.trim());
    for (const p of filled) {
      if (!p.phone.trim() && !p.email.trim()) {
        onError(`${p.name || 'A parent'} needs a phone number or an email address.`);
        return;
      }
    }

    setBusy(true);
    try {
      const kid = {
        firstName: child.firstName.trim(),
        lastName: child.lastName.trim() || filled[0]?.name.trim().split(/\s+/).slice(1).join(' ') || child.firstName.trim(),
        classroomId: child.classroomId,
      };
      // Same shape as a one-row import: each parent is found or created, and
      // both are linked to the one child.
      const res = await api.post<{
        results: { name: string; outcome: string; reason?: string }[];
        summary: { created: number; linked: number; skipped: number; failed: number; childrenCreated: number };
      }>('/api/admin/parents/import', {
        families: filled.map((p) => {
          const [first, ...rest] = p.name.trim().split(/\s+/);
          return {
            firstName: first || kid.lastName,
            lastName: rest.join(' '),
            phone: p.phone.trim() || undefined,
            email: p.email.trim() || undefined,
            children: [kid],
          };
        }),
        children: filled.length ? [] : [kid],
      });

      const failed = res.results.find((r) => r.outcome === 'FAILED');
      if (failed) { onError(failed.reason ?? 'Could not add that child.'); return; }

      const linked = res.results.filter((r) => r.outcome === 'LINKED').map((r) => r.name);
      const created = res.results.filter((r) => r.outcome === 'CREATED').map((r) => r.name);
      const bits = [`Added ${kid.firstName}.`];
      if (linked.length) bits.push(`Linked to ${linked.join(' and ')}, already on the roster.`);
      if (created.length) bits.push(`New account${created.length > 1 ? 's' : ''} for ${created.join(' and ')}.`);
      if (!filled.length) bits.push('No parent yet — add one from Families when you have their details.');
      onChanged(bits.join(' '));
      setChild({ firstName: '', lastName: '', classroomId: '' });
      setParents([emptyParent()]);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Could not add that child.');
    } finally { setBusy(false); }
  }

  return (
    <Card>
      <form onSubmit={submit} className="space-y-5">
        <div>
          <h3 className="mb-3 font-semibold text-ink">Child</h3>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="First name">
                <input className={inputClass} required value={child.firstName}
                  onChange={(e) => setChild({ ...child, firstName: e.target.value })} />
              </Field>
              <Field label="Last name">
                <input className={inputClass} value={child.lastName}
                  onChange={(e) => setChild({ ...child, lastName: e.target.value })} />
              </Field>
            </div>
            <Field label="Classroom" hint="Siblings must be in different classrooms.">
              <select className={inputClass} required value={child.classroomId}
                onChange={(e) => setChild({ ...child, classroomId: e.target.value })}>
                <option value="">Select…</option>
                {classrooms.map((c) => (
                  <option key={c.classroomId} value={c.classroomId}>{c.name}</option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        {parents.map((p, i) => (
          <div key={i}>
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="font-semibold text-ink">{i === 0 ? 'Parent' : 'Second parent'}</h3>
              {i > 0 && (
                <button type="button" onClick={() => setParents((ps) => ps.filter((_, j) => j !== i))}
                  className="text-xs text-muted underline underline-offset-2">
                  Remove
                </button>
              )}
            </div>
            <p className="mb-3 text-xs text-muted">
              If this parent is already on the roster, the child is linked to them.
            </p>
            <div className="space-y-3">
              <Field label="Full name">
                <input className={inputClass} required={i === 0} value={p.name}
                  placeholder="Ana García"
                  onChange={(e) => setParent(i, { name: e.target.value })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Mobile">
                  <input className={inputClass} type="tel" value={p.phone}
                    onChange={(e) => setParent(i, { phone: e.target.value })} />
                </Field>
                <Field label="Email">
                  <input className={inputClass} type="email" value={p.email}
                    onChange={(e) => setParent(i, { email: e.target.value })} />
                </Field>
              </div>
            </div>
          </div>
        ))}

        {parents.length < 2 && (
          <button type="button" onClick={() => setParents((ps) => [...ps, emptyParent()])}
            className="text-sm font-medium text-sage underline underline-offset-4">
            + Add a second parent
          </button>
        )}

        <Button type="submit" loading={busy} className="w-full">Add child</Button>
      </form>
    </Card>
  );
}

/**
 * The go-live switch. A roster can be loaded and checked with this paused;
 * nothing reaches a parent until the school turns it on.
 */
function RemindersCard({ onChanged, onError }: {
  onChanged: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [paused, setPaused] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<{ remindersPaused: boolean }>('/api/admin/school')
      .then((r) => setPaused(r.remindersPaused))
      .catch(() => setPaused(false));
  }, []);

  async function flip() {
    if (paused === null) return;
    setBusy(true);
    try {
      const r = await api.patch<{ remindersPaused: boolean }>('/api/admin/school', { remindersPaused: !paused });
      setPaused(r.remindersPaused);
      onChanged(r.remindersPaused ? 'Reminders paused. Nothing will be sent until you resume.' : 'Reminders are on.');
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Could not change that.');
    } finally { setBusy(false); }
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-ink">Reminders</h2>
          <p className="mt-1 text-sm text-muted">
            {paused === null ? 'Checking…' : paused
              ? 'Paused — no emails or texts go out, whatever the calendar says. Sign-in codes still work.'
              : 'On — families hear the day before their snack day, and when days still need someone.'}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold
                          ${paused ? 'bg-clay-soft text-clay' : 'bg-sage-soft text-sage-dark'}`}>
          {paused === null ? '…' : paused ? 'Paused' : 'On'}
        </span>
      </div>
      <Button
        className="mt-4 w-full"
        variant={paused ? 'primary' : 'ghost'}
        loading={busy}
        disabled={paused === null}
        onClick={() => void flip()}
      >
        {paused ? 'Resume reminders' : 'Pause reminders'}
      </Button>
    </Card>
  );
}

function SetupTab({ onChanged, onError }: {
  onChanged: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  return (
    <div className="space-y-4">
      <RemindersCard onChanged={onChanged} onError={onError} />
      <p className="px-1 text-xs text-muted">
        Snack days are published automatically for the whole school year
        ({SCHOOL_YEAR.label}), for every classroom, minus school closures. Sign-up
        closes with the last day of school, {formatLong(SCHOOL_YEAR.end)}.
      </p>
    </div>
  );
}
