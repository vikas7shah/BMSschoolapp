#!/usr/bin/env node
/**
 * Publishes a month's newsletter from docs/newsletters/<month>.json through
 * the admin API — the same endpoint the Admin → Newsletter form uses.
 *
 *   node scripts/newsletter.mjs 2026-09
 */
import { readFileSync } from 'node:fs';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { REGION, STACK, stackOutputs } from './lib/stack.mjs';

const month = process.argv[2];
if (!/^\d{4}-\d{2}$/.test(month ?? '')) { console.error('Usage: node scripts/newsletter.mjs 2026-09'); process.exit(1); }
const body = JSON.parse(readFileSync(new URL(`../docs/newsletters/${month}.json`, import.meta.url), 'utf8'));

const { AppUrl: base } = await stackOutputs();
const sm = new SecretsManagerClient({ region: REGION });
const { SecretString: code } = await sm.send(new GetSecretValueCommand({ SecretId: `bms-${STACK.replace(/^Bms-/, '')}-dev-login` }));

const login = await fetch(`${base}/api/auth/test`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) });
if (!login.ok) throw new Error(`Admin sign-in failed: ${login.status}`);
const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0];

const r = await fetch(`${base}/api/admin/newsletters/${month}`, {
  method: 'PUT', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body),
});
const json = await r.json();
if (!r.ok) { console.error(json); process.exit(1); }
console.log(`Published ${month}: ${json.newsletter.sections.length} sections, ${json.newsletter.curriculum.length} curriculum groups.`);
