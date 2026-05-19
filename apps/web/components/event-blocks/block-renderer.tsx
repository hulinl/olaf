import type { EventImage } from "@/lib/api";
import type { BlockTone, EventBlock } from "@/lib/event-blocks";

import { DaysBlock } from "./days-block";
import { FaqBlock } from "./faq-block";
import { GalleryBlock } from "./gallery-block";
import { HeroBlock } from "./hero-block";
import { IncludedSplitBlock } from "./included-split-block";
import { MapBlock } from "./map-block";
import { PracticalBlock } from "./practical-block";
import { ProseBlock } from "./prose-block";
import { StatsBlock } from "./stats-block";

interface Props {
  block: EventBlock;
  /** Passed through to the hero so it can derive sensible defaults. */
  fallbackTitle: string;
  fallbackCtaHref: string;
  /** Optional status badge — rendered inside hero block only. */
  heroBadge?: React.ReactNode;
  /** Event images — needed by the gallery block (pulls from event.images). */
  images?: EventImage[];
  /** Visual tone for this block — assigned by the page based on position. */
  tone?: BlockTone;
  /** Single source of truth for price/currency/note (event-level).
   *  Included_split block prefers these over its own legacy payload. */
  eventPrice?: {
    amount: string | null;
    currency: string;
    note: string;
  };
}

export function BlockRenderer({
  block,
  fallbackTitle,
  fallbackCtaHref,
  heroBadge,
  images = [],
  tone = "canvas",
  eventPrice,
}: Props) {
  switch (block.type) {
    case "hero":
      return (
        <HeroBlock
          payload={block.payload}
          fallbackTitle={fallbackTitle}
          fallbackCtaHref={fallbackCtaHref}
          badge={heroBadge}
          tone={tone}
        />
      );
    case "prose":
      return <ProseBlock payload={block.payload} tone={tone} />;
    case "stats":
      return <StatsBlock payload={block.payload} tone={tone} />;
    case "days":
      return <DaysBlock payload={block.payload} tone={tone} />;
    case "included_split":
      return (
        <IncludedSplitBlock
          payload={block.payload}
          tone={tone}
          eventPrice={eventPrice}
        />
      );
    case "gallery":
      return (
        <GalleryBlock payload={block.payload} images={images} tone={tone} />
      );
    case "map":
      return <MapBlock payload={block.payload} tone={tone} />;
    case "faq":
      return <FaqBlock payload={block.payload} tone={tone} />;
    case "practical":
      return <PracticalBlock payload={block.payload} tone={tone} />;
    default:
      return null;
  }
}
