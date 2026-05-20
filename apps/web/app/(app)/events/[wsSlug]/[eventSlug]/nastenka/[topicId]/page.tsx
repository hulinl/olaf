"use client";

import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

import { DiscussionThread } from "@/components/discussion-thread";
import { Alert } from "@/components/ui/card";
import { ApiError, type Event as OlafEvent, events } from "@/lib/api";
import { useUser } from "@/lib/user-context";

interface Props {
  params: Promise<{ wsSlug: string; eventSlug: string; topicId: string }>;
}

/**
 * Event-scoped thread view. Same DiscussionThread under the event
 * shell — anyone with an active RSVP (or the event creator) can read
 * + reply. Pin / delete gated by `i_am_owner`.
 */
export default function EventThreadPage({ params }: Props) {
  const { wsSlug, eventSlug, topicId } = use(params);
  const router = useRouter();
  const user = useUser();
  const [event, setEvent] = useState<OlafEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    events
      .publicEvent(wsSlug, eventSlug)
      .then((ev) => {
        if (cancelled) return;
        setEvent(ev as OlafEvent);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace(
            `/login?next=/events/${wsSlug}/${eventSlug}/nastenka/${topicId}`,
          );
          return;
        }
        if (err instanceof ApiError && err.status === 404) {
          router.replace(`/events/${wsSlug}/${eventSlug}`);
          return;
        }
        setError(err instanceof ApiError ? err.message : "Něco se pokazilo.");
      });
    return () => {
      cancelled = true;
    };
  }, [wsSlug, eventSlug, topicId, router]);

  if (error) return <Alert variant="danger">{error}</Alert>;
  if (!event) {
    return (
      <div className="flex justify-center py-12">
        <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      </div>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:py-12">
      <DiscussionThread
        topicId={Number(topicId)}
        scope={{
          kind: "event",
          workspaceSlug: wsSlug,
          eventSlug,
          isModerator: !!event.i_am_owner,
        }}
        currentUserId={user.id}
        backHref={`/events/${wsSlug}/${eventSlug}?tab=nastenka`}
      />
    </main>
  );
}
