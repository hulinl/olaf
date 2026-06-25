/**
 * Event landing-page block types — TS mirror of apps/api/events/blocks.py.
 * Adding a new block type means: extend BlockType, add the payload shape,
 * add a renderer in components/event-blocks/<type>.tsx, and (Phase 2) a
 * builder form.
 */

export interface BlockMetaTile {
  k: string;
  v: string;
}

export interface BlockListItem {
  label: string;
  desc?: string;
}

export interface BlockDay {
  label?: string;
  num?: string;
  title?: string;
  route?: string;
  body?: string;
  time?: string;
  distance?: string;
  ascent?: string;
  descent?: string;
  map_url?: string;
  image_url?: string;
}

export interface HeroBlockPayload {
  cover_url?: string;
  eyebrow?: string;
  title_override?: string;
  subtitle?: string;
  meta?: BlockMetaTile[];
  cta_label?: string;
  cta_href?: string;
}

export interface ProseBlockPayload {
  eyebrow?: string;
  heading?: string;
  body?: string;
  image_url?: string;
  image_side?: "left" | "right";
}

export interface StatsBlockPayload {
  tiles: { label: string; value: string }[];
  dark?: boolean;
}

export interface DaysBlockPayload {
  /** Volitelný eyebrow nad nadpisem — default "Program". */
  eyebrow?: string;
  /** Volitelný nadpis sekce — default "Den po dni". */
  title?: string;
  lead?: string;
  days: BlockDay[];
}

export interface IncludedSplitBlockPayload {
  included: BlockListItem[];
  not_included: BlockListItem[];
  price_value?: string;
  price_unit?: string;
  price_note?: string;
}

export interface GalleryBlockPayload {
  eyebrow?: string;
  title?: string;
}

export interface MapBlockPayload {
  eyebrow?: string;
  title?: string;
  caption?: string;
  map_url: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface FaqBlockPayload {
  eyebrow?: string;
  title?: string;
  items: FaqItem[];
}

export interface GearBlockPayload {
  eyebrow?: string;
  title?: string;
  /** Slug of a GearList owned by the event creator (must be unlisted or public). */
  list_slug: string;
  /** Optional curated subset of GearListItem ids (the entry ids, not
   *  raw GearItem ids). Empty / missing means "render everything"
   *  for back-compat with existing gear blocks. Owner uses checkboxes
   *  in the editor to pick which items appear on the public landing
   *  — typically a TOP-N selection rather than the full packing list. */
  featured_entry_ids?: number[];
}

export interface PracticalBlockPayload {
  eyebrow?: string;
  title?: string;
  transport?: string;
  accommodation?: string;
  gear?: string;
  /** 0 = unset; 1-5 = light → very hard. */
  difficulty_level?: number;
  difficulty_note?: string;
}

export interface OrganizersBlockPayload {
  eyebrow?: string;
  title?: string;
  intro?: string;
  /** User IDs from EventCollaborators na tomhle eventu. Public landing
   *  payload nese side-lookup `organizers_by_user_id`, takže renderer
   *  vidí display_name + bio + avatar_url bez druhého fetch-u. */
  user_ids: number[];
}

export type EventBlock =
  | { id: string; type: "hero"; payload: HeroBlockPayload }
  | { id: string; type: "prose"; payload: ProseBlockPayload }
  | { id: string; type: "stats"; payload: StatsBlockPayload }
  | { id: string; type: "days"; payload: DaysBlockPayload }
  | {
      id: string;
      type: "included_split";
      payload: IncludedSplitBlockPayload;
    }
  | { id: string; type: "gallery"; payload: GalleryBlockPayload }
  | { id: string; type: "map"; payload: MapBlockPayload }
  | { id: string; type: "faq"; payload: FaqBlockPayload }
  | { id: string; type: "practical"; payload: PracticalBlockPayload }
  | { id: string; type: "gear"; payload: GearBlockPayload }
  | { id: string; type: "organizers"; payload: OrganizersBlockPayload };

export interface OrganizerLookupEntry {
  id: number;
  display_name: string;
  full_name: string;
  first_name: string;
  last_name: string;
  bio: string;
  avatar_url: string;
}

export type BlockType = EventBlock["type"];

/**
 * Visual tone applied to a block on the public landing. The page assigns
 * tones by index so reordering blocks in the builder keeps the rhythm
 * (canvas → ink → canvas → …). Individual renderers map "ink" onto their
 * own dark variant (background, text, borders, internal cards).
 */
export type BlockTone = "canvas" | "ink";

export const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  hero: "Hero — úvodní fotka + meta",
  prose: "Prose — odstavec s volitelnou fotkou",
  stats: "Statistiky — řada dlaždic",
  days: "Program — den po dni + Mapy.cz",
  included_split: "Co je / není v ceně",
  gallery: "Galerie — grid obrázků",
  map: "Mapa — jedna trasa (embed)",
  faq: "FAQ — časté dotazy",
  practical: "Praktické info — doprava, ubytování, výbava, náročnost",
  gear: "Vybavení — odkaz na tvůj gear list",
  organizers: "Organizátoři — karty s fotkou a popisem vybraných spolutvůrců",
};

export type MapProvider = "mapy" | "google";

/** Detect Mapy.cz / mapy.com URLs we should embed as iframe. */
export function isMapyEmbedUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.hostname.endsWith("mapy.com") || u.hostname.endsWith("mapy.cz");
  } catch {
    return false;
  }
}

/** Detect Google Maps URLs (long links + maps.app.goo.gl shorteners). */
export function isGoogleMapsUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return (
      u.hostname === "maps.google.com" ||
      u.hostname.endsWith(".google.com") && u.pathname.startsWith("/maps") ||
      u.hostname === "maps.app.goo.gl" ||
      u.hostname === "goo.gl"
    );
  } catch {
    return false;
  }
}

/** Provider router — vyhodí typ podle URL, případně `null` pokud to
 *  není rozpoznatelná mapová služba. */
export function detectMapProvider(url: string | undefined): MapProvider | null {
  if (isMapyEmbedUrl(url)) return "mapy";
  if (isGoogleMapsUrl(url)) return "google";
  return null;
}

/** Append `frame=1` to a Mapy.cz URL so it renders without their chrome. */
export function ensureMapyFrameParam(url: string): string {
  try {
    const u = new URL(url);
    if (!u.searchParams.has("frame")) u.searchParams.set("frame", "1");
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Rozbalí krátký share-link `mapy.com/s/<code>` (a jeho `mapy.cz` /
 * locale varianty) na finální dlouhou URL.
 *
 * Mapy.com krátké odkazy vrací HTTP 404 + body s celým mapy.com SPA;
 * SPA si pak uvnitř iframe-u dělá JS redirect na koncovou URL, což
 * způsobí reflow a browser scrollne parent stránku k iframe-u (user
 * reportoval: "za sekundu mi to skočí na blok s mapou"). Server-side
 * sáhneme po `og:url` meta tagu, který obsahuje rovnou final URL —
 * iframe pak dostane long URL bez interního redirectu.
 *
 * Next.js fetch cache na 24 h — krátké odkazy se nemění.
 */
/**
 * Vytáhne lat/lng souřadnice z libovolné Google Maps URL formy.
 *
 * Pokrývá:
 *   /maps/search/49.0,17.4              → search forma
 *   /maps/place/Name/@49.0,17.4,15z     → place forma
 *   /maps/@49.0,17.4,15z                → centered view
 *   ?q=49.0,17.4                        → query parameter
 *
 * Záporné souřadnice (jižní polokoule, západní polokoule) cca pokryté.
 */
export function extractGoogleMapsCoords(
  url: string,
): { lat: string; lng: string } | null {
  try {
    const u = new URL(url);
    // ?q=lat,lng
    const q = u.searchParams.get("q");
    const qMatch = q?.match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
    if (qMatch) return { lat: qMatch[1], lng: qMatch[2] };

    // /maps/.../@lat,lng,zoom — Google používá `@` pro centroid
    const atMatch = u.pathname.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (atMatch) return { lat: atMatch[1], lng: atMatch[2] };

    // /maps/search/lat,+lng nebo /maps/search/lat,lng
    const searchMatch = u.pathname.match(
      /\/maps\/search\/(-?\d+\.\d+),\+?(-?\d+\.\d+)/,
    );
    if (searchMatch) return { lat: searchMatch[1], lng: searchMatch[2] };
  } catch {
    /* invalid URL → null */
  }
  return null;
}

/**
 * Vrátí embed URL pro Google Maps share-link.
 *
 * Pipeline:
 *   1. Krátký `maps.app.goo.gl/…` rozbalí 302 redirect na full URL.
 *   2. Z full URL extrahujeme lat/lng (Google to do path-u píše různě
 *      podle typu sdílení — viz `extractGoogleMapsCoords`).
 *   3. Pokud je `GOOGLE_MAPS_EMBED_API_KEY` v env, použijeme oficiální
 *      Google Maps Embed API (`maps/embed/v1/place`) — vrátí Google
 *      branded mapu, kterou Češi znají. Free tier 25k loads/měsíc.
 *      Klíč musí mít HTTP-referrer restrikci na `olaf.events/*` +
 *      lokální dev origins.
 *   4. Bez klíče fallbackneme na OpenStreetMap embed s markerem — funkčně
 *      OK, ale podklady neukážou Google POI label. User pak používá
 *      "Otevřít v Google Maps ↗" jako fallback.
 *
 * Pokud z URL nelze extrahovat souřadnice (URL je třeba `/place/Name`
 * bez lat/lng), vrátíme `null` — MapBlock pak pouze ukáže link na
 * původní Google URL.
 */
export async function resolveGoogleMapsEmbedUrl(
  url: string,
): Promise<string | null> {
  let target = url;
  // Krátký link → followovat redirect na long URL.
  try {
    const u = new URL(url);
    if (u.hostname === "maps.app.goo.gl" || u.hostname === "goo.gl") {
      const res = await fetch(url, {
        redirect: "follow",
        headers: { "User-Agent": "Mozilla/5.0 olaf.events-link-resolver" },
        next: { revalidate: 60 * 60 * 24 },
      });
      target = res.url;
    }
  } catch {
    /* fetch failed → zkusíme extract z původní URL, stejně to není fatal */
  }

  const coords = extractGoogleMapsCoords(target);
  if (!coords) return null;
  const lat = parseFloat(coords.lat);
  const lng = parseFloat(coords.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  // Preferujeme Google Maps Embed API, když je klíč dostupný — vlastní
  // Google branded mapa, kterou Češi znají. Klíč musí mít HTTP-referrer
  // restrikci na olaf.events doménu, jinak Google nahradí mapu chybou.
  // `gestureHandling=cooperative` přinutí Ctrl/Cmd+scroll pro zoom —
  // bez Ctrl scroll prosviští skrz na parent stránku, místo aby
  // zoomoval mapu pod kurzorem na touchpadu.
  const apiKey = process.env.GOOGLE_MAPS_EMBED_API_KEY;
  if (apiKey) {
    return `https://www.google.com/maps/embed/v1/place?key=${apiKey}&q=${lat},${lng}&zoom=15&gestureHandling=cooperative`;
  }

  // Fallback: OSM embed bez API key. ~1 km bbox kolem bodu → comfortable
  // zoom level v OSM viewportu. Visually OSM, ale "Otevřít v Google
  // Maps" link pod mapou pořád vede na původní Google URL.
  const d = 0.005;
  const bbox = `${lng - d},${lat - d},${lng + d},${lat + d}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
}

export async function resolveMapyEmbedUrl(url: string): Promise<string> {
  if (!/^https?:\/\/(?:[a-z]+\.)?mapy\.(?:com|cz)\/s\/[A-Za-z0-9_-]+/.test(url)) {
    return url;
  }
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 olaf.events-link-resolver" },
      next: { revalidate: 60 * 60 * 24 },
    });
    const body = await res.text();
    // Preferujeme og:url — obsahuje skutečnou koncovou URL i s param-y.
    // Body taky obsahuje `<a href="https://mapy.com/screenshoter?...">`
    // (OG image), který bychom omylem chytili širším regexem; proto
    // jdeme přímo na og:url.
    const og = body.match(
      /property=["']og:url["'][^>]*content=["']([^"']+mapy\.(?:com|cz)[^"']+)/i,
    );
    if (og && og[1]) {
      // HTML entity &amp; → &
      return og[1].replace(/&amp;/g, "&");
    }
    // Fallback: twitter:url
    const tw = body.match(
      /name=["']twitter:url["'][^>]*content=["']([^"']+mapy\.(?:com|cz)[^"']+)/i,
    );
    if (tw && tw[1]) return tw[1].replace(/&amp;/g, "&");
  } catch {
    /* síťová chyba / unreachable → vrátíme původní URL, iframe to zkusí jak umí */
  }
  return url;
}
