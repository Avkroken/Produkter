self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

// Network-only by design. Auth, provider configuration, jobs, catalog state and
// application data remain owned by their server-side/runtime boundaries.
self.addEventListener("fetch", () => {});
