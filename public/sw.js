// Service worker: gjør at nettsiden kan legges på hjemskjermen og åpnes uten dekning.
// Strategi: prøv nettet først (så man alltid får nyeste versjon), bruk lagret kopi hvis man er offline.

const CACHE = "tpthk-v6";

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
  // Ikontest-sidene skal virke helt uten service workeren.
  if (url.origin === self.location.origin && url.pathname.startsWith("/ikontest/")) return;
  // Ikoner og manifest: la iPhone hente dem rett fra nettet. Via service workeren kan iPhone ende opp med en bokstav i stedet for logoen på hjemskjermen.
  if (url.origin === self.location.origin && /\.(png|webmanifest)$/.test(url.pathname)) return;
  // Våre egne filer: nettet først, lagret kopi som reserve.
  if (url.origin === self.location.origin) {
    e.respondWith(hentOgLagre(e.request).catch(() => caches.match(e.request, { ignoreSearch: true })));
  }
});

async function hentOgLagre(req) {
  // «no-cache»: spør alltid GitHub om fila er endret, i stedet for å bruke nettleserens kopi (som ellers kan være opptil 10 minutter gammel).
  // Uendrede filer koster nesten ingenting å sjekke.
  const svar = await fetch(req, req.url.includes("/firebasejs/") ? undefined : { cache: "no-cache" });
  if (svar.ok) {
    const kopi = svar.clone();
    caches.open(CACHE).then((c) => c.put(req, kopi));
  }
  return svar;
}
