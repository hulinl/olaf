"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  ApiError,
  type NotificationItem,
  notifications,
} from "@/lib/api";

/** Poll the unread count every minute. Cheaper than refetching the
 *  full list — the bell only needs the badge number. The dropdown
 *  pulls the recent list on open. */
const POLL_INTERVAL_MS = 60 * 1000;

/**
 * Top-right bell with an unread badge + click-to-open dropdown.
 *
 * Polling `/api/notifications/count/` keeps the badge fresh without
 * an open WebSocket — the count endpoint is intentionally tiny
 * (`{ unread: int }`). The dropdown fetches the list lazily on open
 * so the badge poll stays cheap.
 *
 * Clicking a row marks it read (server-side + optimistic local
 * update) and navigates to its link. "Označit vše jako přečtené"
 * clears the bell.
 */
export function NotificationBell() {
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Poll the unread count on mount + every minute.
  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const r = await notifications.count();
        if (!cancelled) setUnread(r.unread);
      } catch {
        // Silent — bell shouldn't spam errors. A real outage shows
        // up via the dropdown when the user clicks it.
      }
    }
    tick();
    const id = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // Click-outside + Esc to close.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  async function openDropdown() {
    setOpen(true);
    if (items === null) await loadItems();
  }

  async function loadItems() {
    setLoading(true);
    setError(null);
    try {
      const list = await notifications.list({ limit: 20 });
      setItems(list);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Načtení selhalo.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleMarkRead(id: number) {
    try {
      await notifications.markRead(id);
      setItems((prev) =>
        prev
          ? prev.map((n) =>
              n.id === id
                ? { ...n, is_read: true, read_at: new Date().toISOString() }
                : n,
            )
          : prev,
      );
      setUnread((u) => Math.max(0, u - 1));
    } catch {
      // Best effort; not worth surfacing.
    }
  }

  async function handleMarkAllRead() {
    try {
      const r = await notifications.markAllRead();
      setUnread(0);
      setItems((prev) =>
        prev
          ? prev.map((n) => ({
              ...n,
              is_read: true,
              read_at: n.read_at ?? new Date().toISOString(),
            }))
          : prev,
      );
      // Touch r to satisfy the linter; could surface the count later.
      void r;
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Označení selhalo.",
      );
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openDropdown())}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={
          unread > 0
            ? `Notifikace (${unread} nepřečtených)`
            : "Notifikace"
        }
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-700 transition-colors hover:bg-surface-muted hover:text-ink-900 focus-ring"
      >
        <BellIcon />
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full border-2 border-canvas bg-brand px-1 text-[10px] font-bold leading-none text-brand-ink"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-80 max-w-[90vw] origin-top-right overflow-hidden rounded-md border border-border bg-surface shadow-lg"
        >
          <div className="flex items-baseline justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-semibold text-ink-900">Notifikace</p>
            {items && items.some((n) => !n.is_read) && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-xs font-medium text-brand hover:underline"
              >
                Označit vše jako přečtené
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading && (
              <div className="flex justify-center py-6">
                <span className="inline-flex h-6 w-6 animate-spin rounded-full border-2 border-border-strong border-t-brand" />
              </div>
            )}
            {error && (
              <p className="px-4 py-3 text-xs text-danger">{error}</p>
            )}
            {!loading && !error && items && items.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-ink-500">
                Žádné notifikace.
              </p>
            )}
            {!loading &&
              items &&
              items.map((n) => (
                <NotificationRow
                  key={n.id}
                  notif={n}
                  onMarkRead={() => handleMarkRead(n.id)}
                  onNavigate={() => setOpen(false)}
                />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationRow({
  notif,
  onMarkRead,
  onNavigate,
}: {
  notif: NotificationItem;
  onMarkRead: () => void;
  onNavigate: () => void;
}) {
  const date = new Date(notif.created_at);
  const ago = formatAgo(date);
  // Server stores absolute frontend URLs (FRONTEND_URL + /…); strip
  // the origin if present so Next.js can route internally.
  let href = notif.link || "/";
  if (typeof window !== "undefined") {
    try {
      const u = new URL(href, window.location.origin);
      if (u.origin === window.location.origin) href = u.pathname + u.search + u.hash;
    } catch {
      // ignore — fallback to raw value
    }
  }
  return (
    <Link
      href={href}
      onClick={() => {
        if (!notif.is_read) onMarkRead();
        onNavigate();
      }}
      className={[
        "flex flex-col gap-1 border-b border-border px-4 py-3 text-sm transition-colors hover:bg-surface-muted",
        notif.is_read ? "" : "bg-brand/5",
      ].join(" ")}
    >
      <p
        className={[
          "font-medium",
          notif.is_read ? "text-ink-700" : "text-ink-900",
        ].join(" ")}
      >
        {notif.title}
      </p>
      {notif.body && (
        <p className="line-clamp-2 text-xs text-ink-500">{notif.body}</p>
      )}
      <p className="text-[10px] text-ink-500">{ago}</p>
    </Link>
  );
}

function formatAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "před chvílí";
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `před ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `před ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `před ${days} dny`;
  return date.toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "short",
  });
}

function BellIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}
