const CACHE = "rpg-gps-field-v1";
const local = (path) => new URL(path, self.location).href;
const APP_SHELL = [local("./"), local("./index.html"), local("./app/"), local("./app/index.html"), local("./app/css/style.css"), local("./app/js/main.js"), local("./app/js/gps.js"), local("./app/manifest.webmanifest"), local("./app/icon.svg"), local("./data/scenarios/chaos.json"), local("./data/hero-classes.json"), local("./data/units.json"), local("./data/locations.json"), "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css", "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"];
self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.hostname.includes("tile.openstreetmap.org")) return;
  event.respondWith(caches.match(event.request).then((cached) => cached ?? fetch(event.request).then((response) => {
    if (response.ok || response.type === "opaque") caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
    return response;
  })));
});
