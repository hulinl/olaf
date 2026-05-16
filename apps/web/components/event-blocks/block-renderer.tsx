import type { EventBlock } from "@/lib/event-blocks";

import { DaysBlock } from "./days-block";
import { HeroBlock } from "./hero-block";
import { IncludedSplitBlock } from "./included-split-block";
import { ProseBlock } from "./prose-block";
import { StatsBlock } from "./stats-block";

interface Props {
  block: EventBlock;
  /** Passed through to the hero so it can derive sensible defaults. */
  fallbackTitle: string;
  fallbackCtaHref: string;
  /** Optional status badge — rendered inside hero block only. */
  heroBadge?: React.ReactNode;
}

export function BlockRenderer({
  block,
  fallbackTitle,
  fallbackCtaHref,
  heroBadge,
}: Props) {
  switch (block.type) {
    case "hero":
      return (
        <HeroBlock
          payload={block.payload}
          fallbackTitle={fallbackTitle}
          fallbackCtaHref={fallbackCtaHref}
          badge={heroBadge}
        />
      );
    case "prose":
      return <ProseBlock payload={block.payload} />;
    case "stats":
      return <StatsBlock payload={block.payload} />;
    case "days":
      return <DaysBlock payload={block.payload} />;
    case "included_split":
      return <IncludedSplitBlock payload={block.payload} />;
    default:
      // Should be unreachable thanks to the discriminated union — but keep
      // a safe fallback for forward-compat when a newer backend ships a type
      // the client doesn't yet recognise.
      return null;
  }
}
