"use client";

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Alert, Card, CardSection } from "@/components/ui/card";
import { DateTimeField } from "@/components/ui/date-time-field";
import { Field, Input } from "@/components/ui/field";
import {
  ApiError,
  type BillingProfile,
  type ContractTemplate,
  type Event as OlafEvent,
  type EventContractConfig,
  type EventWritePayload,
  type GearList,
  QUESTIONNAIRE_SECTION_HINTS,
  QUESTIONNAIRE_SECTION_LABELS,
  QUESTIONNAIRE_SECTION_ORDER,
  type QuestionnaireSection,
  type RequiredDocumentSpec,
  type RiskChecklistItem,
  type Workspace,
  auth,
  contracts as contractsApi,
  gear,
  workspaces,
} from "@/lib/api";

const RISK_TEMPLATE: RiskChecklistItem[] = [
  { key: "weather-forecast", label: "Zkontrolovat předpověď počasí 3 dny předem", category: "Počasí", status: "open", notes: "" },
  { key: "weather-plan-b", label: "Mít plán B pro špatné počasí", category: "Počasí", status: "open", notes: "" },
  { key: "route-mapped", label: "Trasa zmapovaná a stažená offline", category: "Trasa", status: "open", notes: "" },
  { key: "route-escape", label: "Záchytné body a možnost zkrácení trasy", category: "Trasa", status: "open", notes: "" },
  { key: "equip-firstaid", label: "Lékárna doplněná", category: "Vybavení", status: "open", notes: "" },
  { key: "equip-comms", label: "Powerbank, signál v lokalitě", category: "Vybavení", status: "open", notes: "" },
  { key: "medical-allergies", label: "Účastníci nahlásili alergie + medikamenty", category: "Zdraví", status: "open", notes: "" },
  { key: "medical-insurance", label: "Pojištění platné na danou aktivitu", category: "Zdraví", status: "open", notes: "" },
  { key: "comm-contacts", label: "Účastníci mají kontakt na organizátora", category: "Komunikace", status: "open", notes: "" },
  { key: "comm-emergency", label: "Náhradní kontakt na pořadatele", category: "Komunikace", status: "open", notes: "" },
  { key: "transport-plan", label: "Doprava domluvená (sraz, řidiči)", category: "Doprava", status: "open", notes: "" },
];

interface Props {
  /** When provided, the form is in edit mode and pre-populates from the event. */
  initial?: OlafEvent | null;
  workspaceSlug: string;
  onSubmit: (payload: EventWritePayload) => Promise<OlafEvent>;
  onSuccess: (event: OlafEvent) => void;
  submitLabel: string;
  /** Edit-mode-only: pokud je definované, ukáže se „Přesunout do…"
   *  trigger v sekci Komunity, který akci přepne pod jiný workspace.
   *  Callback dostane cílový slug, vrátí novou URL ke které router
   *  routovne. */
  onMoveToWorkspace?: (
    targetWorkspaceSlug: string,
  ) => Promise<{ new_workspace_slug: string; event_slug: string }>;
}

/**
 * Standard document types — present these in the EventForm as one-click
 * adds so owners settle on a small, reportable vocabulary instead of
 * inventing a custom name per event. Custom rows are still possible.
 */
const DOC_PRESETS: { key: string; label: string }[] = [
  { key: "smlouva", label: "Smlouva" },
  { key: "pojisteni", label: "Pojištění" },
];

/** Make a slug-style key from a label, with a positional fallback so
 *  fresh "+ Vlastní dokument" rows still have a valid key before the
 *  owner types anything. */
function slugifyDocKey(label: string, index: number): string {
  const base = label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || `custom-${index + 1}`;
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
  onMoveToWorkspace,
}: Props) {
  const isEdit = Boolean(initial);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const [description, setDescription] = useState(initial?.description ?? "");

  const [startsAt, setStartsAt] = useState(toLocalInput(initial?.starts_at));
  const [endsAt, setEndsAt] = useState(toLocalInput(initial?.ends_at));
  // Fixed for V1 — see comment in the render where the tz field used to
  // be. setTz isn't bound to UI anymore; keep the constant for payload.
  const tz = initial?.tz ?? "Europe/Prague";

  const [location, setLocation] = useState(initial?.location_text ?? "");
  const [meetingPoint, setMeetingPoint] = useState(
    initial?.meeting_point_text ?? "",
  );
  const [locationUrl, setLocationUrl] = useState(initial?.location_url ?? "");

  const [capacity, setCapacity] = useState<string>(
    initial?.capacity != null ? String(initial.capacity) : "",
  );
  const [requirePhoneOnRsvp, setRequirePhoneOnRsvp] = useState(
    initial?.require_phone_on_rsvp ?? true,
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

  const [isPaid, setIsPaid] = useState(initial?.price_amount != null);
  const [priceAmount, setPriceAmount] = useState(initial?.price_amount ?? "");
  const [priceCurrency, setPriceCurrency] = useState(
    initial?.price_currency || "CZK",
  );
  const [priceNote, setPriceNote] = useState(initial?.price_note ?? "");
  const [paymentInCash, setPaymentInCash] = useState(
    initial?.payment_in_cash ?? false,
  );
  const [billingProfileId, setBillingProfileId] = useState<number | null>(
    initial?.billing_profile ?? null,
  );
  const [billingProfiles, setBillingProfiles] = useState<BillingProfile[]>([]);

  // Cross-workspace sharing (Slice 3): owner picks other komunity they own
  // where the event should appear. Always implicitly includes the primary
  // workspace (workspace FK) — user doesn't deselect it here.
  const [ownedWorkspaces, setOwnedWorkspaces] = useState<Workspace[] | null>(
    null,
  );
  // Personal workspace — backend `/mine/` ji excludeuje, ale my ji
  // potřebujeme jako fallback target když user odebere event z poslední
  // ne-personal komunity. Tvůrce akce vždycky má aspoň personal.
  const [personalWorkspace, setPersonalWorkspace] = useState<Workspace | null>(
    null,
  );
  const [sharedSlugs, setSharedSlugs] = useState<string[]>(
    initial?.shared_workspace_slugs ?? [],
  );

  const [requiredDocs, setRequiredDocs] = useState<RequiredDocumentSpec[]>(
    initial?.required_documents ?? [],
  );

  // Recommended gear — owner picks one of their GearLists. Loaded lazily
  // when the form mounts so the picker dropdown has fresh data even if
  // the owner created a list in another tab.
  const [recommendedGearListId, setRecommendedGearListId] = useState<
    number | null
  >(initial?.recommended_gear_list?.id ?? null);
  const [gearLists, setGearLists] = useState<GearList[]>([]);

  // Risk checklist — owner's internal prep list (V2). Loaded from
  // initial.risk_checklist; FE provides a "Load template" affordance
  // for new events so the owner doesn't start from scratch.
  const [risks, setRisks] = useState<RiskChecklistItem[]>(
    initial?.risk_checklist ?? [],
  );

  // Smlouva config — lazy load: templates k vidění a aktuální event
  // contract config. Save sám si pak posílá PUT/DELETE na vlastní
  // endpoint (mimo standardní event PATCH).
  const [contractTemplates, setContractTemplates] = useState<
    ContractTemplate[]
  >([]);
  const [eventContract, setEventContract] = useState<
    EventContractConfig | null
  >(null);
  const [contractDirty, setContractDirty] = useState(false);
  const [contractStatus, setContractStatus] = useState<{
    template: number | "";
    auto_send: boolean;
    require_before_payment: boolean;
  }>({ template: "", auto_send: false, require_before_payment: false });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    workspaces
      .mine()
      .then((list) => {
        if (cancelled) return;
        // Unified komunity model — bereme všechny komunity, kde má user
        // permission ke sdílení (owner, admin, nebo member-with-permission).
        // Frontend si pak v event-formu dropdownu filtruje.
        setOwnedWorkspaces(list);
      })
      .catch(() => {
        // Non-blocking; the picker just stays hidden.
        if (!cancelled) setOwnedWorkspaces([]);
      });
    // Personal workspace = vždy fallback target pro „odebrat akci
    // z poslední komunity". Backend `/mine/` ji exclude-uje, takže
    // ji taháme separátním endpointem.
    workspaces
      .personal()
      .then((p) => {
        if (!cancelled) setPersonalWorkspace(p);
      })
      .catch(() => {
        // Bez personal-fallbacku UI prostě blokuje unshare poslední
        // komunity — alespoň user nepřijde o data.
      });
    contractsApi
      .listTemplates(workspaceSlug)
      .then((list) => {
        if (cancelled) return;
        setContractTemplates(list);
      })
      .catch(() => {
        if (!cancelled) setContractTemplates([]);
      });
    // Pokud edit-mode, načteme stávající event contract config.
    if (initial?.slug) {
      contractsApi
        .getEventContract(workspaceSlug, initial.slug)
        .then((cfg) => {
          if (cancelled) return;
          if (cfg && (cfg as { configured?: boolean }).configured !== false) {
            setEventContract(cfg);
            setContractStatus({
              template: cfg.template,
              auto_send: cfg.auto_send_after_rsvp,
              require_before_payment: cfg.require_before_payment,
            });
          }
        })
        .catch(() => {
          /* nakonfigurovaný není */
        });
    }
    auth
      .billingProfiles()
      .then((list) => {
        if (cancelled) return;
        setBillingProfiles(list);
        // Pre-select user's default profile for new paid events.
        if (initial == null && billingProfileId == null) {
          const def = list.find((p) => p.is_default) ?? list[0];
          if (def) setBillingProfileId(def.id);
        }
      })
      .catch(() => {
        // Silently — no profiles means the section just says "vytvoř si profil".
      });
    gear
      .listLists()
      .then((list) => {
        if (cancelled) return;
        setGearLists(list);
      })
      .catch(() => {
        if (!cancelled) setGearLists([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        require_phone_on_rsvp: requirePhoneOnRsvp,
        requires_approval: requiresApproval,
        visibility,
        status,
        enabled_questionnaire_sections: enabledSections,
        price_amount: isPaid && priceAmount ? priceAmount : null,
        price_currency: priceCurrency,
        price_note: isPaid ? priceNote : "",
        payment_in_cash: isPaid ? paymentInCash : false,
        billing_profile:
          isPaid && !paymentInCash ? billingProfileId : null,
        shared_workspace_slugs: sharedSlugs,
        // Drop placeholder rows the owner added with "+ Přidat dokument"
        // but didn't fill in — those would fail server validation and
        // shouldn't block saving the rest of the form.
        required_documents: requiredDocs.filter(
          (d) => d.key.trim() && d.label.trim(),
        ),
        recommended_gear_list: recommendedGearListId,
        risk_checklist: risks.filter(
          (r) => r.key.trim() && r.label.trim(),
        ),
      };
      const event = await onSubmit(payload);
      // Po úspěšném save eventu propíšeme i smlouvu, pokud user změnil
      // konfiguraci. Endpoint je workspace-scoped + event-slug-scoped.
      if (contractDirty) {
        try {
          if (contractStatus.template === "") {
            await contractsApi.removeEventContract(
              event.workspace_slug,
              event.slug,
            );
            setEventContract(null);
          } else {
            const cfg = await contractsApi.setEventContract(
              event.workspace_slug,
              event.slug,
              {
                template: Number(contractStatus.template),
                auto_send_after_rsvp: contractStatus.auto_send,
                require_before_payment: contractStatus.require_before_payment,
              },
            );
            setEventContract(cfg);
          }
          setContractDirty(false);
        } catch (err) {
          // Save eventu už proběhl — smlouva selhala, ale zbytek je OK.
          // Ukážeme error, ať user ví, že smlouva neuložila.
          setError(
            err instanceof ApiError
              ? `Akce uložena, ale smlouva selhala: ${err.message}`
              : "Akce uložena, ale smlouva selhala.",
          );
          return;
        }
      }
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
            {/* Timezone is fixed to Europe/Prague for V1 — owners didn't
                know what to put here and the field added friction. The
                state is still tracked behind the scenes so existing
                events with custom tz keep working. */}
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
                hint="Google Maps nebo Mapy.cz / Mapy.com (i krátký share link). Propíše se do Map blocku v Obsahu — a obráceně."
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
          <h2 className="text-base font-semibold text-ink-900">Cena</h2>
          <p className="mt-1 text-sm text-ink-500">
            Akce zdarma? Nech tohle vypnuté. Pokud zapneš, cena se propíše
            na veřejnou stránku a po registraci se vygenerují pokyny k
            platbě.
          </p>
          <label className="mt-4 flex items-start gap-2 text-sm text-ink-900">
            <input
              type="checkbox"
              checked={isPaid}
              onChange={(e) => setIsPaid(e.target.checked)}
              className="mt-0.5 size-4 accent-brand"
            />
            Akce je placená
          </label>
          {isPaid && (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_120px]">
              <Field label="Cena *" htmlFor="price">
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  min={0}
                  value={priceAmount}
                  onChange={(e) => setPriceAmount(e.target.value)}
                  required={isPaid}
                />
              </Field>
              <Field label="Měna" htmlFor="price-currency">
                <Input
                  id="price-currency"
                  value={priceCurrency}
                  onChange={(e) =>
                    setPriceCurrency(e.target.value.toUpperCase().slice(0, 3))
                  }
                  maxLength={3}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field
                  label="Poznámka k ceně"
                  htmlFor="price-note"
                  hint='Krátký dodatek, např. "vč. DPH" nebo "záloha 1 000 Kč".'
                >
                  <Input
                    id="price-note"
                    value={priceNote}
                    onChange={(e) => setPriceNote(e.target.value)}
                    maxLength={120}
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <label className="flex items-start gap-2 text-sm text-ink-900">
                  <input
                    type="checkbox"
                    checked={paymentInCash}
                    onChange={(e) => setPaymentInCash(e.target.checked)}
                    className="mt-0.5 size-4 accent-brand"
                  />
                  <span className="flex flex-col">
                    <span>Platba v hotovosti na místě</span>
                    <span className="text-xs text-ink-500">
                      Zaškrtni, pokud peníze vybíráš osobně. Vynechá se QR
                      Platba i vystavení faktury — cena se zobrazí jen
                      informativně.
                    </span>
                  </span>
                </label>
              </div>
              {!paymentInCash && (
                <div className="sm:col-span-2">
                  <Field
                    label="Fakturovat z profilu *"
                    htmlFor="billing-profile"
                    hint='Z kterého tvého fakturačního profilu se vystaví faktura. Profily spravuješ v Nastavení → Profil.'
                  >
                    {billingProfiles.length === 0 ? (
                      <p className="rounded-md border border-dashed border-border-strong bg-surface-muted/40 p-3 text-sm text-ink-500">
                        Zatím nemáš žádný fakturační profil. Vytvoř ho
                        v <strong>Nastavení → Profil</strong>, jinak se
                        faktura nebude generovat.
                      </p>
                    ) : (
                      <select
                        id="billing-profile"
                        value={billingProfileId ?? ""}
                        onChange={(e) =>
                          setBillingProfileId(
                            e.target.value ? Number(e.target.value) : null,
                          )
                        }
                        className="h-11 rounded-md border border-border bg-surface px-3 text-sm focus-ring"
                      >
                        <option value="">— vyber profil —</option>
                        {billingProfiles.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                            {p.is_default ? " (výchozí)" : ""}
                          </option>
                        ))}
                      </select>
                    )}
                  </Field>
                </div>
              )}
            </div>
          )}
        </CardSection>
      </Card>

      {(() => {
        // Unified komunity model — žádná „domovská". User vidí jeden
        // seznam komunit, ve kterých event je. Klik na ✕ ji odebere;
        // dropdown přidá novou ze seznamu komunit, kam má user
        // permission ke sdílení. Primární workspace (technicky FK
        // `event.workspace`) je v listu prostě jedna z položek — bez
        // vizuálního zvýraznění. (Backend přesune primary mezi sdílenými
        // pokud user odebere současný primary; viz endpoint
        // `event_move_workspace`.)
        const shareableCommunities = (ownedWorkspaces ?? []).filter(
          (w) => w.can_share_events,
        );
        // Komunity, ve kterých event teď je: workspace + shared slugs,
        // deduplikované. Pořadí: primary první, pak shared v order.
        const inCommunitySlugs: string[] = [
          workspaceSlug,
          ...sharedSlugs.filter((s) => s !== workspaceSlug),
        ];
        const inCommunities = inCommunitySlugs
          .map((slug) =>
            shareableCommunities.find((w) => w.slug === slug) ??
            (ownedWorkspaces ?? []).find((w) => w.slug === slug) ??
            null,
          )
          .filter((w): w is Workspace => w !== null);
        const notYetInCommunitySlugs = new Set(inCommunitySlugs);
        const availableToAdd = shareableCommunities.filter(
          (w) => !notYetInCommunitySlugs.has(w.slug),
        );
        return (
        <Card>
          <CardSection>
            <h2 className="text-base font-semibold text-ink-900">
              Sdíleno v komunitách
            </h2>
            <p className="mt-1 text-sm text-ink-500">
              Akce se objeví v každé komunitě, kterou tu máš zaškrtnutou —
              ve feedu i na veřejném profilu té komunity. Odškrtnutím se
              sdílení zruší; přidat můžeš pomocí dropdownu níže.
            </p>

            <ul className="mt-4 flex flex-col gap-2">
              {inCommunities.map((w) => (
                <li
                  key={w.slug}
                  className="flex items-center gap-3 rounded-md border border-brand bg-brand/5 px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked
                    onChange={() => {
                      // Odebrat ze seznamu. Pokud je to současný primary,
                      // backend volání move-workspace převede event jinam.
                      if (w.slug === workspaceSlug) {
                        if (!onMoveToWorkspace) return;
                        // Hledáme cílovou komunitu, kam event přesunout.
                        // Preference:
                        //   1) Jiná shared komunita v current listu, kde
                        //      jsi owner/admin (zachová sdílení tam).
                        //   2) Jakákoli další komunita, kterou vlastníš
                        //      (mimo current list).
                        //   3) Tvůj soukromý workspace (personal) jako
                        //      poslední záchrana — event tam vždycky
                        //      patří, je to tvůj vlastní prostor.
                        const inListCandidate = inCommunities.find(
                          (c) =>
                            c.slug !== workspaceSlug &&
                            (c.my_role === "owner" || c.my_role === "admin"),
                        );
                        const ownedElsewhere = (ownedWorkspaces ?? []).find(
                          (c) =>
                            c.slug !== workspaceSlug &&
                            !sharedSlugs.includes(c.slug) &&
                            (c.my_role === "owner" || c.my_role === "admin"),
                        );
                        const target =
                          inListCandidate ?? ownedElsewhere ?? personalWorkspace;
                        if (!target) {
                          // eslint-disable-next-line no-alert
                          alert(
                            "Tvoji akci momentálně nemám kam přesunout. Zkontroluj si Komunity v Tvůrci.",
                          );
                          return;
                        }
                        void onMoveToWorkspace(target.slug);
                        return;
                      }
                      setSharedSlugs((prev) =>
                        prev.filter((s) => s !== w.slug),
                      );
                    }}
                    className="size-4 accent-brand"
                    aria-label={`Odebrat ${w.name}`}
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium text-ink-900">
                      {w.name}
                    </span>
                    {w.location && (
                      <span className="truncate text-xs text-ink-500">
                        {w.location}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>

            {availableToAdd.length > 0 && (
              <div className="mt-4 flex items-center gap-2">
                <select
                  value=""
                  onChange={(e) => {
                    const slug = e.target.value;
                    if (!slug) return;
                    setSharedSlugs((prev) =>
                      prev.includes(slug) ? prev : [...prev, slug],
                    );
                    e.target.value = "";
                  }}
                  className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink-900 focus-ring"
                  aria-label="Přidat komunitu, kam akci sdílet"
                >
                  <option value="">+ Přidat komunitu, kam sdílet…</option>
                  {availableToAdd.map((w) => (
                    <option key={w.slug} value={w.slug}>
                      {w.name}
                      {w.my_role && w.my_role !== "owner"
                        ? ` (${w.my_role === "admin" ? "admin" : "člen"})`
                        : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {availableToAdd.length === 0 && inCommunities.length <= 1 && (
              <p className="mt-3 text-xs text-ink-500">
                Nemáš další komunitu, kam by se akce dala sdílet. Vytvoř
                si komunitu nebo se přidej do existující v sekci{" "}
                <a
                  href="/admin/komunity"
                  className="font-medium text-ink-700 underline hover:text-ink-900"
                >
                  Komunity
                </a>
                .
              </p>
            )}
          </CardSection>
        </Card>
        );
      })()}

      <Card>
        <CardSection>
          <h2 className="text-base font-semibold text-ink-900">Smlouva</h2>
          <p className="mt-1 text-sm text-ink-500">
            Volitelně připoj šablonu smlouvy k této akci. Při odeslání
            (manuálně z rosteru nebo automaticky po RSVP) vygenerujeme
            PDF s vyplněnými daty účastníka a pošleme přes Signi.cz
            k digitálnímu podpisu — účastník dostane e-mail od Signi
            s podpisovým linkem.
          </p>

          {contractTemplates.length === 0 ? (
            <div className="mt-4 rounded-md border border-dashed border-border bg-surface-muted/40 px-3 py-3 text-sm text-ink-500">
              Zatím nemáš žádnou šablonu smlouvy. Vytvoř si ji v sekci{" "}
              <a
                href="/admin/smlouvy"
                className="font-medium text-ink-700 underline hover:text-ink-900"
              >
                Smlouvy
              </a>
              .
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              <Field label="Šablona smlouvy" htmlFor="contract_template">
                <select
                  id="contract_template"
                  value={contractStatus.template}
                  onChange={(e) => {
                    const v = e.target.value;
                    setContractStatus((prev) => ({
                      ...prev,
                      template: v ? Number(v) : "",
                    }));
                    setContractDirty(true);
                  }}
                  className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink-900 focus-ring"
                >
                  <option value="">— Bez smlouvy —</option>
                  {contractTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
              {contractStatus.template !== "" && (
                <>
                  <label className="flex items-start gap-3 rounded-md border border-border p-3 text-sm hover:bg-surface-muted has-[input:checked]:border-brand">
                    <input
                      type="checkbox"
                      checked={contractStatus.auto_send}
                      onChange={(e) => {
                        setContractStatus((prev) => ({
                          ...prev,
                          auto_send: e.target.checked,
                        }));
                        setContractDirty(true);
                      }}
                      className="mt-0.5 size-4 accent-brand"
                    />
                    <span className="flex flex-col">
                      <span className="font-medium text-ink-900">
                        Posílat automaticky po RSVP
                      </span>
                      <span className="text-xs text-ink-500">
                        Po každém novém přihlášení vygenerujeme PDF a
                        pošleme účastníkovi přes Signi. Pokud vypnuto,
                        pošleš ručně z rosteru.
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start gap-3 rounded-md border border-border p-3 text-sm hover:bg-surface-muted has-[input:checked]:border-brand">
                    <input
                      type="checkbox"
                      checked={contractStatus.require_before_payment}
                      onChange={(e) => {
                        setContractStatus((prev) => ({
                          ...prev,
                          require_before_payment: e.target.checked,
                        }));
                        setContractDirty(true);
                      }}
                      className="mt-0.5 size-4 accent-brand"
                    />
                    <span className="flex flex-col">
                      <span className="font-medium text-ink-900">
                        Vyžadovat podpis před platbou
                      </span>
                      <span className="text-xs text-ink-500">
                        Účastník nemůže být označen zaplacen, dokud
                        nemá podepsanou smlouvu.
                      </span>
                    </span>
                  </label>
                </>
              )}
              {eventContract && (
                <p className="text-xs text-ink-500">
                  Aktuálně připojená šablona:{" "}
                  <strong>{eventContract.template_name}</strong>
                </p>
              )}
            </div>
          )}
        </CardSection>
      </Card>

      <Card>
        <CardSection>
          <h2 className="text-base font-semibold text-ink-900">
            Doporučené vybavení
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            Přiřaď jeden ze svých gear seznamů jako doporučené vybavení.
            Na public stránce eventu se ukáže jako bare seznam (jména +
            kategorie); přihlášený účastník dostane interaktivní
            checklist s odškrtáváním.
          </p>

          {gearLists.length === 0 ? (
            <p className="mt-3 rounded-md border border-dashed border-border-strong bg-surface-muted/40 p-3 text-sm text-ink-500">
              Zatím nemáš žádný gear seznam. Vytvoř si ho v{" "}
              <strong>Tvůrce → Vybavení</strong>.
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select
                value={recommendedGearListId ?? ""}
                onChange={(e) =>
                  setRecommendedGearListId(
                    e.target.value ? Number(e.target.value) : null,
                  )
                }
                className="flex-1 min-w-[220px] rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink-900 focus-ring"
              >
                <option value="">— žádný gear seznam —</option>
                {gearLists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({l.item_count}{" "}
                    {l.item_count === 1
                      ? "položka"
                      : l.item_count < 5
                        ? "položky"
                        : "položek"}
                    )
                  </option>
                ))}
              </select>
              {recommendedGearListId != null && (
                <button
                  type="button"
                  onClick={() => setRecommendedGearListId(null)}
                  className="text-xs font-medium text-ink-500 hover:text-danger"
                >
                  Odebrat
                </button>
              )}
            </div>
          )}
        </CardSection>
      </Card>

      <Card>
        <CardSection>
          <h2 className="text-base font-semibold text-ink-900">
            Rizika a příprava
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            Interní checklist před akcí — počasí, trasa, vybavení,
            zdraví, komunikace, doprava. Účastníci to nevidí, jen ty
            a spolutvůrci.
          </p>

          {risks.length === 0 ? (
            <div className="mt-4 rounded-md border border-dashed border-border-strong bg-surface-muted/40 p-4 text-center">
              <p className="text-sm text-ink-500">
                Zatím prázdné. Začni se šablonou, nebo přidej vlastní
                položku.
              </p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setRisks(RISK_TEMPLATE)}
                  className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-brand-ink hover:opacity-90"
                >
                  Načíst šablonu
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setRisks([
                      {
                        key: `custom-${Date.now()}`,
                        label: "",
                        category: "",
                        status: "open",
                        notes: "",
                      },
                    ])
                  }
                  className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-surface-muted"
                >
                  + Vlastní položka
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-2">
              {(() => {
                const done = risks.filter((r) => r.status === "done").length;
                return (
                  <div className="flex items-center justify-between text-xs text-ink-500">
                    <span>
                      <strong className="text-ink-900 tabular-nums">
                        {done}
                      </strong>{" "}
                      / {risks.length} hotovo
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setRisks((prev) => [
                            ...prev,
                            {
                              key: `custom-${Date.now()}`,
                              label: "",
                              category: "",
                              status: "open",
                              notes: "",
                            },
                          ])
                        }
                        className="font-medium text-brand hover:underline"
                      >
                        + Přidat položku
                      </button>
                    </div>
                  </div>
                );
              })()}
              <div className="flex flex-col gap-2">
                {risks.map((r, idx) => (
                  <div
                    key={`${r.key}-${idx}`}
                    className={[
                      "flex flex-col gap-2 rounded-md border bg-surface p-3 text-sm",
                      r.status === "done"
                        ? "border-success/40 bg-success/5"
                        : "border-border",
                    ].join(" ")}
                  >
                    <div className="flex flex-wrap items-start gap-2">
                      <select
                        value={r.status}
                        onChange={(e) =>
                          setRisks((prev) =>
                            prev.map((x, i) =>
                              i === idx
                                ? {
                                    ...x,
                                    status: e.target
                                      .value as RiskChecklistItem["status"],
                                  }
                                : x,
                            ),
                          )
                        }
                        className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-ink-700 focus-ring"
                      >
                        <option value="open">Otevřené</option>
                        <option value="done">Hotovo</option>
                        <option value="na">Nepoužije se</option>
                      </select>
                      <input
                        type="text"
                        value={r.label}
                        onChange={(e) =>
                          setRisks((prev) =>
                            prev.map((x, i) =>
                              i === idx ? { ...x, label: e.target.value } : x,
                            ),
                          )
                        }
                        placeholder="Co zkontrolovat?"
                        className="flex-1 min-w-[200px] rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-ink-900 focus-ring"
                      />
                      <input
                        type="text"
                        value={r.category}
                        onChange={(e) =>
                          setRisks((prev) =>
                            prev.map((x, i) =>
                              i === idx
                                ? { ...x, category: e.target.value }
                                : x,
                            ),
                          )
                        }
                        placeholder="Kategorie"
                        className="w-32 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-ink-700 focus-ring"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setRisks((prev) =>
                            prev.filter((_, i) => i !== idx),
                          )
                        }
                        className="text-xs font-medium text-ink-500 hover:text-danger"
                      >
                        Smazat
                      </button>
                    </div>
                    <textarea
                      rows={2}
                      value={r.notes}
                      onChange={(e) =>
                        setRisks((prev) =>
                          prev.map((x, i) =>
                            i === idx ? { ...x, notes: e.target.value } : x,
                          ),
                        )
                      }
                      placeholder="Poznámka (volitelná)…"
                      className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-ink-700 focus-ring"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardSection>
      </Card>

      <Card>
        <CardSection>
          <h2 className="text-base font-semibold text-ink-900">
            Požadované dokumenty
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            Co budeš po účastnících chtít doložit? Vyber ze standardních
            typů, ať se to dá reportovat napříč akcemi. Pokud potřebuješ
            něco jiného, použij <strong>Vlastní dokument</strong>.
          </p>

          <div className="mt-4 flex flex-col gap-2">
            {requiredDocs.length === 0 ? (
              <p className="rounded-md border border-dashed border-border-strong bg-surface-muted/40 p-3 text-sm text-ink-500">
                Zatím žádné dokumenty. Přidej níže, pokud po účastnících
                budeš něco vyžadovat.
              </p>
            ) : (
              requiredDocs.map((d, idx) => {
                const preset = DOC_PRESETS.find((p) => p.key === d.key);
                const isCustom = !preset;
                return (
                  <div
                    key={idx}
                    className="grid grid-cols-1 items-center gap-2 rounded-md border border-border p-3 sm:grid-cols-[1fr_auto_auto]"
                  >
                    {isCustom ? (
                      <Input
                        value={d.label}
                        placeholder="Název vlastního dokumentu"
                        onChange={(e) =>
                          setRequiredDocs((prev) =>
                            prev.map((p, i) =>
                              i === idx
                                ? {
                                    ...p,
                                    label: e.target.value,
                                    key: slugifyDocKey(e.target.value, idx),
                                  }
                                : p,
                            ),
                          )
                        }
                      />
                    ) : (
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-ink-900">
                          {preset.label}
                        </span>
                        <span className="font-mono text-[10px] uppercase tracking-wide text-ink-500">
                          {preset.key}
                        </span>
                      </div>
                    )}
                    <label className="flex items-center gap-2 text-xs text-ink-700">
                      <input
                        type="checkbox"
                        checked={d.required}
                        onChange={(e) =>
                          setRequiredDocs((prev) =>
                            prev.map((p, i) =>
                              i === idx
                                ? { ...p, required: e.target.checked }
                                : p,
                            ),
                          )
                        }
                        className="size-4 accent-brand"
                      />
                      Povinný
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setRequiredDocs((prev) =>
                          prev.filter((_, i) => i !== idx),
                        )
                      }
                      className="rounded-md border border-border bg-surface px-3 py-1 text-xs text-ink-500 hover:text-danger"
                    >
                      Smazat
                    </button>
                  </div>
                );
              })
            )}

            <div className="mt-2 flex flex-wrap gap-2">
              {DOC_PRESETS.map((p) => {
                const used = requiredDocs.some((d) => d.key === p.key);
                return (
                  <button
                    key={p.key}
                    type="button"
                    disabled={used}
                    onClick={() =>
                      setRequiredDocs((prev) => [
                        ...prev,
                        { key: p.key, label: p.label, required: true },
                      ])
                    }
                    className="inline-flex items-center rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    + {p.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() =>
                  setRequiredDocs((prev) => [
                    ...prev,
                    {
                      key: slugifyDocKey("", prev.length),
                      label: "",
                      required: true,
                    },
                  ])
                }
                className="inline-flex items-center rounded-md border border-dashed border-border-strong bg-surface px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-surface-muted"
              >
                + Vlastní dokument
              </button>
            </div>
          </div>
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
          {/* Telefon je technicky "account" pole (ne questionnaire
              sekce), ale pro ownera je to UI taky volba "co chcu mít
              na formuláři". Sourozenec sekcím dotazníku — sjednocené
              místo, kde rozhoduje co vidí účastník. */}
          <label className="mt-4 flex items-start gap-3 rounded-md border border-border p-3 text-sm hover:bg-surface-muted has-[input:checked]:border-brand">
            <input
              type="checkbox"
              checked={requirePhoneOnRsvp}
              onChange={(e) => setRequirePhoneOnRsvp(e.target.checked)}
              className="mt-0.5 size-4 accent-brand"
            />
            <span className="flex flex-col">
              <span className="font-medium text-ink-900">
                Telefon
              </span>
              <span className="text-xs text-ink-500">
                Doporučeno pro většinu akcí — telefon je klíčový pro
                emergencie. U casual akcí (BBQ, komunitní setkání)
                nech odznačené a pole se vůbec nezobrazí.
              </span>
            </span>
          </label>
          <div className="mt-2 grid grid-cols-1 gap-2">
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

/** Trigger pro „Přesunout akci do jiné komunity". Per-event move
 *  endpoint dotneme s vybranou cílovou komunitou. Po úspěchu parent
 *  router-uje na novou URL (`/<new-ws>/e/<slug>/edit`). */
function MoveWorkspaceTrigger({
  candidates,
  onMove,
}: {
  candidates: Workspace[];
  onMove: (
    targetWorkspaceSlug: string,
  ) => Promise<{ new_workspace_slug: string; event_slug: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(candidates[0]?.slug ?? "");
  const [moving, setMoving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    setMoving(true);
    setErr(null);
    try {
      await onMove(target);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Přesun selhal.");
    } finally {
      setMoving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-ink-700 underline hover:text-ink-900"
      >
        Přesunout do jiné komunity…
      </button>
    );
  }

  return (
    <form onSubmit={handle} className="flex flex-wrap items-center gap-2">
      <select
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        className="rounded-md border border-border bg-surface px-2 py-1 text-sm focus-ring"
      >
        {candidates.map((w) => (
          <option key={w.slug} value={w.slug}>
            {w.name}
          </option>
        ))}
      </select>
      <Button type="submit" variant="primary" size="md" loading={moving}>
        {moving ? "Přesouvám…" : "Přesunout"}
      </Button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        disabled={moving}
        className="text-xs text-ink-500 hover:text-ink-900"
      >
        Zrušit
      </button>
      {err && <p className="w-full text-xs text-danger">{err}</p>}
    </form>
  );
}
