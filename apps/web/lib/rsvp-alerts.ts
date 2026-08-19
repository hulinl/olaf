/**
 * Non-standard hodnoty v RSVP dotazníku, které chce organizátor
 * ihned vidět v rosteru — aby si nezapomněl na alergie, speciální
 * stravu, začátečníky na náročné akci apod.
 *
 * Safety-critical: pokud někdo vyplní „alergie na oříšky" a
 * organizátor si toho nevšimne, může to dopadnout špatně. Standard
 * hodnoty (omnivore, no notes) alerty nevytváří.
 */
import type { RSVPAnswers } from "./api";

export type RsvpAlertKind =
  | "diet"           // vegetarian / vegan / other / diet_note vyplněn
  | "health"         // health_notes vyplněn (alergie, léky, ...)
  | "photo_optout"   // photo_consent = false → foto opatrně
  | "fitness_low";   // fitness_level = beginner (informační, ne warning)

export interface RsvpAlert {
  kind: RsvpAlertKind;
  icon: string;
  label: string;
  /** Konkrétní odpověď z dotazníku pro expand-detail. */
  detail: string;
  /** Tone pro CSS badge — safety pro alergie, brand pro info. */
  tone: "safety" | "brand" | "muted";
}

export function computeRsvpAlerts(a: RSVPAnswers | Record<string, never>): RsvpAlert[] {
  const alerts: RsvpAlert[] = [];

  // Dieta — cokoli mimo "omnivore" chceme vidět (organizátor musí
  // zajistit odpovídající jídlo). `diet_note` navíc = specifické
  // rozšíření (např. „mléčná bílkovina") — vždy alert.
  const diet = a.diet;
  const dietNote = a.diet_note?.trim();
  if (diet === "vegetarian" || diet === "vegan" || diet === "other" || dietNote) {
    const label =
      diet === "vegan"
        ? "Vegan"
        : diet === "vegetarian"
          ? "Vegetarian"
          : diet === "other"
            ? "Speciální strava"
            : "Strava – pozn.";
    const detailParts = [
      diet && diet !== "omnivore" ? label : "",
      dietNote,
    ].filter(Boolean);
    alerts.push({
      kind: "diet",
      icon: "🥕",
      label,
      detail: detailParts.join(" · "),
      tone: "brand",
    });
  }

  // Zdravotní poznámky — obvykle alergie, medikace, chronické.
  // Free-text pole; jakýkoli obsah = alert (nesmíme filtrovat, protože
  // rozhodnutí co je "vážné" je na organizátorovi).
  const health = a.health_notes?.trim();
  if (health) {
    alerts.push({
      kind: "health",
      icon: "⚠️",
      label: "Zdravotní poznámka",
      detail: health,
      tone: "safety",
    });
  }

  // Photo consent = false — organizátor při focení musí být opatrný,
  // nesmí ten člověk být v propagačních fotkách. Explicitně `=== false`,
  // ne prostě falsy, aby chybějící answer nevyvolala false alert.
  if (a.photo_consent === false) {
    alerts.push({
      kind: "photo_optout",
      icon: "📷",
      label: "Bez focení",
      detail: "Účastník nesouhlasil s pořizováním fotek pro propagaci.",
      tone: "muted",
    });
  }

  // Fitness beginner — informační signal, ne warning. Užitečné pro
  // organizátora, aby věděl, koho víc podpořit / kam si nesednout.
  const fit = a.fitness_level;
  if (fit === "beginner") {
    const note = a.fitness_note?.trim();
    alerts.push({
      kind: "fitness_low",
      icon: "💪",
      label: "Začátečník",
      detail: note ? `Začátečník · ${note}` : "Začátečnická úroveň kondice.",
      tone: "muted",
    });
  }

  return alerts;
}
