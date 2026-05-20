"use client";

import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

import { DiscussionThread } from "@/components/discussion-thread";
import { Alert } from "@/components/ui/card";
import { ApiError, type Workspace, workspaces } from "@/lib/api";
import { useUser } from "@/lib/user-context";

interface Props {
  params: Promise<{ slug: string; topicId: string }>;
}

/**
 * Member-facing thread view (in-app workspace shell). Owner workflows
 * use /admin/komunity/<slug>/nastenka/<topicId> instead; both
 * eventually render the same DiscussionThread.
 */
export default function WorkspaceThreadPage({ params }: Props) {
  const { slug, topicId } = use(params);
  const router = useRouter();
  const user = useUser();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    workspaces
      .detail(slug)
      .then((ws) => {
        if (cancelled) return;
        setWorkspace(ws);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace(
            `/login?next=/workspaces/${slug}/nastenka/${topicId}`,
          );
          return;
        }
        setError(err instanceof ApiError ? err.message : "Něco se pokazilo.");
      });
    return () => {
      cancelled = true;
    };
  }, [slug, topicId, router]);

  if (error) return <Alert variant="danger">{error}</Alert>;
  if (!workspace) {
    return (
      <div className="flex justify-center py-12">
        <span className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
      </div>
    );
  }

  const isModerator =
    workspace.my_role === "owner" || workspace.my_role === "admin";

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:py-12">
      <DiscussionThread
        topicId={Number(topicId)}
        scope={{ kind: "workspace", slug, isModerator }}
        currentUserId={user.id}
        backHref={`/workspaces/${slug}`}
      />
    </main>
  );
}
