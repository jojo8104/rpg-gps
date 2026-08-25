const CACHE = "rpg-gps-field-v80";
const local = (path) => new URL(path, self.location).href;
const APP_SHELL = [local("./"), local("./index.html"), local("./app/"), local("./app/index.html"), local("./app/css/style.css"), local("./app/js/main.js"), local("./app/js/gps.js"), local("./app/js/orientation.js"), local("./app/js/position-adapter.js"), local("./app/js/device-alerts.js"), local("./app/js/field-state-storage.js"), local("./app/js/wake-lock.js"), local("./app/js/ui/game-setup-view.js"), local("./app/js/ui/world-view.js"), local("./app/js/core/gps-accuracy-log.js"), local("./app/js/core/heading.js"), local("./app/js/core/location-intel.js"), local("./app/js/core/location-range-policy.js"), local("./app/js/core/play-area-presence.js"), local("./app/manifest.webmanifest"), local("./app/icon.svg"), local("./data/scenarios/chaos.json"), local("./data/hero-classes.json"), local("./data/units.json"), local("./data/locations.json")];
APP_SHELL.push(local("./app/js/ui/garrison-sheet.js"), local("./app/js/ui/bottom-sheet.js"), local("./app/js/ui/unit-icon.js"), local("./app/js/ui/map-view.js"), local("./app/js/map/MapRenderer.js"), local("./app/js/map/UnitRenderer.js"));
APP_SHELL.push(local("./app/js/core/hero-progression-config.js"), local("./app/js/core/hero-progression-service.js"), local("./app/js/core/hero-aptitude.js"), local("./data/hero-aptitudes.json"));
APP_SHELL.push(local("./app/js/core/battle-aptitude-service.js"));
APP_SHELL.push(local("./app/js/core/army-pursuit.js"));
APP_SHELL.push(local("./app/js/core/ambush-service.js"));
APP_SHELL.push(local("./app/js/core/hero-recovery-service.js"));
APP_SHELL.push(local("./app/js/core/hero-class-feature-service.js"));
APP_SHELL.push(local("./app/js/core/quest-runtime.js"), local("./app/js/core/scenario-runtime-builder.js"), local("./app/js/ui/quest-hud.js"));
APP_SHELL.push(local("./app/js/ui/dialogue-view.js"), local("./app/assets/characters/armand-valgrise.png"));
APP_SHELL.push(local("./app/js/core/item-catalog.js"), local("./app/js/core/item-stack.js"), local("./app/js/core/slot-container.js"), local("./app/js/core/inventory-service.js"), local("./app/js/ui/inventory-view.js"));
APP_SHELL.push(local("./app/js/ui/loot-stock-sheet.js"));
APP_SHELL.push(local("./app/js/ui/stock-slots-view.js"));
APP_SHELL.push(local("./app/js/core/equipment-service.js"), local("./app/js/ui/equipment-view.js"));
APP_SHELL.push(local("./app/js/core/setup-placement-service.js"));
APP_SHELL.push(local("./app/js/core/hero-concealment-service.js"));
APP_SHELL.push(local("./app/js/core/deadline-service.js"), local("./app/js/core/result-evaluation-service.js"), local("./app/js/core/location-dismantling-service.js"));
self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.hostname.includes("tile.openstreetmap.org")) return;
  if (url.origin === self.location.origin && url.pathname.includes("/app/")) {
    event.respondWith(fetch(event.request).then((response) => { if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone())); return response; }).catch(() => caches.match(event.request)));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached ?? fetch(event.request).then((response) => {
    if (response.ok || response.type === "opaque") caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
    return response;
  })));
});
