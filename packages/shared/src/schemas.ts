import { z } from 'zod';
import { CHANNELS } from './types.js';

/** Accepts what a parent actually types and normalises to E.164 (US default). */
export function normalizePhone(input: string, defaultCountry = '1'): string | null {
  const trimmed = input.trim();
  const hadPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;
  if (hadPlus) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+${defaultCountry}${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
}

export const phoneSchema = z
  .string()
  .transform((v, ctx) => {
    const n = normalizePhone(v);
    if (!n) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid phone number' });
      return z.NEVER;
    }
    return n;
  });

export const civilDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date');

export const channelPrefsSchema = z.object(
  Object.fromEntries(CHANNELS.map((c) => [c, z.boolean()])) as Record<
    (typeof CHANNELS)[number],
    z.ZodBoolean
  >,
);

/**
 * Parents sign in with whichever they remember — the mobile number the school
 * holds, or their email address. One field, resolved here.
 */
export type Identifier =
  | { kind: 'PHONE'; value: string }
  | { kind: 'EMAIL'; value: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function resolveIdentifier(input: string): Identifier | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // An "@" is unambiguous; nothing else about a phone number contains one.
  if (trimmed.includes('@')) {
    const value = trimmed.toLowerCase();
    return EMAIL_RE.test(value) ? { kind: 'EMAIL', value } : null;
  }

  const phone = normalizePhone(trimmed);
  return phone ? { kind: 'PHONE', value: phone } : null;
}

export const identifierSchema = z.string().transform((v, ctx) => {
  const resolved = resolveIdentifier(v);
  if (!resolved) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: v.includes('@')
        ? "That doesn't look like a complete email address."
        : 'Enter your mobile number or email address.',
    });
    return z.NEVER;
  }
  return resolved;
});

export const startLoginSchema = z.object({ identifier: identifierSchema });

export const verifyLoginSchema = z.object({
  identifier: identifierSchema,
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  session: z.string().min(1),
});

export const claimSlotSchema = z.object({
  classroomId: z.string().min(1),
  date: civilDateSchema,
  /** Optional: only needed when a parent has more than one child in the room. */
  childId: z.string().min(1).optional(),
  /**
   * A child may hold one day per month. To move it, the parent confirms a
   * switch: the day they are giving up is named here, and is released only
   * after the new one has been secured.
   */
  switchFrom: civilDateSchema.optional(),
  note: z.string().max(200).optional(),
});

export const releaseSlotSchema = z.object({
  classroomId: z.string().min(1),
  date: civilDateSchema,
});

export const updatePrefsSchema = z.object({
  prefs: channelPrefsSchema.partial(),
  email: z.string().email().optional().or(z.literal('')),
});

export const pushSubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

export const inviteParentSchema = z.object({
  firstName: z.string().min(1).max(60),
  lastName: z.string().min(1).max(60),
  phone: phoneSchema,
  email: z.string().email().optional().or(z.literal('')),
  role: z.enum(['PARENT', 'ADMIN']).default('PARENT'),
  children: z
    .array(
      z.object({
        firstName: z.string().min(1).max(60),
        lastName: z.string().min(1).max(60),
        classroomId: z.string().min(1),
      }),
    )
    .default([]),
});

export const generateSlotsSchema = z.object({
  classroomId: z.string().min(1),
  from: civilDateSchema,
  to: civilDateSchema,
});

export const createClassroomSchema = z.object({
  name: z.string().min(1).max(80),
  snackWeekdays: z.array(z.number().int().min(1).max(7)).min(1),
});

/* --------------------------------------------------------- roster import */

const paragraph = z.string().trim().min(1).max(4000);
export const newsletterSchema = z.object({
  sentOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  from: z.string().trim().min(1).max(120),
  sections: z.array(z.object({
    heading: z.string().trim().min(1).max(80),
    brief: z.array(z.string().trim().min(1).max(200)).max(6).optional(),
    paragraphs: z.array(paragraph).min(1).max(20),
  })).min(1).max(30),
  curriculumIntro: paragraph.optional().or(z.literal('')),
  curriculum: z.array(z.object({
    group: z.string().trim().min(1).max(60),
    teachers: z.string().trim().max(120).default(''),
    subjects: z.object({
      biology: z.string().trim().max(300).default(''),
      geography: z.string().trim().max(300).default(''),
      botany: z.string().trim().max(300).default(''),
      science: z.string().trim().max(300).default(''),
      culture: z.string().trim().max(300).default(''),
      art: z.string().trim().max(300).default(''),
    }),
  })).max(10).default([]),
  signoff: z.string().trim().max(1000).default(''),
});
export type NewsletterInput = z.infer<typeof newsletterSchema>;

export const importChildSchema = z.object({
  firstName: z.string().min(1).max(60),
  lastName: z.string().min(1).max(60),
  classroomId: z.string().min(1),
});

export const importFamilySchema = z.object({
  firstName: z.string().min(1).max(60),
  // Some people go by a single name; the roster should not reject them.
  lastName: z.string().max(60).default(''),
  /** Optional: the school holds only an email address for some families. */
  phone: phoneSchema.optional(),
  email: z.string().email().optional().or(z.literal('')),
  /** Further numbers/addresses from the same spreadsheet cell. */
  extraPhones: z.array(z.string().max(32)).max(5).default([]),
  extraEmails: z.array(z.string().max(120)).max(5).default([]),
  children: z.array(importChildSchema).max(10).default([]),
}).refine((f) => !!f.phone || !!f.email, {
  message: 'A family needs a phone number or an email address',
});

/**
 * Capped per request so one call stays well inside the Lambda timeout; the
 * browser sends a large roster in consecutive chunks and shows progress.
 */
export const IMPORT_CHUNK_SIZE = 40;

export const importRosterSchema = z.object({
  families: z.array(importFamilySchema).max(50).default([]),
  /**
   * Children listed with no contact details. Created without a guardian so the
   * class list is complete and a parent can be attached later.
   */
  children: z.array(importChildSchema).max(100).default([]),
}).refine((d) => d.families.length + d.children.length > 0, {
  message: 'Nothing to import',
});

export type ImportOutcome = 'CREATED' | 'LINKED' | 'SKIPPED_EXISTS' | 'FAILED';

export interface ImportSummary {
  created: number;
  skipped: number;
  failed: number;
  childrenCreated: number;
}

export interface ImportResult {
  /** Phone if there is one, otherwise the email — whatever identifies the row. */
  phone: string;
  name: string;
  outcome: ImportOutcome;
  reason?: string;
  userId?: string;
  childrenCreated: number;
  childrenLinked: number;
}
