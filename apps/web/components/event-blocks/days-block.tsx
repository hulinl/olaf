import { assetUrl } from "@/lib/api";
import { SectionHead } from "@/components/ui/section-head";
import {
  type DaysBlockPayload,
  ensureMapyFrameParam,
  isMapyEmbedUrl,
} from "@/lib/event-blocks";

interface Props {
  payload: DaysBlockPayload;
}

export function DaysBlock({ payload }: Props) {
  if (!payload.days || payload.days.length === 0) return null;

  return (
    <section className="border-t border-border bg-surface-muted">
      <div className="mx-auto max-w-5xl px-4 py-16 sm:py-20">
        <SectionHead eyebrow="Program" title="Den po dni" lead={payload.lead} />

        <div className="space-y-6">
          {payload.days.map((d, i) => {
            const image = assetUrl(d.image_url);
            const mapEmbeddable = isMapyEmbedUrl(d.map_url);
            const num = d.num || String(i + 1).padStart(2, "0");
            return (
              <article
                key={i}
                className="overflow-hidden rounded-md border border-border bg-canvas"
              >
                <div className="grid gap-0 sm:grid-cols-[180px_1fr]">
                  <div
                    className={[
                      "relative flex min-h-[160px] flex-col justify-between p-6",
                      image ? "text-ink-inverse" : "bg-surface-strong text-ink-900",
                    ].join(" ")}
                    style={
                      image
                        ? {
                            backgroundImage: `linear-gradient(rgba(0,0,0,0.30), rgba(0,0,0,0.55)), url(${image})`,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                          }
                        : undefined
                    }
                  >
                    {d.label && (
                      <p
                        className={[
                          "font-mono text-[10px] font-medium uppercase tracking-[0.14em]",
                          image ? "text-white/75" : "text-ink-500",
                        ].join(" ")}
                      >
                        {d.label}
                      </p>
                    )}
                    <p
                      className="text-5xl font-semibold leading-none"
                      style={{ letterSpacing: "-0.03em" }}
                    >
                      {num}
                    </p>
                  </div>

                  <div className="p-6 sm:p-8">
                    {d.title && (
                      <h3
                        className="text-xl font-semibold text-ink-900 sm:text-2xl"
                        style={{ letterSpacing: "-0.02em" }}
                      >
                        {d.title}
                      </h3>
                    )}
                    {d.route && (
                      <p className="mt-1 font-mono text-xs uppercase tracking-[0.12em] text-ink-500">
                        {d.route}
                      </p>
                    )}
                    {d.body && (
                      <p
                        className="mt-4 whitespace-pre-line text-ink-700"
                        style={{ fontSize: 16, lineHeight: 1.6 }}
                      >
                        {d.body}
                      </p>
                    )}
                    {(d.time || d.distance || d.ascent || d.descent) && (
                      <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-2 border-t border-border pt-4">
                        {d.time && <StatPair k="Čas" v={d.time} />}
                        {d.distance && <StatPair k="Délka" v={d.distance} />}
                        {d.ascent && <StatPair k="Stoupání" v={d.ascent} />}
                        {d.descent && <StatPair k="Klesání" v={d.descent} />}
                      </dl>
                    )}
                    {d.map_url && (
                      <div className="mt-5 border-t border-border pt-4">
                        {mapEmbeddable ? (
                          <>
                            <div className="relative aspect-[16/9] w-full overflow-hidden rounded-md border border-border bg-surface-muted">
                              <iframe
                                loading="lazy"
                                src={ensureMapyFrameParam(d.map_url)}
                                title={`Mapa ${d.title ?? `den ${i + 1}`}`}
                                className="absolute inset-0 h-full w-full border-0"
                              />
                            </div>
                            <div className="mt-2 flex justify-between text-xs text-ink-500">
                              <span>{d.route || d.title}</span>
                              <a
                                href={d.map_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium text-ink-900 underline hover:no-underline"
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
                            className="text-sm font-medium text-ink-900 underline hover:no-underline"
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

function StatPair({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-ink-500">
        {k}
      </dt>
      <dd
        className="mt-0.5 text-base font-semibold text-ink-900"
        style={{ letterSpacing: "-0.01em" }}
      >
        {v}
      </dd>
    </div>
  );
}
