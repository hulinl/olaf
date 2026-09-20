"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ApiError, workspaces } from "@/lib/api";

interface Props {
  workspaceSlug: string;
  /** Když set, link míří do event admin cockpitu; jinak do community
   *  admin cockpitu. Použití: na public event landing s eventSlug,
   *  na workspace pages bez eventSlug. */
  eventSlug?: string;
  /** Barevná varianta — `on-dark` pro overlay nad tmavým cover-em
   *  (bílý translucent), default pro světlý surface. */
  variant?: "default" | "on-dark";
}

/**
 * Malý shortcut z uživatelské / veřejné stránky do Tvůrce shellu.
 * Zobrazí se jen tehdy, když má viewer roli owner / admin na daném
 * workspace-u — anonymním nebo běžným členům zůstává schovaný.
 *
 * Předtím dělal jenom event scope („Owner view"); teď funguje na
 * public workspace page i in-app workspace page (bez eventSlug =
 * míří do `/tvurce/komunity/<slug>`), aby owner/admin nikdy nemusel
 * skákat přes global nav do Tvůrce.
 */
export function OwnerCockpitLink({
  workspaceSlug,
  eventSlug,
  variant = "default",
}: Props) {
  const [canManage, setCanManage] = useState(false);

  useEffect(() => {
    let cancelled = false;
    workspaces
      .detail(workspaceSlug)
      .then((ws) => {
        if (
          !cancelled &&
          (ws.my_role === "owner" || ws.my_role === "admin")
        ) {
          setCanManage(true);
        }
      })
      .catch((err) => {
        if (err instanceof ApiError) return;
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug]);

  if (!canManage) return null;

  const href = eventSlug
    ? `/tvurce/akce/${workspaceSlug}/${eventSlug}/edit`
    : `/tvurce/komunity/${workspaceSlug}`;
  const label = eventSlug ? "Spravovat akci" : "Spravovat komunitu";

  const classes =
    variant === "on-dark"
      ? "inline-flex items-center gap-1.5 rounded-md border border-white/40 bg-white/10 px-3 py-1.5 text-xs font-medium text-ink-inverse backdrop-blur-sm transition-colors hover:border-white/70 hover:bg-white/20 focus-ring"
      : "inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink-700 transition-colors hover:border-brand hover:bg-surface-muted hover:text-brand focus-ring";

  return (
    <Link href={href} title={label} aria-label={label} className={classes}>
      <CogIcon />
      {/* Label schovaný na velmi úzkém viewportu (share + auth pill
          už tam berou místo). */}
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}

function CogIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="8" cy="8" r="2.25" />
      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" />
    </svg>
  );
}
