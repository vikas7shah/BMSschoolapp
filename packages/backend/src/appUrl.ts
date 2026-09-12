import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { env } from './env.js';

const ssm = new SSMClient({});
let cached: { value: string; at: number } | null = null;
const TTL_MS = 10 * 60_000;

/**
 * The public URL of the app. Read from SSM rather than an environment variable
 * because the CloudFront domain isn't known until after the functions that
 * need it have been created.
 */
export async function getAppUrl(): Promise<string> {
  if (env.appUrl) return env.appUrl; // explicit override (custom domain, local dev)
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  if (!env.appUrlParam) return '';

  try {
    const r = await ssm.send(new GetParameterCommand({ Name: env.appUrlParam }));
    const value = r.Parameter?.Value ?? '';
    cached = { value, at: Date.now() };
    return value;
  } catch (err) {
    console.error('Could not read app URL parameter', err);
    return '';
  }
}
