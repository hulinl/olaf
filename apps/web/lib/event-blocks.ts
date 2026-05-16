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

export type EventBlock =
  | { id: string; type: "hero"; payload: HeroBlockPayload }
  | { id: string; type: "prose"; payload: ProseBlockPayload }
  | { id: string; type: "stats"; payload: StatsBlockPayload }
  | { id: string; type: "days"; payload: DaysBlockPayload }
  | {
      id: string;
      type: "included_split";
      payload: IncludedSplitBlockPayload;
    };

export type BlockType = EventBlock["type"];

export const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  hero: "Hero — úvodní fotka + meta",
  prose: "Prose — odstavec s volitelnou fotkou",
  stats: "Statistiky — řada dlaždic",
  days: "Program — den po dni + Mapy.cz",
  included_split: "Co je / není v ceně",
};

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
