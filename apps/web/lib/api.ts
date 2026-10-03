/** Thin fetch wrapper. Same-origin, so the session cookie rides along. */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    /** Full response body — some errors carry data the caller needs. */
    public body: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  const text = await res.text();
  const body = text ? (JSON.parse(text) as Record<string, unknown>) : {};

  if (!res.ok) {
    throw new ApiError(
      res.status,
      (body.error as string) ?? 'Something went wrong. Please try again.',
      body.code as string | undefined,
      body,
    );
  }
  return body as T;
}

/** What /api/admin/overview returns: this month and next, per classroom. */
export interface OverviewData {
  today: string;
  classrooms: { classroomId: string; name: string }[];
  totals: { slots: number; filled: number; open: number };
  months: string[];
  byClassroom: {
    classroomId: string; name: string; slots: number; filled: number; open: number;
    months: { month: string; slots: number; filled: number; open: number }[];
    families: number;
    unbookedFamilies: number;
    nudgedToday: boolean;
  }[];
  openSlots: { date: string; classroomId: string }[];
  childrenWithNothingBooked: { childName: string; classroomId?: string }[];
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

/* ------------------------------------------------------------------- types */

export interface Slot {
  classroomId: string;
  date: string;
  status: 'OPEN' | 'CLAIMED';
  claimedByName?: string;
  claimedForChildName?: string;
  claimedForChildId?: string;
  note?: string;
  isMine: boolean;
  /** This parent asked for the day-before reminder. */
  remindTomorrow?: boolean;
  classroomName?: string;
}

export interface SnackBoard {
  today: string;
  from: string;
  to: string;
  releaseNoticeDays: number;
  isAdmin: boolean;
  classrooms: { classroomId: string; name: string; full: boolean }[];
  slots: Slot[];
}

export interface Me {
  userId: string;
  schoolId: string;
  role: 'PARENT' | 'ADMIN' | 'TEACHER';
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  prefs: { sms: boolean; email: boolean; push: boolean; inApp: boolean };
  children: { childId: string; firstName: string; lastName: string; classroomId: string }[];
  classroomIds: string[];
  classroomNames: Record<string, string>;
  /** For a teacher: the classrooms they teach. */
  teaches?: string[];
  /** For a teacher: the newsletter curriculum groups they teach. */
  curriculumGroups?: string[];
}

/** One time in a sign-up. Staff get `bookings`; a family gets `mine`. */
export interface SignupSlotView {
  slotId: string;
  classroomId: string;
  date: string;
  start: string;
  end: string;
  capacity: number;
  booked: number;
  bookings?: { childId: string; childName: string; parentName: string; email?: string; phone?: string; byOffice: boolean }[];
  mine?: string[];
}

/** A conference or observation sign-up, as the viewer may see it. */
export interface Signup {
  eventId: string;
  kind: 'CONFERENCE' | 'OBSERVATION';
  title: string;
  status: 'DRAFT' | 'OPEN' | 'CLOSED';
  classroomIds: string[];
  slotMinutes: number;
  capacity: number;
  location: string;
  closesOn: string | null;
  setClosesOn: string | null;
  /** Families can still book or switch. */
  open: boolean;
  slots: SignupSlotView[];
  children: { childId: string; firstName: string; classroomId: string; slotId: string | null }[];
  notBooked?: { childId: string; name: string; classroomId: string; parents: string[] }[];
}

/** An alert as the Alerts tab shows it. */
export interface Alert {
  alertId: string;
  kind: 'CLOSURE' | 'EARLY_DISMISSAL' | 'REMINDER' | 'GENERAL';
  title: string;
  message: string;
  audience: 'SCHOOL' | 'CLASSROOMS';
  classroomIds: string[];
  sentByName: string;
  sentByRole: string;
  recipients: number;
  /** Set when it announces a sign-up. */
  signupEventId?: string;
  createdAt: string;
}

/** Something a teacher or the office added to a curriculum group's month. */
export interface CurriculumItem {
  itemId: string;
  month: string;
  /** The newsletter's group: "Classroom 1", "Elementary". */
  group: string;
  area: string;
  text: string;
  addedByName: string;
  updatedAt: string;
}

/** One classroom as a teacher sees it: every child, and how to reach their parents. */
export interface ClassList {
  classroomId: string;
  name: string;
  children: {
    childId: string;
    firstName: string;
    lastName: string;
    parents: {
      firstName: string;
      lastName: string;
      phone?: string;
      email?: string;
      extraPhones?: string[];
      extraEmails?: string[];
    }[];
  }[];
}

export interface Notification {
  notificationId: string;
  sk: string;
  type: string;
  title: string;
  body: string;
  link?: string;
  createdAt: string;
  readAt?: string;
}
