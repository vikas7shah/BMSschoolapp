#!/usr/bin/env node
/**
 * Three test families — one child in each classroom, each with a parent whose
 * mail lands in one real inbox — so every reminder scenario can be exercised
 * against the live app. Runs through the real admin API (sign-in with the
 * admin code, then the roster import), so it is also a smoke test of that
 * path after each deploy.
 *
 *   node scripts/test-families.mjs            create or re-link (idempotent)
 *   node scripts/test-families.mjs --remove   delete them, children included
 *
 * Skips itself when the admin code is not deployed (devLogin false), which is
 * the state the app is in once the school goes live.
 */
import { readFileSync } from 'node:fs';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { REGION, STACK, stackOutputs } from './lib/stack.mjs';

const INBOX = 'yogitaj508@gmail.com';
// Gmail delivers user+anything@ to user@ — three distinct addresses in the
// app (the app requires one address per account), one inbox for the tester.
const [local, domain] = INBOX.split('@');
const FAMILIES = [1, 2, 3].map((n) => ({
  firstName: `Yogita${n}`, lastName: 'Test', email: `${local}+test${n}@${domain}`,
  child: { firstName: `Testchild${n}`, lastName: 'Test' },
}));

const remove = process.argv.includes('--remove');
const context = JSON.parse(readFileSync(new URL('../infra/cdk.json', import.meta.url), 'utf8')).context;
if (context.devLogin !== true) {
  console.log('devLogin is off — no admin code, so no test families. Nothing to do.');
  process.exit(0);
}

const outputs = await stackOutputs();
const base = outputs.AppUrl;
if (!base) throw new Error('No app URL in stack outputs');

const sm = new SecretsManagerClient({ region: REGION });
const { SecretString: code } = await sm.send(new GetSecretValueCommand({ SecretId: `bms-${STACK.replace(/^Bms-/, '')}-dev-login` }));

let cookie = '';
async function call(method, path, body) {
  const r = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = r.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${json.error ?? ''}`);
  return json;
}

await call('POST', '/api/auth/test', { code });
const { classrooms } = await call('GET', '/api/admin/classrooms');
if (classrooms.length < FAMILIES.length) throw new Error(`Need ${FAMILIES.length} classrooms, found ${classrooms.length}`);
const rooms = [...classrooms].sort((a, b) => a.name.localeCompare(b.name));

if (remove) {
  const { parents } = await call('GET', '/api/admin/parents');
  let gone = 0;
  for (const f of FAMILIES) {
    const p = parents.find((u) => u.email === f.email);
    if (!p) continue;
    const r = await call('DELETE', `/api/admin/parents/${p.userId}`);
    console.log(`Removed ${f.firstName} (${r.childrenRemoved} child, ${r.daysReopened} day(s) reopened)`);
    gone += 1;
  }
  console.log(gone ? 'Test families removed.' : 'No test families found.');
  process.exit(0);
}

const r = await call('POST', '/api/admin/parents/import', {
  families: FAMILIES.map((f, i) => ({
    firstName: f.firstName, lastName: f.lastName, email: f.email,
    children: [{ ...f.child, classroomId: rooms[i].classroomId }],
  })),
  children: [],
});
const s = r.summary;
const kids = r.results.reduce((n, x) => n + (x.childrenCreated ?? 0), 0);
console.log(`Test families: ${s.created} created, ${s.linked} already there, ${s.failed} failed, ${kids} children created`);
if (s.failed) { console.error(JSON.stringify(r.results, null, 2)); process.exit(1); }

// The dashboard must now see one unbooked family in every classroom.
const overview = await call('GET', '/api/admin/overview');
for (const room of overview.byClassroom) {
  if (room.unbookedFamilies < 1) { console.error(`${room.name}: expected an unbooked test family, saw ${room.unbookedFamilies}`); process.exit(1); }
}
console.log(`Dashboard sees an unbooked family in each of ${overview.byClassroom.length} classrooms. ✓`);

// Nobody books for another family's child — the admin account has no children,
// so its claim on a test child's open day must be refused outright.
const room = rooms[0];
const { slots } = await call('GET', `/api/snacks?classroomId=${room.classroomId}`);
const open = slots.find((x) => x.status === 'OPEN');
if (open) {
  const r = await fetch(`${base}/api/snacks/claim`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ classroomId: room.classroomId, date: open.date }),
  });
  const body = await r.json();
  if (r.status !== 403 || body.code !== 'NOT_YOUR_CHILD') {
    console.error(`Expected the admin's claim to be refused with NOT_YOUR_CHILD, got ${r.status} ${JSON.stringify(body)}`);
    process.exit(1);
  }
  console.log('A day cannot be taken for a child that is not yours. ✓');
}
// Removing a child takes a parent with it only when that was their last
// child. Testchild1 is Yogita1's only child, so both must go — then the
// seed puts them back, which proves the import path a second time.
{
  const { parents } = await call('GET', '/api/admin/parents');
  const p1 = parents.find((u) => u.email === FAMILIES[0].email);
  const kid = p1?.children.find((k) => k.firstName === FAMILIES[0].child.firstName);
  if (!p1 || !kid) { console.error('Test family 1 not found for the removal check'); process.exit(1); }
  const r = await call('DELETE', `/api/admin/children/${kid.childId}`);
  const after = await call('GET', '/api/admin/parents');
  if (r.parentsRemoved !== 1 || after.parents.some((u) => u.email === FAMILIES[0].email)) {
    console.error(`Expected removing ${kid.firstName} to remove ${p1.firstName} too; got ${JSON.stringify(r)}`);
    process.exit(1);
  }
  console.log('Removing an only child removes the parent too. ✓');
  const again = await call('POST', '/api/admin/parents/import', {
    families: [{ ...FAMILIES[0], child: undefined, children: [{ ...FAMILIES[0].child, classroomId: rooms[0].classroomId }] }],
    children: [],
  });
  if (again.summary.created !== 1) { console.error(`Re-seed of family 1 failed: ${JSON.stringify(again.summary)}`); process.exit(1); }
}

// The September newsletter is the first entry; publishing it is idempotent
// and proves the admin editor's endpoint and the parents' read path.
{
  const doc = JSON.parse(readFileSync(new URL('../docs/newsletters/2026-09.json', import.meta.url), 'utf8'));
  await call('PUT', '/api/admin/newsletters/2026-09', doc);
  const { newsletters } = await call('GET', '/api/newsletters');
  const sept = newsletters.find((n) => n.month === '2026-09');
  if (!sept || sept.sections.length !== doc.sections.length || sept.curriculum.length !== doc.curriculum.length) {
    console.error('September newsletter did not read back as published'); process.exit(1);
  }
  console.log(`Newsletter for September reads back: ${sept.sections.length} sections, ${sept.curriculum.length} groups. ✓`);
}

for (const f of FAMILIES) console.log(`  ${f.firstName} ${f.lastName} <${f.email}> — ${f.child.firstName}`);
