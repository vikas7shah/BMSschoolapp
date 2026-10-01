#!/usr/bin/env node
/**
 * Fills the dev stack with sample data so every screen has something to show:
 * the school (reminders paused), three classrooms, the live newsletters,
 * made-up families and a test teacher. Every address is the SES mailbox
 * simulator and every number a fictional 555 line, so nothing reaches a person.
 *
 *   BMS_STACK=Bms-dev node scripts/seed-dev.mjs
 *
 * Idempotent: re-running skips what already exists. Refuses the live stack.
 */
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { REGION, STACK, backendConfig, ulidish } from './lib/stack.mjs';

if (!/^Bms-dev/.test(STACK)) {
  console.error(`Refusing to seed ${STACK}: sample data is for the dev stack only (BMS_STACK=Bms-dev).`);
  process.exit(1);
}

const { outputs, env } = await backendConfig();
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const schoolId = env.SCHOOL_ID ?? 'school';
const now = new Date().toISOString();
const sim = (label) => `success+${label}@simulator.amazonses.com`;

/* ------------------------------------------------- school, reminders paused */
const school = await ddb.send(new GetCommand({ TableName: env.TABLE_SCHOOLS, Key: { schoolId } }));
await ddb.send(new PutCommand({
  TableName: env.TABLE_SCHOOLS,
  Item: {
    createdAt: now, ...school.Item,
    schoolId, name: 'Burlington Montessori School', timezone: 'America/New_York', reminderHour: 15,
    remindersPaused: true, openSlotNudgesPaused: true,
  },
}));
console.log('✓ School (reminders paused)');

/* --------------------------------------------------------------- classrooms */
const existingRooms = (await ddb.send(new QueryCommand({
  TableName: env.TABLE_CLASSROOMS, IndexName: 'bySchool',
  KeyConditionExpression: 'schoolId = :s', ExpressionAttributeValues: { ':s': schoolId },
}))).Items ?? [];
for (const name of ['Classroom 1', 'Classroom 2', 'Classroom 3']) {
  if (existingRooms.some((r) => r.name === name)) continue;
  await ddb.send(new PutCommand({
    TableName: env.TABLE_CLASSROOMS,
    Item: { classroomId: ulidish(), schoolId, name, snackWeekdays: [1, 2, 3, 4, 5], createdAt: now },
  }));
}
console.log('✓ Classrooms 1–3');

/* ------------------------------------------- newsletters, copied from live */
const prodNews = (await new DynamoDBClient({ region: REGION }).send(new ScanCommand({
  TableName: (await liveNewslettersTable()),
}))).Items?.map((i) => unmarshall(i)) ?? [];
for (const n of prodNews) {
  await ddb.send(new PutCommand({ TableName: env.TABLE_NEWSLETTERS, Item: { ...n, schoolId } }));
}
console.log(`✓ ${prodNews.length} newsletter(s)`);

/* ------------------------------------- families and a teacher, via the API */
const base = outputs.AppUrl;
const sm = new SecretsManagerClient({ region: REGION });
const { SecretString: code } = await sm.send(new GetSecretValueCommand({ SecretId: `bms-${STACK.replace(/^Bms-/, '')}-dev-login` }));
let cookie = '';
async function call(method, path, body) {
  const r = await fetch(`${base}${path}`, {
    method, headers: { 'content-type': 'application/json', cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = r.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${json.error ?? ''}`);
  return json;
}
await call('POST', '/api/auth/test', { code });
const rooms = (await call('GET', '/api/admin/classrooms')).classrooms
  .sort((a, b) => a.name.localeCompare(b.name));

const KIDS = [
  ['Ava', 'Patel', 'Priya', 'Raj'], ['Leo', 'Martin', 'Sarah', 'Tom'], ['Mia', 'Chen', 'Lin', null],
  ['Noah', 'Garcia', 'Elena', 'Carlos'], ['Zara', 'Khan', 'Aisha', 'Omar'], ['Ethan', 'Brooks', 'Jenna', 'Mark'],
  ['Isla', 'Murphy', 'Kate', null], ['Arjun', 'Mehta', 'Neha', 'Vik'], ['Lucy', 'Rossi', 'Giulia', 'Marco'],
  ['Owen', 'Kim', 'Grace', 'Daniel'], ['Maya', 'Singh', 'Ritu', 'Aman'], ['Sam', 'Lee', 'Ana', null],
];
let line = 200;
const families = [];
KIDS.forEach(([kid, last, mum, dad], i) => {
  const room = rooms[i % rooms.length];
  for (const parent of [mum, dad].filter(Boolean)) {
    families.push({
      firstName: parent, lastName: last, phone: `+1617555${String(line++).padStart(4, '0')}`,
      email: sim(`${parent}.${last}`.toLowerCase()),
      children: [{ firstName: kid, lastName: last, classroomId: room.classroomId }],
    });
  }
});
const imported = await call('POST', '/api/admin/parents/import', { families });
console.log(`✓ Families: ${JSON.stringify(imported.summary ?? imported)}`);

const { teachers } = await call('GET', '/api/admin/teachers');
if (!teachers.some((t) => t.email === sim('teacher1'))) {
  await call('POST', '/api/admin/teachers', {
    firstName: 'Test', lastName: 'Teacher', email: sim('teacher1'), classroomIds: [rooms[0].classroomId],
  });
}
console.log(`✓ Test teacher (${sim('teacher1')}) for ${rooms[0].name}`);

/* ------------------------------------ snack days, and some of them taken */
await new LambdaClient({ region: REGION }).send(new InvokeCommand({
  FunctionName: outputs.RemindersFunctionName, Payload: Buffer.from('{}'),
}));
const { parents, children } = await call('GET', '/api/admin/parents');
const today = new Date().toISOString().slice(0, 10);
const until = new Date(Date.now() + 45 * 864e5).toISOString().slice(0, 10);
let taken = 0;
for (const room of rooms) {
  const kids = children.filter((k) => k.classroomId === room.classroomId);
  const days = (await ddb.send(new QueryCommand({
    TableName: env.TABLE_SLOTS, KeyConditionExpression: 'classroomId = :c AND sk BETWEEN :a AND :b',
    ExpressionAttributeValues: { ':c': room.classroomId, ':a': today.slice(0, 8) + '01', ':b': until },
  }))).Items ?? [];
  for (const [i, day] of days.entries()) {
    if (day.status !== 'OPEN' || i % 3 === 2 || !kids.length) continue;
    const kid = kids[i % kids.length];
    const parent = parents.find((p) => p.children.some((c) => c.childId === kid.childId));
    if (!parent) continue;
    await ddb.send(new UpdateCommand({
      TableName: env.TABLE_SLOTS, Key: { classroomId: room.classroomId, sk: day.sk },
      UpdateExpression: 'SET #s = :c, claimedByUserId = :u, claimedByName = :n, claimedForChildName = :k, claimedForChildId = :ki, claimedAt = :t, updatedAt = :t',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: {
        ':c': 'CLAIMED', ':u': parent.userId, ':n': `${parent.firstName} ${parent.lastName[0]}.`,
        ':k': kid.firstName, ':ki': kid.childId, ':t': now,
      },
    }));
    taken += 1;
  }
}
console.log(`✓ ${taken} snack days taken`);
console.log(`\nDev app: ${base}`);

/** The live stack's newsletters table, read-only: the dev copy shows the real letters. */
async function liveNewslettersTable() {
  const { CloudFormationClient, DescribeStacksCommand } = await import('@aws-sdk/client-cloudformation');
  const { LambdaClient: L, GetFunctionConfigurationCommand } = await import('@aws-sdk/client-lambda');
  const live = (await new CloudFormationClient({ region: REGION }).send(new DescribeStacksCommand({ StackName: 'Bms-prod' })))
    .Stacks[0].Outputs.find((o) => o.OutputKey === 'ApiFunctionName').OutputValue;
  const cfg = await new L({ region: REGION }).send(new GetFunctionConfigurationCommand({ FunctionName: live }));
  return cfg.Environment.Variables.TABLE_NEWSLETTERS;
}
