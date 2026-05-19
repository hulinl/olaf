import type { EventBlock } from "./event-blocks";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** Build an absolute URL for an asset served by the API (e.g. /media/xxx). */
export function assetUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${API_URL}${path}`;
}

/** Format an event price for display, or null if the event is free. */
export function formatEventPrice(
  amount: string | null | undefined,
  currency: string | undefined,
): string | null {
  if (!amount) return null;
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  // Strip trailing .00 for whole-currency values; keep cents otherwise.
  const isWhole = Math.round(n * 100) === Math.round(n) * 100;
  const body = new Intl.NumberFormat("cs-CZ", {
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(n);
  return `${body} ${currency || "CZK"}`;
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
  // Structured address (Slice 4 — for invoices)
  address_street: string;
  address_city: string;
  address_zip: string;
  address_country: string;
  has_billing_address: boolean;
  billing_name: string;
  billing_ico: string;
  billing_dic: string;
  billing_street: string;
  billing_city: string;
  billing_zip: string;
  billing_country: string;
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
  "fitness",
  "diet",
  "health_notes",
  "emergency_contact",
  "photo_consent",
  "tshirt_size",
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
  payment_iban: string;
  payment_bank_name: string;
  payment_due_days: number;
  created_at: string;
  /** Present on /workspaces/mine/ + /workspaces/{slug}/detail/ for auth'd members. */
  my_role?: "owner" | null;
  /** Present on /workspaces/{slug}/detail/. */
  member_count?: number;
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

export interface EventImage {
  id: number;
  url: string | null;
  alt_text: string;
  sort_order: number;
}

export interface Event extends EventSummary {
  description: string;
  meeting_point_text: string;
  location_url: string;
  waitlist_enabled: boolean;
  requires_approval: boolean;
  blocks: EventBlock[];
  enabled_questionnaire_sections: QuestionnaireSection[];
  community_slugs: string[];
  shared_workspace_slugs: string[];
  images: EventImage[];
  workspace_name: string;
  workspace_logo_url: string | null;
  workspace_accent_color: string;
  is_open_for_rsvp: boolean;
  is_at_capacity: boolean;
  remaining_capacity: number | null;
  cancellation_reason: string;
  price_amount: string | null;
  price_currency: string;
  price_note: string;
  required_documents: RequiredDocumentSpec[];
  my_rsvp?: MyRSVP | null;
}

export interface RequiredDocumentSpec {
  key: string;
  label: string;
  required: boolean;
}

export interface RSVPDocument {
  id: number;
  key: string;
  url: string | null;
  original_name: string;
  uploaded_at: string;
  verified_at: string | null;
}

export interface RSVPDocumentsBundle {
  required: RequiredDocumentSpec[];
  uploaded: RSVPDocument[];
}

export interface InvoiceItem {
  label: string;
  qty: number;
  unit_price: string;
  subtotal: string;
}

export interface Invoice {
  id: number;
  number: string;
  status: "draft" | "issued" | "paid" | "void";
  supplier_name: string;
  supplier_address: string;
  supplier_ico: string;
  supplier_dic: string;
  supplier_iban: string;
  customer_name: string;
  customer_address: string;
  customer_ico: string;
  customer_dic: string;
  customer_email: string;
  items: InvoiceItem[];
  subtotal: string;
  vat_rate: string;
  vat_amount: string;
  total: string;
  currency: string;
  variable_symbol: string;
  issued_at: string;
  due_at: string | null;
  notes: string;
  user_email: string;
  user_full_name: string;
  event_title: string;
  created_at: string;
  updated_at: string;
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
  // Payment (Slice 5). Null/empty fields for free events.
  payment_status: "pending" | "paid" | "refunded" | "waived";
  payment_due_amount: string | null;
  payment_currency: string;
  variable_symbol: string;
  paid_at: string | null;
  created_at: string;
}

export interface RSVPPaymentInstructions {
  status: "pending" | "paid" | "refunded" | "waived";
  amount: string;
  currency: string;
  variable_symbol: string;
  iban: string;
  bank_name: string;
  due_days: number;
  qr_png_url: string | null;
  message: string;
  paid_at: string | null;
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

  /** Convenience for showing the first per-field error in a form.
   *
   * Handles both DRF's array-of-messages shape (`{field: ["msg"]}`) and our
   * own ad-hoc string-per-field responses (`{field: "msg"}`). Skips the
   * generic `detail` key — that's already exposed as `err.message`. */
  firstFieldError(): string | null {
    for (const key of Object.keys(this.data)) {
      if (key === "detail") continue;
      const value = this.data[key];
      if (Array.isArray(value) && value.length > 0) {
        return `${key}: ${value[0]}`;
      }
      if (typeof value === "string" && value) {
        return value;
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
  const isFormData =
    typeof FormData !== "undefined" && init.body instanceof FormData;
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init.body && !isFormData ? { "Content-Type": "application/json" } : {}),
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

export interface WorkspaceWritePayload {
  name?: string;
  bio?: string;
  location?: string;
  social_links?: Record<string, string>;
  accent_color?: string;
  visibility?: "public" | "unlisted" | "private";
  default_tz?: string;
  payment_iban?: string;
  payment_bank_name?: string;
  payment_due_days?: number;
}

export interface WorkspaceCreatePayload {
  slug: string;
  name: string;
  bio?: string;
  location?: string;
  visibility?: "public" | "unlisted" | "private";
  default_tz?: string;
}

export interface WorkspaceMemberSummary {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string;
  total_rsvps: number;
  upcoming_rsvps: number;
  past_rsvps: number;
  last_rsvp_at: string | null;
}

export interface WorkspaceMemberRSVP {
  id: number;
  event_slug: string;
  event_title: string;
  event_starts_at: string;
  event_workspace_slug: string;
  status: MyRSVP["status"];
  payment_status: MyRSVP["payment_status"];
  created_at: string;
}

export interface WorkspaceMemberDetail {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string;
  bio: string;
  fitness_level: User["fitness_level"];
  diet: User["diet"];
  tshirt_size: string;
  rsvps: WorkspaceMemberRSVP[];
}

export const workspaces = {
  byPublicSlug: (slug: string) =>
    apiFetch<Workspace>(`/api/workspaces/${slug}/`),
  detail: (slug: string) =>
    apiFetch<Workspace>(`/api/workspaces/${slug}/detail/`),
  eventsFor: (slug: string) =>
    apiFetch<EventSummary[]>(`/api/workspaces/${slug}/events/`),
  members: (slug: string) =>
    apiFetch<WorkspaceMemberSummary[]>(`/api/workspaces/${slug}/members/`),
  memberDetail: (slug: string, userId: number) =>
    apiFetch<WorkspaceMemberDetail>(
      `/api/workspaces/${slug}/members/${userId}/`,
    ),
  mine: () => apiFetch<Workspace[]>("/api/workspaces/mine/"),
  create: (payload: WorkspaceCreatePayload) =>
    apiFetch<Workspace>("/api/workspaces/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  update: (slug: string, payload: WorkspaceWritePayload) =>
    apiFetch<Workspace>(`/api/workspaces/${slug}/detail/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  uploadLogo: (slug: string, file: File) => {
    const fd = new FormData();
    fd.append("logo", file);
    return apiFetch<Workspace>(`/api/workspaces/${slug}/logo/`, {
      method: "POST",
      body: fd,
    });
  },
  deleteLogo: (slug: string) =>
    apiFetch<Workspace>(`/api/workspaces/${slug}/logo/`, { method: "DELETE" }),
  uploadCover: (slug: string, file: File) => {
    const fd = new FormData();
    fd.append("cover", file);
    return apiFetch<Workspace>(`/api/workspaces/${slug}/cover/`, {
      method: "POST",
      body: fd,
    });
  },
  deleteCover: (slug: string) =>
    apiFetch<Workspace>(`/api/workspaces/${slug}/cover/`, { method: "DELETE" }),
};

export interface Community {
  id: number;
  slug: string;
  name: string;
  description: string;
  cover_url: string | null;
  visibility: "private" | "unlisted" | "public";
  membership_policy: "approval" | "invite_only";
  workspace_slug: string;
  workspace_name: string;
  member_count: number;
  created_at: string;
}

export interface CommunityMemberRecord {
  id: number;
  status: "pending" | "member" | "declined" | "removed";
  joined_at: string;
  decided_at: string | null;
  user_email: string;
  user_full_name: string;
}

export interface CommunityWritePayload {
  slug: string;
  name: string;
  description?: string;
  visibility?: Community["visibility"];
  membership_policy?: Community["membership_policy"];
}

export interface CommunityInviteResult {
  added: CommunityMemberRecord[];
  skipped_already_member: string[];
  no_account_yet: string[];
}

export const communities = {
  forWorkspace: (workspaceSlug: string) =>
    apiFetch<Community[]>(`/api/communities/workspaces/${workspaceSlug}/`),
  create: (workspaceSlug: string, payload: CommunityWritePayload) =>
    apiFetch<Community>(`/api/communities/workspaces/${workspaceSlug}/`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  detail: (workspaceSlug: string, communitySlug: string) =>
    apiFetch<Community>(
      `/api/communities/workspaces/${workspaceSlug}/${communitySlug}/`,
    ),
  update: (
    workspaceSlug: string,
    communitySlug: string,
    payload: Partial<CommunityWritePayload>,
  ) =>
    apiFetch<Community>(
      `/api/communities/workspaces/${workspaceSlug}/${communitySlug}/`,
      { method: "PATCH", body: JSON.stringify(payload) },
    ),
  remove: (workspaceSlug: string, communitySlug: string) =>
    apiFetch<void>(
      `/api/communities/workspaces/${workspaceSlug}/${communitySlug}/`,
      { method: "DELETE" },
    ),
  members: (workspaceSlug: string, communitySlug: string) =>
    apiFetch<CommunityMemberRecord[]>(
      `/api/communities/workspaces/${workspaceSlug}/${communitySlug}/members/`,
    ),
  invite: (workspaceSlug: string, communitySlug: string, emails: string) =>
    apiFetch<CommunityInviteResult>(
      `/api/communities/workspaces/${workspaceSlug}/${communitySlug}/members/`,
      { method: "POST", body: JSON.stringify({ emails }) },
    ),
  removeMember: (
    workspaceSlug: string,
    communitySlug: string,
    memberId: number,
  ) =>
    apiFetch<void>(
      `/api/communities/workspaces/${workspaceSlug}/${communitySlug}/members/${memberId}/`,
      { method: "DELETE" },
    ),
};

export interface EventWritePayload {
  slug: string;
  title: string;
  description?: string;
  community_slugs?: string[];
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
  blocks?: EventBlock[];
  enabled_questionnaire_sections?: QuestionnaireSection[];
  cancellation_reason?: string;
  price_amount?: string | null;
  price_currency?: string;
  price_note?: string;
  shared_workspace_slugs?: string[];
  required_documents?: RequiredDocumentSpec[];
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
  uploadCover: (workspaceSlug: string, eventSlug: string, file: File) => {
    const fd = new FormData();
    fd.append("cover", file);
    return apiFetch<Event>(
      `/api/events/${workspaceSlug}/${eventSlug}/cover/`,
      { method: "POST", body: fd },
    );
  },
  deleteCover: (workspaceSlug: string, eventSlug: string) =>
    apiFetch<Event>(`/api/events/${workspaceSlug}/${eventSlug}/cover/`, {
      method: "DELETE",
    }),
  duplicate: (workspaceSlug: string, eventSlug: string) =>
    apiFetch<Event>(
      `/api/events/${workspaceSlug}/${eventSlug}/duplicate/`,
      { method: "POST" },
    ),
  listImages: (workspaceSlug: string, eventSlug: string) =>
    apiFetch<EventImage[]>(
      `/api/events/${workspaceSlug}/${eventSlug}/images/`,
    ),
  uploadImage: (workspaceSlug: string, eventSlug: string, file: File) => {
    const fd = new FormData();
    fd.append("image", file);
    return apiFetch<EventImage>(
      `/api/events/${workspaceSlug}/${eventSlug}/images/`,
      { method: "POST", body: fd },
    );
  },
  deleteImage: (workspaceSlug: string, eventSlug: string, imageId: number) =>
    apiFetch<void>(
      `/api/events/${workspaceSlug}/${eventSlug}/images/${imageId}/`,
      { method: "DELETE" },
    ),
  reorderImages: (
    workspaceSlug: string,
    eventSlug: string,
    order: number[],
  ) =>
    apiFetch<EventImage[]>(
      `/api/events/${workspaceSlug}/${eventSlug}/images/reorder/`,
      { method: "POST", body: JSON.stringify({ order }) },
    ),
  uploadBlockImage: (workspaceSlug: string, eventSlug: string, file: File) => {
    const fd = new FormData();
    fd.append("image", file);
    return apiFetch<{ url: string }>(
      `/api/events/${workspaceSlug}/${eventSlug}/block-images/`,
      { method: "POST", body: fd },
    );
  },
  approveRsvp: (workspaceSlug: string, eventSlug: string, rsvpId: number) =>
    apiFetch<RSVPRecord>(
      `/api/events/${workspaceSlug}/${eventSlug}/rsvps/${rsvpId}/approve/`,
      { method: "POST" },
    ),
  rejectRsvp: (workspaceSlug: string, eventSlug: string, rsvpId: number) =>
    apiFetch<RSVPRecord>(
      `/api/events/${workspaceSlug}/${eventSlug}/rsvps/${rsvpId}/reject/`,
      { method: "POST" },
    ),
  paymentInstructions: (workspaceSlug: string, eventSlug: string) =>
    apiFetch<RSVPPaymentInstructions>(
      `/api/events/${workspaceSlug}/${eventSlug}/rsvp/payment/`,
    ),
  markRsvpPaid: (workspaceSlug: string, eventSlug: string, rsvpId: number) =>
    apiFetch<RSVPRecord>(
      `/api/events/${workspaceSlug}/${eventSlug}/rsvps/${rsvpId}/mark-paid/`,
      { method: "POST" },
    ),
  myDocuments: (workspaceSlug: string, eventSlug: string) =>
    apiFetch<RSVPDocumentsBundle>(
      `/api/events/${workspaceSlug}/${eventSlug}/rsvp/documents/`,
    ),
  uploadDocument: (
    workspaceSlug: string,
    eventSlug: string,
    key: string,
    file: File,
  ) => {
    const fd = new FormData();
    fd.append("key", key);
    fd.append("file", file);
    return apiFetch<RSVPDocument>(
      `/api/events/${workspaceSlug}/${eventSlug}/rsvp/documents/`,
      { method: "POST", body: fd },
    );
  },
  deleteDocument: (
    workspaceSlug: string,
    eventSlug: string,
    documentId: number,
  ) =>
    apiFetch<void>(
      `/api/events/${workspaceSlug}/${eventSlug}/rsvp/documents/${documentId}/`,
      { method: "DELETE" },
    ),
  invoices: (workspaceSlug: string, eventSlug: string) =>
    apiFetch<Invoice[]>(
      `/api/events/${workspaceSlug}/${eventSlug}/invoices/`,
    ),
  invoiceDetail: (
    workspaceSlug: string,
    eventSlug: string,
    invoiceId: number,
  ) =>
    apiFetch<Invoice>(
      `/api/events/${workspaceSlug}/${eventSlug}/invoices/${invoiceId}/`,
    ),
  updateInvoice: (
    workspaceSlug: string,
    eventSlug: string,
    invoiceId: number,
    patch: Partial<Invoice>,
  ) =>
    apiFetch<Invoice>(
      `/api/events/${workspaceSlug}/${eventSlug}/invoices/${invoiceId}/`,
      { method: "PATCH", body: JSON.stringify(patch) },
    ),
  myInvoice: (workspaceSlug: string, eventSlug: string) =>
    apiFetch<Invoice>(
      `/api/events/${workspaceSlug}/${eventSlug}/rsvp/invoice/`,
    ),
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
