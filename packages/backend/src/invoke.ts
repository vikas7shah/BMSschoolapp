import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { env } from './env.js';

const lambda = new LambdaClient({});

export interface RemindersInvoke {
  force?: boolean;
  dryRun?: boolean;
  onlyUserIds?: string[];
  skipDedupe?: boolean;
}

/** Runs the reminder job now, from the API, and returns its summary. */
export async function invokeReminders(event: RemindersInvoke): Promise<{ sent: number; skipped: number }> {
  if (!env.remindersFunction) throw new Error('REMINDERS_FUNCTION is not configured');
  const r = await lambda.send(new InvokeCommand({
    FunctionName: env.remindersFunction,
    Payload: Buffer.from(JSON.stringify(event)),
  }));
  if (r.FunctionError) throw new Error(`Reminder job failed: ${Buffer.from(r.Payload ?? []).toString()}`);
  const out = JSON.parse(Buffer.from(r.Payload ?? []).toString() || '{}');
  return { sent: Number(out.sent ?? 0), skipped: Number(out.skipped ?? 0) };
}
