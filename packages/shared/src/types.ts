/** Core domain types shared by the API, reminder jobs and the web client. */

/** A teacher sees their own classrooms, read-only; they never book or edit. */
export type Role = 'PARENT' | 'ADMIN' | 'TEACHER';
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
  /**
   * The master switch. While true nothing automatic goes out or lands in the
   * Messages list — not the sweep, not a booking confirmation. Only sign-in
   * codes and the office's "Remind them" still go.
   */
  remindersPaused?: boolean;
  /**
   * While true the sign-up reminders (1st and 8th of the month) stay off; a
   * family's own snack-day reminders still go. Named for what it once paused.
   */
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

/** A conference has one family per time; an observation several. */
export type SignupKind = 'CONFERENCE' | 'OBSERVATION';

/**
 * A sign-up the office runs: parent–teacher conferences, parent observations.
 * Families book a time in their child's classroom, one per child. Hidden from
 * families and teachers until published.
 */
export interface SignupEvent {
  schoolId: string;
  /** "EVENT#<eventId>" */
  sk: string;
  eventId: string;
  kind: SignupKind;
  title: string;
  status: 'DRAFT' | 'OPEN' | 'CLOSED';
  classroomIds: string[];
  /** Length of one time, in minutes. */
  slotMinutes: number;
  /** Families per time, for new times; each time can be raised on its own. */
  capacity: number;
  /** Last day families can book or switch; the day before the first time unless set. */
  closesOn?: string;
  location: string;
  createdAt: string;
  publishedAt?: string;
}

export interface SignupBooking {
  childId: string;
  childName: string;
  userId: string;
  parentName: string;
  bookedAt: string;
  /** Booked by the office rather than the family. */
  byOffice?: boolean;
}

/** One time in one classroom, and who has booked it. */
export interface SignupSlot {
  schoolId: string;
  /** "SLOT#<eventId>#<classroomId>#<date>#<HH:MM>" */
  sk: string;
  eventId: string;
  classroomId: string;
  date: string;
  /** "08:00" */
  start: string;
  end: string;
  capacity: number;
  booked: number;
  /** Keyed by childId, so a booking is added or removed without a read. */
  bookings: Record<string, SignupBooking>;
}

/** Which time a child holds — one per child per sign-up. */
export interface SignupChildBooking {
  schoolId: string;
  /** "BOOK#<eventId>#<childId>" */
  sk: string;
  eventId: string;
  childId: string;
  slotSk: string;
}

/** What an alert is about; decides its colour and the template it starts from. */
export type AlertKind = 'CLOSURE' | 'EARLY_DISMISSAL' | 'REMINDER' | 'GENERAL';

/**
 * A message from a teacher to their class, or from the office to the whole
 * school or chosen classrooms: "School is closed tomorrow — snow day".
 */
export interface SchoolAlert {
  schoolId: string;
  /** "<createdAt>#<alertId>" — newest last; read in reverse. */
  sk: string;
  alertId: string;
  kind: AlertKind;
  title: string;
  message: string;
  audience: 'SCHOOL' | 'CLASSROOMS';
  /** The classrooms it went to, when not the whole school. */
  classroomIds: string[];
  sentByUserId: string;
  sentByName: string;
  sentByRole: Role;
  /** How many people it was delivered to. */
  recipients: number;
  createdAt: string;
}

/** Areas a teacher can add to; the newsletter's six first, then the Montessori areas. */
export const CLASS_CURRICULUM_AREAS = [
  'Practical life', 'Sensorial', 'Language', 'Math',
  'Biology', 'Geography', 'Botany', 'Science', 'Culture', 'Art', 'Music', 'Other',
] as const;

/**
 * Something a teacher or the office adds to a curriculum group for a month,
 * beyond what the newsletter lists. Shown with that group's curriculum.
 */
export interface ClassCurriculumItem {
  schoolId: string;
  /** "2026-09#<itemId>" — a month's items read in one query. */
  sk: string;
  /** The newsletter month it adds to. */
  month: string;
  /** The newsletter's curriculum group: "Classroom 1", "Elementary". */
  group: string;
  itemId: string;
  area: string;
  text: string;
  addedByUserId: string;
  addedByName: string;
  createdAt: string;
  updatedAt: string;
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
  /** For a teacher: the classrooms they teach, and so may see. */
  teachesClassroomIds?: string[];
  /**
   * For a teacher: the newsletter's curriculum groups they teach, chosen by
   * them ("Elementary" has no classroom). Unset means their classrooms' names.
   */
  curriculumGroups?: string[];
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
  /**
   * Parents who tapped "Remind me tomorrow" on the two-day reminder; each gets
   * the day-before reminder. A DynamoDB string set, so a Set when read back.
   */
  remindTomorrowUserIds?: Iterable<string>;
  updatedAt: string;
}

export type NotificationType =
  | 'SNACK_SOON'
  | 'SNACK_TOMORROW'
  | 'SIGNUP_MONTH_START'
  | 'SIGNUP_FOLLOW_UP'
  | 'SIGNUP_NUDGE'
  // No longer sent; kept so older Messages still type-check.
  | 'SNACK_NEXT_WEEK'
  | 'SLOT_OPEN'
  | 'NEVER_SIGNED_UP'
  | 'SLOT_CLAIMED'
  | 'SLOT_RELEASED'
  | 'WELCOME'
  | 'ADMIN_BROADCAST'
  | 'ALERT';

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
  /** Names of every classroom in the school, keyed by id. */
  classroomNames: Record<string, string>;
  /** For a teacher: the classrooms they teach. */
  teaches?: string[];
  /** For a teacher: the curriculum groups they teach. */
  curriculumGroups?: string[];
}
