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
      href={`/communities/${workspaceSlug}/events/${eventSlug}`}
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink-700 transition-colors hover:border-border-strong hover:text-ink-900 focus-ring"
    >
      Owner view →
    </Link>
  );
}
