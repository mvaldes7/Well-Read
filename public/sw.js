// Push only: no offline/authenticated-content cache.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("push", event => {
  // Fixed, privacy-preserving text and destination. Never trust a payload URL.
  event.waitUntil(self.registration.showNotification("Well-Read", {
    body: "Take a moment to learn a lesson.", icon: "/icons/well-read-192.png",
    tag: "daily-lesson-reminder", data: { url: "/learn" },
  }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL("/learn", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin && "navigate" in client) {
        await client.navigate(target); await client.focus(); return;
      }
    }
    await self.clients.openWindow(target);
  })());
});
