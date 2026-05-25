/**
 * Rich metadata pro každý block typ — používá se v `/manual/vizualni-pruvodce-strankou`.
 *
 * Drží *editorial* informace, které se nehodí do `event-blocks.ts` (ten je
 * čistě data-shape). Tady popisujeme **jak se rozhodnout**, jestli daný blok
 * potřebuju — kdy zafunguje, kdy ne, co do něj patří, jak vypadá výsledek.
 *
 * Pořadí v `BLOCK_CATALOG` odpovídá tomu, jak by se bloky typicky řadily
 * na ideální stránce shora dolů: hero → identita → program → praktické → faq.
 */
import type { BlockType } from "./event-blocks";

export interface BlockCatalogEntry {
  /** Block type — matches event-blocks.ts `BlockType`. */
  type: BlockType;
  /** Title shown in builder picker + manual catalog. */
  title: string;
  /** Krátký podtitul — jednou větou pro koho to je. */
  subtitle: string;
  /** Hlavní popis 2–4 věty — co blok je a proč existuje. */
  description: string;
  /** Konkrétní situace, kdy blok zařadit. Bullet body. */
  whenToUse: string[];
  /** Anti-pattern — kdy ho NEpoužít, protože to udělá horší stránku. */
  whenNotToUse: string[];
  /** Klíčová pole formuláře — co uživatel vyplňuje, s krátkým popisem. */
  keyFields: { label: string; hint: string }[];
  /** Jeden řádek příkladu — co to v praxi vypadá. */
  example: string;
  /** Doporučení pro stylování / délku obsahu. */
  tip?: string;
}

export const BLOCK_CATALOG: BlockCatalogEntry[] = [
  {
    type: "hero",
    title: "Hero",
    subtitle: "Úvodní obrazovka stránky",
    description:
      "Vstupní brána — velká fotka, jméno akce, jedna věta podtitulu a CTA " +
      "k přihlášce. Zhruba 80 % návštěvníků se rozhodne tady, jestli číst dál.",
    whenToUse: [
      "Vždy. Hero je první blok každé stránky.",
      "Když máš silnou cover fotku, která sama nese atmosféru akce.",
      "Když chceš ukázat 2–4 meta dlaždice (datum, místo, cena, kapacita).",
    ],
    whenNotToUse: [
      "Stránka má jiný hero blok výš — vždy jen jeden.",
    ],
    keyFields: [
      {
        label: "Cover fotka",
        hint: "Šířková fotka 16:9 nebo širší. Olaf automaticky downscaluje.",
      },
      {
        label: "Eyebrow",
        hint: 'Krátký label nad nadpisem — např. „4denní trek” nebo "Camp Beskydy".',
      },
      {
        label: "Titulek",
        hint: "Hlavní jméno akce. Pokud necháš prázdné, použije se `event.title`.",
      },
      {
        label: "Podtitul",
        hint: "Maximálně 12 slov — claim by měl jít říct na jeden výdech.",
      },
      {
        label: "Meta dlaždice",
        hint: 'Dvojice (klíč, hodnota) — např. „Termín / 16.–19. 5.” nebo "Cena / 2 500 Kč".',
      },
      {
        label: "CTA tlačítko",
        hint: "Volitelně — když chceš nasměrovat jinam než na výchozí přihlášku.",
      },
    ],
    example:
      "Titulek: „Spring Camp Beskydy” · podtitul: „Tři dny v horách, jedna parta, žádný plán B” · 4 dlaždice: termín / místo / cena / kapacita.",
    tip: "Krátký podtitul překonává dlouhý. Drž ho pod 12 slovy.",
  },
  {
    type: "prose",
    title: "Prose",
    subtitle: "Volný text s volitelným obrázkem",
    description:
      "Univerzální textový blok — odstavec až dva, eyebrow nad nadpisem, " +
      "fotka nalevo nebo napravo. Pro „o co jde”, „pro koho to je”, " +
      "„naše filozofie”.",
    whenToUse: [
      "„O akci” sekce hned pod hero — vyprávění příběhu.",
      "„Co tě čeká” — atmosféra a vibe, ne výčet bodů.",
      "„Pro koho to je” — kvalifikace publika.",
      "Když chceš proložit jiné bloky textovým breakem.",
    ],
    whenNotToUse: [
      "Když chceš výčet bodů — pak je lepší Statistiky nebo Praktické info.",
      "Pro program — den po dni patří do Programu.",
    ],
    keyFields: [
      { label: "Eyebrow", hint: "Krátký label — např. „O akci”." },
      { label: "Nadpis", hint: "Co je téma odstavce." },
      {
        label: "Text",
        hint: "Markdown — můžeš použít odstavce, **tučné**, *kurzívu*, odkazy.",
      },
      { label: "Obrázek (volitelně)", hint: "Doprovodná fotka — vlevo nebo vpravo." },
      {
        label: "Strana obrázku",
        hint: "Vlevo / vpravo. Střídej mezi sebou pro vizuální rytmus.",
      },
    ],
    example:
      "„O akci · Čtyři dny v Tyrolských Alpách. Nalehko, bez ferrat, s výhledem na ledovce. Pro sportovce bez alpské zkušenosti.”",
    tip: "Když máš více Prose bloků za sebou, střídej `image_side` left/right — strana vytvoří rytmus.",
  },
  {
    type: "stats",
    title: "Statistiky",
    subtitle: "Řada dlaždic s čísly",
    description:
      "„V číslech” pásek — 3–6 dlaždic s hodnotou a popiskem. Vizuálně silný, " +
      "rychle čitelný, dobře funguje hned pod Hero nebo Prose.",
    whenToUse: [
      "Klíčové parametry akce v číslech — počet dnů, km, výškových metrů, účastníků.",
      "Vyzdvižení nějakého superlativu („3 ledovce”, „4× warm shower”).",
      "Když chceš vizuální oddělovač mezi textovými bloky.",
    ],
    whenNotToUse: [
      "Když nemáš silná čísla — vágní „hodně zážitků” radši nech v Prose.",
      "Více než 6 dlaždic — řada se rozbije, ztratí impact.",
    ],
    keyFields: [
      {
        label: "Dlaždice",
        hint: 'Dvojice (hodnota, popisek). Hodnota stručná — „120 km”, „4 dny”, "2 500 m↑".',
      },
      {
        label: "Tmavý variant",
        hint: "Když chceš inverzní (tmavé pozadí, světlý text) — pro vizuální oddělení od ostatních bloků.",
      },
    ],
    example: '4 dlaždice: „4 dny” / "120 km" / "2 500 m↑" / "max 12 účastníků"',
    tip: "Sudý počet dlaždic (4 nebo 6) vypadá vyrovnaněji než liché.",
  },
  {
    type: "days",
    title: "Program — den po dni",
    subtitle: "Multi-day itinerář s detailem",
    description:
      "Strukturovaný itinerář pro vícedenní akce. Každý den má vlastní kartu " +
      "s nadpisem, trasou, časem, vzdáleností, převýšením a (volitelně) " +
      "Mapy.cz odkazem + ilustrační fotkou.",
    whenToUse: [
      "Vícedenní treky, campy, expedice.",
      "Když chceš návštěvníkovi ukázat „co konkrétně tě v který den čeká”.",
      "Když máš mapové trasy a fotky pro každý den.",
    ],
    whenNotToUse: [
      "Jednodenní akce — radši Hero + Prose („Jak to bude probíhat”).",
      "Když ještě program nemáš pevný — radši Prose s obecným popisem.",
    ],
    keyFields: [
      { label: "Lead", hint: "Krátký úvod nad seznamem dnů — kontext celkového itineráře." },
      { label: "Den · label / číslo", hint: 'Např. „Den 1”, "Sobota", "Příjezd".' },
      { label: "Den · nadpis", hint: "Co se ten den děje — „Sraz a aklimatizace”." },
      { label: "Den · trasa", hint: "Stručně „Chata A → Sedlo X → Chata B”." },
      { label: "Den · popis", hint: "Markdown — 2–4 věty co konkrétně." },
      {
        label: "Den · čas / km / ↑ / ↓",
        hint: 'Čísla v krátké formě — „6 h”, "14 km", "850 m↑", "420 m↓".',
      },
      { label: "Den · mapa", hint: "Mapy.cz odkaz (frame=1 doplníme automaticky)." },
      { label: "Den · obrázek", hint: "Doprovodná fotka — z minulého ročníku nebo lokality." },
    ],
    example:
      "„Den 2 · Riffelseehütte → Braunschweiger Hütte · 6 h, 14 km, 850 m↑, mapa: Mapy.cz”",
    tip: "Aspoň 3 z polí (název, čas, km, převýšení) vyplň pro každý den — tabulka pak vypadá vyvážená.",
  },
  {
    type: "included_split",
    title: "Co je / není v ceně",
    subtitle: "Dvousloupcový rozpis ceny",
    description:
      "Transparentní rozpad — vlevo „v ceně je”, vpravo „není”. Plus volitelně " +
      "samotná cena s jednotkou a poznámkou. Snižuje support tickety typu " +
      '„jsou tam zahrnutý ubytko taky?”.',
    whenToUse: [
      "Placené akce s netriviální cenou (multi-day, s ubytkem).",
      "Když chceš jasně vyjmout věci, co lidi předpokládají, že tam jsou.",
      "Když máš dynamic pricing (early bird, slevy) — patří do `price_note`.",
    ],
    whenNotToUse: [
      "Zdarma akce — nemá co dělit.",
      "Když cena pokrývá vše — radši jen jednoduchý Prose s cenou.",
    ],
    keyFields: [
      { label: "Cena (hodnota)", hint: 'Číslo bez jednotky — „2 500”.' },
      { label: "Jednotka", hint: '"Kč", "EUR", "za osobu" — záleží.' },
      { label: "Poznámka k ceně", hint: 'Volitelně „early bird do 31. 3.” nebo "děti -50 %".' },
      { label: "V ceně", hint: "Body co cena zahrnuje. Každý bod má label + volitelný popisek." },
      { label: "Není v ceně", hint: "Body co naopak ne — doprava, večeře, vstupy, pojištění." },
    ],
    example:
      'V ceně: „3× nocleh”, "průvodce", "polopenze". Není: „doprava do nástupu”, "vstup do termálních lázní".',
    tip: "Drž oba sloupce zhruba stejně dlouhé — opticky to pak nestrhává pozornost na jednu stranu.",
  },
  {
    type: "gallery",
    title: "Galerie",
    subtitle: "Fotky z minulých ročníků",
    description:
      "Grid fotek z `event.images` (uploaduješ je v záložce Galerie cockpitu). " +
      "Slouží jako důkaz „takhle to vážně vypadá”, ne jako kompletní album.",
    whenToUse: [
      "Recurring akce — máš fotky z předchozího ročníku.",
      "Když lokality / atmosféru lépe popíše obraz než text.",
      "Pro budování důvěry — návštěvník vidí, že akce už proběhla.",
    ],
    whenNotToUse: [
      "První ročník, žádné fotky z místa — neukazuj prázdný grid.",
      "Když máš jen 1–2 fotky — radši je dej do Hero a Prose.",
    ],
    keyFields: [
      { label: "Eyebrow", hint: "Krátký label — např. „Z minulého ročníku”." },
      { label: "Titulek", hint: 'Volitelně „Galerie” nebo "Atmosféra".' },
      {
        label: "Fotky",
        hint: "Uploaduješ je v záložce Galerie. Olaf automaticky downscaluje a rotuje EXIF.",
      },
    ],
    example: "8 fotek z Pitztalu 2025 — chata, ranní mlha, ledovec, parta u stolu.",
    tip: "6–12 fotek je sweet spot. Méně = řídký grid, víc = vibe se rozmělní.",
  },
  {
    type: "map",
    title: "Mapa",
    subtitle: "Jedna trasa nebo místo srazu",
    description:
      "Mapy.cz embed jednou trasou nebo bodem srazu. Když má event jen jednu " +
      "centrální trasu (jednodenní hike), je toto blok místo Program-po-dni.",
    whenToUse: [
      "Jednodenní akce s jednou trasou — kompaktnější než Program.",
      "„Místo srazu” — embed bodu na mapě.",
      "Když máš pěkně udělanou Mapy.cz trasu se zastávkami.",
    ],
    whenNotToUse: [
      "Multi-day akce s víc trasami — to patří do Programu.",
      "Když nemáš Mapy.cz odkaz — radši Prose s textovým popisem.",
    ],
    keyFields: [
      { label: "Eyebrow", hint: 'Krátký label — „Trasa” nebo "Místo srazu".' },
      { label: "Titulek", hint: "Co mapa ukazuje." },
      { label: "Caption", hint: "Krátký popisek pod mapou — délka, charakter trasy." },
      {
        label: "Mapa URL",
        hint: "Mapy.cz nebo mapy.com odkaz. Frame=1 přidáme automaticky.",
      },
    ],
    example: 'Mapa: „Lysá hora — okruh přes Ostravici · 18 km, 900 m↑”.',
    tip: "Plánovač Mapy.cz → tlačítko Sdílet → kopíruj plnou URL. Frame param doplníme.",
  },
  {
    type: "faq",
    title: "FAQ",
    subtitle: "Časté otázky",
    description:
      "Sbírka otázka/odpověď. Patří sem věci, co ti chodí mailem 10× za sezónu — " +
      "vrácení peněz, co když prší, lze přijet vlastním autem.",
    whenToUse: [
      "Vždy. FAQ snižuje DM dotazy o 70 %+.",
      "Hlavně pro placené akce a multi-day události.",
      "Když ti přijde stejná otázka třikrát mailem — sem.",
    ],
    whenNotToUse: [
      "Pokud máš jen 1–2 otázky — radši je rozpusti do Praktického info.",
    ],
    keyFields: [
      { label: "Eyebrow", hint: 'Např. „FAQ” nebo "Často se ptáte".' },
      { label: "Titulek", hint: 'Volitelně „Časté dotazy”.' },
      { label: "Položky", hint: "Dvojice (otázka, odpověď). Markdown v odpovědi." },
    ],
    example:
      'Q: „Co když bude pršet?” A: „Jedeme v každém počasí. Pršiplášť je v seznamu vybavení.”',
    tip: "Začni 4–6 otázkami. Postupně doplňuj, jak ti chodí nové dotazy mailem.",
  },
  {
    type: "practical",
    title: "Praktické info",
    subtitle: "Doprava, ubytování, výbava, náročnost",
    description:
      "4-pole praktický blok pro logistiku — jak se dostat, kde se spí, " +
      "co s sebou a jak je to fyzicky náročné (0–5 stupnice + poznámka).",
    whenToUse: [
      "Multi-day akce — doprava, ubytko, výbava jsou důležité.",
      "Když chceš mít všechny logistické info na jednom místě.",
      "Když je akce fyzicky náročná a chceš sebehodnocení účastníků.",
    ],
    whenNotToUse: [
      "Jednoduchá lokální akce — všechno se vejde do Prose.",
      "Když máš detail v jiných blocích (Gear, Program) a tady by se duplikovalo.",
    ],
    keyFields: [
      { label: "Eyebrow", hint: 'Např. „Praktické info” nebo "Logistika".' },
      { label: "Titulek", hint: "Co tato sekce řeší." },
      { label: "Doprava", hint: "Markdown — vlak, auto, autobus, sraz." },
      { label: "Ubytování", hint: "Markdown — kde, kapacita, sociální zařízení." },
      { label: "Výbava", hint: "Markdown — krátký seznam (na detail je Gear blok)." },
      {
        label: "Náročnost · level",
        hint: '0 = neuvedeno, 1 = lehké, 5 = velmi náročné. Vykreslí se jako "● ● ● ○ ○".',
      },
      { label: "Náročnost · poznámka", hint: "Komentář k levelu — pro koho je akce vhodná." },
    ],
    example:
      "Doprava: „Vlak do Ostravice, dál busem”; Ubytko: „Penzion U Lysé”; Náročnost: 3/5.",
    tip: "Náročnost si rozmysli — určuje, jestli si na akci podají ti správní lidé.",
  },
  {
    type: "gear",
    title: "Vybavení (gear list)",
    subtitle: "Odkaz na strukturovaný seznam",
    description:
      "Propojení s tvým gear listem (sekce Vybavení v komunitě). Renderuje " +
      "doporučený packing list — buď celý, nebo curated TOP-N (vybráno " +
      "checkboxy v editoru).",
    whenToUse: [
      "Když máš pro daný typ akce udržovaný gear list a chceš ho návštěvníkovi ukázat.",
      "Multi-day akce — vždy.",
      "Pro „nezkušený účastník neví, co si vzít” — gear list ho vede.",
    ],
    whenNotToUse: [
      "Když nemáš gear list — radši Praktické info → Výbava text.",
      "Když je akce „přijď v čem máš” — gear list je tehdy zbytečně formální.",
    ],
    keyFields: [
      { label: "Eyebrow", hint: 'Např. „Co si vzít” nebo "Doporučená výbava".' },
      { label: "Titulek", hint: "Volitelně." },
      { label: "Gear list slug", hint: "Vybereš ze svých listů — musí být unlisted nebo public." },
      {
        label: "Curated položky",
        hint: "Volitelně — checkbox výběr TOP-N položek. Prázdné = renderuje vše.",
      },
    ],
    example: "Curated 8 položek z „High-altitude packing” listu (z 40 total).",
    tip: "Pro mainstream akce vyber TOP 8–10 nejdůležitějších. Plný list 40 položek odradí.",
  },
];
