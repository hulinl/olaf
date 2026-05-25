/**
 * Block builder presets — předpřipravené sady bloků pro typické scénáře.
 *
 * Owner v cockpitu klikne „Použít vzor” → vybere preset → bloky se vloží
 * do akce (s warningem pokud už nějaké jsou). Pak je doupraví v builderu.
 *
 * Cíl: snížit bariéru „prázdné stránky”. Místo přemýšlení „co tam dát”
 * začne od vzoru, který už zhruba vypadá, a jen ho přepisuje.
 *
 * Presety reusují `sample-event-landing.ts` data, takže vizuální průvodce
 * a presety jsou v sync — co user viděl v návodu, dostane jako šablonu.
 */
import {
  SAMPLE_DAYS,
  SAMPLE_FAQ,
  SAMPLE_GALLERY,
  SAMPLE_HERO,
  SAMPLE_INCLUDED,
  SAMPLE_MAP,
  SAMPLE_PRACTICAL,
  SAMPLE_PROSE_INTRO,
  SAMPLE_STATS,
} from "./sample-event-landing";
import type { EventBlock } from "./event-blocks";

export interface EventBlockPreset {
  id: string;
  name: string;
  /** Krátký, 1 řádek — pro koho preset je. */
  tagline: string;
  /** Detail — kdy zvolit. */
  description: string;
  /** Lidský label kategorií — pro grouping v UI. */
  category: "trek" | "vikend" | "lokalni";
  /** Counts pro mini-overview v kartě presetu. */
  blockCount: number;
  /** Factory — vrací čerstvé `EventBlock[]` s vygenerovanými ID (nezávislé instance). */
  build: () => EventBlock[];
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

const MULTI_DAY_TREK_BLOCKS = (): EventBlock[] => [
  { id: newId(), type: "hero", payload: { ...SAMPLE_HERO } },
  { id: newId(), type: "prose", payload: { ...SAMPLE_PROSE_INTRO } },
  { id: newId(), type: "stats", payload: { ...SAMPLE_STATS, tiles: [...SAMPLE_STATS.tiles] } },
  {
    id: newId(),
    type: "days",
    payload: { ...SAMPLE_DAYS, days: SAMPLE_DAYS.days.map((d) => ({ ...d })) },
  },
  {
    id: newId(),
    type: "included_split",
    payload: {
      ...SAMPLE_INCLUDED,
      included: SAMPLE_INCLUDED.included.map((i) => ({ ...i })),
      not_included: SAMPLE_INCLUDED.not_included.map((i) => ({ ...i })),
    },
  },
  { id: newId(), type: "practical", payload: { ...SAMPLE_PRACTICAL } },
  { id: newId(), type: "map", payload: { ...SAMPLE_MAP } },
  { id: newId(), type: "gallery", payload: { ...SAMPLE_GALLERY } },
  {
    id: newId(),
    type: "faq",
    payload: { ...SAMPLE_FAQ, items: SAMPLE_FAQ.items.map((i) => ({ ...i })) },
  },
];

const WEEKEND_CAMP_BLOCKS = (): EventBlock[] => [
  {
    id: newId(),
    type: "hero",
    payload: {
      eyebrow: "Víkendový camp",
      title_override: "",
      subtitle: "",
      cta_label: "Přihlásit se",
      cta_href: "#rsvp",
      meta: [
        { k: "Termín", v: "doplň termín" },
        { k: "Místo", v: "doplň místo" },
        { k: "Cena", v: "doplň cenu" },
        { k: "Kapacita", v: "doplň kapacitu" },
      ],
    },
  },
  {
    id: newId(),
    type: "prose",
    payload: {
      eyebrow: "O akci",
      heading: "Krátký popis akce",
      body:
        "Napiš 2–3 odstavce o tom, co účastníky čeká. Jaká je atmosféra, " +
        "co se bude dít, pro koho je akce.",
      image_side: "right",
    },
  },
  {
    id: newId(),
    type: "practical",
    payload: {
      eyebrow: "Praktické info",
      title: "Logistika",
      transport: "Jak se dostat na místo (vlak, auto, sraz).",
      accommodation: "Kde se spí (stan, chata, penzion).",
      gear: "Hrubě co s sebou — detail v gear listu.",
      difficulty_level: 2,
      difficulty_note: "Pro koho je víkend vhodný.",
    },
  },
  {
    id: newId(),
    type: "included_split",
    payload: {
      price_value: "",
      price_unit: "Kč",
      price_note: "",
      included: [
        { label: "Ubytování", desc: "" },
        { label: "Snídaně", desc: "" },
        { label: "Průvodce", desc: "" },
      ],
      not_included: [
        { label: "Doprava", desc: "" },
        { label: "Obědy / večeře", desc: "" },
      ],
    },
  },
  {
    id: newId(),
    type: "faq",
    payload: {
      eyebrow: "FAQ",
      title: "Časté dotazy",
      items: [
        { question: "Co když bude pršet?", answer: "Doplň odpověď." },
        { question: "Vrácení peněz při zrušení?", answer: "Doplň pravidla storna." },
        { question: "Můžu přijet vlastním autem?", answer: "Doplň." },
      ],
    },
  },
];

const LOCAL_DAYTRIP_BLOCKS = (): EventBlock[] => [
  {
    id: newId(),
    type: "hero",
    payload: {
      eyebrow: "Jednodenní akce",
      title_override: "",
      subtitle: "Krátký claim — jedna věta, max 12 slov.",
      cta_label: "Přihlásit se",
      cta_href: "#rsvp",
      meta: [
        { k: "Termín", v: "doplň datum" },
        { k: "Sraz", v: "doplň místo srazu" },
        { k: "Cena", v: "zdarma / doplň" },
      ],
    },
  },
  {
    id: newId(),
    type: "prose",
    payload: {
      eyebrow: "O akci",
      heading: "Co tě čeká",
      body:
        "2–3 odstavce o tom, co se bude dít. Atmosféra, trasa, " +
        "co si z toho účastník odnese.",
      image_side: "right",
    },
  },
  {
    id: newId(),
    type: "map",
    payload: {
      eyebrow: "Trasa",
      title: "Místo srazu a trasa",
      caption: "Doplň krátký popisek trasy.",
      map_url: "https://mapy.cz/zakladni?x=14.42&y=50.08&z=12",
    },
  },
  {
    id: newId(),
    type: "faq",
    payload: {
      eyebrow: "FAQ",
      title: "Časté dotazy",
      items: [
        { question: "Co když bude pršet?", answer: "Doplň odpověď." },
        { question: "Co si vzít?", answer: "Doplň." },
      ],
    },
  },
];

export const EVENT_BLOCK_PRESETS: EventBlockPreset[] = [
  {
    id: "multi-day-trek",
    name: "Vícedenní trek",
    tagline: "Multi-day akce v horách — Pitztal-style",
    description:
      "Kompletní 9-bloková stránka pro vícedenní trek nebo camp. Obsahuje hero, " +
      "„o akci”, statistiky, program po dnech, ceník, praktické info, mapu, galerii " +
      "a FAQ. Vychází z reálné Pitztal akce — přepiš text a fotky.",
    category: "trek",
    blockCount: 9,
    build: MULTI_DAY_TREK_BLOCKS,
  },
  {
    id: "weekend-camp",
    name: "Víkendový camp",
    tagline: "2–3 dny, lokální, méně logistiky",
    description:
      "5 bloků pro víkendovku — hero, popis, praktické info, ceník, FAQ. " +
      "Bez programu po dnech (víkend je krátký) a bez galerie/mapy (přidáš si je " +
      "později v builderu).",
    category: "vikend",
    blockCount: 5,
    build: WEEKEND_CAMP_BLOCKS,
  },
  {
    id: "local-daytrip",
    name: "Jednodenní výlet",
    tagline: "Lokální akce, půldenní až celodenní",
    description:
      "Minimal 4-bloková stránka — hero, krátký popis, mapa trasy, FAQ. " +
      "Pro lokální výlety, sraz v parku, večerní procházku.",
    category: "lokalni",
    blockCount: 4,
    build: LOCAL_DAYTRIP_BLOCKS,
  },
];
