import { MapEmbedShell } from "./map-embed-shell";
import { SectionHead } from "@/components/ui/section-head";
import {
  type BlockTone,
  type MapBlockPayload,
  type MapProvider,
  detectMapProvider,
  ensureMapyFrameParam,
  resolveGoogleMapsEmbedUrl,
  resolveMapyEmbedUrl,
} from "@/lib/event-blocks";

interface Props {
  payload: MapBlockPayload;
  tone?: BlockTone;
}

const PROVIDER_LABELS: Record<MapProvider, string> = {
  mapy: "Mapy.cz",
  google: "Google Maps",
};

async function buildEmbedSrc(
  url: string,
  provider: MapProvider,
): Promise<string | null> {
  if (provider === "mapy") {
    const resolved = await resolveMapyEmbedUrl(url);
    return ensureMapyFrameParam(resolved);
  }
  // google
  return resolveGoogleMapsEmbedUrl(url);
}

export async function MapBlock({ payload, tone = "canvas" }: Props) {
  if (!payload.map_url) return null;
  const provider = detectMapProvider(payload.map_url);
  const eyebrow = payload.eyebrow || "Mapa";
  const title = payload.title || "Kudy poběžíme";
  const dark = tone === "ink";

  // Provider-aware embed builder. Mapy.cz krátké linky nutno
  // server-side rozbalit přes og:url (HTTP 404 + SPA body). Google
  // krátké linky `maps.app.goo.gl` mají normální 302 redirect, ale
  // pro embed potřebujeme z koncové URL extrahovat lat/lng, ze
  // kterých sestavíme legacy `output=embed` URL.
  const iframeSrc = provider ? await buildEmbedSrc(payload.map_url, provider) : null;

  // Google Embed API dostává `gestureHandling=cooperative` query param
  // a sama hlídá zoom přes Ctrl+scroll. OSM (default fallback) a
  // Mapy.cz ten param neznají, takže do nich strkáme overlay přes
  // klientskou komponentu — `pointer-events:none` na iframe-u dokud
  // user neklikne, scroll pak prošumí na parent stránku jako wheel
  // event a stránka se odscrollovává správně.
  const isGoogleEmbed =
    typeof iframeSrc === "string" && iframeSrc.includes("gestureHandling=");

  return (
    <section
      className={[
        "",
        dark ? "bg-ink-900" : "bg-canvas",
      ].join(" ")}
    >
      <div className="mx-auto max-w-5xl px-4 py-10 sm:py-12">
        <SectionHead
          eyebrow={eyebrow}
          title={title}
          tone={dark ? "dark" : "light"}
        />
        {iframeSrc ? (
          <MapEmbedShell
            src={iframeSrc}
            title={title}
            dark={dark}
            // OSM / Mapy embed nemá gesture override → klient
            // hlídá overlay; Google si vystačí sám.
            needsScrollGuard={!isGoogleEmbed}
          />
        ) : (
          <a
            href={payload.map_url}
            target="_blank"
            rel="noopener noreferrer"
            className={[
              "inline-flex items-center gap-2 rounded-md border px-4 py-3 text-sm font-medium focus-ring",
              dark
                ? "border-white/15 bg-white/[0.04] text-ink-inverse hover:bg-white/[0.08]"
                : "border-border bg-surface text-ink-900 hover:bg-surface-muted",
            ].join(" ")}
          >
            Otevřít mapu →
          </a>
        )}
        {(payload.caption || (provider && iframeSrc)) && (
          <div
            className={[
              "mt-3 flex flex-wrap items-center justify-between gap-3 text-sm",
              dark ? "text-white/60" : "text-ink-500",
            ].join(" ")}
          >
            {payload.caption && <span>{payload.caption}</span>}
            {provider && iframeSrc && (
              <a
                href={payload.map_url}
                target="_blank"
                rel="noopener noreferrer"
                className={[
                  "ml-auto font-mono text-[11px] font-medium uppercase tracking-[0.14em]",
                  dark
                    ? "text-white/80 hover:text-ink-inverse"
                    : "text-ink-700 hover:text-ink-900",
                ].join(" ")}
              >
                Otevřít v {PROVIDER_LABELS[provider]} ↗
              </a>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
