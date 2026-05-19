// Service worker — only job in V1 is to relay Web Push notifications
// and route clicks back to the right URL. No offline caching layer yet;
// kept intentionally tiny so the install cost is zero.

self.addEventListener("install", (event) => {
  // Activate the new worker immediately so a freshly installed PWA
  // can subscribe to push without a reload cycle.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch (err) {
    payload = { title: "olaf", body: event.data.text() };
  }
  const title = payload.title || "olaf";
  const options = {
    body: payload.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: payload.tag,
    data: { url: payload.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // If a tab is already open on the target URL, focus it.
      for (const client of allClients) {
        if (client.url.endsWith(targetUrl) && "focus" in client) {
          return client.focus();
        }
      }
      // Otherwise focus the first olaf tab and navigate it.
      if (allClients.length > 0) {
        const client = allClients[0];
        await client.navigate(targetUrl);
        return client.focus();
      }
      // No olaf tab open — open a new one.
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })(),
  );
});
