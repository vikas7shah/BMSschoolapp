import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const base = new DynamoDBClient({});

export const ddb = DynamoDBDocumentClient.from(base, {
  marshallOptions: { removeUndefinedValues: true, convertClassInstanceToMap: true },
});

/** Seconds-since-epoch TTL value `n` days from now. */
export function ttlDays(days: number): number {
  return Math.floor(Date.now() / 1000) + days * 86_400;
}

export function nowIso(): string {
  return new Date().toISOString();
}
