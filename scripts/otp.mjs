#!/usr/bin/env node
/**
 * Reads the most recent sign-in code from CloudWatch. Needed only while SNS is
 * in its SMS sandbox and real texts are not yet going out. Requires AWS
 * credentials, so it is no weaker than the console itself.
 */
import {
  CloudWatchLogsClient, FilterLogEventsCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import { REGION, stackOutputs } from './lib/stack.mjs';

const outputs = await stackOutputs();
const logGroupName = outputs.CreateAuthChallengeLogGroup;
const logs = new CloudWatchLogsClient({ region: REGION });

const r = await logs.send(new FilterLogEventsCommand({
  logGroupName,
  filterPattern: '"Sign-in code issued for"',
  startTime: Date.now() - 15 * 60_000,
  limit: 20,
}));

const events = (r.events ?? []).sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
if (!events.length) {
  console.log('No sign-in code in the last 15 minutes. Request one in the app first.');
  process.exit(0);
}

for (const e of events.slice(0, 5)) {
  const match = /Sign-in code issued for (\S+)(?: via \w+)?: (\d{6})/.exec(e.message ?? '');
  if (match) {
    const age = Math.round((Date.now() - (e.timestamp ?? 0)) / 1000);
    console.log(`${match[2]}   ${match[1]}   (${age}s ago)`);
  }
}
