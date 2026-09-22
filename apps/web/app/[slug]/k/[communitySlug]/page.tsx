import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppFooter } from "@/components/ui/app-footer";
import { Logo } from "@/components/ui/logo";
import { OwnerCockpitLink } from "@/components/ui/owner-cockpit-link";
import { PublicAuthIndicator } from "@/components/ui/public-auth-indicator";
import { ShareButton } from "@/components/ui/share-button";
import { assetUrl, type Community, type Workspace } from "@/lib/api";
import { serverFetch } from "@/lib/server-api";

interface Props {
  params: Promise<{ slug: string; communitySlug: string }>;
}

async function fetchCommunity(
  wsSlug: string,
  cSlug: string,
): Promise<Community | null> {
  return serverFetch<Community>(
    `/api/communities/workspaces/${wsSlug}/${cSlug}/`,
  );
}

async function fetchWorkspace(slug: string): Promise<Workspace | null> {
  return serverFetch<Workspace>(`/api/workspaces/${slug}/`);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, communitySlug } = await params;
  const community = await fetchCommunity(slug, communitySlug);
  if (!community) return { title: "Not found — olaf" };
  const cover = assetUrl(community.cover_url);
  return {
    title: `${community.name} — olaf`,
    description: community.description || `${community.name} on olaf.`,
    openGraph: {
      title: community.name,
      description: community.description,
      images: cover ? [cover] : undefined,
      type: "website",
    },
  };
}

export default async function PublicCommunityPage({ params }: Props) {
  const { slug, communitySlug } = await params;
  const [community, workspace] = await Promise.all([
    fetchCommunity(slug, communitySlug),
    fetchWorkspace(slug),
  ]);
  if (!community) notFound();

  const cover = assetUrl(community.cover_url);

  return (
    <div className="bg-canvas text-ink-900">
      <header className="sticky top-0 z-10 border-b border-border bg-canvas/85 backdrop-blur supports-[backdrop-filter]:bg-canvas/70">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <Link
            href="/"
            className="text-ink-900 transition-opacity hover:opacity-80"
            aria-label="olaf"
          >
            <Logo size={26} />
          </Link>
          <div className="flex items-center gap-3">
            <ShareButton
              url={`/${slug}/k/${communitySlug}`}
              title={community.name}
              text={community.description || community.name}
              variant="soft"
            />
            <OwnerCockpitLink workspaceSlug={slug} />
            <PublicAuthIndicator />
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        {/* HERO — cover jako pozadí (když je), nadpis + workspace odkaz
            přes overlay dole. Layout mirrors /[slug]/page.tsx pro
            konzistenci mezi workspace a community public stránkami. */}
        <section
          className="relative isolate flex min-h-[220px] flex-col overflow-hidden sm:min-h-[280px] md:min-h-[320px]"
          style={!cover ? { backgroundColor: "#0f172a" } : undefined}
        >
          {cover && (
            <div className="absolute inset-0 -z-10 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cover}
                alt=""
                className="h-full w-full object-cover"
              />
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.10) 45%, rgba(0,0,0,0.75) 100%)",
                }}
              />
            </div>
          )}

          <div className="mt-auto w-full">
            <div className="mx-auto max-w-4xl px-4 pb-6 sm:pb-8">
              <p
                className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-white/85"
                style={{ textShadow: "0 1px 8px rgba(0,0,0,0.5)" }}
              >
                Komunita
                {workspace && (
                  <>
                    {" · "}
                    <Link
                      href={`/${workspace.slug}`}
                      className="underline decoration-white/40 underline-offset-2 hover:decoration-white"
                    >
                      {workspace.name}
                    </Link>
                  </>
                )}
              </p>
              <h1
                className="mt-2 text-3xl font-semibold leading-tight text-ink-inverse sm:text-4xl md:text-5xl"
                style={{
                  letterSpacing: "-0.02em",
                  textShadow: "0 2px 12px rgba(0,0,0,0.5)",
                }}
              >
                {community.name}
              </h1>
              <p
                className="mt-2 text-sm text-white/90 sm:text-base"
                style={{ textShadow: "0 1px 8px rgba(0,0,0,0.55)" }}
              >
                {community.member_count}{" "}
                {community.member_count === 1 ? "člen" : "členů"}
              </p>
              {/* Compact join CTA — dedikovaná stránka drží celý flow. */}
              {community.visibility === "public" &&
                (!community.my_membership ||
                  community.my_membership.status === "removed" ||
                  community.my_membership.status === "declined") && (
                  <div className="mt-3">
                    <Link
                      href={`/${slug}/k/${communitySlug}/join`}
                      className="inline-flex items-center gap-1 rounded-full bg-white/95 px-3.5 py-1.5 text-sm font-semibold text-ink-900 shadow-sm transition-colors hover:bg-white focus-ring"
                    >
                      Přidej se do komunity →
                    </Link>
                  </div>
                )}
              {community.visibility === "public" &&
                community.my_membership?.status === "pending" && (
                  <div className="mt-3">
                    <span className="inline-flex items-center gap-1 rounded-full bg-warning/90 px-3.5 py-1.5 text-sm font-semibold text-ink-900">
                      Čekáš na schválení
                    </span>
                  </div>
                )}
            </div>
          </div>
        </section>

        {/* DESCRIPTION */}
        {community.description && (
          <section className="bg-canvas">
            <div className="mx-auto max-w-4xl px-4 py-10 sm:py-14">
              <p
                className="max-w-2xl whitespace-pre-line text-ink-700"
                style={{ fontSize: 16, lineHeight: 1.6 }}
              >
                {community.description}
              </p>
            </div>
          </section>
        )}

        <AppFooter />
      </main>
    </div>
  );
}
