import { timingSafeEqual } from 'node:crypto';
import type { VerifyAuthChallengeResponseTriggerHandler } from 'aws-lambda';

export const handler: VerifyAuthChallengeResponseTriggerHandler = async (event) => {
  const expected = event.request.privateChallengeParameters?.secretCode ?? '';
  const given = event.request.challengeAnswer ?? '';

  event.response.answerCorrect = constantTimeEquals(expected, given);
  return event;
};

function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length === 0 || ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
