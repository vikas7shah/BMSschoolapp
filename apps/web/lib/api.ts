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
  role: 'PARENT' | 'ADMIN';
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  prefs: { sms: boolean; email: boolean; push: boolean; inApp: boolean };
  children: { childId: string; firstName: string; lastName: string; classroomId: string }[];
  classroomIds: string[];
  classroomNames: Record<string, string>;
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
