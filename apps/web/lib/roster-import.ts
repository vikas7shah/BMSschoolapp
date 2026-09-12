/**
 * Turns a parsed sheet into families the API can create, and explains anything
 * it cannot. Deliberately forgiving about how a school labels its columns, and
 * strict about what it will actually send.
 *
 * Two layouts are supported, because schools keep rosters both ways:
 *
 *   ROW_PER_PARENT     one row per parent/child pair, classroom in a column
 *   GROUPED_BY_CHILD   one row per child, parents on the rows beneath it, and
 *                      the classroom given by a heading row above the section
 */
import { normalizePhone } from '@bms/shared';

export type Layout = 'ROW_PER_PARENT' | 'GROUPED_BY_CHILD';

export type FieldKey =
  | 'firstName' | 'lastName' | 'childFirstName' | 'childLastName'
  | 'parentFullName' | 'childFullName'
  | 'phone' | 'email' | 'classroom';

export type ColumnMap = Partial<Record<FieldKey, number>>; // absent or -1 = unmapped

export const FIELD_LABELS: Record<FieldKey, string> = {
  firstName: 'Parent first name',
  lastName: 'Parent last name',
  childFirstName: "Child's first name",
  childLastName: "Child's last name",
  parentFullName: 'Parent name',
  childFullName: "Child's name",
  phone: 'Mobile number',
  email: 'Email',
  classroom: 'Classroom',
};

/** Which fields each layout asks about, in the order they should be shown. */
export const LAYOUT_FIELDS: Record<Layout, FieldKey[]> = {
  ROW_PER_PARENT: ['firstName', 'lastName', 'phone', 'email', 'childFirstName', 'childLastName', 'classroom'],
  GROUPED_BY_CHILD: ['childFullName', 'parentFullName', 'phone', 'email', 'classroom'],
};

export const LAYOUT_LABELS: Record<Layout, string> = {
  ROW_PER_PARENT: 'One row per parent',
  GROUPED_BY_CHILD: 'Grouped by child, classrooms as headings',
};

const SYNONYMS: Record<FieldKey, string[]> = {
  firstName: ['firstname', 'first', 'parentfirstname', 'parentfirst', 'guardianfirstname', 'givenname'],
  lastName: ['lastname', 'last', 'surname', 'parentlastname', 'parentlast', 'guardianlastname', 'familyname'],
  parentFullName: ['parentname', 'parentnames', 'parent', 'parents', 'guardian', 'guardianname', 'guardians', 'parentguardian', 'contactname'],
  childFullName: ['name', 'childname', 'child', 'studentname', 'student', 'pupil', 'childsname'],
  childFirstName: ['childfirstname', 'childfirst', 'studentfirstname', 'studentfirst'],
  childLastName: ['childlastname', 'childlast', 'childsurname', 'studentlastname', 'studentlast'],
  phone: ['mobile', 'mobilenumber', 'phonenumber', 'phone', 'cell', 'cellphone', 'contactnumber', 'contact', 'tel', 'telephone'],
  email: ['emailaddress', 'email', 'mail', 'parentemail', 'guardianemail'],
  classroom: ['classroom', 'class', 'room', 'group', 'level', 'cohort'],
};

/** For matching column headings, where punctuation and digits are noise. */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

/**
 * For matching names, where a digit is part of the identity — "Classroom 1"
 * and "Classroom 2" must not collapse to the same key.
 */
const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const nonEmpty = (row: string[]) => row.filter((c) => c.trim()).length;

/** Section headings like "Classroom 1", "Toddler Room", "Upper Elementary". */
const SECTION_RE = /^(classroom|class|room|level|group|cohort)\b|\b(room|classroom)\s*\d+$/i;

/** A row that repeats the column titles partway down the sheet. */
function looksLikeHeader(row: string[]): boolean {
  const cells = row.map(norm).filter(Boolean);
  if (cells.length < 2) return false;
  const known = new Set(Object.values(SYNONYMS).flat());
  const hits = cells.filter((c) => known.has(c)).length;
  return hits >= 2 && hits >= cells.length - 1;
}

export interface LayoutDetection { layout: Layout; headerRow: number }

/**
 * Works out which shape the sheet is in, and which row holds the column
 * titles — often not row 1, since schools put a classroom heading above them.
 */
export function detectLayout(rows: string[][]): LayoutDetection {
  const headerRow = rows.findIndex(looksLikeHeader);
  if (headerRow === -1) return { layout: 'ROW_PER_PARENT', headerRow: 0 };

  const header = rows[headerRow]!.map(norm);
  const hasParentFull = header.some((h) => SYNONYMS.parentFullName.includes(h));
  const hasSplitParent = header.some((h) => SYNONYMS.firstName.includes(h))
    && header.some((h) => SYNONYMS.lastName.includes(h));

  // "Parent Name" as one column, with no separate first/last, means the child
  // owns the row and parents hang beneath it.
  const layout: Layout = hasParentFull && !hasSplitParent ? 'GROUPED_BY_CHILD' : 'ROW_PER_PARENT';
  return { layout, headerRow };
}

export function detectColumns(header: string[], layout: Layout): ColumnMap {
  const map: ColumnMap = {};
  const fields = LAYOUT_FIELDS[layout];
  const normalized = header.map(norm);
  const taken = new Set<number>();

  for (const key of fields) {
    const idx = normalized.findIndex((h, i) => !taken.has(i) && SYNONYMS[key].includes(h));
    if (idx !== -1) { map[key] = idx; taken.add(idx); }
  }
  for (const key of fields) {
    if (map[key] !== undefined) continue;
    const idx = normalized.findIndex(
      (h, i) => !taken.has(i) && h.length > 2 && SYNONYMS[key].some((s) => h.includes(s)),
    );
    if (idx !== -1) { map[key] = idx; taken.add(idx); }
  }
  return map;
}

/** "Camila Kumar" → first "Camila", last "Kumar". One-word names keep a blank surname. */
export function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0]!, lastName: '' };
  return { firstName: parts[0]!, lastName: parts.slice(1).join(' ') };
}

/**
 * "857-472-8125, 617-799-2677" — a cell holding more than one value. The first
 * is treated as primary; the rest are kept as further contact details rather
 * than thrown away.
 */
export function splitValues(cell: string): string[] {
  return cell
    .split(/[,;/]| or /i)
    .map((v) => v.trim())
    .filter(Boolean);
}

export interface Issue { level: 'ERROR' | 'WARN'; message: string }

export interface ImportChild {
  firstName: string;
  lastName: string;
  classroomId: string;
  classroomName: string;
}

export interface ImportFamily {
  firstName: string;
  lastName: string;
  /** Absent when the school holds only an email address for this contact. */
  phone?: string;
  email?: string;
  /** Further numbers and addresses from the same cell, kept for the office. */
  extraPhones?: string[];
  extraEmails?: string[];
  children: ImportChild[];
  sheetRows: number[];
  issues: Issue[];
  existing: boolean;
}

/** A child listed with no contact details at all. */
export interface OrphanChild extends ImportChild {
  sheetRows: number[];
  issues: Issue[];
}

export interface SkippedParent {
  sheetRows: number[];
  name: string;
  email?: string;
  reason: string;
}

export interface ImportPlan {
  layout: Layout;
  families: ImportFamily[];
  /** Children with no guardian — created so the class list is complete. */
  orphans: OrphanChild[];
  /** Parents we cannot create an account for, listed so the office can chase them. */
  skippedParents: SkippedParent[];
  rejected: { sheetRow: number; reason: string; preview: string }[];
  /** Classroom names in the sheet that do not exist in the app yet. */
  missingClassrooms: string[];
  counts: {
    ready: number; existing: number; withErrors: number;
    rejected: number; orphans: number; skippedParents: number;
  };
}

export interface BuildOptions {
  rows: string[][];
  map: ColumnMap;
  layout: Layout;
  /** Row index (0-based) holding the column titles; rows above it are ignored. */
  headerRow: number;
  classrooms: { classroomId: string; name: string }[];
  existingPhones: Set<string>;
  existingEmails: Set<string>;
  /** Classroom names the admin has agreed to create as part of this import. */
  pendingClassrooms?: Set<string>;
}

export function buildImportPlan(opts: BuildOptions): ImportPlan {
  return opts.layout === 'GROUPED_BY_CHILD' ? buildGrouped(opts) : buildRowPerParent(opts);
}

/* ------------------------------------------------- shared plumbing ------- */

interface SeenChild {
  name: string;
  classroom: string;
  sheetRows: number[];
  /** A family took this child on, so it will be created with a guardian. */
  linked: boolean;
  /** Contact rows existed, even if none of them could be used. */
  hadContact: boolean;
  /** Held back with its family (e.g. a sibling clash) — not an orphan either. */
  blocked: boolean;
}

interface Ctx {
  byName: Map<string, { classroomId: string; name: string }>;
  sole?: { classroomId: string; name: string };
  missing: Set<string>;
  pending: Set<string>;
}

function makeCtx(opts: BuildOptions): Ctx {
  return {
    byName: new Map(opts.classrooms.map((c) => [normName(c.name), c])),
    sole: opts.classrooms.length === 1 ? opts.classrooms[0] : undefined,
    missing: new Set<string>(),
    pending: opts.pendingClassrooms ?? new Set<string>(),
  };
}

/**
 * Resolves a classroom name. Names the admin has agreed to create resolve to a
 * placeholder id that the caller swaps for the real one after creating them.
 */
function resolveClassroom(ctx: Ctx, raw: string): { classroomId: string; name: string } | null {
  if (!raw) return ctx.sole ?? null;
  const hit = ctx.byName.get(normName(raw));
  if (hit) return hit;
  ctx.missing.add(raw);
  if (ctx.pending.has(raw)) return { classroomId: `new:${raw}`, name: raw };
  return null;
}

function finish(
  opts: BuildOptions, ctx: Ctx, layout: Layout,
  families: ImportFamily[], orphans: OrphanChild[],
  skipped: SkippedParent[], rejected: ImportPlan['rejected'],
): ImportPlan {
  for (const f of families) {
    if (f.existing) f.issues.push({ level: 'WARN', message: 'Already on the roster — this row will be skipped' });
    else if (!f.children.length && !f.issues.some((i) => i.level === 'ERROR')) {
      f.issues.push({ level: 'WARN', message: 'No child listed — they will not see any snack days' });
    }
  }
  return {
    layout,
    families,
    orphans,
    skippedParents: skipped,
    rejected,
    missingClassrooms: [...ctx.missing],
    counts: {
      ready: families.filter((f) => !f.existing && !f.issues.some((i) => i.level === 'ERROR')).length,
      existing: families.filter((f) => f.existing).length,
      withErrors: families.filter((f) => f.issues.some((i) => i.level === 'ERROR')).length,
      rejected: rejected.length,
      orphans: orphans.length,
      skippedParents: skipped.length,
    },
  };
}

/**
 * Attaches a child to a family. The school's rule is that siblings are never
 * placed in the same classroom — twins included — so a second child in a room
 * the family already has one in is an error, not a merge. The family is held
 * back from import until the sheet is corrected.
 */
function attachChild(
  family: ImportFamily,
  child: ImportChild,
  sheetRow: number,
): boolean {
  const sameName = family.children.find(
    (c) => normName(c.firstName) === normName(child.firstName) && c.classroomId === child.classroomId,
  );
  if (sameName) return true; // the same row seen twice, e.g. under each guardian

  const sibling = family.children.find((c) => c.classroomId === child.classroomId);
  if (sibling) {
    family.issues.push({
      level: 'ERROR',
      message: `Row ${sheetRow}: ${child.firstName} and ${sibling.firstName} are both in `
        + `${child.classroomName}. Siblings must be in different classrooms — fix the `
        + 'sheet and import again.',
    });
    return false;
  }
  family.children.push(child);
  return true;
}

/* --------------------------------------------- layout: grouped by child --- */

function buildGrouped(opts: BuildOptions): ImportPlan {
  const { rows, map, headerRow, existingPhones, existingEmails } = opts;
  const ctx = makeCtx(opts);
  const cell = (row: string[], key: FieldKey) => {
    const i = map[key];
    return i === undefined || i < 0 ? '' : (row[i] ?? '').trim();
  };

  const families = new Map<string, ImportFamily>();
  const orphans: OrphanChild[] = [];
  const skipped = new Map<string, SkippedParent>();
  const rejected: ImportPlan['rejected'] = [];

  let classroomRaw = '';
  let child: SeenChild | null = null;
  // Every child encountered, whether or not a parent account came out of it.
  const childSeen = new Map<string, SeenChild>();

  rows.forEach((row, i) => {
    const sheetRow = i + 1;
    if (nonEmpty(row) === 0) return;
    if (looksLikeHeader(row)) return; // the titles, repeated per section

    const childCell = cell(row, 'childFullName');
    const parentCell = cell(row, 'parentFullName');
    const phoneRaw = cell(row, 'phone');
    const emailRaw = cell(row, 'email');
    const hasContact = !!(parentCell || phoneRaw || emailRaw);
    const isSection = !!childCell && !hasContact && nonEmpty(row) === 1 && SECTION_RE.test(childCell);

    // A lone cell in the child column, with a heading shape, starts a section.
    // Checked before the header-row cut-off, because the first section heading
    // usually sits *above* the column titles.
    if (isSection) {
      classroomRaw = childCell;
      child = null;
      return;
    }

    // Anything else above the titles is a document title or a stray note.
    if (i <= headerRow) return;

    // An explicit classroom column, if the sheet has one, wins over the heading.
    const rowClassroom = cell(row, 'classroom') || classroomRaw;

    if (childCell) {
      const key = `${normName(rowClassroom)}|${normName(childCell)}`;
      const prior = childSeen.get(key);
      if (prior) {
        prior.sheetRows.push(sheetRow);
        child = prior;
      } else {
        child = { name: childCell, classroom: rowClassroom, sheetRows: [sheetRow], linked: false, hadContact: false, blocked: false };
        childSeen.set(key, child);
      }
    }

    if (!hasContact) return;
    if (!child) {
      rejected.push({ sheetRow, reason: 'Contact details with no child above them', preview: parentCell || phoneRaw });
      return;
    }
    child.hadContact = true;

    const room = resolveClassroom(ctx, child.classroom);
    if (!room) {
      rejected.push({ sheetRow, reason: classroomReason(child.classroom), preview: parentCell || child.name });
      return;
    }

    // A cell may hold more than one number or address; the first is primary.
    const phoneParts = splitValues(phoneRaw)
      .map((v) => normalizePhone(v))
      .filter((v): v is string => !!v);
    const emailParts = splitValues(emailRaw)
      .map((v) => v.toLowerCase())
      .filter((v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v));

    const phone = phoneParts[0];
    const email = emailParts[0];

    // Two people sharing one number and one address are one contact for the
    // school, so the cell is kept as written rather than guessing a split.
    const name = parentCell || `${splitName(child.name).lastName || child.name} family`;

    // Without either a number or an address there is nothing to reach them on.
    if (!phone && !email) {
      const prior = skipped.get(`row:${sheetRow}`);
      skipped.set(`row:${sheetRow}`, {
        sheetRows: [...(prior?.sheetRows ?? []), sheetRow],
        name,
        reason: phoneRaw
          ? `"${phoneRaw}" is not a usable phone number, and there is no email`
          : 'No phone number or email address',
      });
      return;
    }

    const { firstName, lastName } = splitName(name);
    // Identity is the phone where there is one, otherwise the email — so one
    // parent listed under two siblings becomes a single account either way.
    const key = phone ?? `email:${email}`;
    let family = families.get(key);
    if (!family) {
      family = {
        firstName, lastName, phone, email,
        extraPhones: phoneParts.slice(1),
        extraEmails: emailParts.slice(1),
        children: [], sheetRows: [], issues: [],
        // An address already on the roster is the *same person*, not a clash —
        // typically a parent who is also staff. They are linked to the child
        // rather than skipped.
        existing: (!!phone && existingPhones.has(phone)) || (!!email && existingEmails.has(email)),
      };
      families.set(key, family);
    }
    family.sheetRows.push(sheetRow);

    if (phoneParts.length > 1) {
      family.issues.push({
        level: 'WARN',
        message: `Row ${sheetRow}: more than one number given — `
          + `${phone} will be the main one`,
      });
    }
    if (!phone) {
      family.issues.push({
        level: 'WARN',
        message: 'No phone number — they will sign in with their email address',
      });
    }
    if (!parentCell) {
      family.issues.push({
        level: 'WARN',
        message: `Row ${sheetRow}: no parent name given, so "${name}" is used`,
      });
    }

    const { firstName: cf, lastName: cl } = splitName(child.name);
    if (attachChild(family, {
      firstName: cf, lastName: cl || lastName || cf,
      classroomId: room.classroomId, classroomName: room.name,
    }, sheetRow)) {
      child.linked = true;
    } else {
      child.blocked = true;
    }
  });

  // Any child no family took on still belongs on the class list — including
  // one whose only listed parents had to be skipped.
  for (const seen of childSeen.values()) {
    if (seen.linked || seen.blocked) continue;
    const room = resolveClassroom(ctx, seen.classroom);
    if (!room) {
      rejected.push({
        sheetRow: seen.sheetRows[0]!,
        reason: classroomReason(seen.classroom),
        preview: seen.name,
      });
      continue;
    }
    const { firstName, lastName } = splitName(seen.name);
    const issues: Issue[] = [{
      level: 'WARN',
      message: seen.hadContact
        ? 'Listed contacts could not be used — added without a guardian'
        : 'No parent contact listed',
    }];
    if (seen.sheetRows.length > 1) {
      issues.push({
        level: 'WARN',
        message: `This name appears on rows ${seen.sheetRows.join(' and ')} — check it is not a duplicate`,
      });
    }
    orphans.push({
      firstName, lastName: lastName || firstName,
      classroomId: room.classroomId, classroomName: room.name,
      sheetRows: seen.sheetRows, issues,
    });
  }

  // A duplicated name under a family that *was* created still deserves a note.
  for (const seen of childSeen.values()) {
    if (!seen.linked || seen.sheetRows.length < 2) continue;
    for (const f of families.values()) {
      if (f.sheetRows.some((r) => seen.sheetRows.includes(r))) {
        f.issues.push({
          level: 'WARN',
          message: `"${seen.name}" appears on rows ${seen.sheetRows.join(' and ')} — check it is not a duplicate`,
        });
      }
    }
  }

  return finish(opts, ctx, 'GROUPED_BY_CHILD', [...families.values()], orphans,
    [...skipped.values()], rejected);
}

const classroomReason = (raw: string) =>
  raw ? `Classroom "${raw}" does not exist yet` : 'No classroom, and there is more than one to choose from';

/* ------------------------------------------- layout: one row per parent --- */

function buildRowPerParent(opts: BuildOptions): ImportPlan {
  const { rows, map, headerRow, existingPhones, existingEmails } = opts;
  const ctx = makeCtx(opts);
  const cell = (row: string[], key: FieldKey) => {
    const i = map[key];
    return i === undefined || i < 0 ? '' : (row[i] ?? '').trim();
  };

  const families = new Map<string, ImportFamily>();
  const rejected: ImportPlan['rejected'] = [];

  rows.forEach((row, i) => {
    const sheetRow = i + 1;
    if (i <= headerRow) return;
    if (nonEmpty(row) === 0) return;

    const firstName = cell(row, 'firstName');
    const lastName = cell(row, 'lastName');
    const rawPhone = cell(row, 'phone');
    const phone = rawPhone ? normalizePhone(rawPhone) : null;
    const preview = [firstName, lastName, rawPhone].filter(Boolean).join(' ') || row.join(' ').slice(0, 40);

    if (!phone) {
      rejected.push({
        sheetRow,
        reason: rawPhone ? `"${rawPhone}" is not a usable mobile number` : 'No mobile number',
        preview,
      });
      return;
    }
    if (!firstName && !lastName) {
      rejected.push({ sheetRow, reason: 'No parent name', preview });
      return;
    }

    let family = families.get(phone);
    if (!family) {
      family = {
        firstName: firstName || lastName,
        lastName: lastName || '',
        phone, children: [], sheetRows: [], issues: [],
        existing: existingPhones.has(phone),
      };
      families.set(phone, family);
    }
    family.sheetRows.push(sheetRow);

    const rawEmail = cell(row, 'email');
    if (rawEmail) {
      const email = rawEmail.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        family.issues.push({ level: 'WARN', message: `Row ${sheetRow}: "${rawEmail}" is not a valid email — it will be left blank` });
      } else if (!family.email) {
        family.email = email;
        if (existingEmails.has(email) && !family.existing) {
          family.issues.push({ level: 'ERROR', message: `${email} already belongs to another family` });
        }
      }
    }

    const childFirst = cell(row, 'childFirstName');
    if (!childFirst) return;
    const childLast = cell(row, 'childLastName') || lastName;

    const room = resolveClassroom(ctx, cell(row, 'classroom'));
    if (!room) {
      family.issues.push({ level: 'ERROR', message: `Row ${sheetRow}: ${classroomReason(cell(row, 'classroom'))}` });
      return;
    }

    attachChild(family, {
      firstName: childFirst, lastName: childLast || childFirst,
      classroomId: room.classroomId, classroomName: room.name,
    }, sheetRow);
  });

  return finish(opts, ctx, 'ROW_PER_PARENT', [...families.values()], [], [], rejected);
}

/** A starter file in the exact shape the importer expects. */
export function templateCsv(classroomName = 'Primary'): string {
  return [
    'First Name,Last Name,Mobile,Email,Child First Name,Child Last Name,Classroom',
    `Ana,García,(617) 555-0101,ana@example.com,Amelia,García,${classroomName}`,
    `Ana,García,(617) 555-0101,ana@example.com,Mateo,García,${classroomName}`,
    `Ben,O'Neill,(617) 555-0102,,Bo,O'Neill,${classroomName}`,
  ].join('\n');
}
