const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** Build an absolute URL for an asset served by the API (e.g. /media/xxx). */
export function assetUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${API_URL}${path}`;
}

export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  display_name: string;
  full_name: string;
  phone: string;
  dob: string | null;
  avatar_blob_id: string;
  address: string;
  // Activity & performance
  fitness_level: "" | "beginner" | "intermediate" | "advanced";
  fitness_note: string;
  pace_10k: string;
  weekly_km: number | null;
  longest_run: string;
  sport_tags: string[];
  bio: string;
  // Diet
  diet: "" | "omnivore" | "vegetarian" | "vegan" | "other";
  diet_note: string;
  // Apparel
  tshirt_size: string;
  // Emergency
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relationship: string;
  // System
  email_verified: boolean;
  date_joined: string;
}

export type QuestionnaireSection =
  | "tshirt_size"
  | "diet"
  | "fitness"
  | "health_notes"
  | "emergency_contact"
  | "photo_consent";

export const QUESTIONNAIRE_SECTION_ORDER: QuestionnaireSection[] = [
  "tshirt_size",
  "diet",
  "fitness",
  "health_notes",
  "emergency_contact",
  "photo_consent",
];

export const QUESTIONNAIRE_SECTION_LABELS: Record<QuestionnaireSection, string> = {
  tshirt_size: "Velikost trika",
  diet: "Strava a alergie",
  fitness: "Kondice a výkonnost",
  health_notes: "Zdravotní poznámky",
  emergency_contact: "Emergency kontakt",
  photo_consent: "Souhlas s fotkami",
};

export const QUESTIONNAIRE_SECTION_HINTS: Record<QuestionnaireSection, string> = {
  tshirt_size: "Pro akce, kde rozdáváš tričko.",
  diet: "Strava a alergie z profilu + per-event poznámka.",
  fitness: "Fitness level, 10K time, týdenní km, nejdelší běh — pro řízení tempa.",
  health_notes: "Citlivé info — uchováno 90 dní po akci.",
  emergency_contact: "Důležité pro outdoor akce.",
  photo_consent: "GDPR best practice.",
};

export interface Workspace {
  slug: string;
  name: string;
  bio: string;
  location: string;
  social_links: Record<string, string>;
  accent_color: string;
  logo_url: string | null;
  cover_url: string | null;
  visibility: "public" | "unlisted" | "private";
  default_tz: string;
  created_at: string;
  /** Present on /workspaces/mine/ + /workspaces/{slug}/detail/ for auth'd members. */
  my_role?: "owner" | null;
  /** Present on /workspaces/{slug}/detail/. */
  member_count?: number;
}

export interface ProgramDay {
  day: string;
  title: string;
  body: string;
}

export interface EventSummary {
  slug: string;
  title: string;
  starts_at: string;
  ends_at: string;
  tz: string;
  location_text: string;
  cover_url: string | null;
  capacity: number | null;
  status:
    | "draft"
    | "published"
    | "closed"
    | "cancelled"
    | "completed";
  visibility: "public" | "invite_only";
  workspace_slug: string;
  confirmed_count: number;
  waitlist_count: number;
}

export interface Event extends EventSummary {
  description: string;
  meeting_point_text: string;
  location_url: string;
  waitlist_enabled: boolean;
  requires_approval: boolean;
  highlights: string[];
  included: string[];
  program: ProgramDay[];
  price_text: string;
  enabled_questionnaire_sections: QuestionnaireSection[];
  workspace_name: string;
  workspace_logo_url: string | null;
  workspace_accent_color: string;
  is_open_for_rsvp: boolean;
  is_at_capacity: boolean;
  cancellation_reason: string;
  my_rsvp?: MyRSVP | null;
}

export interface RSVPAnswers {
  // Tshirt section
  tshirt_size?: "XS" | "S" | "M" | "L" | "XL" | "XXL";
  // Diet section
  diet?: "omnivore" | "vegetarian" | "vegan" | "other";
  diet_note?: string;
  // Fitness section (expanded)
  fitness_level?: "beginner" | "intermediate" | "advanced";
  fitness_note?: string;
  pace_10k?: string;
  weekly_km?: number | null;
  longest_run?: string;
  // Health section
  health_notes?: string;
  // Emergency
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  // Photo
  photo_consent?: boolean;
}

export interface RSVPAccount {
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
}

export interface MyRSVP {
  id: number;
  status:
    | "yes"
    | "maybe"
    | "no"
    | "waitlist"
    | "pending_approval"
    | "cancelled";
  questionnaire_answers: RSVPAnswers | Record<string, never>;
  waitlist_position: number | null;
  created_at: string;
}

export interface RSVPRecord extends MyRSVP {
  user_email: string;
  user_full_name: string;
  user_phone: string;
  attended: boolean | null;
  updated_at: string;
}

export class ApiError extends Error {
  status: number;
  data: Record<string, unknown>;

  constructor(status: number, data: Record<string, unknown>) {
    super(
      typeof data?.detail === "string"
        ? data.detail
        : `Request failed with status ${status}`,
    );
    this.status = status;
    this.data = data;
  }

  /** Convenience for showing the first per-field error in a form. */
  firstFieldError(): string | null {
    for (const key of Object.keys(this.data)) {
      const value = this.data[key];
      if (Array.isArray(value) && value.length > 0) {
        return `${key}: ${value[0]}`;
      }
    }
    return null;
  }
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp("(?:^|; )" + name + "=([^;]+)"),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

async function ensureCsrfToken(): Promise<void> {
  if (getCookie("csrftoken")) return;
  await fetch(`${API_URL}/api/auth/csrf/`, {
    credentials: "include",
  });
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    await ensureCsrfToken();
  }
  const csrf = getCookie("csrftoken");
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init.body ? { "Content-Type": "application/json" } : {}),
    ...(init.headers as Record<string, string> | undefined),
  };
  if (csrf) headers["X-CSRFToken"] = csrf;

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    // empty body is fine
  }

  if (!res.ok) throw new ApiError(res.status, data);
  return data as unknown as T;
}

export const workspaces = {
  byPublicSlug: (slug: string) =>
    apiFetch<Workspace>(`/api/workspaces/${slug}/`),
  detail: (slug: string) =>
    apiFetch<Workspace>(`/api/workspaces/${slug}/detail/`),
  eventsFor: (slug: string) =>
    apiFetch<EventSummary[]>(`/api/workspaces/${slug}/events/`),
  mine: () => apiFetch<Workspace[]>("/api/workspaces/mine/"),
};

export interface EventWritePayload {
  slug: string;
  title: string;
  description?: string;
  starts_at: string;
  ends_at: string;
  tz?: string;
  location_text?: string;
  meeting_point_text?: string;
  location_url?: string;
  capacity?: number | null;
  waitlist_enabled?: boolean;
  visibility?: "public" | "invite_only";
  status?: "draft" | "published" | "closed" | "cancelled" | "completed";
  requires_approval?: boolean;
  highlights?: string[];
  included?: string[];
  program?: ProgramDay[];
  price_text?: string;
  enabled_questionnaire_sections?: QuestionnaireSection[];
  cancellation_reason?: string;
}

export const events = {
  publicEvent: (workspaceSlug: string, eventSlug: string) =>
    apiFetch<Event>(`/api/events/${workspaceSlug}/${eventSlug}/`),
  rsvp: (
    workspaceSlug: string,
    eventSlug: string,
    payload: { answers: RSVPAnswers; account?: RSVPAccount },
  ) =>
    apiFetch<MyRSVP>(`/api/events/${workspaceSlug}/${eventSlug}/rsvp/`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  cancelMyRsvp: (workspaceSlug: string, eventSlug: string) =>
    apiFetch<MyRSVP>(
      `/api/events/${workspaceSlug}/${eventSlug}/rsvp/cancel/`,
      { method: "POST" },
    ),
  mine: () => apiFetch<EventSummary[]>("/api/events/mine/"),
  owner: () => apiFetch<EventSummary[]>("/api/events/owner/"),
  rsvpList: (workspaceSlug: string, eventSlug: string) =>
    apiFetch<RSVPRecord[]>(
      `/api/events/${workspaceSlug}/${eventSlug}/rsvps/`,
    ),
  create: (workspaceSlug: string, payload: EventWritePayload) =>
    apiFetch<Event>(`/api/events/${workspaceSlug}/create/`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  update: (
    workspaceSlug: string,
    eventSlug: string,
    payload: Partial<EventWritePayload>,
  ) =>
    apiFetch<Event>(`/api/events/${workspaceSlug}/${eventSlug}/update/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  cancel: (workspaceSlug: string, eventSlug: string, reason: string) =>
    apiFetch<Event>(`/api/events/${workspaceSlug}/${eventSlug}/cancel/`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
};

export const auth = {
  signup: (payload: {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
    phone?: string;
  }) =>
    apiFetch<{ detail: string }>("/api/auth/signup/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  verifyEmail: (token: string) =>
    apiFetch<{ detail: string }>("/api/auth/verify/", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  login: (payload: { email: string; password: string }) =>
    apiFetch<User>("/api/auth/login/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  logout: () =>
    apiFetch<{ detail: string }>("/api/auth/logout/", {
      method: "POST",
    }),
  me: () => apiFetch<User>("/api/auth/me/"),
  updateMe: (patch: Partial<User>) =>
    apiFetch<User>("/api/auth/me/", {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  requestPasswordReset: (email: string) =>
    apiFetch<{ detail: string }>("/api/auth/password/reset/request/", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  confirmPasswordReset: (token: string, password: string) =>
    apiFetch<{ detail: string }>("/api/auth/password/reset/confirm/", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    }),
};
