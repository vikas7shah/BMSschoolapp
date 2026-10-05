import {
  DeleteCommand, GetCommand, PutCommand, QueryCommand, TransactWriteCommand, UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type {
  SignupBooking, SignupChildBooking, SignupEvent, SignupSlot,
} from '@bms/shared';
import { ddb } from './ddb.js';
import { env } from './env.js';

const T = () => env.tables.signups;

export const eventSk = (eventId: string) => `EVENT#${eventId}`;
export const signupSlotSk = (eventId: string, classroomId: string, date: string, start: string) =>
  `SLOT#${eventId}#${classroomId}#${date}#${start}`;
export const childBookingSk = (eventId: string, childId: string) => `BOOK#${eventId}#${childId}`;

export async function listSignupEvents(schoolId: string): Promise<SignupEvent[]> {
  const r = await ddb.send(new QueryCommand({
    TableName: T(),
    KeyConditionExpression: 'schoolId = :s AND begins_with(sk, :p)',
    ExpressionAttributeValues: { ':s': schoolId, ':p': 'EVENT#' },
  }));
  return (r.Items as SignupEvent[]) ?? [];
}

export async function getSignupEvent(schoolId: string, eventId: string): Promise<SignupEvent | null> {
  const r = await ddb.send(new GetCommand({ TableName: T(), Key: { schoolId, sk: eventSk(eventId) } }));
  return (r.Item as SignupEvent) ?? null;
}

export async function putSignupEvent(e: SignupEvent): Promise<void> {
  await ddb.send(new PutCommand({ TableName: T(), Item: e }));
}

async function queryPrefix<X>(schoolId: string, prefix: string): Promise<X[]> {
  const out: X[] = [];
  let start: Record<string, unknown> | undefined;
  do {
    const r = await ddb.send(new QueryCommand({
      TableName: T(),
      KeyConditionExpression: 'schoolId = :s AND begins_with(sk, :p)',
      ExpressionAttributeValues: { ':s': schoolId, ':p': prefix },
      ExclusiveStartKey: start,
    }));
    out.push(...((r.Items as X[]) ?? []));
    start = r.LastEvaluatedKey;
  } while (start);
  return out;
}

/** Every time in a sign-up, in date and time order. */
export async function listSignupSlots(schoolId: string, eventId: string): Promise<SignupSlot[]> {
  return queryPrefix<SignupSlot>(schoolId, `SLOT#${eventId}#`);
}

export async function listChildBookings(schoolId: string, eventId: string): Promise<SignupChildBooking[]> {
  return queryPrefix<SignupChildBooking>(schoolId, `BOOK#${eventId}#`);
}

export async function getSignupSlot(schoolId: string, sk: string): Promise<SignupSlot | null> {
  const r = await ddb.send(new GetCommand({ TableName: T(), Key: { schoolId, sk } }));
  return (r.Item as SignupSlot) ?? null;
}

/** Adds a time unless it already exists. Returns false when it did. */
export async function addSignupSlot(slot: SignupSlot): Promise<boolean> {
  try {
    await ddb.send(new PutCommand({ TableName: T(), Item: slot, ConditionExpression: 'attribute_not_exists(sk)' }));
    return true;
  } catch (err) {
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') return false;
    throw err;
  }
}

/** Removes a time nobody has booked. Returns false when someone has. */
export async function deleteEmptySignupSlot(schoolId: string, sk: string): Promise<boolean> {
  try {
    await ddb.send(new DeleteCommand({
      TableName: T(), Key: { schoolId, sk }, ConditionExpression: 'booked = :zero',
      ExpressionAttributeValues: { ':zero': 0 },
    }));
    return true;
  } catch (err) {
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') return false;
    throw err;
  }
}

export async function setSlotCapacity(schoolId: string, sk: string, capacity: number): Promise<void> {
  await ddb.send(new UpdateCommand({
    TableName: T(), Key: { schoolId, sk },
    UpdateExpression: 'SET #cap = :c', ConditionExpression: 'attribute_exists(sk)',
    ExpressionAttributeNames: { '#cap': 'capacity' },
    ExpressionAttributeValues: { ':c': capacity },
  }));
}

export async function deleteSignupItems(schoolId: string, eventId: string): Promise<void> {
  const items = [
    ...await queryPrefix<{ sk: string }>(schoolId, `SLOT#${eventId}#`),
    ...await queryPrefix<{ sk: string }>(schoolId, `BOOK#${eventId}#`),
    { sk: eventSk(eventId) },
  ];
  for (const i of items) await ddb.send(new DeleteCommand({ TableName: T(), Key: { schoolId, sk: i.sk } }));
}

export type BookResult = 'OK' | 'FULL' | 'SAME' | 'CHANGED';

/**
 * Books a child into a time, or moves them there from the time they hold —
 * one transaction, so a seat is never double-sold and a child never holds
 * two times. `ignoreCapacity` lets the office seat a family in a full time.
 */
export async function bookSignupSlot(args: {
  schoolId: string; eventId: string; slotSk: string; booking: SignupBooking; ignoreCapacity?: boolean;
}): Promise<BookResult> {
  const { schoolId, eventId, slotSk: target, booking } = args;
  const key = childBookingSk(eventId, booking.childId);
  const held = (await ddb.send(new GetCommand({ TableName: T(), Key: { schoolId, sk: key } }))).Item as SignupChildBooking | undefined;
  if (held?.slotSk === target) return 'SAME';

  const names = { '#b': 'bookings', '#c': booking.childId };
  const add = {
    Update: {
      TableName: T(), Key: { schoolId, sk: target },
      UpdateExpression: 'SET #b.#c = :booking ADD booked :one',
      ConditionExpression: args.ignoreCapacity
        ? 'attribute_exists(sk) AND attribute_not_exists(#b.#c)'
        : 'attribute_exists(sk) AND attribute_not_exists(#b.#c) AND booked < #cap',
      // "capacity" is a DynamoDB reserved word, so it goes by a name.
      ExpressionAttributeNames: args.ignoreCapacity ? names : { ...names, '#cap': 'capacity' },
      ExpressionAttributeValues: { ':booking': booking, ':one': 1 },
    },
  };
  const record: SignupChildBooking = { schoolId, sk: key, eventId, childId: booking.childId, slotSk: target };
  const items = held
    ? [
      add,
      {
        Update: {
          TableName: T(), Key: { schoolId, sk: held.slotSk },
          UpdateExpression: 'REMOVE #b.#c ADD booked :minus',
          ConditionExpression: 'attribute_exists(#b.#c)',
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: { ':minus': -1 },
        },
      },
      {
        Put: {
          TableName: T(), Item: record,
          ConditionExpression: 'slotSk = :old', ExpressionAttributeValues: { ':old': held.slotSk },
        },
      },
    ]
    : [add, { Put: { TableName: T(), Item: record, ConditionExpression: 'attribute_not_exists(sk)' } }];

  try {
    await ddb.send(new TransactWriteCommand({ TransactItems: items }));
    return 'OK';
  } catch (err) {
    const reasons = (err as { CancellationReasons?: { Code?: string }[] }).CancellationReasons ?? [];
    if (reasons[0]?.Code === 'ConditionalCheckFailed') return 'FULL';
    if (reasons.some((r) => r.Code === 'ConditionalCheckFailed')) return 'CHANGED';
    throw err;
  }
}

/** Frees a child's time. The office only; families switch instead. */
export async function cancelSignupBooking(schoolId: string, eventId: string, childId: string): Promise<boolean> {
  const key = childBookingSk(eventId, childId);
  const held = (await ddb.send(new GetCommand({ TableName: T(), Key: { schoolId, sk: key } }))).Item as SignupChildBooking | undefined;
  if (!held) return false;
  await ddb.send(new TransactWriteCommand({
    TransactItems: [
      {
        Update: {
          TableName: T(), Key: { schoolId, sk: held.slotSk },
          UpdateExpression: 'REMOVE #b.#c ADD booked :minus',
          ConditionExpression: 'attribute_exists(#b.#c)',
          ExpressionAttributeNames: { '#b': 'bookings', '#c': childId },
          ExpressionAttributeValues: { ':minus': -1 },
        },
      },
      { Delete: { TableName: T(), Key: { schoolId, sk: key } } },
    ],
  }));
  return true;
}
