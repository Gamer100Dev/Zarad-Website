// Zarad asset freshness worker.
// Network responses are revalidated before cached same-origin files are reused.
self.addEventListener("install", event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", event => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  // Keep requests for pages, scripts, styles, JSON, and images current.
  // The server's ETag/Last-Modified validators make unchanged files cheap.
  event.respondWith(
    fetch(request, { cache: "no-cache" })
  );
});
