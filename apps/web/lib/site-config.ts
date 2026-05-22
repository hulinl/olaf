/**
 * Site-wide marketing config — single source of truth for the
 * presentation landing, the manual index, the blog category nav, and
 * SEO metadata.
 *
 * When you add a new feature to the app and want it surfaced on the
 * marketing site, add an entry to FEATURES + (ideally) a manual
 * article slug it links to. The landing renders them in the order
 * defined here.
 */

export const SITE = {
  name: "olaf",
  domain: "olaf.events",
  url: "https://olaf.events",
  tagline: "Kde začíná dobrodružství.",
  description:
    "olaf je platforma pro outdoor party, sportovní komunity a firemní akce. Komunita má profil, akce mají landing page, přihlášky mají pořádek a tvůrce má cockpit, kde to všechno řídí.",
  ogImage: "/og.png",
  twitter: "@olafevents",
  locale: "cs_CZ",
} as const;

export interface FeatureEntry {
  id: string;
  /** Mono-uppercased eyebrow above the section title (e.g. "01 · Komunita"). */
  number: string;
  /** Short tag rendered next to the number. */
  tag: string;
  /** Section title — supports a "highlight" word for accent color. */
  title: string;
  highlight?: string;
  /** ~2-sentence intro paragraph. */
  lede: string;
  /** 3-5 capability bullets shown beside the screenshot. */
  bullets: string[];
  /** Path under /public for the screenshot. Placeholder until real images. */
  screenshot: string;
  /** Optional alt for the screenshot. */
  screenshotAlt?: string;
  /** Link to the related manual article (slug only, no /manual prefix). */
  manualSlug?: string;
  /** Side the screenshot renders on (alternate for visual rhythm). */
  side: "left" | "right";
}

export const FEATURES: FeatureEntry[] = [
  {
    id: "komunita",
    number: "01",
    tag: "Komunita",
    title: "Domov pro tvoji partu",
    highlight: "partu",
    lede:
      "Veřejný profil komunity s logem, popisem a všemi akcemi na jednom místě. Účastníci vidí, kdo jste a kam chystáte další výpravu.",
    bullets: [
      "Vlastní URL `olaf.events/tvoje-komunita`",
      "Logo, cover, popis, sociální odkazy",
      "Seznam nadcházejících i proběhnutých akcí",
      "Členové, role (owner / admin / member), pozvánky",
      "Vnitřní nástěnka pro diskusi nad rámec jedné akce",
    ],
    screenshot: "/screenshots/komunita.svg",
    screenshotAlt: "Profil komunity Olaf Adventures",
    manualSlug: "vytvorit-komunitu",
    side: "right",
  },
  {
    id: "landing-builder",
    number: "02",
    tag: "Stránka akce",
    title: "Vlastní stránka pro každou akci, bez vývojáře",
    highlight: "bez vývojáře",
    lede:
      "Skládáš stránku akce z bloků jako z Lega. Hero, program po dnech, mapa, fotky, cena, FAQ. Co naskládáš dovnitř, to lidi vidí venku.",
    bullets: [
      "9+ typů bloků: hero, prose, days, stats, gallery, map, FAQ, practical, included",
      "Drag-and-drop pořadí, inline editace",
      "Cover obrázek, automatický downscale",
      "Public landing s OG metadaty pro sdílení",
    ],
    screenshot: "/screenshots/landing-builder.svg",
    screenshotAlt: "Builder s bloky landing page akce",
    manualSlug: "skladani-landing-page",
    side: "left",
  },
  {
    id: "prihlasky",
    number: "03",
    tag: "Přihlášky",
    title: "Registrace, jak je chceš mít",
    highlight: "jak je chceš mít",
    lede:
      "Vlastní otázky podle typu akce — velikost trička, doprava, zdravotní omezení, dietní specifika. Profil účastníka se předvyplní sám, opakované registrace jsou rychlé.",
    bullets: [
      "Konfigurovatelný dotazník (sekce profil, doprava, jídlo, zdraví, gear)",
      "Kapacita + waitlist se schvalováním",
      "Anonymní přihlášení nebo přes účet",
      "Duplicate-detection badge pro stejný telefon / jméno",
      "Owner přehled v tabulce + mobile kartách",
    ],
    screenshot: "/screenshots/prihlasky.svg",
    screenshotAlt: "Seznam přihlášek v cockpitu",
    manualSlug: "spravovat-prihlasky",
    side: "right",
  },
  {
    id: "platby",
    number: "04",
    tag: "Platby",
    title: "QR Platba a faktury bez chaosu",
    highlight: "bez chaosu",
    lede:
      'Účastník dostane QR kód s variabilním symbolem, fakturu v PDF a stav platby vidí na své stránce. Ty máš jeden klik pro „zaplaceno" — nebo Fio CSV import.',
    bullets: [
      "SPAYD QR Platba (Česká banka, číslo účtu + VS)",
      "Auto-generované faktury v PDF s vlastním brandingem",
      "Mark-as-paid jedním klikem nebo Fio CSV reconcile",
      "Variabilní symbol stabilní per RSVP (event ID + RSVP ID)",
      "Hotovostní platby pro malé akce",
    ],
    screenshot: "/screenshots/platby.svg",
    screenshotAlt: "QR Platba s variabilním symbolem",
    manualSlug: "platby-qr-faktury",
    side: "left",
  },
  {
    id: "cockpit",
    number: "05",
    tag: "Cockpit",
    title: "Tvůrce má všechno na jednom místě",
    highlight: "všechno na jednom místě",
    lede:
      "Roadmapa akce, checklist připomínek, profily přihlášených, audit aktivity, kontrolní statistiky. Vidíš, co je hotovo a co řešit dnes.",
    bullets: [
      "Statistiky kapacity, čeká na schválení, neplaceno",
      "Checklist roadmapy se scheduled e-maily účastníkům",
      "Click-through na profil každého účastníka",
      "Risk checklist (počasí, trasa, vybavení, zdraví, komunikace, doprava)",
      "Audit log — kdo co udělal, append-only",
    ],
    screenshot: "/screenshots/cockpit.svg",
    screenshotAlt: "Cockpit pořadatele s roadmapou a statistikami",
    manualSlug: "cockpit-poradatele",
    side: "right",
  },
  {
    id: "nastenka",
    number: "06",
    tag: "Nástěnka",
    title: "Diskuse pro komunitu i konkrétní akci",
    highlight: "i konkrétní akci",
    lede:
      "Témata, lajky, komentáře, @-zmínky. E-mail + push notifikace o nových příspěvcích. Vlastní nástěnka pro každou komunitu i pro každou akci zvlášť.",
    bullets: [
      "Komentáře s obrázky, lajky, vlákna",
      "@-mention upozorní konkrétního člena",
      "Push notifikace v PWA na mobilu",
      "Per-kind preferences (kdo chce co dostávat)",
      "Pin + lock pro moderaci ownerem nebo adminem",
    ],
    screenshot: "/screenshots/nastenka.svg",
    screenshotAlt: "Vlákno na nástěnce s komentáři",
    manualSlug: "diskuse-nastenka",
    side: "left",
  },
  {
    id: "audit",
    number: "07",
    tag: "Audit + Trash",
    title: "Žádné překvapení, žádný strach z mazání",
    highlight: "žádný strach z mazání",
    lede:
      "Co se v aplikaci stalo, vidíš v audit logu. Co omylem smažeš, sedí 30 dní v koši — kdykoliv to vrátíš zpátky.",
    bullets: [
      "Append-only audit: vytvoření, úprava, smazání, schválení, role změna",
      "Workspace-scoped feed, filtr podle typu akce",
      "Soft-delete akcí s 30denní retencí, hard-purge automaticky",
      "Pro moderátory vidět kdo (a kdy) odstranil komentář",
    ],
    screenshot: "/screenshots/audit.svg",
    screenshotAlt: "Audit log s historií akcí ve workspacu",
    manualSlug: "audit-a-kos",
    side: "right",
  },
];

export interface ManualCategory {
  id: string;
  label: string;
  description: string;
}

export const MANUAL_CATEGORIES: ManualCategory[] = [
  {
    id: "zaciname",
    label: "Začínáme",
    description: "Účet, profil, první komunita, první akce.",
  },
  {
    id: "komunita",
    label: "Komunita",
    description: "Profil, členové, role, pozvánky, nástěnka komunity.",
  },
  {
    id: "akce",
    label: "Akce",
    description: "Vytvoření akce, landing builder, kapacita, schvalování.",
  },
  {
    id: "prihlasky",
    label: "Přihlášky a účastníci",
    description: "Otázky, waitlist, duplicate detection, profil účastníka.",
  },
  {
    id: "platby",
    label: "Platby a faktury",
    description: "QR Platba, faktury PDF, Fio import, hotovost.",
  },
  {
    id: "pokrocile",
    label: "Pokročilé",
    description: "Audit log, soft-delete, risk checklist, integrace.",
  },
];

export interface BlogCategory {
  id: string;
  label: string;
}

export const BLOG_CATEGORIES: BlogCategory[] = [
  { id: "pripadovka", label: "Případovka" },
  { id: "novinka", label: "Novinka" },
  { id: "navod", label: "Tipy a triky" },
  { id: "uvahy", label: "Úvahy" },
];

export const PUBLIC_NAV = [
  { href: "/", label: "Úvod" },
  { href: "/manual", label: "Návody" },
  { href: "/blog", label: "Blog" },
] as const;
