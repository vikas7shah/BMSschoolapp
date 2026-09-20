/** Core domain types shared by the API, reminder jobs and the web client. */

export type Role = 'PARENT' | 'ADMIN';
export type UserStatus = 'INVITED' | 'ACTIVE' | 'DISABLED';

export type SlotStatus = 'OPEN' | 'CLAIMED';

/**
 * What a family brings on their day. One family covers the whole day — a dry
 * snack *and* fruit — so a snack day is a single commitment, not two.
 */
export const SNACK_NOTE =
  'The family signed up for a day brings both a dry snack and fruit for the '
  + 'whole class that morning.';

/** Delivery channels a parent can switch on or off independently. */
export type Channel = 'sms' | 'email' | 'push' | 'inApp';
export const CHANNELS: Channel[] = ['sms', 'email', 'push', 'inApp'];

export type ChannelPrefs = Record<Channel, boolean>;

export const DEFAULT_PREFS: ChannelPrefs = {
  // Off until the parent switches it on themselves. Carriers require express
  // consent for texts, and a number copied from a roster is not consent.
  sms: false,
  email: true,
  push: false,
  inApp: true,
};

export interface School {
  schoolId: string;
  name: string;
  /** IANA zone, e.g. "America/Los_Angeles". All reminder scheduling is local to this. */
  timezone: string;
  /** Hour (0-23, school-local) at which the daily reminder sweep sends. */
  reminderHour: number;
  /** While true the sweep sends nothing — for loading a roster before go-live. */
  remindersPaused?: boolean;
  /** While true the "days still need a family" nudges stay off; a family's own day reminders still go. */
  openSlotNudgesPaused?: boolean;
  createdAt: string;
}

/** The six columns every curriculum table in the school's newsletter carries. */
export const CURRICULUM_SUBJECTS = [
  ['biology', 'Biology (Zoology)'],
  ['geography', 'Geography'],
  ['botany', 'Botany'],
  ['science', 'Science'],
  ['culture', 'Culture'],
  ['art', 'Art'],
] as const;
export type CurriculumSubject = typeof CURRICULUM_SUBJECTS[number][0];

export interface CurriculumGroup {
  /** As printed: "Classroom 1", "Elementary". Matched to a classroom by name where one exists. */
  group: string;
  teachers: string;
  subjects: Record<CurriculumSubject, string>;
}

export interface NewsletterSection {
  heading: string;
  /** Present-tense points covering everything the school's paragraph said. */
  points: string[];
}

/** The school's monthly letter, as headed bullet points, plus the curriculum. */
export interface Newsletter {
  schoolId: string;
  /** "2026-09" */
  month: string;
  sentOn: string;
  from: string;
  fromEmail?: string;
  sections: NewsletterSection[];
  curriculumIntro?: string;
  curriculum: CurriculumGroup[];
  updatedAt: string;
}

export interface Classroom {
  classroomId: string;
  schoolId: string;
  name: string;
  /** ISO weekdays (1=Mon .. 5=Fri) that need a snack contribution. */
  snackWeekdays: number[];
  /** Last date snack days have been generated through (the school year's end once done). */
  publishedThrough?: string;
  /** The day the office last sent a "remind now" to this room's unbooked families. */
  nudgedOn?: string;
  createdAt: string;
}

export interface User {
  userId: string;
  schoolId: string;
  role: Role;
  firstName: string;
  lastName: string;
  /**
   * E.164, e.g. +14155550123. Optional: some families are on the roster with
   * only an email address, and sign-in no longer depends on a phone.
   */
  phone?: string;
  email?: string;
  /**
   * The Cognito username. Historically the phone number; new accounts use the
   * userId so an account can exist without one. Stored explicitly rather than
   * derived, so it never has to be guessed.
   */
  cognitoUsername: string;
  /** Further numbers the school holds for this contact. Not used for sign-in. */
  extraPhones?: string[];
  /** Further addresses the school holds. Sign-in uses `email`. */
  extraEmails?: string[];
  status: UserStatus;
  prefs: ChannelPrefs;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

export interface Child {
  childId: string;
  schoolId: string;
  classroomId: string;
  firstName: string;
  lastName: string;
  createdAt: string;
}

export interface SnackSlot {
  schoolId: string;
  classroomId: string;
  /** YYYY-MM-DD in school-local time. Also the table's sort key. */
  date: string;
  status: SlotStatus;
  claimedByUserId?: string;
  claimedByName?: string;
  claimedForChildName?: string;
  /** Which child the day is for — the unit the one-a-month rule counts. */
  claimedForChildId?: string;
  claimedAt?: string;
  note?: string;
  updatedAt: string;
}

export type NotificationType =
  | 'SNACK_TOMORROW'
  | 'SNACK_NEXT_WEEK'
  | 'SLOT_OPEN'
  | 'NEVER_SIGNED_UP'
  | 'SLOT_CLAIMED'
  | 'SLOT_RELEASED'
  | 'WELCOME'
  | 'ADMIN_BROADCAST';

export type DeliveryResult = 'SENT' | 'FAILED' | 'SKIPPED';

export interface NotificationRecord {
  userId: string;
  notificationId: string;
  type: NotificationType;
  title: string;
  body: string;
  /** Deep link into the app, e.g. "/snacks?date=2026-09-14". */
  link?: string;
  createdAt: string;
  readAt?: string;
  channelResults: Partial<Record<Channel, DeliveryResult>>;
  ttl?: number;
}

export interface PushSubscriptionRecord {
  userId: string;
  endpointId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  createdAt: string;
  failureCount: number;
}

/** Shape returned by GET /api/me — everything the app needs to boot. */
export interface SessionUser {
  userId: string;
  schoolId: string;
  role: Role;
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  extraPhones?: string[];
  extraEmails?: string[];
  prefs: ChannelPrefs;
  children: Child[];
  classroomIds: string[];
  /** Names of the classrooms the children are in, keyed by id. */
  classroomNames: Record<string, string>;
}
