"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ApiError, workspaces } from "@/lib/api";

interface Props {
  workspaceSlug: string;
  eventSlug: string;
}

/**
 * Small client island for public event / workspace pages. Renders nothing
 * unless the viewer is the owner of this workspace — in which case it shows
 * a discreet "Owner view" link back to the admin cockpit.
 *
 * Quietly swallows auth / fetch errors: anonymous visitors get a 401, the
 * component just stays hidden.
 */
export function OwnerCockpitLink({ workspaceSlug, eventSlug }: Props) {
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    let cancelled = false;
    workspaces
      .detail(workspaceSlug)
      .then((ws) => {
        if (!cancelled && ws.my_role === "owner") setIsOwner(true);
      })
      .catch((err) => {
        if (err instanceof ApiError) return;
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug]);

  if (!isOwner) return null;

  return (
    <Link
      href={`/admin/eventy/${workspaceSlug}/${eventSlug}/edit`}
      title="Owner view"
      aria-label="Owner view"
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1.5 text-xs font-medium text-ink-700 transition-colors hover:border-border-strong hover:text-ink-900 focus-ring sm:px-3"
    >
      <CogIcon />
      {/* Label hidden on the cramped mobile public-event header where
          ShareButton + PublicAuthIndicator already take their share. */}
      <span className="hidden sm:inline">Owner view →</span>
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
