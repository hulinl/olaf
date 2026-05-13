import Link from "next/link";

import { TopographyBg } from "@/components/marketing/topography-bg";
import { LinkButton } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";

const FEATURES = [
  {
    title: "Communities",
    body: "Gate your crew with approval-based or invite-only membership. Keep the roster in one place.",
  },
  {
    title: "Events",
    body: "From a two-hour group run to a four-day expedition — RSVPs, capacity, waitlists, GPX, the works.",
  },
  {
    title: "Gear & waivers",
    body: "Per-event gear lists, document acknowledgements, and participant uploads. No more email threads.",
  },
];

export default function Home() {
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
          <nav className="flex items-center gap-2 text-sm">
            <Link
              href="/login"
              className="rounded-md px-3 py-1.5 font-medium text-ink-700 transition-colors hover:bg-surface-muted hover:text-ink-900 focus-ring"
            >
              Log in
            </Link>
            <LinkButton href="/signup" variant="primary" size="md">
              Get started
            </LinkButton>
          </nav>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        <section className="relative overflow-hidden">
          <TopographyBg />
          <div className="mx-auto flex max-w-3xl flex-col items-center px-4 py-24 text-center sm:py-32">
            <span className="mb-6 inline-flex items-center rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-ink-500">
              now in private beta
            </span>
            <h1 className="text-balance text-5xl font-semibold leading-[1.05] tracking-tight text-ink-900 sm:text-6xl">
              Where adventures begin.
            </h1>
            <p className="mt-5 max-w-xl text-balance text-lg text-ink-500">
              olaf gives organizers and crews one place to plan, RSVP, sign,
              and show up — built for outdoor communities and corporate teams
              alike.
            </p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <LinkButton href="/signup" variant="primary" size="lg">
                Create an account
              </LinkButton>
              <LinkButton href="/login" variant="secondary" size="lg">
                I already have one
              </LinkButton>
            </div>
          </div>
        </section>

        <section className="border-t border-border bg-surface-muted/60">
          <div className="mx-auto grid max-w-5xl gap-4 px-4 py-16 sm:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-lg border border-border bg-surface p-6 shadow-sm"
              >
                <h3 className="text-base font-semibold text-ink-900">
                  {f.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-500">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <footer className="border-t border-border">
          <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-8 text-sm text-ink-500 sm:flex-row sm:items-center sm:justify-between">
            <span>© {new Date().getFullYear()} olaf — where adventures begin.</span>
            <span className="text-ink-300">EU-hosted · GDPR-clean · PWA-first</span>
          </div>
        </footer>
      </main>
    </>
  );
}
