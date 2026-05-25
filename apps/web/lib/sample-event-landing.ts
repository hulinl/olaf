/**
 * Vzorová „kompletně sestavená” stránka akce — používá se v interaktivním
 * průvodci na `/manual/vizualni-pruvodce-strankou`.
 *
 * Inspirováno Pitztal templátem (`templates/pitztal-template.html`) — multi-day
 * trek se vším potřebným. Každý block typ je tu zastoupený aspoň jednou.
 * Pořadí odráží, jak by se ideální stránka skládala shora dolů.
 */
import type {
  DaysBlockPayload,
  FaqBlockPayload,
  GalleryBlockPayload,
  HeroBlockPayload,
  IncludedSplitBlockPayload,
  MapBlockPayload,
  PracticalBlockPayload,
  ProseBlockPayload,
  StatsBlockPayload,
} from "./event-blocks";
import type { BlockType } from "./event-blocks";

export interface SampleBlock {
  id: string;
  type: BlockType;
  label: string; // Lidský label pro outline
  payload: unknown; // Type narrowed per `type` na render-time
}

export const SAMPLE_HERO: HeroBlockPayload = {
  eyebrow: "4denní trek · Tyrolské Alpy",
  title_override: "Pitztal — přechod po chatách",
  subtitle: "Tři chaty, dva ledovce, žádné ferraty. Pro sportovce bez alpské zkušenosti.",
  cta_label: "Přihlásit se",
  cta_href: "#rsvp",
  meta: [
    { k: "Termín", v: "21.–24. 8. 2026" },
    { k: "Sraz", v: "Mandarfen, Pitztal" },
    { k: "Cena", v: "8 900 Kč" },
    { k: "Kapacita", v: "max 10 lidí" },
  ],
};

export const SAMPLE_PROSE_INTRO: ProseBlockPayload = {
  eyebrow: "O akci",
  heading: "Čtyři dny v srdci Tyrolských Alp",
  body:
    "Klasický rakouský **přechod po chatách** v nejvyšší části Pitztalu. Spíš na " +
    "Riffelsee, projdeš sedlo nad ledovcem Karles, a slezeš do údolí přes Braunschweiger Hütte. " +
    "**Nalehko** — věci na 4 dny v jednom 40l batohu, jíme a spíme na chatách.\n\n" +
    "Trasa je sportovní, ale **bez technických pasáží** — žádné ferraty, žádný led, jen jasné cesty " +
    "a pár sutí. Vhodné pro lidi, kteří chodí v Beskydech nebo Krkonoších a chtějí poprvé vyzkoušet, " +
    "jak to chodí ve velehorách.",
  image_url: "",
  image_side: "right",
};

export const SAMPLE_STATS: StatsBlockPayload = {
  tiles: [
    { label: "dnů", value: "4" },
    { label: "kilometrů", value: "48" },
    { label: "výškových metrů ↑", value: "3 200" },
    { label: "maximum lidí", value: "10" },
  ],
  dark: false,
};

export const SAMPLE_DAYS: DaysBlockPayload = {
  lead:
    "Čtyři etapy, tři přespání na chatách. Druhý den je nejdelší, čtvrtý už jen sestup do údolí.",
  days: [
    {
      label: "Den 1",
      num: "1",
      title: "Mandarfen → Riffelseehütte",
      route: "lanovka + 2 h chůze, 350 m ↑",
      body:
        "Sraz v Mandarfenu v 10:00 (parking u lanovky). Vyjedem lanovkou na Hochzeiger a pohodlnou cestou " +
        "vystoupáme nad jezero Riffelsee. Lehčí start, aklimatizace.",
      time: "3 h",
      distance: "6 km",
      ascent: "350 m",
      descent: "0 m",
      map_url: "https://mapy.cz/turisticka?x=10.85&y=47.10&z=14",
      image_url: "",
    },
    {
      label: "Den 2",
      num: "2",
      title: "Riffelseehütte → Braunschweiger Hütte",
      route: "přes sedlo Karlesjoch, 14 km, 900 m ↑",
      body:
        "Nejdelší etapa. Ranní start, výstup pod ledovec Karles, sedlo ve 3 100 m, sestup na chatu pod " +
        "Wildspitze. Možnost vidět ledovec zblízka.",
      time: "7 h",
      distance: "14 km",
      ascent: "900 m",
      descent: "650 m",
      map_url: "https://mapy.cz/turisticka?x=10.87&y=47.05&z=13",
      image_url: "",
    },
    {
      label: "Den 3",
      num: "3",
      title: "Braunschweiger → Rüsselsheimer Hütte",
      route: "hřebenovka, 16 km, 950 m ↑",
      body:
        "Klasická tyrolská hřebenovka — dva přechody přes sedla, pak dlouhý traverz nad údolím. " +
        "Náročnější noha, krásné výhledy na Wildspitze celý den.",
      time: "8 h",
      distance: "16 km",
      ascent: "950 m",
      descent: "750 m",
      map_url: "https://mapy.cz/turisticka?x=10.90&y=47.02&z=13",
      image_url: "",
    },
    {
      label: "Den 4",
      num: "4",
      title: "Rüsselsheimer → Plangeroß",
      route: "sestup do údolí, 12 km, 1 200 m ↓",
      body:
        "Závěrečný sestup. Po snídani vyrazíme dolů, kolem 14:00 jsme v Plangeroßu. " +
        "Bus zpět do Mandarfenu k autům.",
      time: "5 h",
      distance: "12 km",
      ascent: "100 m",
      descent: "1 200 m",
      map_url: "",
      image_url: "",
    },
  ],
};

export const SAMPLE_INCLUDED: IncludedSplitBlockPayload = {
  price_value: "8 900",
  price_unit: "Kč / osoba",
  price_note: "Early bird do 31. 3. 2026: 8 200 Kč",
  included: [
    { label: "3× nocleh na chatě", desc: "vícelůžkové pokoje, polopenze" },
    { label: "Průvodce po celou dobu", desc: "Olaf, certifikovaný horský vůdce" },
    { label: "Detailní brief před akcí", desc: "online call týden před výjezdem" },
    { label: "Mapy + GPS tracky", desc: "k vytisknutí i do telefonu" },
  ],
  not_included: [
    { label: "Doprava do Mandarfenu", desc: "vlastní auto nebo busem z Innsbrucku" },
    { label: "Obědy během etap", desc: "balíčky si bereš z chat ráno" },
    { label: "Cestovní pojištění", desc: "hory ve výšce nad 3 000 m vyžadují připojištění" },
    { label: "Lanovka první den", desc: "30 € — sami u pokladny" },
  ],
};

export const SAMPLE_GALLERY: GalleryBlockPayload = {
  eyebrow: "Z minulého ročníku",
  title: "Atmosféra",
};

export const SAMPLE_MAP: MapBlockPayload = {
  eyebrow: "Místo srazu",
  title: "Mandarfen, Pitztal",
  caption: "Parking u lanovky Hochzeiger. GPS 47.0667° N, 10.8500° E.",
  map_url: "https://mapy.cz/zakladni?x=10.85&y=47.07&z=12",
};

export const SAMPLE_PRACTICAL: PracticalBlockPayload = {
  eyebrow: "Praktické info",
  title: "Logistika",
  transport:
    "**Autem** přes Pasov–Innsbruck–Imst (~10 h z Prahy). **Vlakem** Praha → Innsbruck (RJ + ICE), " +
    "dál bus Pitztaler Verkehr do Mandarfenu.",
  accommodation:
    "**Chaty CAI/ÖAV** — vícelůžkové pokoje (4–8 lůžek), společná koupelna, polopenze v ceně. " +
    "Spacák podšívka povinná.",
  gear:
    "Nalehko — 30–40l batoh, holínky netreba (jsou trail boty), spacák podšívka. " +
    "Detailní gear list níže.",
  difficulty_level: 3,
  difficulty_note:
    "**3 z 5** — sportovní turistika ve vysokých horách, ale bez technických pasáží. " +
    "Předpoklad: 6 h chůze s ~10 kg batohem v kopcovitém terénu.",
};

export const SAMPLE_FAQ: FaqBlockPayload = {
  eyebrow: "FAQ",
  title: "Časté dotazy",
  items: [
    {
      question: "Co když bude špatné počasí?",
      answer:
        "Trasa je flexibilní — máme alternativy pro každou etapu. Při bouřkové předpovědi posuneme " +
        "start o den. Pojištění pokrývá storno do 48 h před výjezdem.",
    },
    {
      question: "Můžu přijet vlastním autem?",
      answer:
        "Ano, parking v Mandarfenu (200 Kč / den). Carpooling řešíme týden před akcí ve sdíleném " +
        "Google Sheetu.",
    },
    {
      question: "Co pojištění?",
      answer:
        "Povinné — pojištění úrazové **včetně horské záchranky do 3 500 m**. ČSOB má speciální " +
        "připojištění „Hory” za ~150 Kč/den.",
    },
    {
      question: "Jakou kondici potřebuju?",
      answer:
        "Pokud chodíš víkendovky v Beskydech / Krkonoších s ~10 kg batohem, jsi v pohodě. Druhý den " +
        "(14 km, 900 m↑) je benchmark — pokud to zvládneš doma, zvládneš to tady.",
    },
    {
      question: "Co když si nebudu věřit přímo na chatě?",
      answer:
        "Každá chata má dolní variantu (lanovka, bus). Vrátit se dá z kterékoli etapy — průvodce " +
        "s tebou kompromis řeší na místě.",
    },
  ],
};

export const SAMPLE_OUTLINE: SampleBlock[] = [
  { id: "hero", type: "hero", label: "Hero — úvodní obrazovka", payload: SAMPLE_HERO },
  { id: "prose", type: "prose", label: "Prose — o akci", payload: SAMPLE_PROSE_INTRO },
  { id: "stats", type: "stats", label: "Statistiky — v číslech", payload: SAMPLE_STATS },
  { id: "days", type: "days", label: "Program — den po dni", payload: SAMPLE_DAYS },
  {
    id: "included",
    type: "included_split",
    label: "Co je / není v ceně",
    payload: SAMPLE_INCLUDED,
  },
  { id: "practical", type: "practical", label: "Praktické info", payload: SAMPLE_PRACTICAL },
  { id: "map", type: "map", label: "Mapa — místo srazu", payload: SAMPLE_MAP },
  { id: "gallery", type: "gallery", label: "Galerie — z minulého ročníku", payload: SAMPLE_GALLERY },
  {
    id: "gear",
    type: "gear",
    label: "Vybavení (gear list)",
    payload: {
      eyebrow: "Co si vzít",
      title: "Doporučený packing",
      list_slug: "high-altitude-trek",
    },
  },
  { id: "faq", type: "faq", label: "FAQ — časté dotazy", payload: SAMPLE_FAQ },
];
