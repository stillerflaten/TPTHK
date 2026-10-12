// Service worker: gjør at nettsiden kan legges på hjemskjermen og åpnes uten dekning.
// Strategi: prøv nettet først (så man alltid får nyeste versjon), bruk lagret kopi hvis man er offline.

const CACHE = "tpthk-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const navn of await caches.keys()) if (navn !== CACHE) await caches.delete(navn);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;

  // Firebase-bibliotekene har versjonsnummer i adressen og endrer seg aldri: hent fra lager først.
  if (url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/")) {
    e.respondWith(caches.match(e.request).then((svar) => svar || hentOgLagre(e.request)));
    return;
  }
  // Våre egne filer: nettet først, lagret kopi som reserve.
  if (url.origin === self.location.origin) {
    e.respondWith(hentOgLagre(e.request).catch(() => caches.match(e.request, { ignoreSearch: true })));
  }
});

async function hentOgLagre(req) {
  const svar = await fetch(req);
  if (svar.ok) {
    const kopi = svar.clone();
    caches.open(CACHE).then((c) => c.put(req, kopi));
  }
  return svar;
}
