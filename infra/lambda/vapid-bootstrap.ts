import { GetSecretValueCommand, PutSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import webpush from 'web-push';

const client = new SecretsManagerClient({});

/**
 * Generates the VAPID key pair for web push on first deploy and stores it in
 * Secrets Manager. Doing it here (rather than in the template) keeps the
 * private key out of CloudFormation, and keeping it to first-deploy-only means
 * existing browser subscriptions survive later deploys.
 */
export const handler = async (event: { RequestType: string; ResourceProperties: { SecretArn: string } }) => {
  const { SecretArn } = event.ResourceProperties;
  const physicalId = `vapid-${SecretArn.split(':').pop()}`;

  if (event.RequestType === 'Delete') return { PhysicalResourceId: physicalId };

  const current = await client.send(new GetSecretValueCommand({ SecretId: SecretArn }));
  let needsKeys = true;
  try {
    const parsed = JSON.parse(current.SecretString ?? '{}');
    needsKeys = !parsed.publicKey || !parsed.privateKey;
  } catch {
    needsKeys = true;
  }

  if (needsKeys) {
    const keys = webpush.generateVAPIDKeys();
    await client.send(new PutSecretValueCommand({
      SecretId: SecretArn,
      SecretString: JSON.stringify({ publicKey: keys.publicKey, privateKey: keys.privateKey }),
    }));
    console.log('Generated new VAPID key pair');
  }

  return { PhysicalResourceId: physicalId };
};
