"use client";

import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

import { DiscussionThread } from "@/components/discussion-thread";
import { Alert } from "@/components/ui/card";
import { ApiError, auth, type Workspace, workspaces } from "@/lib/api";
import { useUser } from "@/lib/user-context";

interface Props {
  params: Promise<{ slug: string; topicId: string }>;
}

/**
 * Dedicated discussion-thread page reached from the admin community
 * wall. The admin shell wraps this so the sidebar context stays
 * consistent while the owner reads + replies.
 */
export default function AdminKomunitaThreadPage({ params }: Props) {
  const { slug, topicId } = use(params);
  const router = useRouter();
  const user = useUser();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ws = await workspaces.detail(slug);
        if (cancelled) return;
        if (ws.my_role !== "owner" && ws.my_role !== "admin") {
          try {
            await auth.me();
            router.replace(`/${slug}`);
          } catch {
            router.replace(
              `/login?next=/admin/komunity/${slug}/nastenka/${topicId}`,
            );
          }
          return;
        }
        setWorkspace(ws);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace(
            `/login?next=/admin/komunity/${slug}/nastenka/${topicId}`,
          );
          return;
        }
        setError(err instanceof ApiError ? err.message : "Něco se pokazilo.");
      }
    })();
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

  return (
    <DiscussionThread
      topicId={Number(topicId)}
      scope={{ kind: "workspace", slug, isModerator: true }}
      currentUserId={user.id}
      backHref={`/admin/komunity/${slug}#nastenka`}
    />
  );
}
