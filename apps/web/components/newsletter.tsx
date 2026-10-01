'use client';

import Link from 'next/link';
import {
  CURRICULUM_SUBJECTS, monthLabel, type CurriculumGroup, type Newsletter,
} from '@bms/shared';
import type { CurriculumItem } from '@/lib/api';
import { Card } from './ui';

/** "Classroom 3" in the newsletter ↔ the classroom named "Classroom 3" on the roster. */
export const groupMatches = (group: string, classroomName: string) =>
  group.trim().toLowerCase() === classroomName.trim().toLowerCase();

/**
 * One classroom's month, six subjects as tiles that flow and wrap — the same
 * card on the Newsletter page and, for the parent's own classrooms, on Home.
 */
export function CurriculumCard({ group, month, tag, lifted, link, tile, extras = [], action }: {
  group: CurriculumGroup;
  month: string;
  /** What the class's teachers added this month, shown after the newsletter's six. */
  extras?: CurriculumItem[];
  /** e.g. the teacher's "Add" link, beside the heading. */
  action?: React.ReactNode;
  /** e.g. the child's name, when this is their classroom. */
  tag?: string;
  lifted?: boolean;
  link?: boolean;
  /** Fill a fixed dashboard cell: three tile columns, values clamped to two lines. */
  tile?: boolean;
}) {
  return (
    // On Home, a card with additions takes two rows, so the newsletter's six
    // and the teachers' items both show in full rather than being squeezed.
    <Card className={`${lifted ? 'border-sage ring-[3px] ring-sage-soft' : ''} ${tile ? 'flex h-full min-h-0 flex-col overflow-hidden' : ''} ${tile && extras.length ? '[grid-row:span_2]' : ''}`}>
      {tile && (
        <p className="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-muted">
          Curriculum · {monthLabel(month).replace(/ \d{4}$/, '')}
        </p>
      )}
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
        {action}
      </div>
      {group.teachers && <p className={`mt-0.5 text-xs text-muted ${tile ? 'truncate' : ''}`}>{group.teachers}</p>}
      {hasSubjects(group) && (
      <div className={tile
        ? `mt-2 grid grid-cols-3 gap-1.5 ${extras.length ? '' : 'min-h-0 flex-1 grid-rows-2'}`
        : 'mt-3 flex flex-wrap gap-2'}>
        {CURRICULUM_SUBJECTS.map(([key, label]) => {
          const value = group.subjects?.[key];
          if (!value) return null;
          return (
            <div key={key} className={`min-w-0 rounded-xl border border-line bg-cream ${tile ? 'min-h-0 overflow-hidden px-2 py-1.5' : 'flex-[1_1_130px] px-2.5 py-2'}`}>
              <p className="text-[9.5px] font-bold uppercase tracking-wide text-muted">{tile ? label.replace(/ \(.*\)$/, '') : label}</p>
              <p className={`mt-0.5 leading-snug text-ink ${tile ? 'line-clamp-2 text-[12px]' : 'whitespace-pre-line text-[13px]'}`}>
                {tile ? value.split('\n')[0] : value}
              </p>
            </div>
          );
        })}
      </div>
      )}
      {!hasSubjects(group) && !extras.length && (
        <p className="mt-2 text-sm text-muted">Nothing added for this month yet.</p>
      )}
      {extras.length > 0 && (
        <div className={tile ? 'mt-3 min-h-0 flex-1 overflow-hidden' : 'mt-3'}>
          {hasSubjects(group) && (
            <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-sage-dark">Added by the teachers</p>
          )}
          <div className={tile ? 'grid grid-cols-2 gap-1.5' : 'flex flex-wrap gap-2'}>
            {extras.map((e) => (
              <div key={e.itemId} className={`min-w-0 rounded-xl border border-sage/25 bg-sage-soft ${tile ? 'px-2 py-1.5' : 'flex-[1_1_130px] px-2.5 py-2'}`}>
                <p className="text-[9.5px] font-bold uppercase tracking-wide text-sage-dark">{e.area}</p>
                <p className={`mt-0.5 leading-snug text-ink ${tile ? 'line-clamp-2 text-[12px]' : 'whitespace-pre-line text-[13px]'}`}>{e.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

const hasSubjects = (g: CurriculumGroup) => CURRICULUM_SUBJECTS.some(([k]) => !!g.subjects?.[k]);

/**
 * The whole letter: headed sections word for word, then the curriculum with
 * the reader's own classrooms first and the rest after.
 */
export function NewsletterArticle({ newsletter, myClassrooms, extrasFor = () => [] }: {
  newsletter: Newsletter;
  /** Teachers' additions for a curriculum group this month. */
  extrasFor?: (group: string) => CurriculumItem[];
  /** classroom name → child's first name, for lifting and tagging. */
  myClassrooms: Map<string, string>;
}) {
  const mine = newsletter.curriculum.filter((g) => [...myClassrooms.keys()].some((n) => groupMatches(g.group, n)));
  const others = newsletter.curriculum.filter((g) => !mine.includes(g));
  const tagFor = (g: CurriculumGroup) => {
    const entry = [...myClassrooms.entries()].find(([n]) => groupMatches(g.group, n));
    if (!entry) return undefined;
    return entry[1] === 'Your class' ? entry[1] : `${entry[1]}’s class`;
  };

  return (
    <div className="space-y-3">
      <div className="mb-4 flex items-center gap-3">
        <div className="grid size-9 place-items-center rounded-full bg-sage-soft text-xs font-bold text-sage-dark">
          {initials(newsletter.from)}
        </div>
        <p className="text-sm text-muted">
          <span className="font-semibold text-ink">{newsletter.from}</span>
          {newsletter.fromEmail && (
            <><br /><a href={`mailto:${newsletter.fromEmail}`} className="text-sage-dark underline underline-offset-2">{newsletter.fromEmail}</a></>
          )}
        </p>
      </div>

      {newsletter.sections.map((s) => (
        <Card key={s.heading}>
          <h3 className="font-serif text-[19px] font-semibold text-ink">{s.heading}</h3>
          <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-ink">
            {s.points.map((b, i) => (
              <li key={i} className="flex gap-2"><span aria-hidden className="text-sage">•</span><span>{b}</span></li>
            ))}
          </ul>
        </Card>
      ))}

      {newsletter.curriculum.length > 0 && (
        <>
          <p className="mt-6 px-1 text-xs font-semibold uppercase tracking-wide text-muted">Curriculum</p>
          {newsletter.curriculumIntro && (
            <p className="px-1 text-sm text-muted">{newsletter.curriculumIntro}</p>
          )}
          {mine.map((g) => (
            <CurriculumCard key={g.group} group={g} month={newsletter.month} tag={tagFor(g)} lifted extras={extrasFor(g.group)} />
          ))}
          {others.map((g) => (
            <details key={g.group} className="group rounded-2xl border border-line bg-surface">
              <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 font-semibold text-ink">
                {g.group}
                <span className="text-muted transition-transform group-open:rotate-90">›</span>
              </summary>
              <div className="px-1 pb-1">
                <CurriculumCard group={g} month={newsletter.month} extras={extrasFor(g.group)} />
              </div>
            </details>
          ))}
        </>
      )}

    </div>
  );
}

/**
 * Which classrooms are "mine", by name, with the child to tag them with — or,
 * for a teacher, the curriculum groups they teach, tagged as theirs.
 */
export function myClassroomsOf(me: {
  children: { firstName: string; classroomId: string }[];
  classroomNames: Record<string, string>;
  teaches?: string[];
  curriculumGroups?: string[];
} | null) {
  const m = new Map<string, string>();
  for (const group of me?.curriculumGroups ?? []) m.set(group, 'Your class');
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
