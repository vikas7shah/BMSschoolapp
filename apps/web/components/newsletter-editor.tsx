'use client';

import { useEffect, useState } from 'react';
import { CURRICULUM_SUBJECTS, monthLabel, type Newsletter } from '@bms/shared';
import { ApiError, api } from '@/lib/api';
import { Button, Card, Field, inputClass } from './ui';

type Section = { heading: string; points: string };
type Group = { group: string; teachers: string; subjects: Record<string, string> };

const emptySubjects = () => Object.fromEntries(CURRICULUM_SUBJECTS.map(([k]) => [k, '']));
const DEFAULT_GROUPS = ['Classroom 1', 'Classroom 2', 'Classroom 3', 'Elementary'];

/**
 * The office pastes the month's letter in, one section at a time. Paragraphs
 * are split on blank lines, exactly as they arrive in the email. Saving a
 * month again replaces it, so a correction is a re-paste.
 */
export function NewsletterEditor({ onChanged, onError }: {
  onChanged: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const thisMonth = new Date().toISOString().slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [sentOn, setSentOn] = useState(new Date().toISOString().slice(0, 10));
  const [from, setFrom] = useState('Dan Bertini · Director');
  const [fromEmail, setFromEmail] = useState('dbertini0101@gmail.com');
  const [sections, setSections] = useState<Section[]>([{ heading: '', points: '' }]);
  const [intro, setIntro] = useState('');
  const [groups, setGroups] = useState<Group[]>(DEFAULT_GROUPS.map((g) => ({ group: g, teachers: '', subjects: emptySubjects() })));
  const [busy, setBusy] = useState(false);
  const [existing, setExisting] = useState<string[]>([]);

  useEffect(() => {
    api.get<{ newsletters: Newsletter[] }>('/api/newsletters')
      .then((r) => setExisting(r.newsletters.map((n) => n.month)))
      .catch(() => undefined);
  }, []);

  // Editing a month that exists starts from what is published.
  async function loadMonth(m: string) {
    setMonth(m);
    if (!existing.includes(m)) return;
    try {
      const { newsletter: n } = await api.get<{ newsletter: Newsletter }>(`/api/newsletters/${m}`);
      setSentOn(n.sentOn);
      setFrom(n.from);
      setFromEmail(n.fromEmail ?? '');
      setSections(n.sections.map((s) => ({ heading: s.heading, points: s.points.join('\n') })));
      setIntro(n.curriculumIntro ?? '');
      setGroups(n.curriculum.length
        ? n.curriculum.map((g) => ({ group: g.group, teachers: g.teachers, subjects: { ...emptySubjects(), ...g.subjects } }))
        : DEFAULT_GROUPS.map((g) => ({ group: g, teachers: '', subjects: emptySubjects() })));
    } catch { /* leave the form as it is */ }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put(`/api/admin/newsletters/${month}`, {
        sentOn, from, fromEmail, curriculumIntro: intro,
        sections: sections
          .filter((s) => s.heading.trim() && s.points.trim())
          .map((s) => ({
            heading: s.heading,
            points: s.points.split('\n').map((b) => b.replace(/^[-•*]\s*/, '').trim()).filter(Boolean),
          })),
        curriculum: groups.filter((g) => g.group.trim() && Object.values(g.subjects).some((v) => v.trim())),
      });
      onChanged(`${monthLabel(month)} newsletter published.`);
      setExisting((xs) => (xs.includes(month) ? xs : [month, ...xs]));
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Could not save the newsletter.');
    } finally { setBusy(false); }
  }

  const setSection = (i: number, patch: Partial<Section>) =>
    setSections((xs) => xs.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const setGroup = (i: number, patch: Partial<Group>) =>
    setGroups((xs) => xs.map((g, j) => (j === i ? { ...g, ...patch } : g)));

  return (
    <form onSubmit={save} className="space-y-4">
      <Card>
        <h2 className="font-semibold text-ink">Newsletter</h2>
        <p className="mt-1 text-sm text-muted">
          The month&apos;s letter as short points under headings — one point per line, present
          tense, covering everything the letter said. Saving a month again replaces it.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Field label="Month" hint={existing.includes(month) ? 'Already published — saving replaces it.' : undefined}>
            <input className={inputClass} type="month" required value={month} onChange={(e) => void loadMonth(e.target.value)} />
          </Field>
          <Field label="Sent on">
            <input className={inputClass} type="date" required value={sentOn} onChange={(e) => setSentOn(e.target.value)} />
          </Field>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="From">
            <input className={inputClass} required value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="Email" hint="Shown under the name, tappable.">
            <input className={inputClass} type="email" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} />
          </Field>
        </div>
      </Card>

      {sections.map((s, i) => (
        <Card key={i}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Section {i + 1}</p>
            {sections.length > 1 && (
              <button type="button" className="text-xs text-muted underline underline-offset-2"
                onClick={() => setSections((xs) => xs.filter((_, j) => j !== i))}>
                Remove
              </button>
            )}
          </div>
          <div className="mt-2 space-y-3">
            <Field label="Heading">
              <input className={inputClass} placeholder="Show and Tell" value={s.heading}
                onChange={(e) => setSection(i, { heading: e.target.value })} />
            </Field>
            <Field label="Points" hint="One per line.">
              <textarea className={`${inputClass} min-h-32`} value={s.points}
                onChange={(e) => setSection(i, { points: e.target.value })} />
            </Field>
          </div>
        </Card>
      ))}
      <Button type="button" variant="secondary" className="w-full"
        onClick={() => setSections((xs) => [...xs, { heading: '', points: '' }])}>
        Add a section
      </Button>

      <Card>
        <h2 className="font-semibold text-ink">Monthly curriculum</h2>
        <div className="mt-3">
          <Field label="Note" hint="Optional — one line shown above the tables.">
            <input className={inputClass} value={intro} onChange={(e) => setIntro(e.target.value)} />
          </Field>
        </div>
      </Card>
      {groups.map((g, i) => (
        <Card key={i}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Group">
              <input className={inputClass} value={g.group} onChange={(e) => setGroup(i, { group: e.target.value })} />
            </Field>
            <Field label="Teachers">
              <input className={inputClass} value={g.teachers} onChange={(e) => setGroup(i, { teachers: e.target.value })} />
            </Field>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {CURRICULUM_SUBJECTS.map(([key, label]) => (
              <Field key={key} label={label}>
                <input className={inputClass} value={g.subjects[key] ?? ''}
                  onChange={(e) => setGroup(i, { subjects: { ...g.subjects, [key]: e.target.value } })} />
              </Field>
            ))}
          </div>
        </Card>
      ))}


      <Button type="submit" loading={busy} className="w-full">
        {existing.includes(month) ? `Replace ${monthLabel(month)}` : `Publish ${monthLabel(month)}`}
      </Button>
    </form>
  );
}
