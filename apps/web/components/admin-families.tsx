'use client';

import { useMemo, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { Banner, Button, Card, inputClass } from './ui';

export interface Parent {
  userId: string; firstName: string; lastName: string; phone?: string; email?: string;
  extraPhones?: string[]; extraEmails?: string[];
  role: string; status: string; lastLoginAt?: string;
  children: { childId: string; firstName: string; classroomId: string }[];
}

export interface Child {
  childId: string; firstName: string; lastName: string; classroomId: string;
}

interface Props {
  parents: Parent[];
  children: Child[];
  classrooms: { classroomId: string; name: string }[];
  onChanged: (msg: string) => void;
  onError: (msg: string) => void;
}

type View = 'CHILDREN' | 'CONTACTS';

export function AdminFamilies({ parents, children, classrooms, onChanged, onError }: Props) {
  const [view, setView] = useState<View>('CHILDREN');

  const roomName = (id: string) =>
    classrooms.find((c) => c.classroomId === id)?.name ?? 'No classroom';

  // Guardians per child, inverted from the roster.
  const guardiansOf = useMemo(() => {
    const map = new Map<string, Parent[]>();
    for (const p of parents) {
      for (const c of p.children) map.set(c.childId, [...(map.get(c.childId) ?? []), p]);
    }
    return map;
  }, [parents]);

  const byRoom = useMemo(() => {
    const map = new Map<string, Child[]>();
    for (const c of children) map.set(c.classroomId, [...(map.get(c.classroomId) ?? []), c]);
    return [...map.entries()].sort((a, b) => roomName(a[0]).localeCompare(roomName(b[0])));
  }, [children, classrooms]);

  const missingEmail = parents.filter((p) => !p.email).length;
  const noGuardian = children.filter((c) => !guardiansOf.get(c.childId)?.length).length;

  // Siblings are never placed together. The importer and the add-family form
  // refuse it, but data can be edited directly, so it is checked here too.
  const clashes = useMemo(() => {
    const flagged = new Set<string>();
    for (const p of parents) {
      const byRoom = new Map<string, string[]>();
      for (const c of p.children) byRoom.set(c.classroomId, [...(byRoom.get(c.classroomId) ?? []), c.childId]);
      for (const ids of byRoom.values()) if (ids.length > 1) ids.forEach((id) => flagged.add(id));
    }
    return flagged;
  }, [parents]);

  return (
    <div className="space-y-4">
      <div role="tablist" className="flex gap-1.5 rounded-full bg-black/5 p-1">
        {([['CHILDREN', `Children (${children.length})`], ['CONTACTS', `Contacts (${parents.length})`]] as const)
          .map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={view === value}
              onClick={() => setView(value)}
              className={`flex-1 rounded-full px-3 py-2 text-sm font-medium transition-colors
                          ${view === value ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}
            >
              {label}
            </button>
          ))}
      </div>

      {view === 'CHILDREN' ? (
        <>
          {clashes.size > 0 && (
            <Banner tone="error">
              {clashes.size} children are in the same classroom as a sibling. The school never
              places siblings together — please move one.
            </Banner>
          )}
          {noGuardian > 0 && (
            <Banner tone="warn">
              {noGuardian} {noGuardian === 1 ? 'child has' : 'children have'} no parent linked, so
              nobody is reminded for them.
            </Banner>
          )}
          {byRoom.map(([classroomId, kids]) => (
            <Card key={classroomId}>
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-semibold text-ink">{roomName(classroomId)}</h2>
                <span className="shrink-0 text-sm text-muted">{kids.length}</span>
              </div>
              <ul className="mt-3 divide-y divide-line">
                {kids.map((child) => (
                  <ChildRow
                    key={child.childId}
                    child={child}
                    guardians={guardiansOf.get(child.childId) ?? []}
                    clash={clashes.has(child.childId)}
                    onChanged={onChanged}
                    onError={onError}
                  />
                ))}
              </ul>
            </Card>
          ))}
        </>
      ) : (
        <>
          {missingEmail > 0 && (
            <Banner tone="error">
              {missingEmail} {missingEmail === 1 ? 'family has' : 'families have'} no email address,
              so they cannot sign in. Tap a red label to add one.
            </Banner>
          )}
          <Card>
            <ul className="divide-y divide-line">
              {[...parents]
                // Families who cannot sign in first — they are what needs action.
                .sort((a, b) => Number(!!a.email) - Number(!!b.email)
                  || a.firstName.localeCompare(b.firstName))
                .map((p) => (
                  <ContactRow key={p.userId} parent={p} onChanged={onChanged} onError={onError} />
                ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}

function ChildRow({ child, guardians, clash, onChanged, onError }: {
  child: Child;
  guardians: Parent[];
  clash: boolean;
  onChanged: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  // A parent goes with the child only when this was their last child.
  const leaving = guardians.filter((g) => g.children.length === 1);

  async function remove() {
    setBusy(true);
    try {
      const r = await api.del<{ parentsRemoved: number; daysReopened: number }>(`/api/admin/children/${child.childId}`);
      const bits = [`Removed ${child.firstName} ${child.lastName}`];
      if (r.parentsRemoved) bits.push(`${r.parentsRemoved} ${r.parentsRemoved === 1 ? 'parent' : 'parents'}`);
      if (r.daysReopened) bits.push(`reopened ${r.daysReopened} snack ${r.daysReopened === 1 ? 'day' : 'days'}`);
      onChanged(bits.join(', ') + '.');
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Could not remove that child.');
      setBusy(false);
    }
  }

  return (
    <li className="py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">
            {child.firstName} {child.lastName}
          </p>
          {clash && (
            <p className="mt-0.5 text-xs font-medium text-clay">Sibling in the same classroom</p>
          )}
          {guardians.length ? (
            <p className="mt-0.5 text-xs text-muted">
              {guardians.map((g) => `${g.firstName} ${g.lastName}`).join(' · ')}
            </p>
          ) : (
            <p className="mt-0.5 text-xs font-medium text-clay">No parent linked</p>
          )}
        </div>
        {!confirming && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="shrink-0 text-[11px] text-muted underline underline-offset-2"
          >
            Remove
          </button>
        )}
      </div>

      {confirming && (
        <div className="mt-2 rounded-xl bg-clay-soft p-3 text-xs text-clay">
          <p>
            Remove {child.firstName}? Any snack day booked for {child.firstName} reopens.
            {leaving.length > 0 && (
              <> {leaving.map((g) => g.firstName).join(' and ')} {leaving.length === 1 ? 'has' : 'have'} no
              other child here, so {leaving.length === 1 ? 'their account goes' : 'their accounts go'} too.</>
            )}
            {guardians.length > leaving.length && (
              <> {guardians.filter((g) => g.children.length > 1).map((g) => g.firstName).join(' and ')} stays
              for their other {guardians.filter((g) => g.children.length > 1).length === 1 ? 'child' : 'children'}.</>
            )}
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="danger" loading={busy} onClick={() => void remove()}>Remove</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Keep</Button>
          </div>
        </div>
      )}
    </li>
  );
}

function ContactRow({ parent, onChanged, onError }: {
  parent: Parent;
  onChanged: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState(parent.email ?? '');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      const r = await api.del<{ childrenRemoved: number; daysReopened: number }>(`/api/admin/parents/${parent.userId}`);
      const bits = [`Removed ${parent.firstName} ${parent.lastName}`];
      if (r.childrenRemoved) bits.push(`${r.childrenRemoved} ${r.childrenRemoved === 1 ? 'child' : 'children'}`);
      if (r.daysReopened) bits.push(`reopened ${r.daysReopened} snack ${r.daysReopened === 1 ? 'day' : 'days'}`);
      onChanged(bits.join(', ') + '.');
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Could not remove that parent.');
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    try {
      await api.patch(`/api/admin/parents/${parent.userId}`, { email });
      onChanged(`Saved email for ${parent.firstName}.`);
      setEditing(false);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Could not save that email.');
    } finally { setBusy(false); }
  }

  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">
            {parent.firstName} {parent.lastName}
            {parent.role === 'ADMIN' && (
              <span className="ml-2 rounded-full bg-sage-soft px-2 py-0.5 text-[11px] font-semibold text-sage-dark">
                Staff
              </span>
            )}
          </p>
          <p className="truncate text-xs text-muted">
            {parent.phone ? (
              <a href={`tel:${parent.phone}`} className="underline underline-offset-2">
                {parent.phone}
              </a>
            ) : (
              <span className="italic">No phone number</span>
            )}
            {parent.children.length > 0 && ` · ${parent.children.map((c) => c.firstName).join(', ')}`}
          </p>
          {/* Further numbers and addresses the school holds for this contact. */}
          {(parent.extraPhones?.length || parent.extraEmails?.length) && (
            <p className="truncate text-xs text-muted/80">
              Also: {[...(parent.extraPhones ?? []), ...(parent.extraEmails ?? [])].join(' · ')}
            </p>
          )}
        </div>
        <span className={`shrink-0 text-xs ${parent.lastLoginAt ? 'text-sage-dark' : 'text-muted'}`}>
          {parent.lastLoginAt ? 'Active' : 'Not signed in'}
        </span>
      </div>

      {editing ? (
        <div className="mt-2 flex gap-2">
          <input
            className={`${inputClass} py-2 text-sm`}
            type="email"
            autoFocus
            placeholder="parent@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button size="sm" loading={busy} onClick={() => void save()}>Save</Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
        </div>
      ) : parent.email ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-1 truncate text-xs text-muted underline underline-offset-2"
        >
          {parent.email}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-1 rounded-full bg-clay-soft px-2.5 py-1 text-xs font-semibold text-clay"
        >
          No email — add one so they can sign in
        </button>
      )}

      {parent.role !== 'ADMIN' && (
        confirming ? (
          <div className="mt-2 rounded-xl bg-clay-soft p-3 text-xs text-clay">
            <p>
              Remove {parent.firstName}? Their sign-in goes too, along with any child
              no other parent is listed for, and any snack day they hold reopens.
            </p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="danger" loading={busy} onClick={() => void remove()}>Remove</Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Keep</Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="mt-2 block text-[11px] text-muted underline underline-offset-2"
          >
            Remove from the school
          </button>
        )
      )}
    </li>
  );
}
