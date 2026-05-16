"use client";

import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Alert, Card, CardSection } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import {
  ApiError,
  type Event as OlafEvent,
  type EventWritePayload,
  type FaqItem,
  type ProgramDay,
  QUESTIONNAIRE_SECTION_HINTS,
  QUESTIONNAIRE_SECTION_LABELS,
  QUESTIONNAIRE_SECTION_ORDER,
  type QuestionnaireSection,
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

  const [priceText, setPriceText] = useState(initial?.price_text ?? "");
  const [highlightsText, setHighlightsText] = useState(
    initial?.highlights?.join("\n") ?? "",
  );
  const [includedText, setIncludedText] = useState(
    initial?.included?.join("\n") ?? "",
  );
  const [program, setProgram] = useState<ProgramDay[]>(
    initial?.program ?? [],
  );

  const [enabledSections, setEnabledSections] = useState<QuestionnaireSection[]>(
    initial?.enabled_questionnaire_sections ?? [...QUESTIONNAIRE_SECTION_ORDER],
  );

  const [notIncludedText, setNotIncludedText] = useState(
    initial?.not_included?.join("\n") ?? "",
  );
  const [additionalCostNote, setAdditionalCostNote] = useState(
    initial?.additional_cost_note ?? "",
  );
  const [difficultyLevel, setDifficultyLevel] = useState<number>(
    initial?.difficulty_level ?? 0,
  );
  const [difficultyNote, setDifficultyNote] = useState(
    initial?.difficulty_note ?? "",
  );
  const [transportInfo, setTransportInfo] = useState(
    initial?.transport_info ?? "",
  );
  const [accommodationInfo, setAccommodationInfo] = useState(
    initial?.accommodation_info ?? "",
  );
  const [gearInfo, setGearInfo] = useState(initial?.gear_info ?? "");
  const [faq, setFaq] = useState<FaqItem[]>(initial?.faq ?? []);

  function addFaq() {
    setFaq((prev) => [...prev, { question: "", answer: "" }]);
  }
  function updateFaq(i: number, patch: Partial<FaqItem>) {
    setFaq((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }
  function removeFaq(i: number) {
    setFaq((prev) => prev.filter((_, idx) => idx !== i));
  }

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateTitle(value: string) {
    setTitle(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  function addProgramDay() {
    setProgram((prev) => [...prev, { day: "", title: "", body: "" }]);
  }

  function updateProgramDay(i: number, patch: Partial<ProgramDay>) {
    setProgram((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }

  function removeProgramDay(i: number) {
    setProgram((prev) => prev.filter((_, idx) => idx !== i));
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
        price_text: priceText,
        highlights: highlightsText
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        included: includedText
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        program: program.filter(
          (d) => d.day.trim() || d.title.trim() || d.body.trim(),
        ),
        enabled_questionnaire_sections: enabledSections,
        not_included: notIncludedText
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        additional_cost_note: additionalCostNote,
        difficulty_level: difficultyLevel,
        difficulty_note: difficultyNote,
        transport_info: transportInfo,
        accommodation_info: accommodationInfo,
        gear_info: gearInfo,
        faq: faq.filter((f) => f.question.trim() || f.answer.trim()),
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
              <Input
                id="starts"
                type="datetime-local"
                required
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </Field>
            <Field label="Konec *" htmlFor="ends">
              <Input
                id="ends"
                type="datetime-local"
                required
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
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
            <Field label="Cena (text)" htmlFor="price" hint='např. "2 450 Kč"'>
              <Input
                id="price"
                value={priceText}
                onChange={(e) => setPriceText(e.target.value)}
              />
            </Field>
          </div>
        </CardSection>
      </Card>

      <Card>
        <CardSection>
          <h2 className="text-base font-semibold text-ink-900">Popis</h2>
          <p className="mt-1 text-sm text-ink-500">
            Krátký intro odstavec na začátek landing page.
          </p>
          <div className="mt-4">
            <Field label="Popis akce" htmlFor="desc">
              <textarea
                id="desc"
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Připoj se k nám na intenzivní víkend plný běhání…"
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm focus-ring"
              />
            </Field>
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
          <h2 className="text-base font-semibold text-ink-900">Obsah landing page</h2>
          <p className="mt-1 text-sm text-ink-500">
            Tyhle texty se vykreslí na veřejné stránce akce.
          </p>
          <div className="mt-4 flex flex-col gap-4">
            <Field
              label="Na co se zaměříme"
              htmlFor="highlights"
              hint="Jeden bod na řádek"
            >
              <textarea
                id="highlights"
                rows={4}
                value={highlightsText}
                onChange={(e) => setHighlightsText(e.target.value)}
                placeholder={
                  "technika běhu v terénu\nregenerace a práce s tělem\nstravování pro dlouhé běhy"
                }
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm focus-ring"
              />
            </Field>
            <Field
              label="Co je v ceně"
              htmlFor="included"
              hint="Jeden bod na řádek"
            >
              <textarea
                id="included"
                rows={4}
                value={includedText}
                onChange={(e) => setIncludedText(e.target.value)}
                placeholder={"3 noci ubytování\norganizované tréninky\nsnídaně a večeře"}
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm focus-ring"
              />
            </Field>

            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <label className="text-sm font-medium text-ink-900">
                  Program (den po dni)
                </label>
                <button
                  type="button"
                  onClick={addProgramDay}
                  className="rounded-md border border-border bg-surface px-3 py-1 text-xs font-medium text-ink-700 hover:bg-surface-muted focus-ring"
                >
                  + Přidat den
                </button>
              </div>
              {program.length === 0 ? (
                <p className="rounded-md border border-dashed border-border-strong bg-surface-muted/40 p-4 text-sm text-ink-500">
                  Zatím prázdné. Klikni „Přidat den" a napiš program.
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {program.map((d, i) => (
                    <div
                      key={i}
                      className="rounded-md border border-border bg-surface p-4"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-xs font-bold text-brand-ink">
                          {i + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeProgramDay(i)}
                          className="text-xs text-ink-500 hover:text-danger"
                        >
                          Odstranit
                        </button>
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Input
                          placeholder="Čtvrtek"
                          value={d.day}
                          onChange={(e) =>
                            updateProgramDay(i, { day: e.target.value })
                          }
                        />
                        <Input
                          placeholder="Příjezd a zahájení"
                          value={d.title}
                          onChange={(e) =>
                            updateProgramDay(i, { title: e.target.value })
                          }
                        />
                      </div>
                      <textarea
                        rows={2}
                        placeholder="Krátký popis programu dne…"
                        value={d.body}
                        onChange={(e) =>
                          updateProgramDay(i, { body: e.target.value })
                        }
                        className="mt-3 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus-ring"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardSection>
      </Card>

      <Card>
        <CardSection>
          <h2 className="text-base font-semibold text-ink-900">
            Co NENÍ v ceně
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            Vyjasní očekávání. Účastníci ocení, když ví co si platí navíc.
          </p>
          <div className="mt-4 flex flex-col gap-4">
            <Field
              label="Položky mimo cenu"
              htmlFor="not_included"
              hint="Jeden bod na řádek"
            >
              <textarea
                id="not_included"
                rows={4}
                value={notIncludedText}
                onChange={(e) => setNotIncludedText(e.target.value)}
                placeholder={
                  "doprava na místo\nstartovné na závodu\nosobní pojištění"
                }
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm focus-ring"
              />
            </Field>
            <Field
              label="Odhad dodatečných nákladů"
              htmlFor="additional_cost"
              hint='např. "~1 500 Kč navíc na lanovky a oběd v restauraci"'
            >
              <Input
                id="additional_cost"
                value={additionalCostNote}
                onChange={(e) => setAdditionalCostNote(e.target.value)}
              />
            </Field>
          </div>
        </CardSection>
      </Card>

      <Card>
        <CardSection>
          <h2 className="text-base font-semibold text-ink-900">Náročnost</h2>
          <p className="mt-1 text-sm text-ink-500">
            Pomáhá účastníkům posoudit, jestli to zvládnou.
          </p>
          <div className="mt-4 flex flex-col gap-4">
            <div>
              <p className="text-sm font-medium text-ink-900">
                Úroveň (0 = nezadáno)
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setDifficultyLevel(n)}
                    className={[
                      "h-10 w-12 rounded-md border text-sm font-medium transition-colors focus-ring",
                      difficultyLevel === n
                        ? "border-brand bg-brand text-brand-ink"
                        : "border-border bg-surface text-ink-700 hover:bg-surface-muted",
                    ].join(" ")}
                  >
                    {n === 0 ? "—" : n}
                  </button>
                ))}
              </div>
            </div>
            <Field
              label="Co náročnost znamená pro tuto akci"
              htmlFor="diff_note"
              hint="Vzdálenost/den, hodiny pohybu, převýšení, požadovaná kondice."
            >
              <textarea
                id="diff_note"
                rows={3}
                value={difficultyNote}
                onChange={(e) => setDifficultyNote(e.target.value)}
                placeholder="např. 15–20 km/den, 5–7 h chůze, min. kondice: zvládneš dlouhý výběh 15 km"
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm focus-ring"
              />
            </Field>
          </div>
        </CardSection>
      </Card>

      <Card>
        <CardSection>
          <h2 className="text-base font-semibold text-ink-900">
            Doprava, ubytování, výbava
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            Volitelné. Co účastník potřebuje vědět, aby přijel připravený.
          </p>
          <div className="mt-4 flex flex-col gap-4">
            <Field label="Doprava" htmlFor="transport">
              <textarea
                id="transport"
                rows={2}
                value={transportInfo}
                onChange={(e) => setTransportInfo(e.target.value)}
                placeholder="Sraz v Karlovicích, autem (může se sdílet), ke startu vlakem…"
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm focus-ring"
              />
            </Field>
            <Field label="Ubytování a strava" htmlFor="accomm">
              <textarea
                id="accomm"
                rows={2}
                value={accommodationInfo}
                onChange={(e) => setAccommodationInfo(e.target.value)}
                placeholder="Chata Kyčerka, 4-lůžkové pokoje, polopenze v ceně, večeře 18:30."
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm focus-ring"
              />
            </Field>
            <Field label="Výbava" htmlFor="gear">
              <textarea
                id="gear"
                rows={2}
                value={gearInfo}
                onChange={(e) => setGearInfo(e.target.value)}
                placeholder="Trailové boty, plecák 20–30 l, čelovka, vrstvení na zimu/déšť. GPS budeme mít s sebou."
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm focus-ring"
              />
            </Field>
          </div>
        </CardSection>
      </Card>

      <Card>
        <CardSection>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-base font-semibold text-ink-900">
              Časté dotazy (FAQ)
            </h2>
            <button
              type="button"
              onClick={addFaq}
              className="rounded-md border border-border bg-surface px-3 py-1 text-xs font-medium text-ink-700 hover:bg-surface-muted focus-ring"
            >
              + Přidat otázku
            </button>
          </div>
          <p className="text-sm text-ink-500">
            Zachytí otázky, na které jinak budeš odpovídat emaily.
          </p>
          {faq.length === 0 ? (
            <p className="mt-4 rounded-md border border-dashed border-border-strong bg-surface-muted/40 p-4 text-sm text-ink-500">
              Zatím prázdné. Přidej první otázku.
            </p>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              {faq.map((f, i) => (
                <div
                  key={i}
                  className="rounded-md border border-border bg-surface p-4"
                >
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-medium uppercase tracking-wide text-ink-500">
                      Otázka {i + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFaq(i)}
                      className="text-xs text-ink-500 hover:text-danger"
                    >
                      Odstranit
                    </button>
                  </div>
                  <Input
                    placeholder="Co když přijdu pozdě?"
                    value={f.question}
                    onChange={(e) => updateFaq(i, { question: e.target.value })}
                    className="mt-3"
                  />
                  <textarea
                    rows={2}
                    placeholder="Sraz je v 17:00, ale večeři držíme do 19:00. Napiš mi, kdyby ses zpozdil/a víc."
                    value={f.answer}
                    onChange={(e) => updateFaq(i, { answer: e.target.value })}
                    className="mt-3 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus-ring"
                  />
                </div>
              ))}
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
