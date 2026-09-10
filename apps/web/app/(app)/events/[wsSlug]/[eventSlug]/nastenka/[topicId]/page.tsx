"use client";

import { useRouter } from "next/navigation";
import { use, useEffect } from "react";

interface Props {
  params: Promise<{ wsSlug: string; eventSlug: string; topicId: string }>;
}

/**
 * Legacy thread deep-link route. Feed rework 2026-09-10 sloučil topic
 * detail do wall feedu (inline diskuze v kartě), takže standalone
 * thread page zmizel. Ponecháváme routu jako redirect na `?t=<id>`
 * feed URL, ať staré e-mail/bookmark linky nespadly do 404 —
 * `#comment-<id>` hash necháváme netknutý pro anchor scroll na
 * konkrétní komentář ve feedu.
 */
export default function EventThreadRedirect({ params }: Props) {
  const { wsSlug, eventSlug, topicId } = use(params);
  const router = useRouter();

  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    router.replace(
      `/events/${wsSlug}/${eventSlug}?tab=nastenka&t=${topicId}${hash}`,
    );
  }, [wsSlug, eventSlug, topicId, router]);

  return (
    <div className="flex justify-center py-12">
      <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
    </div>
  );
}
