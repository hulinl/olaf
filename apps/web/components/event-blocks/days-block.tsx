import { assetUrl } from "@/lib/api";
import { SectionHead } from "@/components/ui/section-head";
import {
  type BlockTone,
  type DaysBlockPayload,
  ensureMapyFrameParam,
  isMapyEmbedUrl,
  resolveMapyEmbedUrl,
} from "@/lib/event-blocks";
import { FormattedBody } from "@/lib/prose-format";

import { MapEmbedShell } from "./map-embed-shell";

interface Props {
  payload: DaysBlockPayload;
  tone?: BlockTone;
}

export async function DaysBlock({ payload, tone = "canvas" }: Props) {
  if (!payload.days || payload.days.length === 0) return null;

  const dark = tone === "ink";

  // Day-level map_url-y bývají Mapy.com krátké share-linky
  // (`mapy.com/s/<code>`). Ty v iframe-u nerenderuje — vracejí HTTP 404
  // s SPA body, browser hlási „embedded mapa nelze správně načíst".
  // Server-side rozbalíme přes `resolveMapyEmbedUrl` (vytáhne og:url
  // meta tag → koncovou long URL) a teprve do iframe-u jde
  // `ensureMapyFrameParam(<long URL>)`. Resolve běží paralelně přes
  // Promise.all — den s 4 mapami se neserializuje za sebou.
  const dayMapSrcs = await Promise.all(
    payload.days.map(async (d) => {
      if (!d.map_url || !isMapyEmbedUrl(d.map_url)) return null;
      try {
        const resolved = await resolveMapyEmbedUrl(d.map_url);
        return ensureMapyFrameParam(resolved);
      } catch {
        // Síťová chyba při resolve → fallback na původní URL +
        // frame=1. Lepší fragile embed než žádný embed.
        return ensureMapyFrameParam(d.map_url);
      }
    }),
  );

  return (
    <section
      className={[
        "",
        dark
          ? "bg-ink-900"
          : "bg-canvas",
      ].join(" ")}
    >
      <div className="mx-auto max-w-5xl px-4 py-10 sm:py-12">
        <SectionHead
          eyebrow={payload.eyebrow || "Program"}
          title={payload.title || "Den po dni"}
          lead={payload.lead}
          tone={dark ? "dark" : "light"}
        />

        <div className="space-y-6">
          {payload.days.map((d, i) => {
            const image = assetUrl(d.image_url);
            const mapSrc = dayMapSrcs[i];
            const mapEmbeddable = mapSrc !== null;
            const num = d.num || String(i + 1).padStart(2, "0");
            return (
              <article
                key={i}
                className={[
                  "overflow-hidden rounded-2xl border shadow-md",
                  dark
                    ? "border-white/10 bg-white/[0.04]"
                    : "border-border bg-surface",
                ].join(" ")}
              >
                <div className="grid gap-0 sm:grid-cols-[200px_1fr]">
                  <div
                    className={[
                      "relative flex min-h-[200px] flex-col justify-between p-8 sm:min-h-[240px]",
                      image
                        ? "text-ink-inverse"
                        : dark
                          ? "bg-ink-700 text-ink-inverse"
                          : "bg-ink-900 text-ink-inverse",
                    ].join(" ")}
                    style={
                      image
                        ? {
                            backgroundImage: `linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.65)), url(${image})`,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                          }
                        : undefined
                    }
                  >
                    {d.label && (
                      <p className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-white/85">
                        {d.label}
                      </p>
                    )}
                    {/* Číslo dne dřív bylo text-5xl/6xl — vizuálně
                        přebíjelo nadpis dne. Decentnější velikost
                        nechá pozornost na obsahu. */}
                    <p
                      className="text-4xl font-semibold leading-none sm:text-5xl"
                      style={{ letterSpacing: "-0.03em" }}
                    >
                      {num}
                    </p>
                  </div>

                  <div className="p-8 sm:p-10">
                    {d.title && (
                      <h3
                        className={[
                          "text-xl font-semibold sm:text-2xl",
                          dark ? "text-ink-inverse" : "text-ink-900",
                        ].join(" ")}
                        style={{ letterSpacing: "-0.02em" }}
                      >
                        {d.title}
                      </h3>
                    )}
                    {d.route && (
                      <p
                        className={[
                          "mt-1 font-mono text-xs uppercase tracking-[0.12em]",
                          dark ? "text-white/60" : "text-ink-500",
                        ].join(" ")}
                      >
                        {d.route}
                      </p>
                    )}
                    {d.body && (
                      <div
                        className={[
                          "mt-4 space-y-3",
                          dark ? "text-white/80" : "text-ink-700",
                        ].join(" ")}
                        style={{ fontSize: 16, lineHeight: 1.6 }}
                      >
                        <FormattedBody body={d.body} />
                      </div>
                    )}
                    {(d.time || d.distance || d.ascent || d.descent) && (
                      <dl
                        className={[
                          "mt-5 flex flex-wrap gap-x-8 gap-y-2 border-t border-dashed pt-4",
                          dark ? "border-white/10" : "border-border",
                        ].join(" ")}
                      >
                        {d.time && <StatPair k="Čas" v={d.time} dark={dark} />}
                        {d.distance && (
                          <StatPair k="Délka" v={d.distance} dark={dark} />
                        )}
                        {d.ascent && (
                          <StatPair
                            k="Stoupání"
                            v={d.ascent}
                            icon="↑"
                            dark={dark}
                          />
                        )}
                        {d.descent && (
                          <StatPair
                            k="Klesání"
                            v={d.descent}
                            icon="↓"
                            dark={dark}
                          />
                        )}
                      </dl>
                    )}
                    {d.map_url && (
                      <div
                        className={[
                          "mt-5 border-t pt-4",
                          dark ? "border-white/10" : "border-border",
                        ].join(" ")}
                      >
                        {mapEmbeddable ? (
                          <>
                            {/* Day-level mapa = stejný click-to-activate
                                pattern jako standalone Map block. Bez
                                MapEmbedShell-u scroll přes mapu zoomoval
                                místo pohybu po stránce — user report
                                2026-06-25. */}
                            <MapEmbedShell
                              src={mapSrc ?? ""}
                              title={`Mapa ${d.title ?? `den ${i + 1}`}`}
                              dark={dark}
                              needsScrollGuard={true}
                            />
                            <div
                              className={[
                                "mt-2 flex justify-between text-xs",
                                dark ? "text-white/60" : "text-ink-500",
                              ].join(" ")}
                            >
                              <span>{d.route || d.title}</span>
                              <a
                                href={d.map_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={[
                                  "font-medium underline hover:no-underline",
                                  dark ? "text-ink-inverse" : "text-ink-900",
                                ].join(" ")}
                              >
                                Otevřít v Mapy.cz →
                              </a>
                            </div>
                          </>
                        ) : (
                          <a
                            href={d.map_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={[
                              "text-sm font-medium underline hover:no-underline",
                              dark ? "text-ink-inverse" : "text-ink-900",
                            ].join(" ")}
                          >
                            Odkaz na trasu →
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function StatPair({
  k,
  v,
  icon,
  dark,
}: {
  k: string;
  v: string;
  /** Volitelná ikona vlevo od hodnoty — ↑ pro stoupání, ↓ pro klesání.
   *  User report 2026-06-25: bez ikony bylo na první pohled těžké
   *  rozlišit „550 m" stoupání vs klesání. */
  icon?: string;
  dark: boolean;
}) {
  return (
    <div>
      <dt
        className={[
          "font-mono text-[10px] font-medium uppercase tracking-[0.14em]",
          dark ? "text-white/60" : "text-ink-500",
        ].join(" ")}
      >
        {k}
      </dt>
      <dd
        className={[
          "mt-0.5 inline-flex items-baseline gap-1 text-base font-semibold",
          dark ? "text-ink-inverse" : "text-ink-900",
        ].join(" ")}
        style={{ letterSpacing: "-0.01em" }}
      >
        {icon && (
          <span
            aria-hidden
            className={[
              "text-sm font-bold",
              dark ? "text-brand" : "text-brand",
            ].join(" ")}
          >
            {icon}
          </span>
        )}
        {v}
      </dd>
    </div>
  );
}
