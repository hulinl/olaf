"use client";

import { useEffect, useState } from "react";

import { LinkButton } from "@/components/ui/button";
import { auth } from "@/lib/api";

/**
 * Hero CTA block on the public landing. Swaps between sign-up / log-in
 * buttons (anonymous visitor) and a single "Otevřít olaf →" button
 * pointed at the dashboard (logged-in user).
 *
 * Before: a logged-in user landing on the homepage saw the same
 * "Vytvořit účet / Mám už účet" pair as an anonymous visitor — on
 * mobile this was the only visible entry point and didn't tell them
 * how to actually re-enter the app. The "Dashboard" chip in the top
 * header was hidden on small viewports for space, so the user had to
 * open the avatar menu to find their way back in.
 *
 * Now the hero itself becomes the obvious "continue" button when
 * we know who's looking.
 */
export function HeroCta() {
  const [state, setState] = useState<"loading" | "anon" | "auth">("loading");

  useEffect(() => {
    let cancelled = false;
    auth
      .me()
      .then(() => {
        if (!cancelled) setState("auth");
      })
      .catch(() => {
        if (!cancelled) setState("anon");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Reserve the slot so the hero doesn't jump while we resolve auth.
  if (state === "loading") {
    return <div className="h-[52px]" aria-hidden />;
  }

  if (state === "auth") {
    return (
      <div className="flex flex-col gap-3 sm:flex-row">
        <LinkButton href="/dashboard" variant="primary" size="lg">
          Otevřít olaf →
        </LinkButton>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <LinkButton href="/signup" variant="primary" size="lg">
        Vytvořit účet
      </LinkButton>
      <LinkButton href="/login" variant="secondary" size="lg">
        Mám už účet
      </LinkButton>
    </div>
  );
}
