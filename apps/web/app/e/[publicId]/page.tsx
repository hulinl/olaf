import { notFound, permanentRedirect } from "next/navigation";

import type { Event, EventDraftPreview } from "@/lib/api";
import { serverFetch } from "@/lib/server-api";

interface Props {
  params: Promise<{ publicId: string }>;
}

type FetchResult = Event | EventDraftPreview;

/**
 * Krátká share URL (2026-09-11) — `/e/<public_id>` resolvuje event
 * přes 8-znakový hash a 308 přesměruje na canonical landing
 * `/{workspace_slug}/e/{event_slug}`. Držíme jednu kopii landing UI
 * (pod tenant slug-em, kvůli navigaci komunity nad postem) a `/e/`
 * je jen krátký shareable alias. Draftový event bez `slug` /
 * `workspace_slug` vrací 404, veřejné události se ihned rozklíčují.
 */
export default async function ShareLinkRedirect({ params }: Props) {
  const { publicId } = await params;
  const event = await serverFetch<FetchResult>(
    `/api/events/e/${publicId}/`,
  );
  if (!event) notFound();
  const workspaceSlug = (event as Event).workspace_slug;
  const eventSlug = (event as Event).slug;
  if (!workspaceSlug || !eventSlug) notFound();
  permanentRedirect(`/${workspaceSlug}/e/${eventSlug}`);
}
