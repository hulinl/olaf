import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Logo } from "@/components/ui/logo";
import { PublicAuthIndicator } from "@/components/ui/public-auth-indicator";
import { assetUrl, type Workspace } from "@/lib/api";
import { serverFetch } from "@/lib/server-api";

interface Props {
  params: Promise<{ slug: string }>;
}

async function fetchWorkspace(slug: string): Promise<Workspace | null> {
  return serverFetch<Workspace>(`/api/workspaces/${slug}/`);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const workspace = await fetchWorkspace(slug);
  if (!workspace) return { title: "Not found — olaf" };

  const cover = assetUrl(workspace.cover_url);
  return {
    title: `${workspace.name} — olaf`,
    description: workspace.bio || `${workspace.name} on olaf.`,
    openGraph: {
      title: workspace.name,
      description: workspace.bio,
      images: cover ? [cover] : undefined,
      type: "website",
    },
    twitter: {
      card: cover ? "summary_large_image" : "summary",
      title: workspace.name,
      description: workspace.bio,
      images: cover ? [cover] : undefined,
    },
  };
}

export default async function WorkspaceProfilePage({ params }: Props) {
  const { slug } = await params;
  const workspace = await fetchWorkspace(slug);
  if (!workspace) notFound();

  const logo = assetUrl(workspace.logo_url);
  const cover = assetUrl(workspace.cover_url);
  const socials = Object.entries(workspace.social_links ?? {}).filter(
    ([, url]) => Boolean(url),
  );

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-border bg-canvas/85 backdrop-blur supports-[backdrop-filter]:bg-canvas/70">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link
            href="/"
            className="text-ink-900 transition-opacity hover:opacity-80"
          >
            <Logo size={26} />
          </Link>
          <PublicAuthIndicator />
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        <div
          className="relative h-48 w-full border-b border-border bg-surface-strong sm:h-64"
          style={
            cover
              ? {
                  backgroundImage: `url(${cover})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : undefined
          }
        />

        <section className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16">
          <div className="-mt-12 sm:-mt-16 flex flex-col items-center gap-4 sm:flex-row sm:items-end">
            <div
              className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-4 border-canvas bg-surface shadow-md sm:h-32 sm:w-32"
              style={
                workspace.accent_color
                  ? { backgroundColor: workspace.accent_color }
                  : undefined
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {logo ? (
                <img
                  src={logo}
                  alt={`${workspace.name} logo`}
                  className="h-full w-full object-contain"
                />
              ) : (
                <span className="text-2xl font-semibold text-ink-300">
                  {workspace.name.charAt(0)}
                </span>
              )}
            </div>

            <div className="text-center sm:flex-1 sm:pb-2 sm:text-left">
              <h1 className="text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">
                {workspace.name}
              </h1>
              {workspace.location && (
                <p className="mt-1 text-sm text-ink-500">
                  {workspace.location}
                </p>
              )}
            </div>
          </div>

          {workspace.bio && (
            <p className="mt-8 max-w-2xl text-balance text-ink-700">
              {workspace.bio}
            </p>
          )}

          {socials.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {socials.map(([key, url]) => (
                <a
                  key={key}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink-700 transition-colors hover:bg-surface-muted hover:text-ink-900"
                >
                  {key}
                </a>
              ))}
            </div>
          )}

          <div className="mt-12 grid gap-6 md:grid-cols-2">
            <Section title="Communities" hint="Coming with Slice 3">
              <EmptyMessage>
                Public communities under this workspace will be listed here
                once the community shell ships.
              </EmptyMessage>
            </Section>

            <Section title="Upcoming events" hint="Coming with Slice 4">
              <EmptyMessage>
                Public events open for RSVP will appear here as soon as event
                publishing lands.
              </EmptyMessage>
            </Section>
          </div>
        </section>

        <footer className="border-t border-border">
          <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-8 text-sm text-ink-500 sm:flex-row sm:items-center sm:justify-between">
            <span>
              © {new Date().getFullYear()} {workspace.name} on{" "}
              <Link href="/" className="underline">
                olaf
              </Link>
              .
            </span>
            <span className="text-ink-300">EU-hosted · GDPR-clean</span>
          </div>
        </footer>
      </main>
    </>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-ink-900">{title}</h2>
        {hint && <span className="text-xs text-ink-500">{hint}</span>}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function EmptyMessage({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-ink-500">{children}</p>;
}
