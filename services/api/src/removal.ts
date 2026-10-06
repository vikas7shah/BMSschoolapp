import {
  childIdsForGuardian, deleteChild, deleteUser, getChild, getSchool, getUser, guardianIdsForChild,
  listSlotsBySchool, releaseSlot, unlinkGuardian,
} from '@bms/backend';
import { addDays, todayIn } from '@bms/shared';
import { deleteCognitoUser } from './cognito.js';

export interface Removed { parentsRemoved: number; childrenRemoved: number; daysReopened: number }

/** Any upcoming day claimed by this user or for this child goes back to open. */
async function reopenDays(schoolId: string, match: (s: { claimedByUserId?: string; claimedForChildId?: string }) => boolean): Promise<number> {
  const school = await getSchool(schoolId);
  const today = todayIn(school?.timezone ?? 'America/New_York');
  const held = (await listSlotsBySchool(schoolId, today, addDays(today, 400)))
    .filter((s) => s.status === 'CLAIMED' && match(s));
  for (const s of held) {
    await releaseSlot({ classroomId: s.classroomId, date: s.date, userId: 'admin', isAdmin: true });
  }
  return held.length;
}

/**
 * A parent leaves with everything that hangs off the account: the sign-in,
 * the links to children, any child nobody else is a guardian of, and any
 * upcoming day they held — which reopens so another family can take it.
 */
export async function removeParent(schoolId: string, userId: string): Promise<Removed | 'NOT_FOUND'> {
  const target = await getUser(userId);
  if (!target || target.schoolId !== schoolId) return 'NOT_FOUND';

  let childrenRemoved = 0;
  for (const childId of await childIdsForGuardian(userId)) {
    await unlinkGuardian(userId, childId);
    const others = (await guardianIdsForChild(childId)).filter((id) => id !== userId);
    if (!others.length) {
      await deleteChild(childId);
      childrenRemoved += 1;
    }
  }
  const daysReopened = await reopenDays(schoolId, (s) => s.claimedByUserId === userId);

  await deleteCognitoUser(target.cognitoUsername ?? target.phone ?? '');
  await deleteUser(userId);
  return { parentsRemoved: 1, childrenRemoved, daysReopened };
}

/**
 * A child leaves with their upcoming days reopened and, for each parent, the
 * link removed — and the parent themselves only when this was their last
 * child, so a sibling never loses their family.
 */
export async function removeChild(schoolId: string, childId: string): Promise<Removed | 'NOT_FOUND'> {
  const child = await getChild(childId);
  if (!child || child.schoolId !== schoolId) return 'NOT_FOUND';

  const out: Removed = { parentsRemoved: 0, childrenRemoved: 1, daysReopened: 0 };
  out.daysReopened += await reopenDays(schoolId, (s) => s.claimedForChildId === childId);

  for (const userId of await guardianIdsForChild(childId)) {
    await unlinkGuardian(userId, childId);
    const remaining = await childIdsForGuardian(userId);
    if (!remaining.length) {
      const r = await removeParent(schoolId, userId);
      if (r !== 'NOT_FOUND') {
        out.parentsRemoved += 1;
        out.daysReopened += r.daysReopened;
      }
    }
  }
  await deleteChild(childId);
  return out;
}
