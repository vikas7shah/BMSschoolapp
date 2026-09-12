'use client';

import { useMemo, useRef, useState } from 'react';
import { IMPORT_CHUNK_SIZE, type ImportResult } from '@bms/shared';
import { ApiError, api } from '@/lib/api';
import { SpreadsheetError, readSpreadsheet } from '@/lib/spreadsheet';
import {
  FIELD_LABELS, LAYOUT_FIELDS, LAYOUT_LABELS, buildImportPlan, detectColumns, detectLayout,
  templateCsv,
  type ColumnMap, type FieldKey, type ImportFamily, type ImportPlan, type Layout, type OrphanChild,
} from '@/lib/roster-import';
import { Banner, Button, Card, Field, Skeleton } from './ui';

interface Props {
  classrooms: { classroomId: string; name: string }[];
  existingPhones: Set<string>;
  existingEmails: Set<string>;
  onImported: (summary: string) => void;
  /** Reload the admin data — used after classrooms are created mid-import. */
  onRefresh: () => Promise<void> | void;
}

type Stage = 'CHOOSE' | 'REVIEW' | 'IMPORTING' | 'DONE';

export function RosterImport({
  classrooms, existingPhones, existingEmails, onImported, onRefresh,
}: Props) {
  const [stage, setStage] = useState<Stage>('CHOOSE');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<string[][]>([]);
  const [layout, setLayout] = useState<Layout>('ROW_PER_PARENT');
  const [headerRow, setHeaderRow] = useState(0);
  const [map, setMap] = useState<ColumnMap>({});
  const [makeClassrooms, setMakeClassrooms] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<ImportResult[]>([]);
  const [childCount, setChildCount] = useState(0);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const plan: ImportPlan | null = useMemo(() => {
    if (!rows.length) return null;
    // Built twice: the first pass discovers which classroom names the sheet
    // refers to, the second resolves them once the admin has agreed to create
    // the missing ones.
    const base = {
      rows, map, layout, headerRow, classrooms, existingPhones, existingEmails,
    };
    const discovered = buildImportPlan(base);
    if (!discovered.missingClassrooms.length || !makeClassrooms) return discovered;
    return buildImportPlan({ ...base, pendingClassrooms: new Set(discovered.missingClassrooms) });
  }, [rows, map, layout, headerRow, classrooms, existingPhones, existingEmails, makeClassrooms]);

  async function handleFile(file: File) {
    setError(null);
    try {
      const sheet = await readSpreadsheet(file);
      if (!sheet.rows.length) throw new SpreadsheetError('That file has no rows in it.');
      const detected = detectLayout(sheet.rows);
      setFileName(file.name);
      setRows(sheet.rows);
      setLayout(detected.layout);
      setHeaderRow(detected.headerRow);
      setMap(detectColumns(sheet.rows[detected.headerRow] ?? [], detected.layout));
      setMakeClassrooms(true);
      setStage('REVIEW');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That file could not be read.');
    }
  }

  function changeLayout(next: Layout) {
    setLayout(next);
    setMap(detectColumns(rows[headerRow] ?? [], next));
  }

  async function runImport() {
    if (!plan) return;
    setError(null);

    // Classrooms must exist before anything can reference them.
    let roomIds = new Map(classrooms.map((c) => [c.name, c.classroomId]));
    if (plan.missingClassrooms.length && makeClassrooms) {
      setStage('IMPORTING');
      setProgress({ done: 0, total: 0 });
      try {
        for (const name of plan.missingClassrooms) {
          const res = await api.post<{ classroom: { classroomId: string; name: string } }>(
            '/api/admin/classrooms',
            { name, snackWeekdays: [1, 2, 3, 4, 5] },
          );
          roomIds.set(res.classroom.name, res.classroom.classroomId);
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not create the classrooms.');
        setStage('REVIEW');
        return;
      }
    }

    // Swap the placeholder ids the preview used for the real ones.
    const realId = (id: string, name: string) => (id.startsWith('new:') ? roomIds.get(name) ?? id : id);

    // Families already on the roster are still sent: the server links them to
    // any child they are not yet attached to, rather than creating a duplicate.
    const toSend = plan.families.filter((f) => !f.issues.some((i) => i.level === 'ERROR'));
    const orphanPayload = plan.orphans.map((o) => ({
      firstName: o.firstName, lastName: o.lastName,
      classroomId: realId(o.classroomId, o.classroomName),
    }));

    setStage('IMPORTING');
    setProgress({ done: 0, total: toSend.length });
    const all: ImportResult[] = [];
    let kids = 0;

    try {
      // Chunked so a big roster never outruns the request timeout, and so the
      // admin sees steady progress rather than a frozen button.
      for (let i = 0; i < Math.max(toSend.length, 1); i += IMPORT_CHUNK_SIZE) {
        const chunk = toSend.slice(i, i + IMPORT_CHUNK_SIZE);
        const res = await api.post<{ results: ImportResult[]; summary: { childrenCreated: number } }>(
          '/api/admin/parents/import',
          {
            families: chunk.map((f) => ({
              firstName: f.firstName,
              lastName: f.lastName,
              phone: f.phone,
              email: f.email,
              extraPhones: f.extraPhones ?? [],
              extraEmails: f.extraEmails ?? [],
              children: f.children.map((c) => ({
                firstName: c.firstName,
                lastName: c.lastName,
                classroomId: realId(c.classroomId, c.classroomName),
              })),
            })),
            // Guardian-less children ride along with the first chunk only.
            children: i === 0 ? orphanPayload : [],
          },
        );
        all.push(...res.results);
        kids += res.summary.childrenCreated;
        setProgress({ done: Math.min(i + chunk.length, toSend.length), total: toSend.length });
        if (!toSend.length) break;
      }
      setResults(all);
      setChildCount(kids);
      setStage('DONE');
      const created = all.filter((r) => r.outcome === 'CREATED').length;
      onImported(`Imported ${created} ${created === 1 ? 'family' : 'families'} from ${fileName}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The import could not be completed.');
      setResults(all);
      setStage('DONE');
    }
    await onRefresh();
  }

  function reset() {
    setStage('CHOOSE');
    setRows([]); setMap({}); setResults([]); setError(null); setFileName(''); setChildCount(0);
    if (inputRef.current) inputRef.current.value = '';
  }

  /* ------------------------------------------------------------- choose */

  if (stage === 'CHOOSE') {
    return (
      <Card>
        <h2 className="font-semibold text-ink">Import families from a spreadsheet</h2>
        <p className="mt-1 text-sm text-muted">
          Upload the roster you already keep. Nothing is created until you have
          seen exactly what will happen.
        </p>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) void handleFile(file);
          }}
          className={`mt-4 rounded-2xl border-2 border-dashed p-6 text-center transition-colors
                      ${dragging ? 'border-sage bg-sage-soft' : 'border-line'}`}
        >
          <p className="text-sm text-muted">Drag a file here, or</p>
          <div className="mt-3">
            <Button type="button" onClick={() => inputRef.current?.click()}>Choose a file</Button>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xlsm,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <p className="mt-3 text-xs text-muted">Excel (.xlsx) or CSV</p>
        </div>

        {error && <div className="mt-4"><Banner tone="error">{error}</Banner></div>}

        <div className="mt-4 flex items-center justify-between gap-3 text-sm">
          <span className="text-muted">Not sure of the format?</span>
          <button
            type="button"
            onClick={() => downloadTemplate(classrooms[0]?.name)}
            className="font-medium text-sage underline underline-offset-4"
          >
            Download a template
          </button>
        </div>
      </Card>
    );
  }

  /* ------------------------------------------------------------- review */

  if (stage === 'REVIEW' && plan) {
    const header = rows[headerRow] ?? [];
    const canImport = plan.counts.ready > 0 || plan.counts.orphans > 0;

    return (
      <div className="space-y-4">
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate font-semibold text-ink">{fileName}</h2>
              <p className="text-sm text-muted">
                {rows.length} rows · column titles on row {headerRow + 1}
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={reset}>Change file</Button>
          </div>

          <div className="mt-4">
            <Field label="How is this sheet laid out?">
              <select
                className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm"
                value={layout}
                onChange={(e) => changeLayout(e.target.value as Layout)}
              >
                {(Object.keys(LAYOUT_LABELS) as Layout[]).map((l) => (
                  <option key={l} value={l}>{LAYOUT_LABELS[l]}</option>
                ))}
              </select>
            </Field>
          </div>
        </Card>

        <Card>
          <h3 className="font-semibold text-ink">Which column is which?</h3>
          <p className="mt-1 text-sm text-muted">
            We guessed from your headings. Change anything we got wrong.
          </p>
          <div className="mt-4 space-y-3">
            {LAYOUT_FIELDS[layout].map((key: FieldKey) => (
              <Field key={key} label={FIELD_LABELS[key]}>
                <select
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm"
                  value={map[key] ?? -1}
                  onChange={(e) => setMap({ ...map, [key]: Number(e.target.value) })}
                >
                  <option value={-1}>— not in this file —</option>
                  {header.map((h, i) => (
                    <option key={i} value={i}>{h.trim() || `Column ${columnLetter(i)}`}</option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
          {layout === 'GROUPED_BY_CHILD' && (
            <p className="mt-3 text-xs text-muted">
              Classrooms are taken from the heading rows in the sheet, so no
              classroom column is needed.
            </p>
          )}
        </Card>

        {plan.missingClassrooms.length > 0 && (
          <Card>
            <h3 className="font-semibold text-ink">New classrooms</h3>
            <p className="mt-1 text-sm text-muted">
              These appear in the sheet but not yet in the app.
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {plan.missingClassrooms.map((name) => (
                <li key={name} className="rounded-full bg-sage-soft px-3 py-1 text-sm text-sage-dark">
                  {name}
                </li>
              ))}
            </ul>
            <label className="mt-4 flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={makeClassrooms}
                onChange={(e) => setMakeClassrooms(e.target.checked)}
                className="size-4 rounded border-line accent-[#3f6f52]"
              />
              Create them as part of this import (Mon–Fri, dry snack + fruit)
            </label>
          </Card>
        )}

        <Card>
          <h3 className="font-semibold text-ink">What will happen</h3>
          <ul className="mt-3 space-y-1.5 text-sm">
            <Count n={plan.counts.ready} tone="good" label="parent accounts will be created" />
            <Count n={plan.counts.orphans} tone="muted" label="children added without a guardian" />
            <Count n={plan.counts.existing} tone="muted" label="already on the roster, will be skipped" />
            <Count n={plan.counts.skippedParents} tone="bad" label="parents need fixing by hand" />
            <Count n={plan.counts.withErrors} tone="bad" label="have a problem to fix first" />
            <Count n={plan.counts.rejected} tone="bad" label="rows could not be read at all" />
          </ul>
        </Card>

        {plan.skippedParents.length > 0 && (
          <Card>
            <h3 className="font-semibold text-ink">Parents we cannot add</h3>
            <p className="mt-1 text-sm text-muted">
              Everything else still imports. Add these by hand, or fix the sheet
              and import it again.
            </p>
            <ul className="mt-3 divide-y divide-line text-sm">
              {plan.skippedParents.map((s) => (
                <li key={s.sheetRows.join()} className="py-2">
                  <p className="font-medium text-ink">
                    {s.name || '(no name)'}
                    <span className="ml-2 text-xs font-normal text-muted">
                      row{s.sheetRows.length > 1 ? 's' : ''} {s.sheetRows.join(', ')}
                    </span>
                  </p>
                  <p className="text-xs text-clay">{s.reason}</p>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {plan.rejected.length > 0 && (
          <Card>
            <h3 className="font-semibold text-ink">Rows we had to skip</h3>
            <ul className="mt-3 divide-y divide-line text-sm">
              {plan.rejected.slice(0, 12).map((r) => (
                <li key={r.sheetRow} className="py-2">
                  <span className="font-medium text-ink">Row {r.sheetRow}</span>
                  <span className="text-muted"> — {r.reason}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card>
          <h3 className="font-semibold text-ink">Preview</h3>
          <ul className="mt-3 divide-y divide-line">
            {plan.families.slice(0, 20).map((f) => <FamilyRow key={f.phone} family={f} />)}
            {plan.orphans.slice(0, 8).map((o) => <OrphanRow key={o.sheetRows.join()} child={o} />)}
          </ul>
          {plan.families.length > 20 && (
            <p className="mt-3 text-xs text-muted">
              …and {plan.families.length - 20} more families.
            </p>
          )}
        </Card>

        {error && <Banner tone="error">{error}</Banner>}

        <Button className="w-full" disabled={!canImport} onClick={() => void runImport()}>
          {canImport ? importLabel(plan) : 'Nothing to import'}
        </Button>
      </div>
    );
  }

  /* ---------------------------------------------------------- importing */

  if (stage === 'IMPORTING') {
    const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
    return (
      <Card>
        <h2 className="font-semibold text-ink">Adding families…</h2>
        <p className="mt-1 text-sm text-muted">
          {progress.total ? `${progress.done} of ${progress.total}` : 'Setting up classrooms'}
        </p>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-sage transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-4 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </Card>
    );
  }

  /* --------------------------------------------------------------- done */

  const created = results.filter((r) => r.outcome === 'CREATED');
  const failed = results.filter((r) => r.outcome === 'FAILED');
  const skipped = results.filter((r) => r.outcome === 'SKIPPED_EXISTS');

  return (
    <div className="space-y-4">
      {error && <Banner tone="error">{error}</Banner>}
      <Card>
        <h2 className="font-semibold text-ink">Import finished</h2>
        <ul className="mt-3 space-y-1.5 text-sm">
          <Count n={created.length} tone="good" label="parent accounts added" />
          <Count n={childCount} tone="good" label="children added" />
          <Count n={skipped.length} tone="muted" label="already existed" />
          <Count n={failed.length} tone="bad" label="could not be added" />
        </ul>
        {failed.length > 0 && (
          <ul className="mt-4 divide-y divide-line text-sm">
            {failed.map((r) => (
              <li key={r.phone} className="py-2">
                <span className="font-medium text-ink">{r.name}</span>
                <span className="text-muted"> — {r.reason}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-5">
          <Button variant="secondary" className="w-full" onClick={reset}>
            Import another file
          </Button>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------- helpers */

function importLabel(plan: ImportPlan): string {
  const bits: string[] = [];
  if (plan.counts.ready) bits.push(`${plan.counts.ready} ${plan.counts.ready === 1 ? 'family' : 'families'}`);
  if (plan.counts.orphans) bits.push(`${plan.counts.orphans} more ${plan.counts.orphans === 1 ? 'child' : 'children'}`);
  return `Import ${bits.join(' and ')}`;
}

function FamilyRow({ family }: { family: ImportFamily }) {
  const errors = family.issues.filter((i) => i.level === 'ERROR');
  const warns = family.issues.filter((i) => i.level === 'WARN');
  const tone = errors.length ? 'bad' : family.existing ? 'muted' : 'good';

  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">
            {family.firstName} {family.lastName}
          </p>
          <p className="truncate text-xs text-muted">
            {family.phone}
            {family.email ? ` · ${family.email}` : ''}
            {family.children.length
              ? ` · ${family.children.map((c) => `${c.firstName} (${c.classroomName})`).join(', ')}`
              : ''}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold
            ${tone === 'good' ? 'bg-sage-soft text-sage-dark'
              : tone === 'bad' ? 'bg-clay-soft text-clay'
              : 'bg-black/5 text-muted'}`}
        >
          {errors.length ? 'Fix' : family.existing ? 'Skip' : 'Add'}
        </span>
      </div>
      {[...errors, ...warns].slice(0, 3).map((issue, i) => (
        <p key={i} className={`mt-1 text-xs ${issue.level === 'ERROR' ? 'text-clay' : 'text-muted'}`}>
          {issue.message}
        </p>
      ))}
    </li>
  );
}

function OrphanRow({ child }: { child: OrphanChild }) {
  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">
            {child.firstName} {child.lastName}
          </p>
          <p className="truncate text-xs text-muted">
            {child.classroomName} · no guardian yet
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-sun-soft px-2 py-0.5 text-[11px] font-semibold text-[#8a6414]">
          Child only
        </span>
      </div>
      {child.issues.slice(0, 2).map((issue, i) => (
        <p key={i} className="mt-1 text-xs text-muted">{issue.message}</p>
      ))}
    </li>
  );
}

function Count({ n, label, tone }: { n: number; label: string; tone: 'good' | 'bad' | 'muted' }) {
  if (!n) return null;
  return (
    <li className="flex items-baseline gap-2">
      <span className={`font-semibold ${tone === 'good' ? 'text-sage-dark' : tone === 'bad' ? 'text-clay' : 'text-muted'}`}>
        {n}
      </span>
      <span className="text-muted">{label}</span>
    </li>
  );
}

function downloadTemplate(classroomName?: string) {
  const blob = new Blob([templateCsv(classroomName)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'family-roster-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

/** 0 → A, 26 → AA — matches the column letters shown in Excel. */
function columnLetter(i: number): string {
  let s = '';
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}
