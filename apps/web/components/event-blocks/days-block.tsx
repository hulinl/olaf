import { assetUrl } from "@/lib/api";
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
    <section className="border-t border-border bg-surface-muted/40">
      <div className="mx-auto max-w-5xl px-4 py-16">
        <h2 className="mb-6 inline-block bg-ink-900 px-3 py-1.5 text-xl font-semibold text-ink-inverse">
          PROGRAM
        </h2>
        {payload.lead && (
          <p className="mb-8 max-w-2xl text-ink-700">{payload.lead}</p>
        )}
        <div className="space-y-8">
          {payload.days.map((d, i) => {
            const image = assetUrl(d.image_url);
            const mapEmbeddable = isMapyEmbedUrl(d.map_url);
            return (
              <article
                key={i}
                className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm"
              >
                <div className="grid gap-0 sm:grid-cols-[200px_1fr]">
                  <div
                    className="relative flex min-h-[180px] flex-col justify-between bg-ink-900 p-6 text-ink-inverse"
                    style={
                      image
                        ? {
                            backgroundImage: `linear-gradient(rgba(0,0,0,0.35), rgba(0,0,0,0.45)), url(${image})`,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                          }
                        : undefined
                    }
                  >
                    {d.label && (
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-inverse/80">
                        {d.label}
                      </p>
                    )}
                    {(d.num || i + 1) && (
                      <p className="text-5xl font-semibold leading-none">
                        {d.num || String(i + 1).padStart(2, "0")}
                      </p>
                    )}
                  </div>
                  <div className="p-6 sm:p-8">
                    {d.title && (
                      <h3 className="text-lg font-semibold text-ink-900 sm:text-xl">
                        {d.title}
                      </h3>
                    )}
                    {d.route && (
                      <p className="mt-1 text-sm text-ink-500">{d.route}</p>
                    )}
                    {d.body && (
                      <p className="mt-4 whitespace-pre-line text-ink-700">
                        {d.body}
                      </p>
                    )}
                    {(d.time || d.distance || d.ascent || d.descent) && (
                      <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-dashed border-border pt-4 text-sm text-ink-700">
                        {d.time && <span>⏱ {d.time}</span>}
                        {d.distance && <span>↔ {d.distance}</span>}
                        {d.ascent && <span>↑ {d.ascent}</span>}
                        {d.descent && <span>↓ {d.descent}</span>}
                      </div>
                    )}
                    {d.map_url && (
                      <div className="mt-5 border-t border-dashed border-border pt-4">
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
                                className="text-brand hover:underline"
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
                            className="text-sm text-brand hover:underline"
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
