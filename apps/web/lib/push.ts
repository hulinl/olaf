/**
 * Web Push subscription helpers — wired up from /settings/notifications.
 *
 * iOS Safari only allows push when the app is installed via "Add to
 * Home Screen" (the standalone PWA launched from a home-screen icon).
 * Detect with `window.navigator.standalone` or the display-mode
 * media query and surface that requirement to the user before
 * prompting for permission.
 */
import { apiFetch } from "@/lib/api";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export function pushAvailable(): boolean {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator)) return false;
  if (!("PushManager" in window)) return false;
  if (!VAPID_PUBLIC_KEY) return false;
  return true;
}

export function isPwa(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  // iOS Safari-specific.
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

function urlBase64ToUint8Array(b64: string): Uint8Array {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

async function ensureSwRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/sw.js");
  if (existing) return existing;
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!pushAvailable()) return null;
  try {
    const reg = await ensureSwRegistration();
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export async function subscribePush(): Promise<void> {
  if (!pushAvailable()) throw new Error("Web Push není dostupný.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Bez povolení notifikací push nelze aktivovat.");
  }
  const reg = await ensureSwRegistration();
  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      // TS lib types don't accept Uint8Array<ArrayBufferLike> here yet
      // but it's exactly what the runtime expects — cast safely.
      applicationServerKey: urlBase64ToUint8Array(
        VAPID_PUBLIC_KEY,
      ) as unknown as BufferSource,
    }));

  const json = sub.toJSON();
  await apiFetch("/api/auth/me/push-subscriptions/", {
    method: "POST",
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: json.keys,
      user_agent: navigator.userAgent.slice(0, 300),
    }),
  });
}

export async function unsubscribePush(): Promise<void> {
  if (!pushAvailable()) return;
  const reg = await ensureSwRegistration();
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  // Tell the backend first so dead endpoints stop receiving sends
  // even if the browser unsub fails for some reason.
  try {
    await apiFetch("/api/auth/me/push-subscriptions/", {
      method: "POST",
      body: JSON.stringify({
        endpoint: sub.endpoint,
        keys: sub.toJSON().keys,
        user_agent: navigator.userAgent.slice(0, 300),
      }),
    });
  } catch {
    /* ignore */
  }
  await sub.unsubscribe();
}

export interface PushTestResult {
  sent: number;
  subscriptions: number;
  vapid_configured: boolean;
}

export async function sendTestPush(): Promise<PushTestResult> {
  return await apiFetch<PushTestResult>("/api/auth/me/push-test/", {
    method: "POST",
  });
}
