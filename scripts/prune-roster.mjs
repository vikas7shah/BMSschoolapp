#!/usr/bin/env node
/**
 * Removes every parent and child except the ones you name — for testing with
 * a handful of real accounts before the school goes live.
 *
 *   node scripts/prune-roster.mjs --keep <userId>[,<userId>...] [--apply]
 *
 * Without --apply it only reports. With it, every table is first written to
 * backups/<timestamp>.json (git-ignored) so the removal can be undone, then:
 * users, their Cognito accounts, guardianships, children with no remaining
 * guardian, notifications, dedupe rows, push subscriptions and login channels
 * are deleted, and any snack day a removed parent held is reopened.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient, ScanCommand, BatchWriteCommand, UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  CognitoIdentityProviderClient, AdminDeleteUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { REGION, backendConfig } from './lib/stack.mjs';

const args = process.argv.slice(2);
const keepIdx = args.indexOf('--keep');
const keep = new Set(keepIdx > -1 ? args[keepIdx + 1].split(',') : []);
const apply = args.includes('--apply');
if (!keep.size) { console.error('--keep <userId,...> is required'); process.exit(1); }

const { env } = await backendConfig();
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const cognito = new CognitoIdentityProviderClient({ region: REGION });

const T = {
  users: env.TABLE_USERS, children: env.TABLE_CHILDREN, guardianships: env.TABLE_GUARDIANSHIPS,
  slots: env.TABLE_SLOTS, notifications: env.TABLE_NOTIFICATIONS, dedupe: env.TABLE_DEDUPE,
  push: env.TABLE_PUSH, login: env.TABLE_LOGIN_CHANNEL, classrooms: env.TABLE_CLASSROOMS,
  schools: env.TABLE_SCHOOLS,
};
for (const [k, v] of Object.entries(T)) if (!v) throw new Error(`Missing table name for ${k}`);

async function scanAll(TableName) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const r = await ddb.send(new ScanCommand({ TableName, ExclusiveStartKey }));
    items.push(...(r.Items ?? []));
    ExclusiveStartKey = r.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

const all = Object.fromEntries(await Promise.all(
  Object.entries(T).map(async ([k, name]) => [k, await scanAll(name)]),
));

const users = all.users;
const missing = [...keep].filter((id) => !users.some((u) => u.userId === id));
if (missing.length) { console.error(`Not found: ${missing.join(', ')}`); process.exit(1); }

const removeUsers = users.filter((u) => !keep.has(u.userId));
const removeIds = new Set(removeUsers.map((u) => u.userId));
const keptChildren = new Set(all.guardianships.filter((g) => keep.has(g.userId)).map((g) => g.childId));
const removeChildren = all.children.filter((c) => !keptChildren.has(c.childId));
const removeGuardianships = all.guardianships.filter((g) => removeIds.has(g.userId) || !keptChildren.has(g.childId));
const removeNotifications = all.notifications.filter((n) => removeIds.has(n.userId));
const removeDedupe = all.dedupe.filter((d) => [...removeIds].some((id) => String(d.dedupeKey).includes(id)));
const removePush = all.push.filter((p) => removeIds.has(p.userId));
const removeLogin = all.login.filter((l) => removeUsers.some((u) => u.cognitoUsername === l.username || u.phone === l.username));
const reopenSlots = all.slots.filter((s) => s.status === 'CLAIMED' && removeIds.has(s.claimedByUserId));

console.log(`Keeping ${keep.size} parent(s):`);
for (const u of users.filter((u) => keep.has(u.userId))) console.log(`  ${u.firstName} ${u.lastName} <${u.email ?? u.phone}> (${u.role})`);
console.log(`Keeping ${keptChildren.size} child(ren): ${all.children.filter((c) => keptChildren.has(c.childId)).map((c) => `${c.firstName} ${c.lastName}`).join(', ')}`);
console.log(`\nWould remove: ${removeUsers.length} parents, ${removeChildren.length} children, ${removeGuardianships.length} guardianships, `
  + `${removeNotifications.length} notifications, ${removeDedupe.length} dedupe rows, ${removePush.length} push subscriptions, `
  + `${removeLogin.length} login channels; reopen ${reopenSlots.length} snack day(s).`);

if (!apply) { console.log('\nDry run. Add --apply to do it.'); process.exit(0); }

mkdirSync('backups', { recursive: true });
const file = `backups/${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
writeFileSync(file, JSON.stringify({ tables: T, data: all }, null, 2));
console.log(`\nBacked up every table to ${file}`);

async function batchDelete(TableName, keys) {
  for (let i = 0; i < keys.length; i += 25) {
    const chunk = keys.slice(i, i + 25);
    let req = { [TableName]: chunk.map((Key) => ({ DeleteRequest: { Key } })) };
    while (Object.keys(req).length) {
      const r = await ddb.send(new BatchWriteCommand({ RequestItems: req }));
      req = r.UnprocessedItems ?? {};
      if (Object.keys(req).length) await new Promise((res) => setTimeout(res, 200));
    }
  }
}

let cognitoGone = 0;
for (const u of removeUsers) {
  const Username = u.cognitoUsername ?? u.phone;
  if (!Username) continue;
  try {
    await cognito.send(new AdminDeleteUserCommand({ UserPoolId: env.COGNITO_USER_POOL_ID, Username }));
    cognitoGone += 1;
  } catch (err) {
    if (err?.name !== 'UserNotFoundException') throw err;
  }
}
console.log(`Cognito: removed ${cognitoGone} account(s)`);

for (const s of reopenSlots) {
  await ddb.send(new UpdateCommand({
    TableName: T.slots,
    Key: { classroomId: s.classroomId, sk: s.sk },
    UpdateExpression: 'SET #st = :open, updatedAt = :now REMOVE claimedByUserId, claimedByName, claimedAt, claimedForChildName, claimedForChildId',
    ExpressionAttributeNames: { '#st': 'status' },
    ExpressionAttributeValues: { ':open': 'OPEN', ':now': new Date().toISOString() },
  }));
}

await batchDelete(T.guardianships, removeGuardianships.map((g) => ({ userId: g.userId, childId: g.childId })));
await batchDelete(T.children, removeChildren.map((c) => ({ childId: c.childId })));
await batchDelete(T.notifications, removeNotifications.map((n) => ({ userId: n.userId, sk: n.sk })));
await batchDelete(T.dedupe, removeDedupe.map((d) => ({ dedupeKey: d.dedupeKey })));
await batchDelete(T.push, removePush.map((p) => ({ userId: p.userId, endpointId: p.endpointId })));
await batchDelete(T.login, removeLogin.map((l) => ({ username: l.username })));
await batchDelete(T.users, removeUsers.map((u) => ({ userId: u.userId })));
console.log('Done.');
