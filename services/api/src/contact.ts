import { normalizePhone, type User } from '@bms/shared';
import { getUserByEmail, getUserByPhone, updateUser } from '@bms/backend';
import { setCognitoPhone } from './cognito.js';

export interface ContactChange {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
}

/**
 * Changes someone's name, mobile number or email — the office editing a
 * family on the roster, or an admin their own. A blank number or email
 * removes it, but one has to stay so they can still sign in, and neither can
 * be someone else's. A new number is copied to Cognito so sign-in finds it.
 */
export async function changeContact(
  current: User, change: ContactChange, extra: Partial<Pick<User, 'status' | 'role'>> = {},
): Promise<{ user: User } | { error: string; status: 400 | 404 | 409 }> {
  const remove: ('email' | 'phone')[] = [];

  let firstName: string | undefined;
  let lastName: string | undefined;
  if (change.firstName !== undefined) {
    firstName = change.firstName.trim();
    if (!firstName || firstName.length > 60) return { error: 'Enter a first name', status: 400 };
  }
  if (change.lastName !== undefined) {
    lastName = change.lastName.trim();
    if (lastName.length > 60) return { error: 'That last name is too long', status: 400 };
  }

  let email: string | undefined;
  if (change.email !== undefined) {
    const trimmed = change.email.trim().toLowerCase();
    if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
      return { error: 'That is not a valid email address', status: 400 };
    }
    if (trimmed) {
      const owner = await getUserByEmail(trimmed);
      if (owner && owner.userId !== current.userId) return { error: 'Someone else already uses that email address', status: 409 };
      email = trimmed;
    } else if (current.email) {
      remove.push('email');
    }
  }

  let phone: string | undefined;
  if (change.phone !== undefined) {
    if (change.phone.trim()) {
      const normalized = normalizePhone(change.phone);
      if (!normalized) return { error: 'That is not a valid phone number', status: 400 };
      const owner = await getUserByPhone(normalized);
      if (owner && owner.userId !== current.userId) return { error: 'Someone else already uses that phone number', status: 409 };
      if (normalized !== current.phone) phone = normalized;
    } else if (current.phone) {
      remove.push('phone');
    }
  }

  // Only a change that takes the last one away is refused.
  const willHaveEmail = !remove.includes('email') && !!(email ?? current.email);
  const willHavePhone = !remove.includes('phone') && !!(phone ?? current.phone);
  if (remove.length && !willHaveEmail && !willHavePhone) {
    return { error: 'Keep a phone number or an email address so sign-in still works', status: 400 };
  }

  // Accounts made before usernames were stored are known to Cognito by their
  // original phone number; pin that before the number changes, or sign-in
  // would go looking for a Cognito user under the new one.
  const cognitoUsername = current.cognitoUsername ?? current.phone;
  if (phone && cognitoUsername) await setCognitoPhone(cognitoUsername, phone);

  const user = await updateUser(current.userId, {
    ...extra, firstName, lastName, email, phone,
    ...(!current.cognitoUsername && cognitoUsername && (phone || remove.includes('phone')) ? { cognitoUsername } : {}),
  }, remove);
  return user ? { user } : { error: 'Not found', status: 404 };
}
