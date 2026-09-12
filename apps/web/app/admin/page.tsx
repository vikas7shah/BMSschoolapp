'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Shell } from '@/components/shell';
import { Banner, Button, Card, Field, PageHeader, inputClass } from '@/components/ui';
import { RosterImport } from '@/components/roster-import';
import { AdminOverview, type OverviewData } from '@/components/admin-overview';
import { AdminFamilies, type Child, type Parent } from '@/components/admin-families';

type Tab = 'OVERVIEW' | 'ROSTER' | 'IMPORT' | 'SETUP';

export default function AdminPage() {
  const { me } = useSession();
  const [tab, setTab] = useState<Tab>('OVERVIEW');
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [parents, setParents] = useState<Parent[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  /** null = every classroom. Narrows the whole Overview tab, not one card. */
  const [room, setRoom] = useState<string | null>(null);

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
          ['OVERVIEW', 'Overview'], ['ROSTER', 'Families'],
          ['IMPORT', 'Import'], ['SETUP', 'Set-up'],
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

      {tab === 'OVERVIEW' && overview && (
        <AdminOverview overview={overview} room={room} onRoom={setRoom} />
      )}

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

      {tab === 'SETUP' && (
        <SetupTab
          classrooms={overview?.classrooms ?? []}
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

function SetupTab({ classrooms, onChanged, onError }: {
  classrooms: { classroomId: string; name: string }[];
  onChanged: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState('');
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [busy, setBusy] = useState(false);
  const [gen, setGen] = useState({ classroomId: '', from: today(), to: plusDays(today(), 60) });

  async function createClassroom(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/api/admin/classrooms', { name, snackWeekdays: weekdays });
      onChanged(`Created ${name}.`);
      setName('');
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Could not create that classroom.');
    } finally { setBusy(false); }
  }

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.post<{ created: number }>('/api/admin/slots/generate', gen);
      onChanged(`Added ${r.created} snack slots.`);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Could not generate days.');
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-semibold text-ink">New classroom</h2>
        <form onSubmit={createClassroom} className="mt-3 space-y-4">
          <Field label="Name">
            <input className={inputClass} required placeholder="Primary — Room 1"
              value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field
            label="Snack days"
            hint="Which weekdays need a family to bring snacks. One family covers the whole day."
          >
            <div className="flex gap-1.5">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((d, i) => {
                const day = i + 1;
                const on = weekdays.includes(day);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setWeekdays((w) =>
                      on ? w.filter((x) => x !== day) : [...w, day].sort())}
                    className={`flex-1 rounded-xl py-2.5 text-xs font-medium transition-colors
                                ${on ? 'bg-sage text-white' : 'bg-black/5 text-muted'}`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </Field>
          <Button type="submit" loading={busy} disabled={!weekdays.length} className="w-full">
            Create classroom
          </Button>
        </form>
      </Card>

      <Card>
        <h2 className="font-semibold text-ink">Publish snack days</h2>
        <p className="mt-1 text-sm text-muted">
          Adds one open day for each snack weekday in the range. Safe to re-run —
          existing sign-ups are never touched.
        </p>
        <form onSubmit={generate} className="mt-4 space-y-4">
          <Field label="Classroom">
            <select className={inputClass} required value={gen.classroomId}
              onChange={(e) => setGen({ ...gen, classroomId: e.target.value })}>
              <option value="">Select…</option>
              {classrooms.map((c) => (
                <option key={c.classroomId} value={c.classroomId}>{c.name}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From">
              <input className={inputClass} type="date" required value={gen.from}
                onChange={(e) => setGen({ ...gen, from: e.target.value })} />
            </Field>
            <Field label="To">
              <input className={inputClass} type="date" required value={gen.to}
                onChange={(e) => setGen({ ...gen, to: e.target.value })} />
            </Field>
          </div>
          <Button type="submit" loading={busy} className="w-full">Publish days</Button>
        </form>
      </Card>
    </div>
  );
}

const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (d: string, n: number) =>
  new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
