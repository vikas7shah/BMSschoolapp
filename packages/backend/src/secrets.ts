import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({});
const cache = new Map<string, { value: string; at: number }>();
const TTL_MS = 5 * 60_000; // survives warm invocations, still picks up rotation

export async function getSecret(arn: string): Promise<string> {
  const hit = cache.get(arn);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const r = await client.send(new GetSecretValueCommand({ SecretId: arn }));
  const value = r.SecretString;
  if (!value) throw new Error(`Secret ${arn} has no string value`);
  cache.set(arn, { value, at: Date.now() });
  return value;
}

export async function getSecretJson<T>(arn: string): Promise<T> {
  return JSON.parse(await getSecret(arn)) as T;
}
