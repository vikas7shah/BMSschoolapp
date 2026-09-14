import {
  DeleteCommand, GetCommand, PutCommand, QueryCommand, ScanCommand, UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import type {
  Child, Classroom, Newsletter, NotificationRecord, PushSubscriptionRecord, School, SnackSlot, User,
} from '@bms/shared';
import { DEFAULT_PREFS } from '@bms/shared';
import { ddb, nowIso, ttlDays } from './ddb.js';
import { env } from './env.js';

const T = env.tables;

/**
 * A snack day is one commitment covering the whole day, so the sort key is
 * simply the date. Kept as `sk` rather than renaming the key attribute, which
 * would mean replacing the table.
 */
export const slotSk = (date: string) => date;

/* ------------------------------------------------------------------ schools */

export async function setRemindersPaused(schoolId: string, paused: boolean): Promise<void> {
  await ddb.send(new UpdateCommand({
    TableName: T.schools,
    Key: { schoolId },
    UpdateExpression: 'SET remindersPaused = :p',
    ExpressionAttributeValues: { ':p': paused },
    ConditionExpression: 'attribute_exists(schoolId)',
  }));
}

export async function getSchool(schoolId: string): Promise<School | null> {
  const r = await ddb.send(new GetCommand({ TableName: T.schools, Key: { schoolId } }));
  return (r.Item as School) ?? null;
}

export async function putSchool(school: School): Promise<void> {
  await ddb.send(new PutCommand({ TableName: T.schools, Item: school }));
}

/* -------------------------------------------------------------- newsletters */

export async function putNewsletter(n: Newsletter): Promise<void> {
  await ddb.send(new PutCommand({ TableName: T.newsletters, Item: n }));
}

export async function getNewsletter(schoolId: string, month: string): Promise<Newsletter | null> {
  const r = await ddb.send(new GetCommand({ TableName: T.newsletters, Key: { schoolId, month } }));
  return (r.Item as Newsletter) ?? null;
}

/** Newest first. */
export async function listNewsletters(schoolId: string): Promise<Newsletter[]> {
  const r = await ddb.send(new QueryCommand({
    TableName: T.newsletters,
    KeyConditionExpression: 'schoolId = :s',
    ExpressionAttributeValues: { ':s': schoolId },
    ScanIndexForward: false,
  }));
  return (r.Items as Newsletter[]) ?? [];
}

/* --------------------------------------------------------------- classrooms */

export async function listClassrooms(schoolId: string): Promise<Classroom[]> {
  const r = await ddb.send(new QueryCommand({
    TableName: T.classrooms,
    IndexName: 'bySchool',
    KeyConditionExpression: 'schoolId = :s',
    ExpressionAttributeValues: { ':s': schoolId },
  }));
  return (r.Items as Classroom[]) ?? [];
}

export async function getClassroom(classroomId: string): Promise<Classroom | null> {
  const r = await ddb.send(new GetCommand({ TableName: T.classrooms, Key: { classroomId } }));
  return (r.Item as Classroom) ?? null;
}

export async function createClassroom(
  input: Omit<Classroom, 'classroomId' | 'createdAt'>,
): Promise<Classroom> {
  const c: Classroom = { ...input, classroomId: ulid(), createdAt: nowIso() };
  await ddb.send(new PutCommand({ TableName: T.classrooms, Item: c }));
  return c;
}

/* -------------------------------------------------------------------- users */

export async function getUser(userId: string): Promise<User | null> {
  const r = await ddb.send(new GetCommand({ TableName: T.users, Key: { userId } }));
  return (r.Item as User) ?? null;
}

/** Writes a user with a caller-chosen id; createUser is the normal path. */
export async function putUser(user: User): Promise<void> {
  await ddb.send(new PutCommand({
    TableName: T.users,
    Item: user,
    ConditionExpression: 'attribute_not_exists(userId)',
  }));
}

export async function getUserByPhone(phone: string): Promise<User | null> {
  const r = await ddb.send(new QueryCommand({
    TableName: T.users,
    IndexName: 'byPhone',
    KeyConditionExpression: 'phone = :p',
    ExpressionAttributeValues: { ':p': phone },
    Limit: 1,
  }));
  return (r.Items?.[0] as User) ?? null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const r = await ddb.send(new QueryCommand({
    TableName: T.users,
    IndexName: 'byEmail',
    KeyConditionExpression: 'email = :e',
    ExpressionAttributeValues: { ':e': normalizeEmail(email) },
    Limit: 1,
  }));
  return (r.Items?.[0] as User) ?? null;
}

/** Stored lowercase so the byEmail index matches whatever the parent types. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function listUsers(schoolId: string): Promise<User[]> {
  const r = await ddb.send(new QueryCommand({
    TableName: T.users,
    IndexName: 'bySchool',
    KeyConditionExpression: 'schoolId = :s',
    ExpressionAttributeValues: { ':s': schoolId },
  }));
  return (r.Items as User[]) ?? [];
}

export async function createUser(input: {
  schoolId: string; role: User['role']; firstName: string; lastName: string;
  phone?: string; email?: string; extraPhones?: string[]; extraEmails?: string[];
}): Promise<User> {
  const now = nowIso();
  const userId = ulid();
  const user: User = {
    userId,
    status: 'INVITED',
    prefs: { ...DEFAULT_PREFS },
    createdAt: now,
    updatedAt: now,
    // New accounts are keyed on their own id, so a family with no phone number
    // can still exist and sign in by email.
    cognitoUsername: userId,
    ...input,
    email: input.email ? normalizeEmail(input.email) : undefined,
  };
  // Guard against two admins inviting the same phone concurrently.
  await ddb.send(new PutCommand({
    TableName: T.users,
    Item: user,
    ConditionExpression: 'attribute_not_exists(userId)',
  }));
  return user;
}

export async function updateUser(
  userId: string,
  patch: Partial<Pick<User,
    'firstName' | 'lastName' | 'email' | 'phone' | 'prefs' | 'status' | 'lastLoginAt' | 'role'
    | 'extraPhones' | 'extraEmails'>>,
): Promise<User | null> {
  const normalized = patch.email
    ? { ...patch, email: normalizeEmail(patch.email) }
    : patch;
  const entries = Object.entries(normalized).filter(([, v]) => v !== undefined);
  if (!entries.length) return getUser(userId);
  entries.push(['updatedAt', nowIso()]);

  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const sets = entries.map(([k, v], i) => {
    names[`#k${i}`] = k;
    values[`:v${i}`] = v;
    return `#k${i} = :v${i}`;
  });

  const r = await ddb.send(new UpdateCommand({
    TableName: T.users,
    Key: { userId },
    UpdateExpression: `SET ${sets.join(', ')}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
    ConditionExpression: 'attribute_exists(userId)',
    ReturnValues: 'ALL_NEW',
  }));
  return (r.Attributes as User) ?? null;
}

export async function deleteUser(userId: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: T.users, Key: { userId } }));
}

/* ------------------------------------------------- children & guardianships */

export async function createChild(input: Omit<Child, 'childId' | 'createdAt'>): Promise<Child> {
  const child: Child = { ...input, childId: ulid(), createdAt: nowIso() };
  await ddb.send(new PutCommand({ TableName: T.children, Item: child }));
  return child;
}

export async function getChild(childId: string): Promise<Child | null> {
  const r = await ddb.send(new GetCommand({ TableName: T.children, Key: { childId } }));
  return (r.Item as Child) ?? null;
}

export async function listChildren(schoolId: string): Promise<Child[]> {
  const r = await ddb.send(new QueryCommand({
    TableName: T.children,
    IndexName: 'bySchool',
    KeyConditionExpression: 'schoolId = :s',
    ExpressionAttributeValues: { ':s': schoolId },
  }));
  return (r.Items as Child[]) ?? [];
}

export async function linkGuardian(userId: string, childId: string): Promise<void> {
  await ddb.send(new PutCommand({
    TableName: T.guardianships,
    Item: { userId, childId, createdAt: nowIso() },
  }));
}

export async function unlinkGuardian(userId: string, childId: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: T.guardianships, Key: { userId, childId } }));
}

export async function childIdsForGuardian(userId: string): Promise<string[]> {
  const r = await ddb.send(new QueryCommand({
    TableName: T.guardianships,
    KeyConditionExpression: 'userId = :u',
    ExpressionAttributeValues: { ':u': userId },
  }));
  return (r.Items ?? []).map((i) => i.childId as string);
}

export async function listAllGuardianships(): Promise<{ userId: string; childId: string }[]> {
  const items: { userId: string; childId: string }[] = [];
  let key: Record<string, unknown> | undefined;
  do {
    const r = await ddb.send(new ScanCommand({ TableName: T.guardianships, ExclusiveStartKey: key }));
    for (const i of r.Items ?? []) items.push({ userId: i.userId as string, childId: i.childId as string });
    key = r.LastEvaluatedKey;
  } while (key);
  return items;
}

export async function guardianIdsForChild(childId: string): Promise<string[]> {
  const r = await ddb.send(new QueryCommand({
    TableName: T.guardianships,
    IndexName: 'byChild',
    KeyConditionExpression: 'childId = :c',
    ExpressionAttributeValues: { ':c': childId },
  }));
  return (r.Items ?? []).map((i) => i.userId as string);
}

export async function deleteChild(childId: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: T.children, Key: { childId } }));
}

export async function childrenForGuardian(userId: string): Promise<Child[]> {
  const ids = await childIdsForGuardian(userId);
  const kids = await Promise.all(ids.map(getChild));
  return kids.filter((c): c is Child => c !== null);
}

/* -------------------------------------------------------------------- slots */

export async function listSlots(
  classroomId: string, from: string, to: string,
): Promise<SnackSlot[]> {
  const r = await ddb.send(new QueryCommand({
    TableName: T.slots,
    KeyConditionExpression: 'classroomId = :c AND sk BETWEEN :from AND :to',
    ExpressionAttributeValues: { ':c': classroomId, ':from': from, ':to': to },
  }));
  return (r.Items as SnackSlot[]) ?? [];
}

/**
 * Whether a classroom still has an unclaimed day from `today` onwards. Drives
 * the "calendar is full" lock, so it is deliberately unbounded rather than
 * limited to whatever window the board happens to be showing.
 */
export async function classroomHasOpenDay(classroomId: string, today: string): Promise<boolean> {
  // Deliberately no Limit: DynamoDB applies Limit *before* the filter, so
  // `Limit: 1` reads a single row and returns nothing whenever that row happens
  // to be claimed — which would silently prevent the "calendar full" lock from
  // ever engaging. Pages are walked until an open day is found instead.
  let key: Record<string, unknown> | undefined;
  do {
    const r = await ddb.send(new QueryCommand({
      TableName: T.slots,
      KeyConditionExpression: 'classroomId = :c AND sk >= :from',
      FilterExpression: '#s = :open',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':c': classroomId, ':from': today, ':open': 'OPEN' },
      ExclusiveStartKey: key,
    }));
    if ((r.Items?.length ?? 0) > 0) return true;
    key = r.LastEvaluatedKey;
  } while (key);
  return false;
}

/** All slots school-wide in a date window — used by the reminder sweep. */
export async function listSlotsBySchool(
  schoolId: string, from: string, to: string,
): Promise<SnackSlot[]> {
  const items: SnackSlot[] = [];
  let key: Record<string, unknown> | undefined;
  do {
    const r = await ddb.send(new QueryCommand({
      TableName: T.slots,
      IndexName: 'bySchoolDate',
      KeyConditionExpression: 'schoolId = :s AND #d BETWEEN :from AND :to',
      ExpressionAttributeNames: { '#d': 'date' },
      ExpressionAttributeValues: { ':s': schoolId, ':from': from, ':to': to },
      ExclusiveStartKey: key,
    }));
    items.push(...((r.Items as SnackSlot[]) ?? []));
    key = r.LastEvaluatedKey;
  } while (key);
  return items;
}

export async function slotsForUser(userId: string, fromDate: string): Promise<SnackSlot[]> {
  const r = await ddb.send(new QueryCommand({
    TableName: T.slots,
    IndexName: 'byClaimant',
    KeyConditionExpression: 'claimedByUserId = :u AND #d >= :d',
    ExpressionAttributeNames: { '#d': 'date' },
    ExpressionAttributeValues: { ':u': userId, ':d': fromDate },
  }));
  return (r.Items as SnackSlot[]) ?? [];
}

/** Creates an OPEN slot only if that date/type doesn't exist yet. */
export async function markNudged(classroomId: string, on: string): Promise<void> {
  await ddb.send(new UpdateCommand({
    TableName: T.classrooms,
    Key: { classroomId },
    UpdateExpression: 'SET nudgedOn = :d',
    ExpressionAttributeValues: { ':d': on },
  }));
}

export async function markPublished(classroomId: string, through: string): Promise<void> {
  await ddb.send(new UpdateCommand({
    TableName: T.classrooms,
    Key: { classroomId },
    UpdateExpression: 'SET publishedThrough = :t',
    ExpressionAttributeValues: { ':t': through },
  }));
}

export async function ensureSlot(
  schoolId: string, classroomId: string, date: string,
): Promise<boolean> {
  try {
    await ddb.send(new PutCommand({
      TableName: T.slots,
      Item: {
        classroomId, sk: slotSk(date), schoolId, date,
        status: 'OPEN', updatedAt: nowIso(),
      },
      ConditionExpression: 'attribute_not_exists(sk)',
    }));
    return true;
  } catch (e) {
    if ((e as { name?: string }).name === 'ConditionalCheckFailedException') return false;
    throw e;
  }
}

/**
 * Claims a slot. The condition expression is what makes this safe when two
 * parents tap "I'll bring it" at the same moment — the second one loses.
 */
export async function claimSlot(args: {
  classroomId: string; date: string;
  userId: string; userName: string; childName?: string; childId?: string; note?: string;
}): Promise<SnackSlot | 'TAKEN' | 'NOT_FOUND'> {
  try {
    // Optional fields are set or removed, never written as NULL — a NULL
    // child name reads as "present but empty" everywhere downstream.
    const sets = [
      '#s = :claimed', 'claimedByUserId = :u', 'claimedByName = :n',
      'claimedAt = :t', 'updatedAt = :t',
    ];
    const removes: string[] = [];
    const values: Record<string, unknown> = {
      ':claimed': 'CLAIMED', ':open': 'OPEN', ':u': args.userId, ':n': args.userName,
      ':t': nowIso(),
    };

    if (args.childName) { sets.push('claimedForChildName = :c'); values[':c'] = args.childName; }
    else removes.push('claimedForChildName');

    if (args.childId) { sets.push('claimedForChildId = :cid'); values[':cid'] = args.childId; }
    else removes.push('claimedForChildId');

    if (args.note) { sets.push('note = :note'); values[':note'] = args.note; }
    else removes.push('note');

    const r = await ddb.send(new UpdateCommand({
      TableName: T.slots,
      Key: { classroomId: args.classroomId, sk: slotSk(args.date) },
      UpdateExpression:
        `SET ${sets.join(', ')}${removes.length ? ` REMOVE ${removes.join(', ')}` : ''}`,
      ConditionExpression: 'attribute_exists(sk) AND #s = :open',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW',
    }));
    return r.Attributes as SnackSlot;
  } catch (e) {
    if ((e as { name?: string }).name === 'ConditionalCheckFailedException') {
      const cur = await ddb.send(new GetCommand({
        TableName: T.slots,
        Key: { classroomId: args.classroomId, sk: slotSk(args.date) },
      }));
      return cur.Item ? 'TAKEN' : 'NOT_FOUND';
    }
    throw e;
  }
}

/**
 * Releases a slot. The claimant may, either parent of the child it is for
 * may (pass their childIds), and an admin always may.
 */
export async function releaseSlot(args: {
  classroomId: string; date: string; userId: string; isAdmin: boolean; childIds?: Iterable<string>;
}): Promise<SnackSlot | 'FORBIDDEN' | 'NOT_FOUND'> {
  const names: Record<string, string> = { '#s': 'status' };
  const values: Record<string, unknown> = { ':open': 'OPEN', ':t': nowIso() };
  let condition = 'attribute_exists(sk)';
  if (!args.isAdmin) {
    const kids = [...(args.childIds ?? [])];
    values[':u'] = args.userId;
    if (kids.length) {
      kids.forEach((id, i) => { values[`:k${i}`] = id; });
      condition += ` AND (claimedByUserId = :u OR claimedForChildId IN (${kids.map((_, i) => `:k${i}`).join(', ')}))`;
    } else {
      condition += ' AND claimedByUserId = :u';
    }
  }
  try {
    const r = await ddb.send(new UpdateCommand({
      TableName: T.slots,
      Key: { classroomId: args.classroomId, sk: slotSk(args.date) },
      UpdateExpression:
        'SET #s = :open, updatedAt = :t REMOVE claimedByUserId, claimedByName, claimedAt, '
        + 'claimedForChildName, claimedForChildId, note',
      ConditionExpression: condition,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ReturnValues: 'ALL_NEW',
    }));
    return r.Attributes as SnackSlot;
  } catch (e) {
    if ((e as { name?: string }).name === 'ConditionalCheckFailedException') {
      const cur = await ddb.send(new GetCommand({
        TableName: T.slots,
        Key: { classroomId: args.classroomId, sk: slotSk(args.date) },
      }));
      return cur.Item ? 'FORBIDDEN' : 'NOT_FOUND';
    }
    throw e;
  }
}

/**
 * Removes a snack day only if nobody has taken it. Used when a date turns out
 * to be a school holiday — a family's commitment is never silently deleted.
 */
export async function deleteOpenSlot(classroomId: string, date: string): Promise<boolean> {
  try {
    await ddb.send(new DeleteCommand({
      TableName: T.slots,
      Key: { classroomId, sk: slotSk(date) },
      ConditionExpression: 'attribute_exists(sk) AND #s = :open',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':open': 'OPEN' },
    }));
    return true;
  } catch (e) {
    if ((e as { name?: string }).name === 'ConditionalCheckFailedException') return false;
    throw e;
  }
}

export async function deleteSlot(classroomId: string, date: string): Promise<void> {
  await ddb.send(new DeleteCommand({
    TableName: T.slots, Key: { classroomId, sk: slotSk(date) },
  }));
}

/* ------------------------------------------------------------ notifications */

/** Sort key puts the newest first when queried in reverse. */
export const notificationSk = (n: Pick<NotificationRecord, 'createdAt' | 'notificationId'>) =>
  `${n.createdAt}#${n.notificationId}`;

export async function putNotification(n: NotificationRecord): Promise<void> {
  await ddb.send(new PutCommand({
    TableName: T.notifications,
    Item: { ...n, sk: notificationSk(n), ttl: ttlDays(120) },
  }));
}

export async function listNotifications(userId: string, limit = 50): Promise<NotificationRecord[]> {
  const r = await ddb.send(new QueryCommand({
    TableName: T.notifications,
    KeyConditionExpression: 'userId = :u',
    ExpressionAttributeValues: { ':u': userId },
    ScanIndexForward: false,
    Limit: limit,
  }));
  return (r.Items as NotificationRecord[]) ?? [];
}

export async function markNotificationRead(userId: string, sk: string): Promise<void> {
  await ddb.send(new UpdateCommand({
    TableName: T.notifications,
    Key: { userId, sk },
    UpdateExpression: 'SET readAt = :t',
    ExpressionAttributeValues: { ':t': nowIso() },
    ConditionExpression: 'attribute_exists(sk)',
  }));
}

/**
 * Returns true the first time a dedupe key is seen. Every reminder passes
 * through here, which is what guarantees a parent is never texted twice.
 */
export async function claimDedupeKey(key: string, days = 45): Promise<boolean> {
  try {
    await ddb.send(new PutCommand({
      TableName: T.dedupe,
      Item: { dedupeKey: key, createdAt: nowIso(), ttl: ttlDays(days) },
      ConditionExpression: 'attribute_not_exists(dedupeKey)',
    }));
    return true;
  } catch (e) {
    if ((e as { name?: string }).name === 'ConditionalCheckFailedException') return false;
    throw e;
  }
}

/* ------------------------------------------------------- push subscriptions */

export async function putPushSubscription(s: PushSubscriptionRecord): Promise<void> {
  await ddb.send(new PutCommand({ TableName: T.push, Item: s }));
}

export async function listPushSubscriptions(userId: string): Promise<PushSubscriptionRecord[]> {
  const r = await ddb.send(new QueryCommand({
    TableName: T.push,
    KeyConditionExpression: 'userId = :u',
    ExpressionAttributeValues: { ':u': userId },
  }));
  return (r.Items as PushSubscriptionRecord[]) ?? [];
}

export async function deletePushSubscription(userId: string, endpointId: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: T.push, Key: { userId, endpointId } }));
}

/* -------------------------------------------------------------- rate limits */

/** Fixed-window counter. Returns the count after incrementing. */
export async function bumpRateLimit(key: string, windowSeconds: number): Promise<number> {
  const window = Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds;
  const r = await ddb.send(new UpdateCommand({
    TableName: T.rateLimit,
    Key: { rlKey: `${key}#${window}` },
    UpdateExpression: 'ADD #c :one SET #ttl = :ttl',
    ExpressionAttributeNames: { '#c': 'count', '#ttl': 'ttl' },
    ExpressionAttributeValues: { ':one': 1, ':ttl': window + windowSeconds * 2 },
    ReturnValues: 'UPDATED_NEW',
  }));
  return Number(r.Attributes?.count ?? 1);
}

/* ------------------------------------------------------- login channel hint */

export interface LoginChannel {
  channel: 'SMS' | 'EMAIL';
  /** Destination resolved from the roster — never from the request body. */
  to: string;
  name: string;
}

/**
 * Records how the next sign-in code for `username` should be delivered.
 * Short-lived: it only has to survive the round trip into Cognito's
 * CreateAuthChallenge trigger.
 */
export async function putLoginChannel(username: string, hint: LoginChannel): Promise<void> {
  await ddb.send(new PutCommand({
    TableName: T.loginChannels,
    Item: { username, ...hint, createdAt: nowIso(), ttl: Math.floor(Date.now() / 1000) + 900 },
  }));
}

export async function getLoginChannel(username: string): Promise<LoginChannel | null> {
  const r = await ddb.send(new GetCommand({ TableName: T.loginChannels, Key: { username } }));
  if (!r.Item) return null;
  return { channel: r.Item.channel, to: r.Item.to, name: r.Item.name } as LoginChannel;
}
