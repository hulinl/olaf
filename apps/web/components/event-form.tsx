"use client";

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Alert, Card, CardSection } from "@/components/ui/card";
import { DateTimeField } from "@/components/ui/date-time-field";
import { Field, Input } from "@/components/ui/field";
import {
  ApiError,
  type Community,
  type Event as OlafEvent,
  type EventWritePayload,
  QUESTIONNAIRE_SECTION_HINTS,
  QUESTIONNAIRE_SECTION_LABELS,
  QUESTIONNAIRE_SECTION_ORDER,
  type QuestionnaireSection,
  communities,
} from "@/lib/api";

interface Props {
  /** When provided, the form is in edit mode and pre-populates from the event. */
  initial?: OlafEvent | null;
  workspaceSlug: string;
  onSubmit: (payload: EventWritePayload) => Promise<OlafEvent>;
  onSuccess: (event: OlafEvent) => void;
  submitLabel: string;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

/** ISO → "2026-07-16T17:00" for <input type="datetime-local">. */
function toLocalInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "2026-07-16T17:00" → ISO with timezone offset (browser local). */
function fromLocalInput(value: string): string {
  if (!value) return "";
  return new Date(value).toISOString();
}

/**
 * Event mechanics form — owner-only fields that drive how the event behaves
 * (time, capacity, RSVP, sharing, status). All visual landing content lives
 * in the block builder at /events/[wsSlug]/[eventSlug]/blocks. The form
 * intentionally has no fields for highlights / included / program / faq /
 * practical info / price — those are blocks now.
 */
export function EventForm({
  initial,
  workspaceSlug,
  onSubmit,
  onSuccess,
  submitLabel,
}: Props) {
  const isEdit = Boolean(initial);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const [description, setDescription] = useState(initial?.description ?? "");

  const [startsAt, setStartsAt] = useState(toLocalInput(initial?.starts_at));
  const [endsAt, setEndsAt] = useState(toLocalInput(initial?.ends_at));
  const [tz, setTz] = useState(initial?.tz ?? "Europe/Prague");

  const [location, setLocation] = useState(initial?.location_text ?? "");
  const [meetingPoint, setMeetingPoint] = useState(
    initial?.meeting_point_text ?? "",
  );
  const [locationUrl, setLocationUrl] = useState(initial?.location_url ?? "");

  const [capacity, setCapacity] = useState<string>(
    initial?.capacity != null ? String(initial.capacity) : "",
  );
  const [waitlistEnabled, setWaitlistEnabled] = useState(
    initial?.waitlist_enabled ?? true,
  );
  const [requiresApproval, setRequiresApproval] = useState(
    initial?.requires_approval ?? false,
  );

  const [visibility, setVisibility] = useState<"public" | "invite_only">(
    initial?.visibility ?? "public",
  );
  const [status, setStatus] = useState<
    "draft" | "published" | "closed" | "cancelled" | "completed"
  >(initial?.status ?? "draft");

  const [enabledSections, setEnabledSections] = useState<QuestionnaireSection[]>(
    initial?.enabled_questionnaire_sections ?? [...QUESTIONNAIRE_SECTION_ORDER],
  );

  const [availableCommunities, setAvailableCommunities] = useState<
    Community[] | null
  >(null);
  const [communitySlugs, setCommunitySlugs] = useState<string[]>(
    initial?.community_slugs ?? [],
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    communities
      .forWorkspace(workspaceSlug)
      .then((list) => {
        if (!cancelled) setAvailableCommunities(list);
      })
      .catch(() => {
        // Communities list is non-blocking — owner can still save the event.
        if (!cancelled) setAvailableCommunities([]);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug]);

  function updateTitle(value: string) {
    setTitle(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload: EventWritePayload = {
        slug,
        title,
        description,
        starts_at: fromLocalInput(startsAt),
        ends_at: fromLocalInput(endsAt),
        tz,
        location_text: location,
        meeting_point_text: meetingPoint,
        location_url: locationUrl,
        capacity: capacity ? Number(capacity) : null,
        waitlist_enabled: waitlistEnabled,
        requires_approval: requiresApproval,
        visibility,
        status,
        enabled_questionnaire_sections: enabledSections,
        community_slugs: communitySlugs,
      };
      const event = await onSubmit(payload);
      onSuccess(event);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.firstFieldError() ?? err.message);
      } else {
        setError("Něco se nepodařilo uložit.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <Card>
        <CardSection>
          <h2 className="text-base font-semibold text-ink-900">Základní info</h2>
          <p className="mt-1 text-sm text-ink-500">
            Co a kdy. Slug se generuje automaticky z názvu, ale můžeš ho
            přepsat.
          </p>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Název *" htmlFor="title">
                <Input
                  id="title"
                  required
                  value={title}
                  onChange={(e) => updateTitle(e.target.value)}
                  placeholder="Letní běžecký kemp 2026"
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field
                label="Slug *"
                htmlFor="slug"
                hint={`URL bude /${workspaceSlug}/e/${slug || "<slug>"}`}
              >
                <Input
                  id="slug"
                  required
                  value={slug}
                  onChange={(e) => {
                    setSlug(e.target.value);
                    setSlugTouched(true);
                  }}
                  placeholder="letni-bezecky-kemp-2026"
                />
              </Field>
            </div>
            <Field label="Začátek *" htmlFor="starts">
              <DateTimeField
                id="starts"
                required
                value={startsAt}
                onChange={setStartsAt}
              />
            </Field>
            <Field label="Konec *" htmlFor="ends">
              <DateTimeField
                id="ends"
                required
                value={endsAt}
                onChange={setEndsAt}
              />
            </Field>
            <Field
              label="Časové pásmo"
              htmlFor="tz"
              hint="IANA timezone, např. Europe/Prague."
            >
              <Input
                id="tz"
                value={tz}
                onChange={(e) => setTz(e.target.value)}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field
                label="Krátký intro"
                htmlFor="desc"
                hint="Jedna věta nebo dva odstavce. Plný obsah landingu se skládá v sekci Obsah stránky."
              >
                <textarea
                  id="desc"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Připoj se k nám na intenzivní víkend plný běhání…"
                  className="rounded-md border border-border bg-surface px-3 py-2 text-sm focus-ring"
                />
              </Field>
            </div>
          </div>
        </CardSection>
      </Card>

      <Card>
        <CardSection>
          <h2 className="text-base font-semibold text-ink-900">Lokalita</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Lokalita" htmlFor="location" hint='např. "Beskydy"'>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </Field>
            <Field
              label="Místo srazu"
              htmlFor="meeting"
              hint="Konkrétní bod setkání"
            >
              <Input
                id="meeting"
                value={meetingPoint}
                onChange={(e) => setMeetingPoint(e.target.value)}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field
                label="Odkaz na mapu"
                htmlFor="locurl"
                hint="Google Maps, Mapy.cz, …"
              >
                <Input
                  id="locurl"
                  type="url"
                  value={locationUrl}
                  onChange={(e) => setLocationUrl(e.target.value)}
                />
              </Field>
            </div>
          </div>
        </CardSection>
      </Card>

      <Card>
        <CardSection>
          <h2 className="text-base font-semibold text-ink-900">Kapacita</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Maximum přihlášených"
              htmlFor="cap"
              hint="Nech prázdné pro neomezenou kapacitu."
            >
              <Input
                id="cap"
                type="number"
                min={1}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </Field>
            <div className="flex flex-col gap-3 pt-7">
              <label className="flex items-start gap-2 text-sm text-ink-900">
                <input
                  type="checkbox"
                  checked={waitlistEnabled}
                  onChange={(e) => setWaitlistEnabled(e.target.checked)}
                  className="mt-0.5 size-4 accent-brand"
                />
                Po naplnění kapacity přijímat na waitlist
              </label>
              <label className="flex items-start gap-2 text-sm text-ink-900">
                <input
                  type="checkbox"
                  checked={requiresApproval}
                  onChange={(e) => setRequiresApproval(e.target.checked)}
                  className="mt-0.5 size-4 accent-brand"
                />
                Vyžadovat moje schválení každé registrace
              </label>
            </div>
          </div>
        </CardSection>
      </Card>

      <Card>
        <CardSection>
          <h2 className="text-base font-semibold text-ink-900">
            Sdílení do komunit
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            Komunitu nepořádá tuhle akci — pořádáš ji ty, ale můžeš ji v
            komunitě sdílet, takže její členové ji uvidí na profilu komunity.
          </p>
          {availableCommunities === null ? (
            <p className="mt-4 text-sm text-ink-500">Načítám komunity…</p>
          ) : availableCommunities.length === 0 ? (
            <p className="mt-4 text-sm text-ink-500">
              V této pracovní komunitě zatím žádné komunity nejsou.
            </p>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-2">
              {availableCommunities.map((c) => {
                const checked = communitySlugs.includes(c.slug);
                return (
                  <label
                    key={c.slug}
                    className="flex items-start gap-3 rounded-md border border-border p-3 text-sm hover:bg-surface-muted has-[input:checked]:border-brand"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setCommunitySlugs((prev) =>
                          prev.includes(c.slug)
                            ? prev.filter((s) => s !== c.slug)
                            : [...prev, c.slug],
                        )
                      }
                      className="mt-0.5 size-4 accent-brand"
                    />
                    <span className="flex flex-col">
                      <span className="font-medium text-ink-900">{c.name}</span>
                      {c.description && (
                        <span className="text-xs text-ink-500">
                          {c.description}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </CardSection>
      </Card>

      <Card>
        <CardSection>
          <h2 className="text-base font-semibold text-ink-900">
            Co chceš na přihlášce
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            Vyber, které sekce přihlašovacího formuláře se účastníkům
            zobrazí. Stabilní údaje (kondice, dieta, tričko, emergency
            kontakt) se předvyplní z jejich profilu.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-2">
            {QUESTIONNAIRE_SECTION_ORDER.map((section) => {
              const checked = enabledSections.includes(section);
              return (
                <label
                  key={section}
                  className="flex items-start gap-3 rounded-md border border-border p-3 text-sm hover:bg-surface-muted has-[input:checked]:border-brand"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setEnabledSections((prev) =>
                        prev.includes(section)
                          ? prev.filter((s) => s !== section)
                          : [...prev, section],
                      )
                    }
                    className="mt-0.5 size-4 accent-brand"
                  />
                  <span className="flex flex-col">
                    <span className="font-medium text-ink-900">
                      {QUESTIONNAIRE_SECTION_LABELS[section]}
                    </span>
                    <span className="text-xs text-ink-500">
                      {QUESTIONNAIRE_SECTION_HINTS[section]}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </CardSection>
      </Card>

      <Card>
        <CardSection>
          <h2 className="text-base font-semibold text-ink-900">
            Viditelnost a status
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-ink-900">Viditelnost</p>
              <div className="mt-2 flex flex-col gap-2 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="vis"
                    checked={visibility === "public"}
                    onChange={() => setVisibility("public")}
                    className="accent-brand"
                  />
                  Public — kdokoli s odkazem
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="vis"
                    checked={visibility === "invite_only"}
                    onChange={() => setVisibility("invite_only")}
                    className="accent-brand"
                  />
                  Invite-only
                </label>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-ink-900">Status</p>
              <div className="mt-2 flex flex-col gap-2 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="status"
                    checked={status === "draft"}
                    onChange={() => setStatus("draft")}
                    className="accent-brand"
                  />
                  Draft — vidíš jen ty
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="status"
                    checked={status === "published"}
                    onChange={() => setStatus("published")}
                    className="accent-brand"
                  />
                  Published — RSVP otevřené
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="status"
                    checked={status === "closed"}
                    onChange={() => setStatus("closed")}
                    className="accent-brand"
                  />
                  Closed — RSVP uzavřené
                </label>
                {isEdit && (
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="status"
                      checked={status === "cancelled"}
                      onChange={() => setStatus("cancelled")}
                      className="accent-brand"
                    />
                    Cancelled
                  </label>
                )}
              </div>
            </div>
          </div>
        </CardSection>
      </Card>

      {error && <Alert variant="danger">{error}</Alert>}

      <div className="flex gap-3">
        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={submitting}
        >
          {submitting ? "Ukládám…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
