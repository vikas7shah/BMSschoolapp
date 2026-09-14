'use client';

import Link from 'next/link';
import {
  CURRICULUM_SUBJECTS, formatLong, monthLabel, type CurriculumGroup, type Newsletter,
} from '@bms/shared';
import { Card } from './ui';

/** "Classroom 3" in the newsletter ↔ the classroom named "Classroom 3" on the roster. */
export const groupMatches = (group: string, classroomName: string) =>
  group.trim().toLowerCase() === classroomName.trim().toLowerCase();

/**
 * One classroom's month, six subjects as tiles that flow and wrap — the same
 * card on the Newsletter page and, for the parent's own classrooms, on Home.
 */
export function CurriculumCard({ group, month, tag, lifted, link }: {
  group: CurriculumGroup;
  month: string;
  /** e.g. the child's name, when this is their classroom. */
  tag?: string;
  lifted?: boolean;
  link?: boolean;
}) {
  return (
    <Card className={lifted ? 'border-sage ring-[3px] ring-sage-soft' : ''}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-semibold text-ink">
          {group.group}
          {tag && (
            <span className="ml-2 rounded-full bg-sage-soft px-2 py-0.5 align-middle text-[11px] font-semibold text-sage-dark">
              {tag}
            </span>
          )}
        </h3>
        {link && (
          <Link href={`/news/?month=${month}`} className="shrink-0 text-xs text-muted underline underline-offset-2">
            Newsletter
          </Link>
        )}
      </div>
      {group.teachers && (
        <p className="mt-0.5 text-xs text-muted">
          {group.teachers} · {monthLabel(month).replace(/ \d{4}$/, '')}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {CURRICULUM_SUBJECTS.map(([key, label]) => {
          const value = group.subjects[key];
          if (!value) return null;
          return (
            <div key={key} className="min-w-0 flex-[1_1_130px] rounded-xl border border-line bg-cream px-2.5 py-2">
              <p className="text-[10.5px] font-bold uppercase tracking-wide text-muted">{label}</p>
              <p className="mt-0.5 whitespace-pre-line text-[13px] leading-snug text-ink">{value}</p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/**
 * The whole letter: headed sections word for word, then the curriculum with
 * the reader's own classrooms first and the rest after.
 */
export function NewsletterArticle({ newsletter, myClassrooms }: {
  newsletter: Newsletter;
  /** classroom name → child's first name, for lifting and tagging. */
  myClassrooms: Map<string, string>;
}) {
  const mine = newsletter.curriculum.filter((g) => [...myClassrooms.keys()].some((n) => groupMatches(g.group, n)));
  const others = newsletter.curriculum.filter((g) => !mine.includes(g));
  const tagFor = (g: CurriculumGroup) => {
    const entry = [...myClassrooms.entries()].find(([n]) => groupMatches(g.group, n));
    return entry ? `${entry[1]}’s class` : undefined;
  };

  return (
    <div className="space-y-3">
      <div className="mb-4 flex items-center gap-3">
        <div className="grid size-9 place-items-center rounded-full bg-sage-soft text-xs font-bold text-sage-dark">
          {initials(newsletter.from)}
        </div>
        <p className="text-sm text-muted">
          <span className="font-semibold text-ink">{newsletter.from}</span><br />
          Sent {formatLong(newsletter.sentOn)}
        </p>
      </div>

      {newsletter.sections.map((s) => (
        <Card key={s.heading}>
          <h3 className="font-semibold text-ink">{s.heading}</h3>
          {s.brief && s.brief.length > 0 && (
            // The short version first; the school's own words follow untouched.
            <ul className="mt-2 space-y-1 rounded-xl bg-sage-soft/60 px-4 py-3 text-sm text-sage-dark">
              {s.brief.map((b, i) => (
                <li key={i} className="flex gap-2"><span aria-hidden>•</span><span>{b}</span></li>
              ))}
            </ul>
          )}
          {s.paragraphs.map((p, i) => (
            <p key={i} className="mt-2 text-sm leading-relaxed text-ink">{p}</p>
          ))}
        </Card>
      ))}

      {newsletter.curriculum.length > 0 && (
        <>
          <p className="mt-6 px-1 text-xs font-semibold uppercase tracking-wide text-muted">Monthly curriculum</p>
          {newsletter.curriculumIntro && (
            <Card><p className="text-sm leading-relaxed text-ink">{newsletter.curriculumIntro}</p></Card>
          )}
          {mine.map((g) => <CurriculumCard key={g.group} group={g} month={newsletter.month} tag={tagFor(g)} lifted />)}
          {others.map((g) => (
            <details key={g.group} className="group rounded-2xl border border-line bg-surface">
              <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 font-semibold text-ink">
                {g.group}
                <span className="text-muted transition-transform group-open:rotate-90">›</span>
              </summary>
              <div className="px-1 pb-1">
                <CurriculumCard group={g} month={newsletter.month} />
              </div>
            </details>
          ))}
        </>
      )}

      {newsletter.signoff && (
        <Card>
          <p className="whitespace-pre-line text-sm leading-relaxed text-ink">{newsletter.signoff}</p>
        </Card>
      )}
    </div>
  );
}

/** Which classrooms are "mine", by name, with the child to tag them with. */
export function myClassroomsOf(me: { children: { firstName: string; classroomId: string }[]; classroomNames: Record<string, string> } | null) {
  const m = new Map<string, string>();
  for (const k of me?.children ?? []) {
    const name = me?.classroomNames[k.classroomId];
    if (name && !m.has(name)) m.set(name, k.firstName);
  }
  return m;
}

function initials(name: string): string {
  return name.replace(/,.*$/, '').split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).slice(0, 2)
    .map((w) => w[0]!.toUpperCase()).join('');
}
