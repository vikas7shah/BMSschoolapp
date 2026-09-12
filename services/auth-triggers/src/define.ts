import type { DefineAuthChallengeTriggerHandler } from 'aws-lambda';

const MAX_ATTEMPTS = 3;

/** Drives the SMS-code flow: one challenge, up to three tries, then fail. */
export const handler: DefineAuthChallengeTriggerHandler = async (event) => {
  const answered = event.request.session ?? [];

  // A user that doesn't exist is signalled by Cognito with a synthetic session;
  // fail closed rather than leaking which numbers are registered.
  if (event.request.userNotFound) {
    event.response.issueTokens = false;
    event.response.failAuthentication = true;
    return event;
  }

  const last = answered[answered.length - 1];

  if (last && last.challengeName === 'CUSTOM_CHALLENGE' && last.challengeResult) {
    event.response.issueTokens = true;
    event.response.failAuthentication = false;
    return event;
  }

  if (answered.length >= MAX_ATTEMPTS) {
    event.response.issueTokens = false;
    event.response.failAuthentication = true;
    return event;
  }

  event.response.issueTokens = false;
  event.response.failAuthentication = false;
  event.response.challengeName = 'CUSTOM_CHALLENGE';
  return event;
};
