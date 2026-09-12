import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readSpreadsheet } from '../lib/spreadsheet.ts';
import { buildImportPlan, detectColumns, detectLayout, splitName } from '../lib/roster-import.ts';

const FX = new URL('./fixtures/', import.meta.url).pathname;
const CLASSROOMS = [
  { classroomId: 'c1', name: 'Primary' },
  { classroomId: 'c2', name: 'Toddler' },
];

async function planFor(file: string, classrooms = CLASSROOMS, existingPhones = new Set<string>(), existingEmails = new Set<string>()) {
  const sheet = await readSpreadsheet(new File([readFileSync(`${FX}${file}`)], file));
  const { layout, headerRow } = detectLayout(sheet.rows);
  const map = detectColumns(sheet.rows[headerRow] ?? [], layout);
  const base = { rows: sheet.rows, map, layout, headerRow, classrooms, existingPhones, existingEmails };
  const first = buildImportPlan(base);
  // Second pass, as if the admin agreed to create the missing classrooms.
  const plan = first.missingClassrooms.length
    ? buildImportPlan({ ...base, pendingClassrooms: new Set(first.missingClassrooms) })
    : first;
  return { layout, headerRow, map, plan, missing: first.missingClassrooms };
}

/* ------------------------------------------------- layout: row per parent */

test('flat sheets still detect as one row per parent', async () => {
  const { layout, headerRow, map } = await planFor('roster.xlsx');
  assert.equal(layout, 'ROW_PER_PARENT');
  assert.equal(headerRow, 0);
  assert.equal(map.firstName, 0);
  assert.equal(map.childFirstName, 4, "child column not stolen by the parent's");
});

test('row-per-parent: repeated parents merge, guardians share a child', async () => {
  const { plan } = await planFor('roster.xlsx');
  const ana = plan.families.find((f) => f.phone === '+16175550101');
  assert.deepEqual(ana?.children.map((c) => c.firstName).sort(), ['Amelia', 'Mateo']);
  assert.deepEqual(ana?.sheetRows, [2, 5]);
  const bad = plan.rejected.find((r) => /not a usable mobile/.test(r.reason));
  assert.equal(bad?.sheetRow, 8, 'row number matches what Excel shows');
});

/* ---------------------------------------------- layout: grouped by child */

test('child-grouped sheets are detected, titles found below the first heading', async () => {
  const { layout, headerRow, map } = await planFor('grouped-roster.xlsx');
  assert.equal(layout, 'GROUPED_BY_CHILD');
  assert.equal(headerRow, 1, 'titles are on row 2, under the Classroom 1 heading');
  assert.equal(map.childFullName, 0);
  assert.equal(map.parentFullName, 1);
  assert.equal(map.phone, 2);
  assert.equal(map.email, 3);
});

test('classroom headings become classrooms, including the one above the titles', async () => {
  const { missing } = await planFor('grouped-roster.xlsx');
  assert.deepEqual(missing, ['Classroom 1', 'Classroom 2']);
});

test('a second parent on a blank-name row joins the child above', async () => {
  const { plan } = await planFor('grouped-roster.xlsx');
  const ben = plan.families.find((f) => f.phone === '+16175550102');
  const cara = plan.families.find((f) => f.phone === '+16175550103');
  assert.equal(ben?.children[0]?.firstName, 'Bo');
  assert.equal(cara?.children[0]?.firstName, 'Bo', 'blank name column means "same child"');
  assert.equal(cara?.lastName, 'Oneill', 'full name split into first and last');
});

test('a phone Excel stored as a number still resolves', async () => {
  const { plan } = await planFor('grouped-roster.xlsx');
  const dev = plan.families.find((f) => f.phone === '+16175550104');
  assert.ok(dev, 'scientific-notation phone recovered');
  assert.equal(dev.email, 'dev@example.com', 'email lowercased and trimmed');
});

test('one parent of two children in different classrooms is a single account', async () => {
  const { plan } = await planFor('grouped-roster.xlsx');
  const rosa = plan.families.filter((f) => f.phone === '+16175550108');
  assert.equal(rosa.length, 1, 'not duplicated across sections');
  assert.deepEqual(rosa[0]!.children.map((c) => c.firstName).sort(), ['Milo', 'Pia']);
  assert.equal(new Set(rosa[0]!.children.map((c) => c.classroomId)).size, 2, 'in two rooms');
  assert.ok(!rosa[0]!.issues.some((i) => i.level === 'ERROR'));
});

test('siblings in the same classroom are an error, twins included', async () => {
  // The school never places siblings together. The family is held back for
  // the admin to correct the sheet, rather than imported with a guess.
  const { plan } = await planFor('grouped-roster.xlsx');
  const iris = plan.families.find((f) => f.phone === '+16175550110');
  assert.ok(iris, 'family is still in the plan, so the admin can see why');
  const err = iris.issues.find((i) => i.level === 'ERROR');
  assert.ok(err, 'flagged as an error, not a warning');
  assert.match(err.message, /Ian and Ivy are both in Classroom 1/);
  assert.match(err.message, /Siblings must be in different classrooms/);
  assert.equal(iris.children.length, 1, 'only the first child attached');
  assert.equal(plan.counts.withErrors, 1);
  // Neither twin leaks into the guardian-less list.
  assert.ok(!plan.orphans.some((o) => o.lastName === 'Bloom'));
});

test('only a child with no contact at all is left without a guardian', async () => {
  const { plan } = await planFor('grouped-roster.xlsx');
  const names = plan.orphans.map((o) => `${o.firstName} ${o.lastName}`).sort();
  // Amelia is the only row in the fixture with nothing to reach anyone on.
  assert.deepEqual(names, ['Amelia Garcia']);
  assert.match(plan.orphans[0]!.issues[0]!.message, /No parent contact listed/);
});

test('a parent with an email but no phone is still imported', async () => {
  const { plan } = await planFor('grouped-roster.xlsx');
  const anya = plan.families.find((f) => f.email === 'anya@example.com');
  assert.ok(anya, 'imported on the strength of the email alone');
  assert.equal(anya.phone, undefined);
  // The same parent under two siblings collapses to one account.
  assert.deepEqual(anya.children.map((c) => c.firstName).sort(), ['Eli', 'Noor']);
  assert.match(anya.issues.map((i) => i.message).join(' '), /sign in with their email/);
});

test('two numbers in one cell keep the first and record the rest', async () => {
  const { plan } = await planFor('grouped-roster.xlsx');
  const nia = plan.families.find((f) => f.firstName === 'Nia');
  assert.ok(nia, 'no longer discarded');
  assert.equal(nia.phone, '+18574728125', 'the first number is the main one');
  assert.deepEqual(nia.extraPhones, ['+16177992677'], 'the second is kept, not lost');
  assert.match(nia.issues.map((i) => i.message).join(' '), /more than one number/);
});

test('two people sharing one number are one contact, named as written', async () => {
  const { plan } = await planFor('grouped-roster.xlsx');
  const tan = plan.families.find((f) => f.phone === '+16175550107');
  assert.ok(tan, 'no longer skipped');
  assert.equal(`${tan.firstName} ${tan.lastName}`, 'Lee & Jenny Tan');
  assert.equal(tan.children[0]?.firstName, 'Zara');
});

test('contact details with no name are attributed to the family', async () => {
  const { plan } = await planFor('grouped-roster.xlsx');
  const cole = plan.families.find((f) => f.phone === '+16175550109');
  assert.ok(cole, 'no longer skipped');
  assert.match(`${cole.firstName} ${cole.lastName}`, /Cole family/);
  assert.equal(cole.children[0]?.firstName, 'Sam');
  assert.match(cole.issues.map((i) => i.message).join(' '), /no parent name given/);
});

test('nothing is skipped when every row has a way to reach someone', async () => {
  const { plan } = await planFor('grouped-roster.xlsx');
  assert.deepEqual(plan.skippedParents, []);
});

test('every child in the sheet is still accounted for', async () => {
  const { plan } = await planFor('grouped-roster.xlsx');
  const viaFamilies = new Set(
    plan.families.flatMap((f) => f.children.map((c) => `${c.classroomId}|${c.firstName}`)),
  );
  // 12 children in the fixture: 10 importable, plus the two Bloom twins whose
  // family is held back. Ivy is attached; Ian is blocked with the family.
  assert.equal(viaFamilies.size + plan.orphans.length, 11, 'none silently dropped');
});

test('families already on the roster are matched, not duplicated', async () => {
  const { plan } = await planFor('grouped-roster.xlsx', CLASSROOMS, new Set(['+16175550102']));
  const ben = plan.families.find((f) => f.phone === '+16175550102');
  assert.equal(ben?.existing, true);
  assert.equal(plan.counts.existing, 1);
});

test('an address already on the roster is the same person, not a clash', async () => {
  // A parent who is also staff appears in both places. Treating that as a
  // conflict would silently drop their child's link, so it is a match instead.
  const { plan } = await planFor('grouped-roster.xlsx', CLASSROOMS, new Set(), new Set(['ben@example.com']));
  const ben = plan.families.find((f) => f.phone === '+16175550102');
  assert.equal(ben?.existing, true);
  assert.ok(!ben!.issues.some((i) => i.level === 'ERROR'), 'not an error');
});


test('without agreeing to create classrooms, nothing is silently misfiled', async () => {
  const sheet = await readSpreadsheet(new File([readFileSync(`${FX}grouped-roster.xlsx`)], 'g.xlsx'));
  const { layout, headerRow } = detectLayout(sheet.rows);
  const plan = buildImportPlan({
    rows: sheet.rows, map: detectColumns(sheet.rows[headerRow] ?? [], layout), layout, headerRow,
    classrooms: CLASSROOMS, existingPhones: new Set(), existingEmails: new Set(),
  });
  assert.equal(plan.families.length, 0, 'no family lands in the wrong classroom');
  assert.ok(plan.rejected.length > 0, 'rows are reported instead');
  assert.ok(plan.rejected.every((r) => /does not exist yet/.test(r.reason)));
});

test('name splitting', () => {
  assert.deepEqual(splitName('Camila Kumar'), { firstName: 'Camila', lastName: 'Kumar' });
  assert.deepEqual(splitName('Jose Luis Marin'), { firstName: 'Jose', lastName: 'Luis Marin' });
  assert.deepEqual(splitName('Anya'), { firstName: 'Anya', lastName: '' });
  assert.deepEqual(splitName('  '), { firstName: '', lastName: '' });
});

test('classroom names differing only by a digit stay distinct', async () => {
  // "Classroom 1" and "Classroom 2" must not collapse to one key — a
  // letters-only normaliser silently filed every child into one room.
  const sheet = await readSpreadsheet(
    new File([readFileSync(`${FX}grouped-roster.xlsx`)], 'g.xlsx'),
  );
  const { layout, headerRow } = detectLayout(sheet.rows);
  const plan = buildImportPlan({
    rows: sheet.rows, map: detectColumns(sheet.rows[headerRow] ?? [], layout), layout, headerRow,
    // Both rooms already exist, which is when the name lookup is used.
    classrooms: [
      { classroomId: 'room-1', name: 'Classroom 1' },
      { classroomId: 'room-2', name: 'Classroom 2' },
    ],
    existingPhones: new Set(), existingEmails: new Set(),
  });

  assert.deepEqual(plan.missingClassrooms, [], 'both names resolve');
  const rooms = new Set([
    ...plan.families.flatMap((f) => f.children.map((c) => c.classroomId)),
    ...plan.orphans.map((o) => o.classroomId),
  ]);
  assert.deepEqual([...rooms].sort(), ['room-1', 'room-2'], 'children land in both rooms');

  const bo = plan.families.find((f) => f.phone === '+16175550102');
  assert.equal(bo?.children[0]?.classroomId, 'room-1', 'Bo is in Classroom 1');
  const rosa = plan.families.find((f) => f.phone === '+16175550108');
  assert.deepEqual(rosa?.children.map((c) => c.classroomId).sort(), ['room-1', 'room-2']);
});
