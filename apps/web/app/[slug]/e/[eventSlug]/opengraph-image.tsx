import { ImageResponse } from "next/og";

import {
  assetUrl,
  type Event,
  type EventDraftPreview,
  formatEventDateRange,
} from "@/lib/api";
import { serverFetch } from "@/lib/server-api";

// Per-event social share card (1200×630). Called by Facebook, WhatsApp,
// Twitter/X, Slack, LinkedIn, Signal, Discord etc. before they render a
// link preview. Was missing before → shared URLs looked like naked
// text. Now every event gets a branded card even when the owner didn't
// upload a hero photo yet.
//
// Runtime: node (Azure SWA's Next.js integration doesn't support edge).
// Cached 1 hour — social platforms cache OG data for days-to-weeks anyway.
export const runtime = "nodejs";
export const revalidate = 3600;
export const contentType = "image/png";
export const alt = "olaf event";
export const size = { width: 1200, height: 630 };

interface Props {
  params: Promise<{ slug: string; eventSlug: string }>;
}

const BRAND_AMBER = "#F59E0B";
const INK_900 = "#111111";
const INK_800 = "#1F1F1F";

export default async function EventOgImage({ params }: Props) {
  const { slug, eventSlug } = await params;
  const event = await serverFetch<Event | EventDraftPreview>(
    `/api/events/${slug}/${eventSlug}/`,
  );

  if (!event || (event as EventDraftPreview).is_draft_preview) {
    return brandedFallback();
  }

  const ev = event as Event;
  const heroBlock = (ev.blocks ?? []).find((b) => b.type === "hero");
  const heroCover =
    heroBlock?.type === "hero" ? assetUrl(heroBlock.payload.cover_url) : undefined;
  const cover =
    assetUrl(ev.cover_url) ?? heroCover ?? assetUrl(ev.workspace_logo_url);

  const dateLabel = formatEventDateRange(ev.starts_at, ev.ends_at);
  const metaParts = [dateLabel, ev.location_text].filter(Boolean);

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          height: "100%",
          width: "100%",
          padding: "60px 72px",
          color: "white",
          fontFamily: "sans-serif",
          background: cover
            ? undefined
            : `linear-gradient(135deg, ${INK_900} 0%, ${INK_800} 60%, #3A2410 100%)`,
        }}
      >
        {cover && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cover}
              alt=""
              width={1200}
              height={630}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.20) 30%, rgba(0,0,0,0.85) 100%)",
              }}
            />
          </>
        )}

        {/* Top row — olaf wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              display: "flex",
              width: 40,
              height: 40,
              borderRadius: 999,
              border: `3px solid ${BRAND_AMBER}`,
              background: "transparent",
            }}
          />
          <span
            style={{
              fontSize: 30,
              fontWeight: 700,
              letterSpacing: -0.5,
              color: "white",
            }}
          >
            olaf.events
          </span>
        </div>

        {/* Bottom text block — workspace kicker + title + meta */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: 4,
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.9)",
            }}
          >
            <span style={{ color: BRAND_AMBER }}>●</span>
            <span>{ev.workspace_name}</span>
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 76,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: -2,
              color: "white",
              maxWidth: 1000,
            }}
          >
            {ev.title}
          </div>
          {metaParts.length > 0 && (
            <div
              style={{
                display: "flex",
                fontSize: 30,
                fontWeight: 500,
                color: "rgba(255,255,255,0.9)",
              }}
            >
              {metaParts.join("  ·  ")}
            </div>
          )}
        </div>
      </div>
    ),
    { ...size },
  );
}

function brandedFallback() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          height: "100%",
          width: "100%",
          background: `linear-gradient(135deg, ${INK_900} 0%, ${INK_800} 60%, #3A2410 100%)`,
          color: "white",
          fontFamily: "sans-serif",
          gap: 24,
        }}
      >
        <div
          style={{
            display: "flex",
            width: 96,
            height: 96,
            borderRadius: 999,
            border: `6px solid ${BRAND_AMBER}`,
          }}
        />
        <div style={{ display: "flex", fontSize: 72, fontWeight: 800, letterSpacing: -2 }}>
          olaf.events
        </div>
        <div style={{ display: "flex", fontSize: 28, opacity: 0.8 }}>
          Kde začíná dobrodružství.
        </div>
      </div>
    ),
    { ...size },
  );
}
