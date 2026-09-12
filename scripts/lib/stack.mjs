/** Shared helpers for the setup scripts: locate the stack and read its config. */
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { LambdaClient, GetFunctionConfigurationCommand } from '@aws-sdk/client-lambda';

export const REGION = process.env.AWS_REGION || 'us-east-1';
export const STACK = process.env.BMS_STACK || 'Bms-prod';

export async function stackOutputs() {
  const cfn = new CloudFormationClient({ region: REGION });
  const r = await cfn.send(new DescribeStacksCommand({ StackName: STACK }));
  const stack = r.Stacks?.[0];
  if (!stack) throw new Error(`Stack ${STACK} not found in ${REGION}`);
  return Object.fromEntries((stack.Outputs ?? []).map((o) => [o.OutputKey, o.OutputValue]));
}

/**
 * The API Lambda's environment already holds every table name and the user
 * pool id, so we read configuration from there rather than duplicating outputs.
 */
export async function backendConfig() {
  const outputs = await stackOutputs();
  const lambda = new LambdaClient({ region: REGION });
  const cfg = await lambda.send(new GetFunctionConfigurationCommand({
    FunctionName: outputs.ApiFunctionName,
  }));
  return { outputs, env: cfg.Environment?.Variables ?? {} };
}

export function normalizePhone(input) {
  const trimmed = String(input).trim();
  const hadPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;
  if (hadPlus) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
}

export function ulidish() {
  // Monotonic-enough unique id for one-off setup records.
  const t = Date.now().toString(36).toUpperCase().padStart(10, '0');
  const r = Array.from({ length: 16 }, () =>
    '0123456789ABCDEFGHJKMNPQRSTVWXYZ'[Math.floor(Math.random() * 32)]).join('');
  return t + r;
}
