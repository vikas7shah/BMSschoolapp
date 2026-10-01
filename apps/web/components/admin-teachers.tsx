'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { formatPhone } from '@/lib/phone';
import { Button, Card, EmptyState, Skeleton, inputClass } from './ui';

export interface Teacher {
  userId: string;
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  classroomIds: string[];
  status: string;
  lastLoginAt?: string;
}

type Draft = { firstName: string; lastName: string; phone: string; email: string; classroomIds: string[] };
const blank = (): Draft => ({ firstName: '', lastName: '', phone: '', email: '', classroomIds: [] });

/**
 * The office's list of teachers. A teacher signs in like a parent and sees
 * only the classrooms ticked here, read-only.
 */
export function AdminTeachers({ classrooms, onChanged, onError }: {
  classrooms: { classroomId: string; name: string }[];
  onChanged: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [teachers, setTeachers] = useState<Teacher[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTeachers((await api.get<{ teachers: Teacher[] }>('/api/admin/teachers')).teachers);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Could not load teachers.');
    }
  }, [onError]);

  useEffect(() => { void load(); }, [load]);

  const nameOf = (id: string) => classrooms.find((c) => c.classroomId === id)?.name ?? 'Removed classroom';
  const done = (msg: string) => { setAdding(false); setEditing(null); onChanged(msg); void load(); };

  async function remove(t: Teacher) {
    if (!window.confirm(`Remove ${t.firstName} ${t.lastName}? They will no longer be able to sign in.`)) return;
    try {
      await api.del(`/api/admin/teachers/${t.userId}`);
      done(`Removed ${t.firstName}.`);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Could not remove that teacher.');
    }
  }

  return (
    <div className="space-y-4">
      <Button className="w-full" onClick={() => { setAdding((v) => !v); setEditing(null); }}>
        {adding ? 'Cancel' : 'Add a teacher'}
      </Button>
      <p className="text-center text-xs text-muted">
        Teachers see their classroom&apos;s children, parents and snack days, read-only, and can add to its curriculum.
      </p>

      {adding && (
        <TeacherForm classrooms={classrooms} initial={blank()} onSaved={done} onCancel={() => setAdding(false)} onError={onError} />
      )}

      {!teachers ? (
        <Skeleton className="h-40" />
      ) : teachers.length === 0 ? (
        <EmptyState title="No teachers yet" body="Add a teacher and tick the classroom they teach." />
      ) : (
        <ul className="space-y-2.5">
          {teachers.map((t) => (
            <li key={t.userId}>
              <Card className="!p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{t.firstName} {t.lastName}</p>
                    <p className="truncate text-xs text-muted">{[t.phone && formatPhone(t.phone), t.email].filter(Boolean).join(' · ')}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {t.classroomIds.map((id) => (
                        <span key={id} className="rounded-full bg-sage-soft px-2.5 py-0.5 text-xs font-semibold text-sage-dark">
                          {nameOf(id)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted">
                    {t.lastLoginAt ? 'Signed in' : 'Not signed in yet'}
                  </span>
                </div>
                {editing === t.userId ? (
                  <TeacherForm
                    classrooms={classrooms}
                    initial={{
                      firstName: t.firstName, lastName: t.lastName, phone: t.phone ? formatPhone(t.phone) : '', email: t.email ?? '',
                      classroomIds: t.classroomIds,
                    }}
                    userId={t.userId}
                    onSaved={done}
                    onCancel={() => setEditing(null)}
                    onError={onError}
                  />
                ) : (
                  <div className="mt-3 flex gap-4 text-xs font-medium">
                    <button type="button" onClick={() => { setEditing(t.userId); setAdding(false); }} className="text-sage underline underline-offset-2">
                      Edit
                    </button>
                    <button type="button" onClick={() => void remove(t)} className="text-clay underline underline-offset-2">
                      Remove
                    </button>
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TeacherForm({ classrooms, initial, userId, onSaved, onCancel, onError }: {
  classrooms: { classroomId: string; name: string }[];
  initial: Draft;
  userId?: string;
  onSaved: (msg: string) => void;
  onCancel: () => void;
  onError: (msg: string) => void;
}) {
  const [d, setD] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Draft>) => setD((v) => ({ ...v, ...patch }));
  const toggleRoom = (id: string) => set({
    classroomIds: d.classroomIds.includes(id) ? d.classroomIds.filter((x) => x !== id) : [...d.classroomIds, id],
  });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (userId) await api.patch(`/api/admin/teachers/${userId}`, d);
      else await api.post('/api/admin/teachers', d);
      onSaved(userId ? `Saved ${d.firstName}.` : `Added ${d.firstName}. They can sign in now.`);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Could not save that teacher.');
      setBusy(false);
    }
  }

  const label = 'mb-1 block text-[11px] font-medium text-muted';
  return (
    <form onSubmit={save} className="mt-3 space-y-2.5 rounded-xl bg-black/[.03] p-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="min-w-0">
          <span className={label}>First name</span>
          <input className={`${inputClass} py-2 text-sm`} value={d.firstName} onChange={(e) => set({ firstName: e.target.value })} required autoFocus />
        </label>
        <label className="min-w-0">
          <span className={label}>Last name</span>
          <input className={`${inputClass} py-2 text-sm`} value={d.lastName} onChange={(e) => set({ lastName: e.target.value })} />
        </label>
      </div>
      <label className="block">
        <span className={label}>Mobile number</span>
        <input className={`${inputClass} py-2 text-sm`} type="tel" inputMode="tel" placeholder="(617) 555-0123" value={d.phone} onChange={(e) => set({ phone: e.target.value })} />
      </label>
      <label className="block">
        <span className={label}>Email</span>
        <input className={`${inputClass} py-2 text-sm`} type="email" placeholder="teacher@example.com" value={d.email} onChange={(e) => set({ email: e.target.value })} />
      </label>
      <fieldset>
        <legend className={label}>Teaches</legend>
        <div className="flex flex-wrap gap-2">
          {classrooms.map((c) => {
            const on = d.classroomIds.includes(c.classroomId);
            return (
              <button
                key={c.classroomId}
                type="button"
                aria-pressed={on}
                onClick={() => toggleRoom(c.classroomId)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors
                            ${on ? 'bg-sage text-white' : 'bg-black/5 text-muted hover:text-ink'}`}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      </fieldset>
      <p className="text-[11px] text-muted">They sign in with the mobile number or email. Codes go by email for now.</p>
      <div className="flex gap-2">
        <Button size="sm" type="submit" loading={busy} disabled={!d.classroomIds.length}>{userId ? 'Save' : 'Add teacher'}</Button>
        <Button size="sm" variant="ghost" type="button" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
