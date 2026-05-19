/**
 * Server-side fetch helper for Next.js Server Components and
 * generateMetadata. Hits the Django API over the docker-internal hostname
 * when set (INTERNAL_API_URL), falling back to the browser-facing URL.
 *
 * Forwards the visitor's cookies so authenticated requests work — without
 * this, an owner viewing their own draft event would always 404 because
 * the Django gate falls back to "anonymous = draft hidden".
 */
import { cookies as nextCookies } from "next/headers";

const SERVER_API_URL =
  process.env.INTERNAL_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8000";

async function buildCookieHeader(): Promise<string | undefined> {
  try {
    const jar = await nextCookies();
    const pairs = jar.getAll().map((c) => `${c.name}=${c.value}`);
    return pairs.length > 0 ? pairs.join("; ") : undefined;
  } catch {
    // Outside a request scope (e.g. build-time metadata generation).
    return undefined;
  }
}

export async function serverFetch<T>(path: string): Promise<T | null> {
  try {
    const cookieHeader = await buildCookieHeader();
    const res = await fetch(`${SERVER_API_URL}${path}`, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
