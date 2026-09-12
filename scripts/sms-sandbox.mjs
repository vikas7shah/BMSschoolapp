#!/usr/bin/env node
/**
 * While an AWS account is in the SNS SMS sandbox, texts only reach numbers you
 * have verified. This adds one and, on a second run with --code, confirms it.
 *
 *   node scripts/sms-sandbox.mjs --phone "+14155550123"
 *   node scripts/sms-sandbox.mjs --phone "+14155550123" --code 123456
 *   node scripts/sms-sandbox.mjs --list
 */
import {
  SNSClient, CreateSMSSandboxPhoneNumberCommand, VerifySMSSandboxPhoneNumberCommand,
  ListSMSSandboxPhoneNumbersCommand, GetSMSSandboxAccountStatusCommand,
} from '@aws-sdk/client-sns';
import { REGION, normalizePhone } from './lib/stack.mjs';

const arg = (n) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
};

const sns = new SNSClient({ region: REGION });

const status = await sns.send(new GetSMSSandboxAccountStatusCommand({}));
console.log(status.IsInSandbox
  ? '⚠ This account is in the SNS SMS sandbox — only verified numbers receive texts.'
  : '✓ This account has production SMS access.');

if (process.argv.includes('--list')) {
  const r = await sns.send(new ListSMSSandboxPhoneNumbersCommand({}));
  for (const p of r.PhoneNumbers ?? []) console.log(`${p.PhoneNumber}  ${p.Status}`);
  process.exit(0);
}

const phone = normalizePhone(arg('phone') ?? '');
if (!phone) {
  console.error('Usage: node scripts/sms-sandbox.mjs --phone "+14155550123" [--code 123456]');
  process.exit(1);
}

const code = arg('code');
if (code) {
  await sns.send(new VerifySMSSandboxPhoneNumberCommand({
    PhoneNumber: phone, OneTimePassword: code,
  }));
  console.log(`✓ ${phone} is verified and can now receive texts.`);
} else {
  await sns.send(new CreateSMSSandboxPhoneNumberCommand({
    PhoneNumber: phone, LanguageCode: 'en-US',
  }));
  console.log(`A verification code has been texted to ${phone}.`);
  console.log(`Run: node scripts/sms-sandbox.mjs --phone "${phone}" --code <code>`);
}
