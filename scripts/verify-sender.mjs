#!/usr/bin/env node
/**
 * Checks — and if needed starts — SES verification for the From address in
 * infra/cdk.json. Kept out of the CDK stack on purpose: an SES identity is
 * account-scoped and often already in use, so it should outlive any one stack.
 */
import { readFileSync } from 'node:fs';
import {
  SESv2Client, GetEmailIdentityCommand, CreateEmailIdentityCommand, GetAccountCommand,
} from '@aws-sdk/client-sesv2';

/**
 * Mail sent "from" a gmail.com address through SES fails Gmail's own
 * authentication checks and lands in spam — SES cannot sign for a domain it
 * does not control. The fix is a domain the school owns, verified here.
 */
const SCHOOL_DOMAIN = 'burlingtonmontessori.org';
import { REGION } from './lib/stack.mjs';

const context = JSON.parse(
  readFileSync(new URL('../infra/cdk.json', import.meta.url), 'utf8'),
).context;

const arg = (n) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
};
const address = arg('email') ?? context.fromEmail;

if (!address) {
  console.error('No From address. Set "fromEmail" in infra/cdk.json, or pass --email.');
  process.exit(1);
}

const ses = new SESv2Client({ region: REGION });

const account = await ses.send(new GetAccountCommand({}));
console.log(account.ProductionAccessEnabled
  ? '✓ SES has production access — mail can go to anyone.'
  : '⚠ SES is in sandbox — mail only reaches verified addresses.');

// --- the school's domain: the real fix for spam ----------------------------
try {
  const dom = await ses.send(new GetEmailIdentityCommand({ EmailIdentity: SCHOOL_DOMAIN }));
  const dkim = dom.DkimAttributes?.Status;
  if (dom.VerifiedForSendingStatus && dkim === 'SUCCESS') {
    console.log(`✓ ${SCHOOL_DOMAIN} is verified with DKIM — mail from it will authenticate.`);
    if (!address.endsWith(`@${SCHOOL_DOMAIN}`)) {
      console.log(`  → set "fromEmail" in infra/cdk.json to an address @${SCHOOL_DOMAIN} and redeploy.`);
    }
  } else {
    console.log(`⏳ ${SCHOOL_DOMAIN}: DKIM ${dkim ?? 'unknown'}. Add these CNAME records at the domain's DNS:`);
    for (const t of dom.DkimAttributes?.Tokens ?? []) {
      console.log(`     ${t}._domainkey.${SCHOOL_DOMAIN}  CNAME  ${t}.dkim.amazonses.com`);
    }
    console.log('   Verification usually completes within an hour of the records appearing.');
  }
} catch (err) {
  if (err.name !== 'NotFoundException') throw err;
  console.log(`  ${SCHOOL_DOMAIN} is not set up in SES yet.`);
}
console.log();

// --- the address currently in use -----------------------------------------
// A domain identity covers every address at that domain (and its subdomains
// cover themselves), so check the domain first; an address identity is only
// the fallback for a mailbox at a domain we do not control.
const domain = address.split('@')[1];
const domainReport = async (name) => {
  const dom = await ses.send(new GetEmailIdentityCommand({ EmailIdentity: name }));
  const dkim = dom.DkimAttributes?.Status;
  if (dom.VerifiedForSendingStatus && dkim === 'SUCCESS') {
    console.log(`✓ ${name} is verified with DKIM — ${address} will authenticate.`);
    return true;
  }
  console.log(`⏳ ${name}: DKIM ${dkim ?? 'unknown'}. Add these CNAME records at the domain's DNS:`);
  for (const t of dom.DkimAttributes?.Tokens ?? []) {
    console.log(`     ${t}._domainkey.${name}  CNAME  ${t}.dkim.amazonses.com`);
  }
  console.log('   Verification usually completes within an hour of the records appearing.');
  return false;
};

let covered = false;
if (domain && domain !== SCHOOL_DOMAIN) {
  try {
    await domainReport(domain);
    covered = true;
  } catch (err) {
    if (err.name !== 'NotFoundException') throw err;
  }
}

if (!covered) {
  try {
    const identity = await ses.send(new GetEmailIdentityCommand({ EmailIdentity: address }));
    if (identity.VerifiedForSendingStatus) {
      console.log(`✓ ${address} is verified and can send.`);
      if (/@(gmail|yahoo|hotmail|outlook|icloud)\./i.test(address)) {
        console.log('  ⚠ but it is a consumer mailbox address: SES cannot DKIM-sign for that');
        console.log('    domain, so Gmail treats the mail as spoofed and files it as spam.');
      }
    } else {
      console.log(`⏳ ${address} is registered but not verified yet.`);
      console.log('   Check that inbox for the AWS confirmation link.');
    }
  } catch (err) {
    if (err.name !== 'NotFoundException') throw err;
    await ses.send(new CreateEmailIdentityCommand({ EmailIdentity: address }));
    console.log(`→ Verification email sent to ${address}. Click the link, then re-run this.`);
  }
}
