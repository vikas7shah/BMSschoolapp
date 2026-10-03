/**
 * Parent–teacher conferences are built but switched off for now: the school
 * starts with parent observations. Flip to true to bring conferences back —
 * the API, the sheet and the editor already handle them.
 */
export const CONFERENCES_ENABLED = false;

/** Sign-ups the app shows while conferences are off. */
export const shownSignup = (s: { kind: 'CONFERENCE' | 'OBSERVATION' }) =>
  CONFERENCES_ENABLED || s.kind !== 'CONFERENCE';
