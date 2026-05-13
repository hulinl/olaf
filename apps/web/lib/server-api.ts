/**
 * Server-side fetch helper for Next.js Server Components and
 * generateMetadata. Hits the Django API over the docker-internal hostname
 * when set (INTERNAL_API_URL), falling back to the browser-facing URL.
 *
 * Server fetches never carry session cookies or CSRF — public endpoints
 * only (workspaces public profile, etc.).
 */
const SERVER_API_URL =
  process.env.INTERNAL_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8000";

export async function serverFetch<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${SERVER_API_URL}${path}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
