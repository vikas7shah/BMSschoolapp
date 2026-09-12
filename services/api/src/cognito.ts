import {
  AdminCreateUserCommand, AdminDeleteUserCommand, AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand, CognitoIdentityProviderClient, InitiateAuthCommand,
  RespondToAuthChallengeCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { randomBytes } from 'node:crypto';
import { env } from '@bms/backend';

// The app client has no secret: it is reachable only from our own Lambda, and
// adding one would mean storing and rotating a value nothing else can see.
const cognito = new CognitoIdentityProviderClient({});

/**
 * Creates the Cognito user for an invited parent. We suppress Cognito's own
 * invite message and immediately set a permanent random password, because the
 * parent will only ever sign in with an SMS code — a user left in
 * FORCE_CHANGE_PASSWORD cannot start the custom auth flow.
 */
export async function createCognitoUser(
  username: string, userId: string, phone?: string,
): Promise<void> {
  await cognito.send(new AdminCreateUserCommand({
    UserPoolId: env.cognito.userPoolId,
    Username: username,
    MessageAction: 'SUPPRESS',
    UserAttributes: [
      // A phone number is optional now; families are on the roster with only an
      // email address, and the code is delivered by email regardless.
      ...(phone
        ? [
            { Name: 'phone_number', Value: phone },
            { Name: 'phone_number_verified', Value: 'true' },
          ]
        : []),
      { Name: 'custom:userId', Value: userId },
    ],
  }));
  await cognito.send(new AdminSetUserPasswordCommand({
    UserPoolId: env.cognito.userPoolId,
    Username: username,
    Password: `${randomBytes(24).toString('base64url')}aA1!`,
    Permanent: true,
  }));
}

export async function deleteCognitoUser(username: string): Promise<void> {
  try {
    await cognito.send(new AdminDeleteUserCommand({
      UserPoolId: env.cognito.userPoolId, Username: username,
    }));
  } catch (err) {
    if ((err as { name?: string }).name !== 'UserNotFoundException') throw err;
  }
}

export async function setCognitoUserId(phone: string, userId: string): Promise<void> {
  await cognito.send(new AdminUpdateUserAttributesCommand({
    UserPoolId: env.cognito.userPoolId,
    Username: phone,
    UserAttributes: [{ Name: 'custom:userId', Value: userId }],
  }));
}

/** Where the one-time code should be sent for this attempt. */
export interface CodeDestination {
  channel: 'SMS' | 'EMAIL';
  /** E.164 number or email address, resolved by us — never supplied by the client. */
  to: string;
  name: string;
}

/**
 * Starts the custom auth flow. The destination travels as ClientMetadata,
 * which Cognito passes straight to the CreateAuthChallenge trigger; it never
 * leaves the server, so a caller cannot redirect someone else's code.
 */
export async function startCustomAuth(
  phone: string, destination: CodeDestination,
): Promise<string | null> {
  try {
    const r = await cognito.send(new InitiateAuthCommand({
      AuthFlow: 'CUSTOM_AUTH',
      ClientId: env.cognito.clientId,
      AuthParameters: { USERNAME: phone },
      ClientMetadata: {
        channel: destination.channel,
        to: destination.to,
        name: destination.name,
      },
    }));
    return r.Session ?? null;
  } catch (err) {
    const name = (err as { name?: string }).name;
    // Never distinguish "no such parent" from other failures to the caller.
    if (name === 'UserNotFoundException' || name === 'NotAuthorizedException') return null;
    throw err;
  }
}

export type VerifyOutcome =
  | { ok: true }
  | { ok: false; reason: 'WRONG_CODE'; session?: string }
  | { ok: false; reason: 'EXPIRED' };

export async function answerCustomAuth(
  phone: string, code: string, session: string,
): Promise<VerifyOutcome> {
  try {
    const r = await cognito.send(new RespondToAuthChallengeCommand({
      ClientId: env.cognito.clientId,
      ChallengeName: 'CUSTOM_CHALLENGE',
      Session: session,
      ChallengeResponses: { USERNAME: phone, ANSWER: code },
    }));
    if (r.AuthenticationResult) return { ok: true };
    // Cognito hands back a fresh session for each remaining attempt.
    return { ok: false, reason: 'WRONG_CODE', session: r.Session };
  } catch (err) {
    const name = (err as { name?: string }).name;
    if (name === 'NotAuthorizedException') return { ok: false, reason: 'EXPIRED' };
    if (name === 'UserNotFoundException') return { ok: false, reason: 'EXPIRED' };
    throw err;
  }
}
