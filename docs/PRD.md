# OLAF — Product Requirements Document

**Version**: v1.1 — Implementation Edition
**Owner**: Lubomir "Olaf" Hulin
**Status**: Source of truth for V1 build. Supersedes the original Notion draft (v1.0).

A community-and-event platform for adventure organizers, sports communities, and corporate event hosts. Built on the conviction that great events happen when a tight-knit crew shares both the planning *and* the journey.

> **What changed from v1.0**: V1 scope was tightened against fifteen explicit decisions (recorded in `docs/decisions.md` once written, summarised inline below). The wall feed, personal gear catalogue, sensitive-health data on user profiles, password-step-up signatures, web push, billing fields, the audit-log viewer UI, and the onboarding wizard are all deferred to V1.5+. The launch milestone is now "Olaf Adventures runs a real event end-to-end on OLAF", with no calendar deadline.

---

## 1. Executive Summary

OLAF is a multi-tenant SaaS platform that lets Creators (adventure organizers, sports communities, corporate event hosts) spin up a branded workspace, gather members into Communities, and run Events — from a two-hour group run to a four-day mountain trek — with RSVPs, gear checklists, GPX tracks, waivers, and per-event data collection in one place.

Each Creator owns one Workspace. Each Workspace hosts one or more Communities (member rosters) and Events. Each Event has a public landing page, RSVP flow, optional questionnaire, optional gear checklist, optional creator-supplied documents to acknowledge, and optional participant uploads.

Unlike **Eventbrite** (transactional ticketing for public events) or **Meetup** (free-form public groups), OLAF is purpose-built for **organizer-owned communities** that combine soft membership (approval-based, invite-only) with hard event logistics (waivers, GPX, gear lists, custom questionnaires).

The first reference tenant is **Olaf Adventures** — the founder's outdoor community. The platform is built tenant-generic from day one so other Creators (B2C solo organizers, B2B teambuilding hosts) can onboard later.

---

## 2. Goals & Non-Goals

### Goals (V1)

- Let a Creator stand up a workspace, organise members into Communities, and run a multi-day outdoor event end-to-end (RSVP, questionnaire, gear list, document acknowledgement, GPX, reminders, cancellation) without spreadsheets, email threads, or external form tools.
- Replace the typical organizer toolchain (Google Forms + WhatsApp + Excel + emailed waivers) with one PWA.
- Be production-ready for Olaf Adventures as the launch tenant: one Workspace, one or more Communities, multi-day Events, GPX, document acknowledgement, custom questionnaire, 20–100 member rosters.
- Be GDPR-compliant by design (EU-hosted, data minimization, audit log, right to delete).
- Be free in V1. No monetization until the product proves itself.

### Non-Goals (V1)

| Out of scope in V1            | Deferred to                                    |
| ----------------------------- | ---------------------------------------------- |
| Payments / paid events        | V2 (Stripe + invoicing)                        |
| Native iOS/Android apps       | V3                                             |
| Czech UI                      | V2 (data model is i18n-ready from day one)     |
| OAuth / SSO logins            | V1.5 (Google, Microsoft, Apple)                |
| SMS notifications + step-up   | V2                                             |
| Community wall feed           | V1.5 (posts, comments, reactions, pinning)     |
| Personal gear catalogue       | V1.5                                           |
| Web push notifications        | V1.5 (V1 ships PWA shell, email channel only)  |
| Sensitive health data on profile | Collected only as event-scoped questionnaire fields with 90-day retention |
| Onboarding wizard             | V1.5 (V1 = empty dashboard + contextual prompts) |
| Billing profile fields        | V2 (collected only when payments land)         |
| Audit log viewer UI + CSV export | V1.5 (V1 = write side only, queryable via Django admin) |
| GDPR data export (portability) | V1.5                                          |
| 30-day soft-delete buffer     | V1.5                                           |
| Embedded map (Mapy.cz/Leaflet)| V1.5 (V1 = plain Google Maps link)             |
| GPX preview rendering         | V1.5 (V1 = file upload + download)             |
| Affiliate gear marketplace    | V3                                             |
| AI features                   | V3                                             |
| Custom domain mapping         | V2 Pro tier                                    |

---

## 3. Target Users & Use Cases

### 3.1 Personas

1. **Olaf the Organizer** (B2C solo Creator, primary). Runs an outdoor community in spare time + leads multi-day camps as a side business. 1–3 Communities, 50–200 total members, 10–50 events per year. Pain: juggles Google Forms, WhatsApp, paper waivers, Excel. Wants: one tool for Community + Events + Participants + Documents.

2. **Marta the Member** (B2C member, primary). Hobby runner / outdoor enthusiast in 1–3 Communities. Pain: pinged on five channels; loses waivers and gear lists. Wants: one place to see what's coming, RSVP, fetch the gear list, acknowledge the waiver, get reminded the day before.

3. **The Corporate Host** (B2B Creator, secondary). HR / People Ops, or CEO directly. Plans 2–6 internal events per year. Often delegates operational work to an executive assistant. Wants: invite-only event, easy delegation, branded look, audit trail.

4. **Sue the Assistant** (B2B operator, secondary). Executive assistant doing 80 % of the legwork: chasing replies, reminding people to acknowledge documents, uploading rosters. Wants: delegated Event Admin access with a clear "who still hasn't replied / signed / uploaded" view.

### 3.2 Core V1 use cases

1. **Spin up a Community.** Olaf creates "Olaf Trail Running" with approval-based membership, paints a cover image, and invites 30 emails. 25 accept; 5 pending in his queue.
2. **Publish an event.** Olaf creates "Spring Camp Beskydy" — 4-day, gear list with 18 items, custom questionnaire (T-shirt size, dietary, experience level), waiver PDF, GPX route. He shares the event URL on Instagram.
3. **RSVP and prep.** Marta opens the link, registers, RSVPs *yes*, fills the questionnaire, uploads her insurance PDF, ticks gear items she has, acknowledges the waiver.
4. **Day-before reminder.** Email lands in Marta's inbox: "Spring Camp starts tomorrow. Meeting point: …" with the GPX link.
5. **Corporate teambuilding.** ACME's CEO creates an invite-only event for 12 employees, then delegates Event Admin rights to Sue. Sue invites the 12, chases the laggards, exports a roster CSV with dietary info, closes the event post-fact.
6. **Cancel an event.** A storm rolls in. Olaf cancels the camp; all confirmed RSVPs receive an email within seconds with the reason.
7. **Dashboard health check.** Olaf opens his Creator dashboard and sees: upcoming events, attendance rate, no-shows, pending membership approvals.

### 3.3 Sizing

- Communities per workspace: typical 2–5, soft warning at 10.
- Members per Community: typical 20–50, soft warning at 200.
- Events per workspace per year: typical 10–50.
- Concurrent active Creators (planet-wide) in V1: under 100. Architecture must scale to 10 000 — no sharding or aggressive caching needed in V1.

---

## 4. Feature Specifications

### 4.1 Authentication

**Registration**
- Email + password.
- Email verification required (token link, 24 h expiry).
- Password: min 10 chars, ≥1 letter, ≥1 digit. Stored Argon2id.
- Required at registration: first name, last name. Optional: phone.

**Login**
- Email + password.
- Forgot-password flow (email reset link, 1 h expiry).
- Session: HTTP-only secure cookie, SameSite=Lax, 30-day rolling expiry.

**Rate limits** (PRD §7)
- Registration: 5 per IP per hour.
- Login attempts: 5 per IP per 15 min.

**No onboarding wizard in V1.** After email verification, the user is dropped on the dashboard. Contextual prompts handle the first-time flow: an empty dashboard surfaces a "Create your first event" CTA which inline-asks for a workspace name on first click.

### 4.2 User Profile

| Section                | Fields                                                                 |
| ---------------------- | ---------------------------------------------------------------------- |
| Identity & contact     | First name, last name, display name, avatar (max 2 MB), email, phone, DOB, address |
| Emergency contact      | Name, phone, relationship (free-text)                                  |
| Activity & experience  | Fitness level (beginner / intermediate / advanced), sport tags, bio    |
| Notification prefs     | Email-only matrix (see §4.9)                                           |
| Account actions        | Change password, manage sessions, delete account                       |

**Explicitly not on the profile in V1**: medical/health data, blood type, billing fields (IČO/DIČ/legal name), personal gear catalogue.
- Medical/health data is collected per-event via questionnaire fields with 90-day post-event retention.
- Billing fields land in V2 with the payments rollout.
- Personal gear catalogue lands in V1.5.

### 4.3 Creator Workspaces (multi-tenancy)

Every Creator account owns exactly one Workspace. Workspace is the tenant unit — all Communities, Events, GearItems, and audit log entries live under it.

**Workspace settings**
- Display name, slug (lowercase, hyphenated, ASCII, max 50 chars, unique platform-wide, immutable after first publish, reserved-path list rejected).
- Cover image, logo, brand accent color (single hex).
- Bio (rich text), public location, social links.
- Visibility (`public` / `unlisted` / `private`).
- Default IANA timezone.

**Reserved workspace slugs** (cannot be used by Creators):
`app`, `api`, `static`, `admin`, `login`, `signup`, `signin`, `signout`, `logout`, `register`, `dashboard`, `settings`, `account`, `pricing`, `legal`, `terms`, `privacy`, `about`, `help`, `contact`, `blog`, `invite`, `e`, `r`, `g`, `c`, `i`, `www`, `mail`, `mx`, `ns`, `assets`.

**Public profile page** (`olaf.events/{slug}`): cover, logo, name, bio, list of public Communities, next 6 upcoming public events. Open Graph + Twitter Card meta. Visibility honored (`public` indexable, `unlisted` direct-link-only, `private` 404 to non-members).

**Workspace Owner role**
- Full control: create / edit / delete Communities and Events, change workspace settings, invite Event Admins.
- Multiple Owners allowed; cannot demote the last Owner.

**V1 simplification**: the "create workspace" UI is deferred to V1.5. Olaf Adventures' workspace is seeded via a Django data migration. New tenants in V1 are onboarded by the platform admin via Django admin.

### 4.4 Communities

A Community in V1 is **a roster of members + a list of events**. The wall feed (posts, comments, reactions, pinning, GPX attachments on posts) is deferred to V1.5.

**Community settings**
- Name, slug (unique within workspace), description, cover.
- Visibility: `private` / `unlisted` / `public`.
- Membership policy: `approval-based` (default) or `invite-only`.
- Member-to-member visibility toggle (on by default).

**Membership**
- Join requests:
  - `approval-based`: user clicks "Request to join" → request appears in Owner's queue.
  - `invite-only`: members join via emailed invite link (30-day token).
- Bulk invite via paste-100-emails textarea (CSV upload deferred to V1.5).
- Member tags (free-text, used for filtering and future newsletter segmentation).
- Leave: one-click with confirmation.
- Remove member: Owner action; removed user gets an email.

### 4.5 Events

**Event fields**
- Title, cover image, description (rich text).
- Start datetime, end datetime, timezone (defaults to workspace TZ).
- Location: free-text address + auto-rendered `https://maps.google.com/?q={address}` link. No embedded map in V1.
- Meeting point (separate free-text).
- Capacity (optional; unset = unlimited).
- Waitlist enabled (default on if capacity set).
- Visibility: `public` / `community` / `invite-only`.
- Sharing destinations: one or more Communities in the workspace.

**GPX (V1)**
- Upload up to 5 files per event, 5 MB each.
- Members can download.
- **No map preview in V1.** File metadata (filename, size) only.

**Custom questionnaire (V1 simplified field types)**
- `short_text`, `long_text`, `single_select`, `checkbox`.
- (V1.5 adds: `multi_select`, `number`, `date`.)
- Per field: label, optional help text, required flag.
- Answers stored per-RSVP as JSONB.

**Event checklist** (gear list, see §4.10)
- Per-event list of GearItems with required / recommended flag.
- Each participant has independent tick state ("I have this" / "I need this").

**Documents to acknowledge** (Creator-supplied)
- 0–N PDFs the participant must acknowledge before RSVP is confirmed.
- Per document: title, PDF (max 10 MB), description, required vs optional.
- Acknowledgement mechanism: see §4.7.

**Documents to upload** (participant-supplied)
- 0–N upload requirements (e.g. travel insurance).
- Per requirement: title, description, accepted types (PDF / image), max size, required flag.
- Files private to Creator + participant.

**Event landing page** (`olaf.events/{workspace-slug}/e/{event-slug}` for public events): cover, title, time, location with map link, meeting point, description, gear preview, RSVP CTA. OG + Twitter Card meta.

**Status lifecycle**
- `draft` — Creator editing; visible to Creator only.
- `published` — RSVPs open.
- `closed` — RSVPs closed (Creator action or capacity full with waitlist disabled). Page remains visible.
- `cancelled` — Creator cancelled; all RSVPs notified; page remains visible with cancelled banner + reason.
- `completed` — auto-transition after end datetime.

### 4.6 RSVP & Booking

**RSVP states per participant per event**
- `yes` — confirmed.
- `maybe` — interested.
- `no` — declined.
- `waitlist` — capacity full.
- `pending_approval` — for events that require Creator approval after questionnaire submission.

**Public RSVP flow**
1. Visitor lands on event page → clicks "RSVP yes".
2. If not logged in → light registration (email + name + password).
3. Fills custom questionnaire (if any).
4. Acknowledges required documents (if any).
5. Uploads required participant documents (if any). Skippable until event start if Creator allows.
6. RSVP created in `yes` (or `pending_approval`).
7. Confirmation email.
8. If capacity reached → subsequent RSVPs land in `waitlist`.

**Invite-only flow** uses a tokenised email link (30-day expiry) instead of step 1.

**Changing RSVP**
- Member may change RSVP at any time before event start.
- `yes` → `no` after waitlist exists auto-promotes the FIFO first waitlister with email notification.

**Cancellation (Creator)**
- "Cancel event" → confirmation modal with optional reason.
- All RSVPs (yes / maybe / waitlist) get an email.
- Event page stays visible with cancelled banner.

### 4.7 Documents & Acknowledgement (V1)

> **V1 deliberately ships a lighter mechanism than the original PRD proposed.** Password step-up, scroll-to-end enforcement, and signing-certificate emails are deferred to V2 alongside Signi / DocuSign integration. V1's mechanism is an audit-logged acknowledgement — sufficient for non-binding informational waivers (health acknowledgement, GDPR consent).

**Creator side**
- PDF only in V1, max 10 MB. Stored in Azure Blob Storage with private ACLs and SAS URLs for time-bound participant access.

**Participant side**
1. User opens the document (browser-native PDF viewer or pdf.js).
2. Toggles "I have read and agree".
3. `Acknowledgement` record is written (see schema).

**Acknowledgement record**

| Field         | Source                                  |
| ------------- | --------------------------------------- |
| user_id       | Authenticated session                   |
| document_id   | Acknowledged document                   |
| event_id      | Scoping event                           |
| rsvp_id       | Linking RSVP                            |
| signed_at     | Server timestamp                        |
| ip_address    | Client IP                               |
| user_agent    | Client User-Agent                       |
| session_id    | Session in which acknowledgement happened |
| document_hash | SHA-256 of the PDF bytes at acknowledgement time |

**Tamper evidence**: any later modification of the PDF invalidates the hash chain.

**Account deletion impact**: acknowledgement records are anonymized (user_id replaced with `deleted_user_<hash>`), not deleted, per GDPR vs audit retention balance. Documented in the privacy policy.

### 4.8 Roles & Permissions

| Role         | Scope            | Granted by                              | Can do                                                                 |
| ------------ | ---------------- | --------------------------------------- | ---------------------------------------------------------------------- |
| Member       | Per Community / per event | Implicit (membership)        | RSVP, view roster (if Community setting allows).                       |
| Event Admin  | Per event        | Owner                                   | Edit event details, manage RSVPs, send announcements, view participant data, cancel the event. *Cannot* delete events or change workspace settings. |
| Owner        | Per workspace    | Founder or promotion by another Owner   | All Event Admin powers + create / delete Communities and Events, change workspace settings, invite / remove Owners. |

A user may hold different roles in different workspaces and events. The Owner of a workspace is implicitly Event Admin on all events under it. Every role grant / revoke is audit-logged.

**Sue-the-assistant delegation**: Owner opens event → "Team" tab → "Add Event Admin" by email. If the email is unknown, an invite token is emailed; on acceptance the user joins the workspace scoped to that event only.

### 4.9 Notifications (V1: email-only)

**Channel**: Email — Azure Communication Services Email in production, MailHog locally.

Web push, SMS, and digest summaries are all V1.5+.

**Notification types & defaults**

| Event                                          | Email default |
| ---------------------------------------------- | ------------- |
| Email verification, password reset             | On (transactional, not toggleable) |
| Community invitation                           | On            |
| Community membership approved / declined       | On            |
| New event in a Community I'm a member of       | On            |
| RSVP confirmation                              | On (transactional) |
| RSVP reminder 24 h before event                | On            |
| Event updated (date / location / critical fields) | On         |
| Event cancelled                                | On            |
| Promoted from waitlist to confirmed            | On            |
| Document pending acknowledgement / upload      | On            |
| You were granted / revoked Event Admin role    | On            |

The reminder fan-out is a Celery Beat task running every 15 minutes that queries upcoming events in a 24–24.25 h window and queues per-RSVP email tasks.

### 4.10 Gear Lists (per-event only in V1)

**GearItem** (workspace-scoped catalogue)
- Name, optional description, optional product URL, optional product image (URL or uploaded thumbnail max 1 MB), optional category tag.

**EventChecklistItem**
- Links a GearItem to an Event with `required` / `recommended` flag and position.

**Per-participant tick state**: `UserEventChecklistTick` (user_id, event_checklist_item_id, state). The Creator's master list is immutable from the participant side.

**Personal gear catalogue** (per-user, across events) is V1.5. The workspace-scoped `GearItem` model is already in place; V1.5 adds a `UserGearItem` table without schema gymnastics.

### 4.11 PWA (V1: installable shell, email-only notifications)

- `manifest.webmanifest` with name, short name, theme + background colors, 192 × 192 and 512 × 512 icons.
- Service worker caching the app shell (HTML, CSS, JS bundle, fonts, icons) and read-only fallback for the most recent dashboard and event detail.
- Add-to-Home-Screen prompt triggered programmatically after the user's first RSVP.
- iOS PWA meta tags (`apple-mobile-web-app-capable`, status-bar style, touch icons).
- **Web push deferred to V1.5.** Email is the only notification channel in V1.

### 4.12 Creator Dashboard

**Top cards**
- Total Community members across all communities.
- Pending membership approvals.
- Upcoming events in next 30 days.
- RSVPs awaiting action (acknowledgement, upload).

**Communities widget** — one row per Community: name, member count, pending approvals, latest activity timestamp.

**Events widget**
- Upcoming (next 30 days): title, date, RSVP count vs capacity, waitlist length, prep-status indicators.
- Past (last 90 days): title, date, attendance rate, no-show count (Creator marks attendance after the event).

**Audit log viewer UI is deferred to V1.5.** V1 writes the audit log to DB; the data is queryable via Django admin.

**Sizing target**: dashboard renders under 1 s for 5 Communities, 200 members, 50 events.

### 4.13 Account Management

**Delete account**
- One-click in settings; requires password confirmation.
- Effects (immediate, no grace period in V1):
  - All Owner / Event Admin roles revoked. Sole-Owner workspaces block deletion until the user transfers Ownership or deletes the workspace.
  - User removed from all Communities.
  - Event RSVPs cancelled (triggers waitlist promotions).
  - Uploaded participant documents hard-deleted.
  - Profile, gear ticks, notification prefs hard-deleted.
  - **Acknowledgement records retained, anonymized** (user_id → `deleted_user_<hash>`). Signed PDF copy retained as the audit chain requires.

**Workspace deletion (Owner)** — cascades to Communities, Events, RSVPs, documents (no soft-delete buffer in V1; that's V1.5). Members notified by email.

---

## 5. Functional Rules & Edge Cases

- **Slug collisions**: workspace slugs unique platform-wide; Community and Event slugs unique within their workspace. All slugs lowercased, hyphenated, ASCII, max 50 chars, rejected if matching the reserved list. Immutable once the entity has been linked externally (first social share / first published event).
- **Timezones**: every Event has an explicit IANA timezone; workspace default falls back to the Owner's browser TZ at signup; notifications render times in the recipient's preferred TZ.
- **Email collisions on invite**: a pending invite to an unregistered email auto-resolves on first registration. Re-inviting supersedes the previous token.
- **Sensitive data scope (V1)**: medical fields exist only as event-questionnaire answers, retained 90 days post-event, then purged by a Celery Beat job.
- **Concurrent edits**: events use optimistic locking with `updated_at` version checks; UI surfaces "this event was changed by someone else, reload?" on conflict.
- **Bulk invite cap**: 100 emails per submission in V1.
- **Spam protection**: registration rate-limited (5 / IP / hour); invite emails sent from a verified domain with SPF / DKIM / DMARC; invite tokens cryptographically random (256 bits, base32).

---

## 6. Non-Functional Requirements

**Performance**
- p95 page load < 2 s on broadband.
- p95 API call < 500 ms.
- Creator dashboard initial render < 1 s for the sizing target.

**Security & Privacy**
- TLS 1.3 everywhere.
- Argon2id password hashing.
- HTTP-only secure session cookies; SameSite=Lax.
- CSRF protection (Django built-in).
- CSP headers (strict; nonce-based for inline scripts).
- Rate limiting on auth endpoints.
- Sensitive event-questionnaire fields (medical) encrypted at rest via envelope encryption (Azure Key Vault).
- Uploaded documents in Azure Blob Storage with private ACLs and SAS URLs for time-bound access.
- Audit log immutable from the application layer (write-only API).
- All compute and storage in **Azure West Europe (Amsterdam)**.

**GDPR**
- Data minimization at every collection point.
- Explicit consent UX for medical questionnaire fields.
- Right to delete: full account erase available in settings.
- Right to portability (CSV export): V1.5.
- DPA-ready posture; written DPA available before any tenant beyond Olaf Adventures onboards.

**Availability**
- Target uptime 99.5 % (~3.6 h / month) — appropriate for a free / early-stage tier.
- Daily automated DB backups, retained 14 days.

**Browser support**
- Chrome, Edge, Firefox, Safari — last two major versions.
- iOS Safari 16.4+, Chrome Android last two.

**Accessibility**
- WCAG 2.1 AA target. Keyboard navigation, screen-reader labels, sufficient contrast.

---

## 7. Technical Architecture

| Layer         | Choice                                                | Notes                                                |
| ------------- | ----------------------------------------------------- | ---------------------------------------------------- |
| Frontend      | Next.js 16 (App Router) + React 19 + TypeScript + Tailwind 4 | PWA-ready, RSC where it pays off.            |
| Backend       | Django 5 + DRF + django-allauth (headless)            | REST API.                                            |
| Async         | Celery 5 + Celery Beat + Redis 7                      | Email fan-out, scheduled reminders, retention purges. |
| Database      | PostgreSQL 16                                         | Shared schema, `tenant_id` FK on every workspace-scoped table. |
| Storage       | Azure Blob Storage                                    | Documents, GPX, avatars, gear thumbnails.            |
| Email         | Azure Communication Services Email                    | Transactional; MailHog locally.                      |
| Secrets       | Azure Key Vault                                       | DB creds, app `SECRET_KEY`, third-party API keys.    |
| Hosting       | Azure Container Apps (West Europe)                    | Backend container + frontend container behind Front Door. |
| DB hosting    | Azure Database for PostgreSQL — Flexible Server       | Daily backups.                                       |
| Cache / queue | Azure Cache for Redis (Basic tier)                    | Sessions, Celery broker, Celery results.             |
| CI/CD         | GitHub Actions → Azure Container Registry → Container Apps | One pipeline per service.                       |
| Monitoring    | Application Insights                                  | Errors, request perf, custom business events.        |
| Local dev     | docker-compose: Postgres, Redis, MailHog, API, web, Celery worker + beat | See repo root.                |

**Multi-tenancy**
- Shared schema, `tenant_id` (= workspace_id) FK on every workspace-scoped table.
- Django `TenantManager` base class + middleware resolves the active workspace from URL slug or session.
- Cross-tenant joins forbidden by the manager layer; attempted cross-tenant access raises in tests.

**Internationalization-readiness (EN-only in V1)**
- All UI strings wrapped in `gettext` / `useTranslations` from day one.
- Translation source files committed; only `en.po` populated in V1.

---

## 8. Data Model (high-level)

> Updated to reflect V1 cuts: `CommunityPost` / `CommunityPostComment` (wall feed) and `UserGearItem` (personal catalogue) live in V1.5. Sensitive health fields and billing fields are removed from `User`. `Signature` is renamed `Acknowledgement` and loses `auth_method` (only one method in V1).

```
User
  id, email, password_hash, first_name, last_name, display_name,
  phone, dob, avatar_blob_id, address,
  emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
  fitness_level, sport_tags (jsonb), bio,
  active_workspace_id (nullable),
  created_at, updated_at, deleted_at

Workspace                       (tenant root)
  id, slug, name, bio, cover_blob_id, logo_blob_id, accent_color,
  location, social_links (jsonb), visibility, default_tz, created_at

WorkspaceMember
  workspace_id, user_id, role (owner)

Community
  id, workspace_id, slug, name, description, cover_blob_id,
  visibility, membership_policy (approval/invite),
  default_member_visibility, created_at

CommunityMembership
  community_id, user_id, status (active/pending/declined),
  tags (jsonb), joined_at

Event
  id, workspace_id, slug, title, description, cover_blob_id,
  starts_at, ends_at, tz, location_text, meeting_point_text,
  capacity, waitlist_enabled, visibility, status,
  requires_approval, updated_at, created_at

EventCommunity                  (m2m: which communities see this event)
  event_id, community_id

EventAdmin                      (per-event delegated admin)
  event_id, user_id, granted_by_user_id, granted_at

EventQuestion
  id, event_id, label, help_text,
  type (short_text/long_text/single_select/checkbox),
  options (jsonb), required, position, is_sensitive

EventChecklistItem
  id, event_id, gear_item_id, required, position

UserEventChecklistTick          (per-participant tick state)
  user_id, event_checklist_item_id, state, updated_at

GearItem                        (workspace-scoped catalogue)
  id, workspace_id, name, description, product_url,
  image_url, image_blob_id, category_tag

EventDocument                   (Creator-supplied PDF to acknowledge)
  id, event_id, title, file_blob_id, file_hash, description, required

EventUploadRequest              (Creator-required participant upload)
  id, event_id, title, description, accepted_types (jsonb),
  max_size, required

RSVP
  id, event_id, user_id,
  status (yes/maybe/no/waitlist/pending_approval),
  questionnaire_answers (jsonb), waitlist_position,
  attended (nullable bool — Creator marks post-event),
  created_at, updated_at

Acknowledgement                 (was "Signature" in v1.0)
  id, rsvp_id, user_id, document_id, event_id,
  signed_at, ip_address, user_agent, session_id, document_hash

ParticipantUpload
  id, rsvp_id, upload_request_id, file_blob_id, uploaded_at

Invitation
  id, workspace_id, scope (community/event/event_admin),
  scope_id, email, token, expires_at,
  accepted_at, accepted_by_user_id

NotificationPreference
  user_id, type, channel (email), enabled
  -- V1.5 adds 'push' channel rows

AuditLogEntry
  id, workspace_id, actor_user_id, action, target_type,
  target_id, diff (jsonb), ip_address, user_agent, created_at
```

---

## 9. URL Structure

| Surface                | URL pattern                                    | Example                                                  |
| ---------------------- | ---------------------------------------------- | -------------------------------------------------------- |
| Marketing site         | `olaf.events/*` (reserved paths only)          | `olaf.events`, `olaf.events/pricing`                     |
| App (auth, dashboard)  | `app.olaf.events/*`                            | `app.olaf.events/dashboard`                              |
| Creator public profile | `olaf.events/{workspace-slug}`                 | `olaf.events/olafadventures`                             |
| Community page         | `olaf.events/{workspace-slug}/{community-slug}`| `olaf.events/olafadventures/trail-running`               |
| Event landing          | `olaf.events/{workspace-slug}/e/{event-slug}`  | `olaf.events/olafadventures/e/spring-camp`               |
| Invite link            | `app.olaf.events/invite/{token}`               | `app.olaf.events/invite/3F8K…`                           |
| Static assets          | `static.olaf.events/*`                         | CDN-served                                               |

The `/e/` infix on event URLs prevents slug collisions between Communities and Events within the same workspace, and gives a stable namespace for future content types (`/r/` for resources, `/g/` for galleries).

Workspace slugs cannot match any reserved path (see §4.3).

**Custom domain mapping** (V2 Pro feature): Creator maps own domain (e.g. `olafadventures.com`) onto the workspace; visitors see the custom domain but the platform handles routing.

---

## 10. Implementation Plan (vertical slices)

Each slice ships as one PR with model + API + UI + tests. Nothing starts until the previous slice runs production-like in the dev environment.

| #   | Slice                                | End-state                                                                         |
| --- | ------------------------------------ | --------------------------------------------------------------------------------- |
| 0   | Repo bootstrap                       | `make dev` brings up backend (health endpoint) and frontend (default page); CI green. |
| 1   | Auth & User                          | Register → verify email → login → password reset → empty dashboard.               |
| 2   | Workspace + tenant middleware        | Olaf Adventures workspace seeded via migration; public profile at `/olafadventures`; tenant filtering tested. |
| 3   | Community shell (roster only)        | Owner creates Community, paste-100-emails invite, members accept/decline.         |
| 4   | Event create + public landing page   | Owner publishes event, gets shareable URL, OG/Twitter meta, status transitions.   |
| 5   | RSVP + questionnaire + waitlist      | Public RSVP flow incl. capacity-triggered waitlist + FIFO auto-promotion + confirmation email. |
| 6   | Documents + uploads + acknowledgement| Creator uploads PDF, member acknowledges (audit-logged); creator requires upload, member uploads. |
| 7   | Gear list (per-event) + GPX file     | Owner builds checklist, member ticks; GPX upload/download.                        |
| 8   | Notifications + 24 h reminder        | Email-only notification matrix in settings; Celery Beat reminder cron; cancellation fan-out. |
| 9   | Event Admin role + delegation        | Owner grants Event Admin per-event by email; audit log records every grant/revoke. |
| 10  | Creator dashboard                    | Cards + Communities widget + Events widget + post-event attendance marking.       |
| 11  | PWA shell                            | Manifest, service worker (offline read on dashboard + event detail), iOS meta, A2HS prompt after first RSVP. |
| 12  | Account management + GDPR delete     | Delete-account flow + sole-Owner check + acknowledgement anonymization + uploads purge. |
| 13  | Production deploy + observability    | Azure Container Apps, Postgres Flexible, Redis, Blob, ACS Email, Key Vault, Front Door, App Insights, GH Actions → ACR. |

---

## 11. Roadmap beyond V1

**V1.5 — Polish & loved features**
- Community wall feed (posts, comments, reactions, pinning, GPX attachments).
- OAuth logins (Google, Microsoft, Apple).
- Personal gear catalogue + suggestions from past events.
- Web push notifications (VAPID + service worker push handler).
- Onboarding wizard for first-time Creators.
- CSV invite bulk upload.
- GPX preview rendering (Leaflet) + Mapy.cz integration.
- Audit log viewer UI + CSV export.
- GDPR data export (right to portability).
- 30-day soft-delete buffer for workspaces and events.
- Newsletter integration (Mailchimp / Brevo connectors).
- Multi-Owner promotion UI; workspace-create flow for new tenants.

**V2 — Commercial features**
- Stripe-based payments for paid events (one-time + deposits).
- Invoice PDF generation.
- Creator subscription tiers and platform billing.
- Custom domain mapping per workspace (Pro tier).
- SMS step-up + external signature integration (Signi, DocuSign).
- Finance role, Staff / Guide role.
- Recurring events, sub-events.
- CZ localization.
- Billing profile fields (IČO / DIČ / legal name) on user profile.

**V3 — Growth & marketplace**
- Affiliate gear marketplace.
- Native mobile apps (iOS + Android).
- AI: itinerary suggestions, weather-aware gear lists, post-event auto-summaries.
- Gamification: badges, streaks, leaderboards.
- Referral program.
- Curated Community discovery feed.

---

## 12. Risks & Open Questions

**Risks**
- **V1 is still meaningful scope.** Thirteen slices, solo dev + Claude Code. Mitigation: ship one slice as one PR; don't start the next until the previous runs production-like.
- **Sensitive data even at event scope.** Medical questionnaire fields are GDPR special-category data. Mitigation: encrypted at rest via envelope encryption, opt-in consent UX, 90-day retention, DPA template before any tenant beyond Olaf Adventures onboards.
- **Acknowledgement is not a qualified signature.** Documented as a non-binding acknowledgement in the ToS. Signi / DocuSign integration deferred to V2 for higher-assurance scenarios.
- **No web push in V1.** Email is the only channel. iOS PWA push is an iOS-A2HS UX trap anyway — landing in V1.5 with a guided install flow is better than landing in V1 broken.

**Open questions**
- Domain `olaf.events` — purchase confirmation (Cloudflare Registrar) before §10 slice 13.
- ACS Email vs SendGrid — final decision based on EU deliverability tests during slice 13.
- Brand identity — logo, palette, typography needed before public launch; V1 ships with a temporary system-font + accent-color look.

---

## 13. Appendix

**Naming.** Platform name: **olaf** (always lowercase — in code, URLs, identifiers, marketing copy, email subjects, and the wordmark itself; never "OLAF"). Primary domain: `olaf.events`. Working tagline: *"Where adventures begin."*

**Brand v1** (2026-05-12, user-supplied, matches `olafadventures.com` palette):

| Token | Hex | Usage |
|---|---|---|
| Accent | `#ffc719` | Primary CTAs and text highlights only. Minimalist — never decorative. White text fails contrast; primary buttons render **black** text on amber (encoded as `--brand-ink`). |
| Canvas | `#ffffff` | Light-mode background. |
| Text | `#000000` | Primary text. |
| Border / divider | `#dcdcdc` | All borders and rule lines. |

Logo / mark: a topographic peak inside an open circle (`apps/web/components/ui/logo.tsx`). Used everywhere the brand needs to identify itself — header, auth pages, dashboard, favicon. Wordmark beside the mark is lowercase `olaf` in Geist Sans.

**Sibling project.** olaf follows Slotly under the same author; both EU-hosted, GDPR-clean, PWA-first. Slotly's stack inspired olaf's but the two share no code.
