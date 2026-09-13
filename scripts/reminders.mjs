#!/usr/bin/env node
/**
 * Runs the reminder sweep on demand — `--dry-run` prints without sending;
 * `--only <userId>` sends to that one parent (a test send).
 */
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { REGION, stackOutputs } from './lib/stack.mjs';

const dryRun = process.argv.includes('--dry-run');
const onlyIdx = process.argv.indexOf('--only');
const onlyUserIds = onlyIdx > -1 ? [process.argv[onlyIdx + 1]] : undefined;
const outputs = await stackOutputs();
const lambda = new LambdaClient({ region: REGION });

const r = await lambda.send(new InvokeCommand({
  FunctionName: outputs.RemindersFunctionName,
  Payload: Buffer.from(JSON.stringify({ force: true, dryRun, onlyUserIds })),
  LogType: 'Tail',
}));

console.log(Buffer.from(r.Payload ?? []).toString());
if (dryRun && r.LogResult) {
  console.log('\n--- log ---\n' + Buffer.from(r.LogResult, 'base64').toString());
}
