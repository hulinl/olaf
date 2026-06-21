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
  // Notification preferences
  notify_on_discussion_reply: boolean;
  notify_on_discussion_announce: boolean;
  notify_on_discussion_mention: boolean;
  notify_on_event_update: boolean;
  notify_on_rsvp_status: boolean;
  // Gear affiliate partners
  affiliate_partners: { domain: string; params: Record<string, string> }[];
  // System
  email_verified: boolean;
  date_joined: string;
  /** Server-computed: whether the user has filled the V1 minimum
   *  (name + phone + address). Drives the "!" badge on the avatar
   *  and the warning row inside the user menu. */
  profile_completion: {
    is_complete: boolean;
    missing: { key: string; label: string }[];
  };
}

export interface APITokenInfo {
  id: number;
  label: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  is_active: boolean;
}

export interface APITokenCreated extends APITokenInfo {
  /** Plaintext token. Returned exactly once on creation; subsequent
   *  GETs never include this field. */
  key: string;
}

export interface BillingProfile {
  id: number;
  label: string;
  legal_name: string;
  ico: string;
  dic: string;
  address_street: string;
  address_city: string;
  address_zip: string;
  address_country: string;
  iban: string;
  bank_name: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface BillingProfileWritePayload {
  label: string;
  legal_name: string;
  ico?: string;
  dic?: string;
  address_street?: string;
  address_city?: string;
  address_zip?: string;
  address_country?: string;
  iban?: string;
  bank_name?: string;
  is_default?: boolean;
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
  my_role?: "owner" | "admin" | null;
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
  pending_approval_count: number;
  price_amount: string | null;
  price_currency: string;
  price_note: string;
  deleted_at: string | null;
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
  /** Per-event toggle pro povinnost telefonu při registraci. Default
   *  True kvůli emergencies; owner si u casual akcí (komunita, BBQ)
   *  odznačí. */
  require_phone_on_rsvp: boolean;
  blocks: EventBlock[];
  /** Inline payload for every `gear` block on this event's landing.
   *  Map of slug → PublicGearList. Private lists are omitted. */
  gear_lists_by_slug?: Record<string, PublicGearList>;
  /** Slim payload for the event's recommended gear checklist — set
   *  via Event.recommended_gear_list. Strips URLs/weights/notes; just
   *  what a packing checklist needs. */
  recommended_gear_list: RecommendedGearList | null;
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
  payment_in_cash: boolean;
  billing_profile: number | null;
  required_documents: RequiredDocumentSpec[];
  /** Owner-internal risk checklist (weather / route / equipment / etc).
   *  Backend returns [] to non-managers; full list to owners. */
  risk_checklist: RiskChecklistItem[];
  my_rsvp?: MyRSVP | null;
  i_am_owner?: boolean;
}

export interface RiskChecklistItem {
  key: string;
  label: string;
  category: string;
  status: "open" | "done" | "na";
  notes: string;
}

export interface EventDraftPreview {
  is_draft_preview: true;
  title: string;
  workspace_name: string;
  workspace_slug: string;
  workspace_logo_url: string | null;
}

/** Output of the Notion+Claude ingest pipeline. Slim subset of Event
 *  fields — unknown values come back null. Frontend maps this into an
 *  EventForm `initial` after fixing up null → "" / undefined as
 *  EventForm expects. */
export interface EventDraftFromSource {
  title: string | null;
  description: string | null;
  starts_at: string | null;
  ends_at: string | null;
  location_text: string | null;
  meeting_point_text: string | null;
  location_url: string | null;
  capacity: number | null;
  price_amount: string | null;
  price_currency: string | null;
  price_note: string | null;
  notes: string[] | null;
  source_url: string;
  /** 32-hex Notion page id extracted from the URL. Stamp on the
   *  resulting Event as `external_ref = "notion:<page_id>"` so a
   *  second ingest of the same page hits the upsert path. */
  notion_page_id: string;
  /** Claude-extracted landing-page blocks. Empty list when the
   *  source page didn't have rich structured content. Sanitized
   *  server-side — unknown block types get dropped, but the rest
   *  may still fail strict blocks.py validation at save time. */
  blocks: EventBlock[];
  /** When set, this Notion page already produced an event in one of
   *  the caller's workspaces — frontend offers an "update existing"
   *  toggle alongside the default "create new". */
  existing_event: {
    id: number;
    slug: string;
    title: string;
    status: string;
    workspace_slug: string;
  } | null;
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

export interface ChecklistAutoItem {
  key: string;
  title: string;
  description: string;
  done: boolean;
  category: string;
  action_href: string;
}

export type ChecklistRemindAudience = "creator" | "participants";

export interface ChecklistManualItem {
  id: number;
  title: string;
  description: string;
  category: string;
  done: boolean;
  done_at: string | null;
  sort_order: number;
  remind_at: string | null;
  remind_audience: ChecklistRemindAudience;
  remind_sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChecklistPreset {
  key: string;
  title: string;
  description: string;
  category: string;
}

export interface EventChecklist {
  auto: ChecklistAutoItem[];
  manual: ChecklistManualItem[];
  presets: ChecklistPreset[];
}

export interface DiscussionTopic {
  id: number;
  parent_type: "workspace" | "event";
  parent_id: number;
  title: string;
  body: string;
  pinned: boolean;
  locked: boolean;
  author_id: number | null;
  author_name: string;
  comment_count: number;
  like_count: number;
  i_liked: boolean;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
}

export interface TopicLikeResponse {
  topic_id: number;
  like_count: number;
  i_liked: boolean;
}

export interface DiscussionComment {
  id: number;
  topic: number;
  /** Single-level threading: null for top-level, otherwise the id of
   *  the parent comment this one replies to. */
  parent: number | null;
  body: string;
  /** URL to the attached file (image or arbitrary file). null when no
   *  attachment is present. Use attachment_name for the human-friendly
   *  filename label on non-image downloads. */
  attachment_url: string | null;
  attachment_name: string;
  author_id: number | null;
  author_name: string;
  author_email: string;
  like_count: number;
  i_liked: boolean;
  created_at: string;
  updated_at: string;
}

export interface CommentLikeResponse {
  comment_id: number;
  like_count: number;
  i_liked: boolean;
}

export interface DiscussionTopicDetail extends DiscussionTopic {
  comments: DiscussionComment[];
}

export interface TopicWritePayload {
  title: string;
  body?: string;
  pinned?: boolean;
}

export type TodoItem =
  | {
      kind: "payment";
      rsvp_id: number;
      workspace_slug: string;
      workspace_name: string;
      event_slug: string;
      event_title: string;
      event_starts_at: string;
      amount: string;
      currency: string;
      variable_symbol: string;
      iban: string;
    }
  | {
      kind: "document";
      rsvp_id: number;
      workspace_slug: string;
      workspace_name: string;
      event_slug: string;
      event_title: string;
      event_starts_at: string;
      doc_key: string;
      doc_label: string;
    };

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
  has_qr: boolean;
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
  /** Packing-checklist state: keys = stringified RecommendedGearListEntry
   *  ids, values = ISO timestamp the box was ticked. Unchecked items are
   *  simply absent from the dict. */
  gear_checklist: Record<string, string>;
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
  uploaded_doc_keys: string[];
  verified_doc_keys: string[];
  invoice_id: number | null;
  /** Marks this RSVP as an organizer — exempt from capacity / payment /
   *  required-document expectations. Independent of EventCollaborator
   *  (edit rights). */
  is_organizer: boolean;
  /** Soft duplicate detection — populated when this RSVP shares a
   *  normalized phone or name with another non-cancelled RSVP on the
   *  same event. Used to render the "⚠ Možný duplikát" badge. */
  duplicate_hints: ("same_phone" | "same_name")[];
  /** Pro cancelled rows — kdo zrušil. `""` = aktivní RSVP nebo legacy
   *  bez záznamu. Owner v rosteru tím vidí kontext na cancelled buňce
   *  ("Sám zrušil" / "Mailem" / "Zrušil pořadatel"). */
  cancellation_reason: "" | "self" | "by_token" | "owner";
  cancelled_at: string | null;
  /** Backend signal pro skrytí popelnice u řádků, kde remove nemá
   *  smysl: viewer sám sebe (k tomu cancel_my_rsvp), super-admin
   *  workspacu (chráněn), už cancelled. Backend kontroluje při POST
   *  znovu — tohle je jen UI hint. */
  can_be_removed: boolean;
  /** Backend signal pro skrytí "Označit/Odebrat organizátora" toggle —
   *  zakladatel workspace musí zůstat organizátorem akce, nelze ho
   *  demote-nout na běžného účastníka. */
  can_toggle_organizer: boolean;
  updated_at: string;
}

export interface PersonSummary {
  user_id: number;
  full_name: string;
  email: string;
  phone: string;
  event_count: number;
  last_rsvp_at: string | null;
}

export interface PersonEventEntry {
  workspace_slug: string;
  event_slug: string;
  event_title: string;
  event_starts_at: string;
  rsvp_status: string;
  rsvp_created_at: string;
}

export interface PersonDetail {
  user_id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  phone: string;
  address: {
    street: string;
    city: string;
    zip: string;
    country: string;
    legacy: string;
  };
  emergency_contact: {
    name: string;
    phone: string;
    relationship: string;
  };
  events: PersonEventEntry[];
}

export interface EventCollaborator {
  id: number;
  user_id: number;
  email: string;
  full_name: string;
  created_at: string;
}

export interface ParticipantProfile {
  rsvp_id: number;
  user_id: number;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  phone: string;
  address: {
    street: string;
    city: string;
    zip: string;
    country: string;
    legacy: string;
  };
  emergency_contact: {
    name: string;
    phone: string;
    relationship: string;
  };
}

function findFirstError(value: unknown, path: string): string | null {
  // Skip `detail` na top-level — to už je v `err.message`.
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value) {
    return path ? `${path}: ${value}` : value;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const r = findFirstError(item, path);
      if (r) return r;
    }
    return null;
  }
  if (typeof value === "object") {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      if (!path && key === "detail") continue;
      const sub = (value as Record<string, unknown>)[key];
      const nextPath = path ? `${path}.${key}` : key;
      const r = findFirstError(sub, nextPath);
      if (r) return r;
    }
  }
  return null;
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
   * Handles DRF's serializer error shapes:
   *   - top-level array of messages: `{field: ["msg"]}`
   *   - top-level string: `{field: "msg"}` (our ad-hoc responses)
   *   - nested serializer errors: `{answers: {emergency_contact_phone:
   *     ["This field may not be blank."]}}` — předtím vracelo null
   *     a user viděl jen "Request failed with status 400".
   *
   * Skips the generic `detail` key — that's already exposed as
   * `err.message`. */
  firstFieldError(): string | null {
    return findFirstError(this.data, "");
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
  const isWrite = method !== "GET" && method !== "HEAD";
  if (isWrite) {
    await ensureCsrfToken();
  }
  const isFormData =
    typeof FormData !== "undefined" && init.body instanceof FormData;

  const send = (token: string | null): Promise<Response> => {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(init.body && !isFormData
        ? { "Content-Type": "application/json" }
        : {}),
      ...(init.headers as Record<string, string> | undefined),
    };
    if (token) headers["X-CSRFToken"] = token;
    return fetch(`${API_URL}${path}`, {
      ...init,
      headers,
      credentials: "include",
      // Bypass the browser's HTTP cache for every API call. The
      // backend also sends `Cache-Control: no-store` on /api/*, but
      // that header only governs FUTURE caching — existing cache
      // entries (e.g. iOS Safari served a /me/ response yesterday
      // before the no-store header was deployed) stay valid for
      // their heuristic TTL. `cache: "no-store"` here is the
      // belt-and-braces fix that ignores those stale entries.
      cache: "no-store",
    });
  };

  let res = await send(getCookie("csrftoken"));

  // Auto-retry once when the server rejects our CSRF token. Django
  // rotates the token at login, so after a fresh session the cached
  // cookie is stale; ensureCsrfToken re-fetches a new one and the
  // request succeeds on retry without surfacing the error to the
  // user.
  if (isWrite && res.status === 403) {
    const cloned = res.clone();
    let body: Record<string, unknown> = {};
    try {
      body = (await cloned.json()) as Record<string, unknown>;
    } catch {
      /* ignore */
    }
    const detail = typeof body?.detail === "string" ? body.detail : "";
    if (detail.toLowerCase().includes("csrf")) {
      await fetch(`${API_URL}/api/auth/csrf/`, { credentials: "include" });
      res = await send(getCookie("csrftoken"));
    }
  }

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

export type WorkspaceRole = "owner" | "admin" | "member" | null;

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
  role: WorkspaceRole;
  /** CRM annotations — empty when no profile row exists yet. */
  note?: string;
  tag_ids?: number[];
}

export interface PersonTag {
  id: number;
  name: string;
  /** Optional hex/token; empty falls back to brand color. */
  color: string;
  sort_order: number;
}

export interface WorkspaceInvitationSummary {
  id: number;
  email: string;
  status: string;
  invited_by_name: string;
  created_at: string;
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
  promoteMember: (slug: string, userId: number) =>
    apiFetch<{ user_id: number; role: WorkspaceRole }>(
      `/api/workspaces/${slug}/members/${userId}/promote/`,
      { method: "POST" },
    ),
  demoteMember: (slug: string, userId: number) =>
    apiFetch<{ user_id: number; role: WorkspaceRole }>(
      `/api/workspaces/${slug}/members/${userId}/demote/`,
      { method: "POST" },
    ),
  handoverOwnership: (slug: string, userId: number) =>
    apiFetch<{
      new_owner_id: number;
      old_owner_id: number;
      old_owner_role: WorkspaceRole;
    }>(`/api/workspaces/${slug}/members/${userId}/handover/`, {
      method: "POST",
    }),
  listTags: (slug: string) =>
    apiFetch<PersonTag[]>(`/api/workspaces/${slug}/tags/`),
  createTag: (slug: string, payload: { name: string; color?: string }) =>
    apiFetch<PersonTag>(`/api/workspaces/${slug}/tags/`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateTag: (
    slug: string,
    tagId: number,
    payload: { name?: string; color?: string; sort_order?: number },
  ) =>
    apiFetch<PersonTag>(`/api/workspaces/${slug}/tags/${tagId}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteTag: (slug: string, tagId: number) =>
    apiFetch<void>(`/api/workspaces/${slug}/tags/${tagId}/`, {
      method: "DELETE",
    }),
  setMemberNote: (slug: string, userId: number, note: string) =>
    apiFetch<{ note: string }>(
      `/api/workspaces/${slug}/members/${userId}/note/`,
      { method: "PATCH", body: JSON.stringify({ note }) },
    ),
  attachMemberTag: (slug: string, userId: number, tagId: number) =>
    apiFetch<{ tag_ids: number[] }>(
      `/api/workspaces/${slug}/members/${userId}/tags/${tagId}/`,
      { method: "POST" },
    ),
  detachMemberTag: (slug: string, userId: number, tagId: number) =>
    apiFetch<{ tag_ids: number[] }>(
      `/api/workspaces/${slug}/members/${userId}/tags/${tagId}/`,
      { method: "DELETE" },
    ),
  membersCsvUrl: (slug: string) =>
    `${API_URL}/api/workspaces/${slug}/members.csv`,
  addExistingMember: (
    slug: string,
    userId: number,
    role: "member" | "admin" = "member",
  ) =>
    apiFetch<{ user_id: number; role: WorkspaceRole; created: boolean }>(
      `/api/workspaces/${slug}/members/add/`,
      {
        method: "POST",
        body: JSON.stringify({ user_id: userId, role }),
      },
    ),
  listInvitations: (slug: string) =>
    apiFetch<WorkspaceInvitationSummary[]>(
      `/api/workspaces/${slug}/invitations/`,
    ),
  createInvitation: (
    slug: string,
    email: string,
    role: "member" | "admin" = "member",
  ) =>
    apiFetch<
      | {
          mode: "direct";
          user_id: number;
          role: WorkspaceRole;
          created: boolean;
        }
      | {
          mode: "invited";
          id: number;
          email: string;
          status: string;
          created_at: string;
        }
    >(`/api/workspaces/${slug}/invitations/`, {
      method: "POST",
      body: JSON.stringify({ email, role }),
    }),
  cancelInvitation: (slug: string, invitationId: number) =>
    apiFetch<void>(`/api/workspaces/${slug}/invitations/${invitationId}/`, {
      method: "DELETE",
    }),
  bulkInvite: (
    slug: string,
    emails: string,
    role: "member" | "admin" = "member",
  ) =>
    apiFetch<{
      added: { email: string; role: WorkspaceRole }[];
      invited: { email: string; id: number }[];
      already_member: string[];
      already_invited: string[];
      invalid: { email: string; reason: string }[];
      total_processed: number;
    }>(`/api/workspaces/${slug}/invitations/bulk/`, {
      method: "POST",
      body: JSON.stringify({ emails, role }),
    }),
  getInviteLink: (slug: string) =>
    apiFetch<{ public_invite_token: string; invite_url: string }>(
      `/api/workspaces/${slug}/invite-link/`,
    ),
  generateInviteLink: (slug: string) =>
    apiFetch<{ public_invite_token: string; invite_url: string }>(
      `/api/workspaces/${slug}/invite-link/`,
      { method: "POST" },
    ),
  revokeInviteLink: (slug: string) =>
    apiFetch<{ public_invite_token: string; invite_url: string }>(
      `/api/workspaces/${slug}/invite-link/`,
      { method: "DELETE" },
    ),
  lookupInvitation: (token: string) =>
    apiFetch<{
      email: string;
      status: string;
      workspace: { slug: string; name: string; bio: string };
      invited_by_name: string;
    }>(`/api/workspaces/_/invitations/${token}/`),
  acceptInvitation: (token: string) =>
    apiFetch<{ workspace_slug: string }>(
      `/api/workspaces/_/invitations/${token}/accept/`,
      { method: "POST" },
    ),
  lookupPublicInvite: (token: string) =>
    apiFetch<{ workspace: { slug: string; name: string; bio: string } }>(
      `/api/workspaces/_/join/${token}/`,
    ),
  acceptPublicInvite: (token: string) =>
    apiFetch<{ workspace_slug: string; role: WorkspaceRole; created: boolean }>(
      `/api/workspaces/_/join/${token}/accept/`,
      { method: "POST" },
    ),
  bulkEmailMembers: (
    slug: string,
    payload: { user_ids: number[]; subject: string; body: string },
  ) =>
    apiFetch<{ sent: number; skipped: number }>(
      `/api/workspaces/${slug}/members/bulk-email/`,
      { method: "POST", body: JSON.stringify(payload) },
    ),
  reconcilePayments: async (slug: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiFetch<{
      total_rows: number;
      credits: number;
      matched: Array<{
        tx: {
          date: string | null;
          amount: string;
          variable_symbol: string;
          message: string;
          counterparty: string;
        };
        rsvp_id: number;
        event_title: string;
        user_full_name: string;
        user_email: string;
        amount_mismatch: boolean;
      }>;
      unmatched: Array<{
        date: string | null;
        amount: string;
        variable_symbol: string;
        message: string;
        counterparty: string;
      }>;
      already_paid: Array<{
        date: string | null;
        amount: string;
        variable_symbol: string;
        message: string;
        counterparty: string;
      }>;
    }>(`/api/workspaces/${slug}/payments/reconcile/`, {
      method: "POST",
      body: form,
    });
  },
  mine: () => apiFetch<Workspace[]>("/api/workspaces/mine/"),
  personal: () => apiFetch<Workspace>("/api/workspaces/personal/"),
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

export type CommunityMemberRole = "admin" | "member";

export interface CommunityMemberRecord {
  id: number;
  status: "pending" | "member" | "declined" | "removed";
  role: CommunityMemberRole;
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
  setMemberRole: (
    workspaceSlug: string,
    communitySlug: string,
    memberId: number,
    role: CommunityMemberRole,
  ) =>
    apiFetch<CommunityMemberRecord>(
      `/api/communities/workspaces/${workspaceSlug}/${communitySlug}/members/${memberId}/role/`,
      { method: "POST", body: JSON.stringify({ role }) },
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
  require_phone_on_rsvp?: boolean;
  visibility?: "public" | "invite_only";
  status?: "draft" | "published" | "closed" | "cancelled" | "completed";
  requires_approval?: boolean;
  blocks?: EventBlock[];
  enabled_questionnaire_sections?: QuestionnaireSection[];
  cancellation_reason?: string;
  price_amount?: string | null;
  price_currency?: string;
  price_note?: string;
  payment_in_cash?: boolean;
  billing_profile?: number | null;
  shared_workspace_slugs?: string[];
  required_documents?: RequiredDocumentSpec[];
  /** FK id of a GearList owned by the event creator; null clears it. */
  recommended_gear_list?: number | null;
  risk_checklist?: RiskChecklistItem[];
}

export const events = {
  publicEvent: async (workspaceSlug: string, eventSlug: string) => {
    // Non-owners viewing a draft event get a slim "is_draft_preview"
    // payload (200, not 404) so the public landing page can render a
    // friendly placeholder. For everywhere else that expects a full
    // Event (admin cockpit, participant zone, RSVP form), convert that
    // to a 404 so callers' existing redirect logic kicks in.
    const data = await apiFetch<Event & { is_draft_preview?: boolean }>(
      `/api/events/${workspaceSlug}/${eventSlug}/`,
    );
    if ((data as { is_draft_preview?: boolean }).is_draft_preview) {
      throw new ApiError(404, { detail: "Event not found." });
    }
    return data as Event;
  },
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
  /** Magic-link cancel pro guest RSVP. Endpoint je nezávislý na
   *  workspace/event slug — token sám identifikuje RSVP, anon user
   *  nepotřebuje session. */
  rsvpCancelInfoByToken: (token: string) =>
    apiFetch<{
      event_title: string;
      event_starts_at: string;
      workspace_name: string;
      status: string;
      user_name: string;
    }>(`/api/events/rsvp/cancel-by-token/?token=${encodeURIComponent(token)}`),
  rsvpCancelByToken: (token: string) =>
    apiFetch<{ status: string }>(
      `/api/events/rsvp/cancel-by-token/`,
      { method: "POST", body: JSON.stringify({ token }) },
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
  /** V2.1 — extract a draft Event payload from a Notion URL.
   *  Returns a slim object (subset of Event fields) the create form
   *  can mount as `initial`. Does NOT persist. */
  ingestFromSource: (url: string) =>
    apiFetch<EventDraftFromSource>("/api/events/from-source/", {
      method: "POST",
      body: JSON.stringify({ url }),
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
  trashList: () => apiFetch<EventSummary[]>("/api/events/trash/"),
  softDelete: (workspaceSlug: string, eventSlug: string) =>
    apiFetch<Event>(`/api/events/${workspaceSlug}/${eventSlug}/delete/`, {
      method: "POST",
    }),
  restore: (workspaceSlug: string, eventSlug: string) =>
    apiFetch<Event>(`/api/events/${workspaceSlug}/${eventSlug}/restore/`, {
      method: "POST",
    }),
  purge: (workspaceSlug: string, eventSlug: string) =>
    apiFetch<void>(`/api/events/${workspaceSlug}/${eventSlug}/purge/`, {
      method: "POST",
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
  participantProfile: (
    workspaceSlug: string,
    eventSlug: string,
    rsvpId: number,
  ) =>
    apiFetch<ParticipantProfile>(
      `/api/events/${workspaceSlug}/${eventSlug}/rsvps/${rsvpId}/profile/`,
    ),
  people: () => apiFetch<PersonSummary[]>("/api/auth/me/people/"),
  person: (userId: number) =>
    apiFetch<PersonDetail>(`/api/auth/me/people/${userId}/`),
  listCollaborators: (workspaceSlug: string, eventSlug: string) =>
    apiFetch<EventCollaborator[]>(
      `/api/events/${workspaceSlug}/${eventSlug}/collaborators/`,
    ),
  addCollaborator: (
    workspaceSlug: string,
    eventSlug: string,
    email: string,
  ) =>
    apiFetch<EventCollaborator>(
      `/api/events/${workspaceSlug}/${eventSlug}/collaborators/`,
      { method: "POST", body: JSON.stringify({ email }) },
    ),
  removeCollaborator: (
    workspaceSlug: string,
    eventSlug: string,
    userId: number,
  ) =>
    apiFetch<void>(
      `/api/events/${workspaceSlug}/${eventSlug}/collaborators/${userId}/`,
      { method: "DELETE" },
    ),
  rejectRsvp: (workspaceSlug: string, eventSlug: string, rsvpId: number) =>
    apiFetch<RSVPRecord>(
      `/api/events/${workspaceSlug}/${eventSlug}/rsvps/${rsvpId}/reject/`,
      { method: "POST" },
    ),
  /** Owner-side hard-remove libovolného RSVP — typicky duplikátní
   *  registrace, kterou roster přihlásil dvakrát. `rejectRsvp` umí jen
   *  `pending_approval`; tohle je univerzální. */
  removeRsvp: (workspaceSlug: string, eventSlug: string, rsvpId: number) =>
    apiFetch<RSVPRecord>(
      `/api/events/${workspaceSlug}/${eventSlug}/rsvps/${rsvpId}/remove/`,
      { method: "POST" },
    ),
  /** Skryje "Možný duplikát" badge na konkrétním RSVP — owner explicitně
   *  potvrdil "není to duplikát" (otec a syn). Per-event, idempotentní. */
  dismissDuplicateHint: (
    workspaceSlug: string,
    eventSlug: string,
    rsvpId: number,
  ) =>
    apiFetch<RSVPRecord>(
      `/api/events/${workspaceSlug}/${eventSlug}/rsvps/${rsvpId}/duplicate-dismiss/`,
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
  toggleRsvpOrganizer: (
    workspaceSlug: string,
    eventSlug: string,
    rsvpId: number,
    isOrganizer: boolean,
  ) =>
    apiFetch<RSVPRecord>(
      `/api/events/${workspaceSlug}/${eventSlug}/rsvps/${rsvpId}/organizer/`,
      {
        method: "POST",
        body: JSON.stringify({ is_organizer: isOrganizer }),
      },
    ),
  toggleGearChecklistItem: (
    workspaceSlug: string,
    eventSlug: string,
    itemId: number,
    isChecked: boolean,
  ) =>
    apiFetch<{ gear_checklist: Record<string, string> }>(
      `/api/events/${workspaceSlug}/${eventSlug}/rsvp/gear-checklist/`,
      {
        method: "PATCH",
        body: JSON.stringify({ item_id: itemId, is_checked: isChecked }),
      },
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
  checklist: (workspaceSlug: string, eventSlug: string) =>
    apiFetch<EventChecklist>(
      `/api/events/${workspaceSlug}/${eventSlug}/checklist/`,
    ),
  addChecklistItem: (
    workspaceSlug: string,
    eventSlug: string,
    payload: { title: string; description?: string; category?: string },
  ) =>
    apiFetch<ChecklistManualItem>(
      `/api/events/${workspaceSlug}/${eventSlug}/checklist/items/`,
      { method: "POST", body: JSON.stringify(payload) },
    ),
  updateChecklistItem: (
    workspaceSlug: string,
    eventSlug: string,
    itemId: number,
    payload: Partial<{
      title: string;
      description: string;
      category: string;
      done: boolean;
      sort_order: number;
      remind_at: string | null;
      remind_audience: ChecklistRemindAudience;
    }>,
  ) =>
    apiFetch<ChecklistManualItem>(
      `/api/events/${workspaceSlug}/${eventSlug}/checklist/items/${itemId}/`,
      { method: "PATCH", body: JSON.stringify(payload) },
    ),
  sendChecklistReminderNow: (
    workspaceSlug: string,
    eventSlug: string,
    itemId: number,
  ) =>
    apiFetch<ChecklistManualItem>(
      `/api/events/${workspaceSlug}/${eventSlug}/checklist/items/${itemId}/send-now/`,
      { method: "POST" },
    ),
  deleteChecklistItem: (
    workspaceSlug: string,
    eventSlug: string,
    itemId: number,
  ) =>
    apiFetch<void>(
      `/api/events/${workspaceSlug}/${eventSlug}/checklist/items/${itemId}/`,
      { method: "DELETE" },
    ),
  addChecklistFromPreset: (
    workspaceSlug: string,
    eventSlug: string,
    key: string,
  ) =>
    apiFetch<ChecklistManualItem>(
      `/api/events/${workspaceSlug}/${eventSlug}/checklist/from-preset/`,
      { method: "POST", body: JSON.stringify({ key }) },
    ),
};

/** Discussion wall API — works against either a workspace or an event.
 *  Two URL families share the same shape; pass the parent in `scope`. */
export const discussions = {
  listWorkspace: (slug: string) =>
    apiFetch<DiscussionTopic[]>(`/api/discussions/workspace/${slug}/topics/`),
  createWorkspaceTopic: (slug: string, payload: TopicWritePayload) =>
    apiFetch<DiscussionTopicDetail>(
      `/api/discussions/workspace/${slug}/topics/`,
      { method: "POST", body: JSON.stringify(payload) },
    ),
  workspaceTopic: (slug: string, topicId: number) =>
    apiFetch<DiscussionTopicDetail>(
      `/api/discussions/workspace/${slug}/topics/${topicId}/`,
    ),
  updateWorkspaceTopic: (
    slug: string,
    topicId: number,
    payload: Partial<TopicWritePayload> & { locked?: boolean },
  ) =>
    apiFetch<DiscussionTopicDetail>(
      `/api/discussions/workspace/${slug}/topics/${topicId}/`,
      { method: "PATCH", body: JSON.stringify(payload) },
    ),
  deleteWorkspaceTopic: (slug: string, topicId: number) =>
    apiFetch<void>(
      `/api/discussions/workspace/${slug}/topics/${topicId}/`,
      { method: "DELETE" },
    ),
  addWorkspaceComment: (
    slug: string,
    topicId: number,
    body: string,
    parent: number | null = null,
    attachment: File | null = null,
  ) => {
    if (attachment) {
      const fd = new FormData();
      fd.append("body", body);
      if (parent != null) fd.append("parent", String(parent));
      fd.append("attachment", attachment);
      return apiFetch<DiscussionComment>(
        `/api/discussions/workspace/${slug}/topics/${topicId}/comments/`,
        { method: "POST", body: fd },
      );
    }
    return apiFetch<DiscussionComment>(
      `/api/discussions/workspace/${slug}/topics/${topicId}/comments/`,
      { method: "POST", body: JSON.stringify({ body, parent }) },
    );
  },
  deleteWorkspaceComment: (
    slug: string,
    topicId: number,
    commentId: number,
  ) =>
    apiFetch<void>(
      `/api/discussions/workspace/${slug}/topics/${topicId}/comments/${commentId}/`,
      { method: "DELETE" },
    ),
  listEvent: (workspaceSlug: string, eventSlug: string) =>
    apiFetch<DiscussionTopic[]>(
      `/api/discussions/event/${workspaceSlug}/${eventSlug}/topics/`,
    ),
  createEventTopic: (
    workspaceSlug: string,
    eventSlug: string,
    payload: TopicWritePayload,
  ) =>
    apiFetch<DiscussionTopicDetail>(
      `/api/discussions/event/${workspaceSlug}/${eventSlug}/topics/`,
      { method: "POST", body: JSON.stringify(payload) },
    ),
  eventTopic: (
    workspaceSlug: string,
    eventSlug: string,
    topicId: number,
  ) =>
    apiFetch<DiscussionTopicDetail>(
      `/api/discussions/event/${workspaceSlug}/${eventSlug}/topics/${topicId}/`,
    ),
  updateEventTopic: (
    workspaceSlug: string,
    eventSlug: string,
    topicId: number,
    payload: Partial<TopicWritePayload> & { locked?: boolean },
  ) =>
    apiFetch<DiscussionTopicDetail>(
      `/api/discussions/event/${workspaceSlug}/${eventSlug}/topics/${topicId}/`,
      { method: "PATCH", body: JSON.stringify(payload) },
    ),
  deleteEventTopic: (
    workspaceSlug: string,
    eventSlug: string,
    topicId: number,
  ) =>
    apiFetch<void>(
      `/api/discussions/event/${workspaceSlug}/${eventSlug}/topics/${topicId}/`,
      { method: "DELETE" },
    ),
  addEventComment: (
    workspaceSlug: string,
    eventSlug: string,
    topicId: number,
    body: string,
    parent: number | null = null,
    attachment: File | null = null,
  ) => {
    if (attachment) {
      const fd = new FormData();
      fd.append("body", body);
      if (parent != null) fd.append("parent", String(parent));
      fd.append("attachment", attachment);
      return apiFetch<DiscussionComment>(
        `/api/discussions/event/${workspaceSlug}/${eventSlug}/topics/${topicId}/comments/`,
        { method: "POST", body: fd },
      );
    }
    return apiFetch<DiscussionComment>(
      `/api/discussions/event/${workspaceSlug}/${eventSlug}/topics/${topicId}/comments/`,
      { method: "POST", body: JSON.stringify({ body, parent }) },
    );
  },
  deleteEventComment: (
    workspaceSlug: string,
    eventSlug: string,
    topicId: number,
    commentId: number,
  ) =>
    apiFetch<void>(
      `/api/discussions/event/${workspaceSlug}/${eventSlug}/topics/${topicId}/comments/${commentId}/`,
      { method: "DELETE" },
    ),
  toggleWorkspaceLike: (slug: string, topicId: number, liked: boolean) =>
    apiFetch<TopicLikeResponse>(
      `/api/discussions/workspace/${slug}/topics/${topicId}/like/`,
      { method: liked ? "POST" : "DELETE" },
    ),
  toggleEventLike: (
    workspaceSlug: string,
    eventSlug: string,
    topicId: number,
    liked: boolean,
  ) =>
    apiFetch<TopicLikeResponse>(
      `/api/discussions/event/${workspaceSlug}/${eventSlug}/topics/${topicId}/like/`,
      { method: liked ? "POST" : "DELETE" },
    ),
  toggleWorkspaceCommentLike: (
    slug: string,
    topicId: number,
    commentId: number,
    liked: boolean,
  ) =>
    apiFetch<CommentLikeResponse>(
      `/api/discussions/workspace/${slug}/topics/${topicId}/comments/${commentId}/like/`,
      { method: liked ? "POST" : "DELETE" },
    ),
  toggleEventCommentLike: (
    workspaceSlug: string,
    eventSlug: string,
    topicId: number,
    commentId: number,
    liked: boolean,
  ) =>
    apiFetch<CommentLikeResponse>(
      `/api/discussions/event/${workspaceSlug}/${eventSlug}/topics/${topicId}/comments/${commentId}/like/`,
      { method: liked ? "POST" : "DELETE" },
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
  todo: () => apiFetch<TodoItem[]>("/api/auth/me/todo/"),
  getNotionIntegration: () =>
    apiFetch<{ connected: boolean }>(
      "/api/auth/me/integrations/notion/",
    ),
  setNotionIntegration: (token: string) =>
    apiFetch<{ connected: boolean }>(
      "/api/auth/me/integrations/notion/",
      { method: "PUT", body: JSON.stringify({ token }) },
    ),
  removeNotionIntegration: () =>
    apiFetch<{ connected: boolean }>(
      "/api/auth/me/integrations/notion/",
      { method: "DELETE" },
    ),
  getAnthropicIntegration: () =>
    apiFetch<{ connected: boolean }>(
      "/api/auth/me/integrations/anthropic/",
    ),
  setAnthropicIntegration: (token: string) =>
    apiFetch<{ connected: boolean }>(
      "/api/auth/me/integrations/anthropic/",
      { method: "PUT", body: JSON.stringify({ token }) },
    ),
  removeAnthropicIntegration: () =>
    apiFetch<{ connected: boolean }>(
      "/api/auth/me/integrations/anthropic/",
      { method: "DELETE" },
    ),
  listApiTokens: () =>
    apiFetch<APITokenInfo[]>("/api/auth/me/api-tokens/"),
  createApiToken: (label: string) =>
    apiFetch<APITokenCreated>("/api/auth/me/api-tokens/", {
      method: "POST",
      body: JSON.stringify({ label }),
    }),
  revokeApiToken: (id: number) =>
    apiFetch<void>(`/api/auth/me/api-tokens/${id}/`, { method: "DELETE" }),
  billingProfiles: () =>
    apiFetch<BillingProfile[]>("/api/auth/me/billing-profiles/"),
  createBillingProfile: (payload: BillingProfileWritePayload) =>
    apiFetch<BillingProfile>("/api/auth/me/billing-profiles/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateBillingProfile: (
    id: number,
    payload: Partial<BillingProfileWritePayload>,
  ) =>
    apiFetch<BillingProfile>(`/api/auth/me/billing-profiles/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteBillingProfile: (id: number) =>
    apiFetch<void>(`/api/auth/me/billing-profiles/${id}/`, {
      method: "DELETE",
    }),
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

// ===========================================================================
// Gear lists
// ===========================================================================

export interface GearItem {
  id: number;
  name: string;
  weight_g: number | null;
  url: string;
  /** URL with the user's affiliate params applied for matching domains.
   *  Fall back to `url` when no partner matches. Always use this for
   *  outbound clicks. */
  display_url: string;
  /** Category as a name (resolved from FK with legacy-string fallback). */
  category: string;
  /** Canonical FK to GearCategory. Null when the item is uncategorised. */
  category_id: number | null;
  note: string;
  created_at: string;
  updated_at: string;
}

export interface AffiliatePartner {
  domain: string;
  params: Record<string, string>;
}

export interface GearListEntry {
  id: number;
  item: GearItem;
  quantity: number;
  sort_order: number;
  note: string;
  /** Outbound click count — owner-only, 0 on public payloads. */
  click_count?: number;
}

export type GearListVisibility = "private" | "unlisted" | "public";

export interface GearList {
  id: number;
  name: string;
  description: string;
  entries: GearListEntry[];
  item_count: number;
  total_weight_g: number;
  slug: string;
  visibility: GearListVisibility;
  created_at: string;
  updated_at: string;
}

export interface PublicGearList {
  name: string;
  description: string;
  slug: string;
  entries: GearListEntry[];
  item_count: number;
  total_weight_g: number;
  owner_name: string;
  created_at: string;
  updated_at: string;
}

export interface RecommendedGearListEntry {
  id: number;
  name: string;
  category: string;
  quantity: number;
}

export interface RecommendedGearList {
  id: number;
  name: string;
  slug: string;
  entries: RecommendedGearListEntry[];
}

export interface GearItemWritePayload {
  name?: string;
  weight_g?: number | null;
  url?: string;
  /** Preferred: FK id of a GearCategory owned by the caller. */
  category_id?: number | null;
  /** Legacy free-text fallback; backend auto-creates the category. */
  category?: string;
  note?: string;
}

export interface GearCategory {
  id: number;
  name: string;
  sort_order: number;
  created_at: string;
}

export const gear = {
  listItems: () => apiFetch<GearItem[]>("/api/gear/items/"),
  createItem: (payload: GearItemWritePayload) =>
    apiFetch<GearItem>("/api/gear/items/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateItem: (id: number, payload: GearItemWritePayload) =>
    apiFetch<GearItem>(`/api/gear/items/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteItem: (id: number) =>
    apiFetch<void>(`/api/gear/items/${id}/`, { method: "DELETE" }),

  listLists: () => apiFetch<GearList[]>("/api/gear/lists/"),
  createList: (name: string, description?: string) =>
    apiFetch<GearList>("/api/gear/lists/", {
      method: "POST",
      body: JSON.stringify({ name, description: description ?? "" }),
    }),
  updateList: (
    id: number,
    payload: {
      name?: string;
      description?: string;
      visibility?: GearListVisibility;
    },
  ) =>
    apiFetch<GearList>(`/api/gear/lists/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteList: (id: number) =>
    apiFetch<void>(`/api/gear/lists/${id}/`, { method: "DELETE" }),
  getList: (id: number) => apiFetch<GearList>(`/api/gear/lists/${id}/`),
  addItemToList: (listId: number, itemId: number, quantity = 1) =>
    apiFetch<GearListEntry>(`/api/gear/lists/${listId}/items/`, {
      method: "POST",
      body: JSON.stringify({ item_id: itemId, quantity }),
    }),
  updateListEntry: (
    listId: number,
    entryId: number,
    payload: { quantity?: number; note?: string; sort_order?: number },
  ) =>
    apiFetch<GearListEntry>(
      `/api/gear/lists/${listId}/items/${entryId}/`,
      { method: "PATCH", body: JSON.stringify(payload) },
    ),
  removeListEntry: (listId: number, entryId: number) =>
    apiFetch<void>(`/api/gear/lists/${listId}/items/${entryId}/`, {
      method: "DELETE",
    }),
  listCategories: () =>
    apiFetch<GearCategory[]>("/api/gear/categories/"),
  createCategory: (name: string) =>
    apiFetch<GearCategory>("/api/gear/categories/", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  updateCategory: (
    id: number,
    payload: { name?: string; sort_order?: number },
  ) =>
    apiFetch<GearCategory>(`/api/gear/categories/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteCategory: (id: number) =>
    apiFetch<void>(`/api/gear/categories/${id}/`, { method: "DELETE" }),
  importCsv: async (file: File): Promise<GearImportResult> => {
    const form = new FormData();
    form.append("file", file);
    return apiFetch<GearImportResult>("/api/gear/import_csv/", {
      method: "POST",
      // Let the browser set the multipart boundary header.
      body: form,
    });
  },
};

export interface GearImportResult {
  rows: number;
  items_created: number;
  items_backfilled: number;
  lists_total: number;
  edges_created: number;
}

// ---------------------------------------------------------------------------
// Notifications (bell feed)
// ---------------------------------------------------------------------------

export interface NotificationItem {
  id: number;
  kind: string;
  title: string;
  body: string;
  link: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  is_read: boolean;
  created_at: string;
}

export const notifications = {
  list: (params: { unreadOnly?: boolean; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.unreadOnly) qs.set("unread_only", "1");
    if (params.limit) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs}` : "";
    return apiFetch<NotificationItem[]>(`/api/notifications/${suffix}`);
  },
  count: () =>
    apiFetch<{ unread: number }>("/api/notifications/count/"),
  markRead: (id: number) =>
    apiFetch<NotificationItem>(`/api/notifications/${id}/read/`, {
      method: "POST",
    }),
  markAllRead: () =>
    apiFetch<{ flipped: number }>("/api/notifications/read-all/", {
      method: "POST",
    }),
};

export interface AuditEntry {
  id: number;
  action: string;
  summary: string;
  target_type: string;
  target_id: string;
  payload: Record<string, unknown>;
  created_at: string;
  actor: { id: number; full_name: string; email: string } | null;
}

export interface AuditListResponse {
  total: number;
  page: number;
  page_size: number;
  results: AuditEntry[];
}

export const audit = {
  list: (params: {
    workspace: string;
    action?: string;
    target_type?: string;
    target_id?: string;
    after?: string;
    before?: string;
    page?: number;
    page_size?: number;
  }) => {
    const qs = new URLSearchParams();
    qs.set("workspace", params.workspace);
    if (params.action) qs.set("action", params.action);
    if (params.target_type) qs.set("target_type", params.target_type);
    if (params.target_id) qs.set("target_id", params.target_id);
    if (params.after) qs.set("after", params.after);
    if (params.before) qs.set("before", params.before);
    if (params.page) qs.set("page", String(params.page));
    if (params.page_size) qs.set("page_size", String(params.page_size));
    return apiFetch<AuditListResponse>(`/api/audit/?${qs}`);
  },
};
