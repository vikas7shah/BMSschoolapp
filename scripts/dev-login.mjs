#!/usr/bin/env node
/**
 * The Test Admin sign-in code. Prints it; `--set <code>` changes it.
 * Exists only while `devLogin` is true in infra/cdk.json.
 */
import {
  SecretsManagerClient, GetSecretValueCommand, PutSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { REGION, STACK } from './lib/stack.mjs';

const stage = STACK.replace(/^Bms-/, '');
const SecretId = `bms-${stage}-dev-login`;
const sm = new SecretsManagerClient({ region: REGION });

const i = process.argv.indexOf('--set');
try {
  if (i > -1) {
    const code = String(process.argv[i + 1] ?? '').trim();
    if (code.length < 6) throw new Error('Use at least 6 characters.');
    await sm.send(new PutSecretValueCommand({ SecretId, SecretString: code }));
    console.log(`Test code set to ${code}`);
  } else {
    const r = await sm.send(new GetSecretValueCommand({ SecretId }));
    console.log(`Test code: ${r.SecretString}`);
  }
} catch (err) {
  if (err?.name === 'ResourceNotFoundException') {
    console.log('The test sign-in is not deployed (devLogin is false in infra/cdk.json).');
  } else throw err;
}
