'use client';

import { useEffect, useState } from 'react';
import { CURRICULUM_SUBJECTS, monthLabel, type Newsletter } from '@bms/shared';
import { ApiError, api } from '@/lib/api';
import { Button, Card, Field, inputClass } from './ui';

type Section = { heading: string; brief: string; text: string };
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
  const [from, setFrom] = useState('Mrs. Sahar, Administrator');
  const [sections, setSections] = useState<Section[]>([{ heading: '', brief: '', text: '' }]);
  const [intro, setIntro] = useState('');
  const [groups, setGroups] = useState<Group[]>(DEFAULT_GROUPS.map((g) => ({ group: g, teachers: '', subjects: emptySubjects() })));
  const [signoff, setSignoff] = useState('');
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
      setSections(n.sections.map((s) => ({ heading: s.heading, brief: (s.brief ?? []).join('\n'), text: s.paragraphs.join('\n\n') })));
      setIntro(n.curriculumIntro ?? '');
      setGroups(n.curriculum.length
        ? n.curriculum.map((g) => ({ group: g.group, teachers: g.teachers, subjects: { ...emptySubjects(), ...g.subjects } }))
        : DEFAULT_GROUPS.map((g) => ({ group: g, teachers: '', subjects: emptySubjects() })));
      setSignoff(n.signoff);
    } catch { /* leave the form as it is */ }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put(`/api/admin/newsletters/${month}`, {
        sentOn, from, signoff, curriculumIntro: intro,
        sections: sections
          .filter((s) => s.heading.trim() && s.text.trim())
          .map((s) => ({
            heading: s.heading,
            brief: s.brief.split('\n').map((b) => b.trim()).filter(Boolean),
            paragraphs: s.text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean),
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
          Paste the school&apos;s letter in, section by section, exactly as written. Saving a month
          again replaces it.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Field label="Month" hint={existing.includes(month) ? 'Already published — saving replaces it.' : undefined}>
            <input className={inputClass} type="month" required value={month} onChange={(e) => void loadMonth(e.target.value)} />
          </Field>
          <Field label="Sent on">
            <input className={inputClass} type="date" required value={sentOn} onChange={(e) => setSentOn(e.target.value)} />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="From">
            <input className={inputClass} required value={from} onChange={(e) => setFrom(e.target.value)} />
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
            <Field label="Briefly" hint="Optional — three or four short points, one per line, in the present tense. Shown above the text.">
              <textarea className={`${inputClass} min-h-20`} value={s.brief}
                onChange={(e) => setSection(i, { brief: e.target.value })} />
            </Field>
            <Field label="Text" hint="A blank line starts a new paragraph.">
              <textarea className={`${inputClass} min-h-32`} value={s.text}
                onChange={(e) => setSection(i, { text: e.target.value })} />
            </Field>
          </div>
        </Card>
      ))}
      <Button type="button" variant="secondary" className="w-full"
        onClick={() => setSections((xs) => [...xs, { heading: '', brief: '', text: '' }])}>
        Add a section
      </Button>

      <Card>
        <h2 className="font-semibold text-ink">Monthly curriculum</h2>
        <div className="mt-3">
          <Field label="Introduction" hint="Optional — the paragraph before the tables.">
            <textarea className={`${inputClass} min-h-20`} value={intro} onChange={(e) => setIntro(e.target.value)} />
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

      <Card>
        <Field label="Sign-off" hint="Closing lines, as written.">
          <textarea className={`${inputClass} min-h-20`} value={signoff} onChange={(e) => setSignoff(e.target.value)} />
        </Field>
      </Card>

      <Button type="submit" loading={busy} className="w-full">
        {existing.includes(month) ? `Replace ${monthLabel(month)}` : `Publish ${monthLabel(month)}`}
      </Button>
    </form>
  );
}
