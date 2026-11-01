/** Ressources minimales nécessaires avant que le cache dynamique prenne le relais. */
const CACHE = "rpg-gps-field-v316";
const local = (path) => new URL(path, self.location).href;
const APP_SHELL = [
  local("./app/js/core/portrait-characters.js"),
  local("./app/js/core/portrait-hair-colors.js"),
  local("./app/assets/map/tileset-v3/terrain.png"),
  local("./app/assets/map/tileset-v1/structures.png"),
  local("./app/js/core/portrait-catalog.js"),
  local("./app/js/ui/portrait-view.js"),
  local("./app/js/map/mage-male-sheet-v2.js"),
  local("./app/css/portraits.css"),
  local("./app/assets/heroes/mage-male-jrpg-walk-v2.png"),
  ...["warrior", "mage", "ranger"].flatMap((classId) =>
    ["male", "female"].map((gender) =>
      local(`./app/assets/portraits/hero-${classId}-${gender}-anime-v2.png`),
    ),
  ),
  ...[
    "village",
    "town",
    "fort",
    "mine",
    "quarry",
    "forest",
    "tavern",
    "forge",
    "marshal-room",
  ].map((name) =>
    local(`./app/assets/portraits/modular/v1/background-${name}.png`),
  ),
  ...[
    [
      "male",
      {
        body: 12,
        clothingBack: 12,
        face: 4,
        hair: 9,
        hairBack: 0,
        eyes: 8,
        nose: 4,
        mouth: 7,
        clothing: 12,
        accessory: 8,
        headwear: 5,
        glasses: 2,
        prop: 4,
        mask: 2,
        forehead: 2,
        mouthLines: 2,
        eyeWrinkles: 2,
      },
    ],
    [
      "female",
      {
        body: 11,
        clothingBack: 11,
        face: 4,
        hair: 8,
        hairBack: 8,
        eyes: 8,
        nose: 4,
        mouth: 7,
        clothing: 11,
        accessory: 4,
        headwear: 5,
        glasses: 2,
        prop: 4,
        mask: 2,
        forehead: 2,
        mouthLines: 2,
        eyeWrinkles: 2,
      },
    ],
  ].flatMap(([gender, variants]) =>
    Object.entries(variants).flatMap(([part, count]) =>
      Array.from({ length: count }, (_, index) => index)
        .filter(
          (index) =>
            ![
              "accessory",
              "headwear",
              "glasses",
              "prop",
              "mask",
              "forehead",
              "mouthLines",
              "eyeWrinkles",
            ].includes(part) || index > 0,
        )
        .map((index) =>
          local(
            `./app/assets/portraits/modular/v12/${gender}/${part}-${index}${gender === "male" && part === "hair" && index === 8 ? "-front" : ""}.png`,
          ),
        ),
    ),
  ),
  local("./app/js/ui/saved-game-menu.js"),
  local("./app/js/core/hero-gender.js"),
  local("./app/js/ui/hero-appearance.js"),
  local("./app/js/ui/hero-gender-control.js"),
  local("./app/js/map/hero-gender-sheets.js"),
  local("./app/js/ui/hero-class-cards.js"),
  local("./app/js/ui/terrain-vertex.js"),
  local("./app/js/ui/terrain-map-window.js"),
  local("./app/js/ui/saved-map-library-view.js"),
  local("./app/js/ui/lobby-journey.js"),
  local("./app/css/guided-setup.css"),
  local("./app/js/ui/organizer-console-view.js"),
  local("./app/js/ui/player-placement-view.js"),
  local("./app/js/core/player-placement-service.js"),
  local("./app/js/core/initial-scenario-world.js"),
  local("./app/js/ui/preparation-progress.js"),
  local("./app/js/ui/preparation-map-locations.js"),
  local("./app/css/party-preparation.css"),
  local("./app/js/ui/party-preparation-view.js"),
  local("./app/js/ui/qr-scanner.js"),
  local("./app/assets/vendor/jsQR.js"),
  local("./app/js/core/party-preparation.js"),
  local("./app/assets/markers/map/footprints.svg"),
  local("./app/js/core/scenario-location-world-policy.js"),
  local("./app/js/core/location-spacing-policy.js"),
  local("./app/js/map/watch-lookout-sprite.js"),
  local("./app/assets/groups/watch-lookout-v1.png"),
  local("./app/js/map/AstralTravelRenderer.js"),
  local("./app/js/map/AstralGhostDrag.js"),
  local("./app/js/map/autonomous-group-sprite.js"),
  local("./app/js/map/autonomous-group-sprite-atlas.js"),
  local("./app/assets/groups/scout-jrpg-walk-v1.png"),
  local("./app/assets/groups/brigands-jrpg-walk-v1.png"),
  ...["goblins", "orcs", "wolves", "bear", "boar", "deer"].map((id) =>
    local(`./app/assets/groups/${id}-map-front-back-v1.png`),
  ),
  local("./app/js/map/army-banner.js"),
  local("./app/js/map/caravan-sprite.js"),
  local("./app/js/map/caravan-sprite-atlas.js"),
  local("./app/assets/groups/caravan-jrpg-walk-v1.png"),
  local("./app/js/map/hero-class-sheets.js"),
  local("./app/assets/heroes/mage-jrpg-walk-v1.png"),
  local("./app/assets/heroes/ranger-jrpg-walk-v1.png"),
  local("./app/js/map/territory-border-geometry.js"),
  local("./app/js/core/territory-service.js"),
  local("./app/js/core/scenario-map-definition.js"),
  local("./app/js/map/TerritoryRenderer.js"),
  local("./app/js/map/geography-lines.js"),
  local("./app/js/map/location-camera-layout.js"),
  local("./app/js/core/battlefield-generator.js"),
  local("./app/js/map/minimap-tileset.js"),
  local("./app/js/map/tactical-terrain-renderer.js"),
  local("./app/js/controllers/location-quest-marker.js"),
  local("./app/js/map/hero-sprite-atlas.js"),
  local("./app/js/map/MapBillboards.js"),
  local("./app/assets/heroes/hero-jrpg-walk-v2.png"),
  local("./app/js/map/hero-motion.js"),
  local("./app/js/map/MapCamera.js"),
  local("./app/js/map/camera-geometry.js"),
  local("./app/css/map-camera.css"),
  local("./app/js/map/map-package.js"),
  local("./app/js/map/map-package-client.js"),
  local("./app/js/map/GeographyRenderer.js"),
  local("./app/js/map/MapPreparationControls.js"),
  local("./app/js/map/GameMapBackground.js"),
  local("./app/css/map-preparation.css"),
  local("./app/js/core/location-interaction-policy.js"),
  local("./app/js/controllers/encounter-controller.js"),
  local("./app/js/controllers/location-flow-controller.js"),
  local("./app/js/controllers/application-render-controller.js"),
  local("./app/js/ui/encounter-view.js"),
  local("./app/js/ui/world-status-view.js"),
  local("./app/js/controllers/confirmed-action.js"),
  local("./app/js/ui/app-shell-view.js"),
  local("./app/js/controllers/app-navigation-controller.js"),
  local("./app/js/core/solo-launch.js"),
  local("./app/js/session/game-session.js"),
  local("./app/js/controllers/game-start-controller.js"),
  local("./app/js/controllers/world-setup-controller.js"),
  local("./app/js/controllers/game-tools-controller.js"),
  local("./app/js/game-data-loader.js"),
  local("./app/js/core/simulation-config.js"),
  local("./app/js/controllers/hero-ability-controller.js"),
  local("./app/js/ui/hero-ability-view.js"),
  local("./app/js/ui/cooldown-format.js"),
  local("./app/js/controllers/quest-controller.js"),
  local("./app/js/controllers/scenario-world-controller.js"),
  local("./app/js/ui/quest-journal-view.js"),
  local("./app/js/ui/quest-notice-view.js"),
  local("./app/js/ui/quest-debug-view.js"),
  local("./app/js/core/scenario-quest-catalog.js"),

  local("./app/js/controllers/player-interface-controller.js"),
  local("./app/js/ui/hero-view.js"),
  local("./app/js/ui/army-view.js"),
  local("./app/js/ui/army-formation-view.js"),
  local("./app/css/army-formation.css"),
  local("./app/js/ui/player-interface-view.js"),
  local("./app/js/ui/hero-progress-view.js"),
  local("./app/js/ui/progress-reward-view.js"),

  local("./app/js/core/team-fort-quest.js"),
  local("./app/js/ui/team-fort-quest-view.js"),
  local("./app/js/core/location-watch-service.js"),
  local("./app/js/core/location-payment.js"),
  local("./app/js/core/location-tax-service.js"),
  local("./app/js/core/camp-activity-experience.js"),
  local("./app/js/ui/item-visual.js"),
  local("./app/js/core/equipment-art.js"),
  local("./app/assets/equipment/prismadagger.png"),
  local("./app/assets/equipment/hammer.png"),
  local("./app/assets/equipment/herosword.png"),
  local("./app/assets/equipment/shortbow.png"),
  local("./app/assets/equipment/forestbow.png"),
  local("./app/assets/equipment/heavycrossbow.png"),
  local("./app/assets/equipment/lightcrossbow.png"),
  local("./app/assets/equipment/longbow.png"),
  local("./app/assets/equipment/kitchenknife.png"),
  local("./app/assets/equipment/dagger.png"),
  local("./app/assets/equipment/ironspear.png"),
  local("./app/assets/equipment/steelaxe.png"),
  local("./app/assets/equipment/kunai.png"),
  local("./app/assets/equipment/woodbranch.png"),
  local("./app/assets/equipment/wizardwand.png"),
  local("./app/assets/equipment/celestialrod.png"),
  local("./app/assets/equipment/transcendance.png"),
  local("./app/assets/equipment/t13staff.png"),
  local("./app/assets/equipment/buckler.png"),
  local("./app/assets/equipment/oakshield.png"),
  local("./app/assets/equipment/woodshield.png"),
  local("./app/assets/equipment/stpatrickshield.png"),
  local("./app/assets/equipment/artifactscroll.png"),
  local("./app/assets/equipment/t13catalyst.png"),
  local("./app/assets/equipment/t12catalyst.png"),
  local("./app/assets/equipment/tomeofknowledge.png"),
  local("./app/assets/equipment/tombcurse1.png"),
  local("./app/assets/equipment/helmet.png"),
  local("./app/assets/equipment/ironcap.png"),
  local("./app/assets/equipment/vikinghelm.png"),
  local("./app/assets/equipment/centurionhelmet.png"),
  local("./app/assets/equipment/chesshelm.png"),
  local("./app/assets/equipment/leathercap.png"),
  local("./app/assets/equipment/wizardcone.png"),
  local("./app/assets/equipment/blackcowl.png"),
  local("./app/assets/equipment/astralhat.png"),
  local("./app/assets/equipment/chainmail.png"),
  local("./app/assets/equipment/ringmail.png"),
  local("./app/assets/equipment/breastplate.png"),
  local("./app/assets/equipment/scalemail.png"),
  local("./app/assets/equipment/cuirass.png"),
  local("./app/assets/equipment/leatherarmor.png"),
  local("./app/assets/equipment/padded.png"),
  local("./app/assets/equipment/studded.png"),
  local("./app/assets/equipment/exploreroutfit.png"),
  local("./app/assets/equipment/windrunnerarmor.png"),
  local("./app/assets/equipment/robe.png"),
  local("./app/assets/equipment/wizardrobe.png"),
  local("./app/assets/equipment/disciplerobe.png"),
  local("./app/assets/equipment/vampirerobe.png"),
  local("./app/assets/equipment/t13robe.png"),
  local("./app/assets/equipment/furcloak.png"),
  local("./app/assets/equipment/squirecloak.png"),
  local("./app/assets/equipment/scalecloak.png"),
  local("./app/assets/equipment/elvencloak.png"),
  local("./app/assets/equipment/siacloak.png"),
  local("./app/assets/equipment/leatherboots.png"),
  local("./app/assets/equipment/heavyboots.png"),
  local("./app/assets/equipment/forestshoes.png"),
  local("./app/assets/equipment/harpyshoes.png"),
  local("./app/assets/equipment/platinumshoes.png"),
  local("./app/assets/equipment/noblering.png"),
  local("./app/assets/equipment/silverband.png"),
  local("./app/assets/equipment/gatormaidring.png"),
  local("./app/assets/equipment/mysteriousring.png"),
  local("./app/assets/equipment/t12ring.png"),
  local("./app/assets/equipment/goldamulet.png"),
  local("./app/assets/equipment/pendant.png"),
  local("./app/assets/equipment/noblechain.png"),
  local("./app/assets/equipment/vipamulet.png"),
  local("./app/assets/equipment/sunpendant.png"),
  local("./app/assets/equipment/tiara.png"),
  local("./app/assets/equipment/holysymbol.png"),
  local("./app/assets/equipment/t12heavyarmor.png"),
  local("./app/assets/equipment/longsword.png"),
  local("./app/assets/equipment/prideshield.png"),
  local("./app/assets/equipment/berserkerboots.png"),
  local("./app/assets/equipment/medal.png"),
  local("./app/js/ui/live-dom.js"),
  local("./app/js/ui/number-format.js"),
  local("./app/js/map/AutonomousGroupAnimator.js"),
  local("./app/js/core/snapshot-delta.js"),
  local("./app/js/core/repression-quest.js"),
  local("./app/assets/scenes/repression-convoy.svg"),
  local("./app/assets/scenes/repression-prison.svg"),
  local("./app/assets/scenes/repression-release.svg"),
  local("./app/assets/scenes/repression-records.svg"),
  local("./app/assets/scenes/repression-siege.svg"),
  local("./app/assets/scenes/repression-camp.svg"),
  local("./app/assets/scenes/repression-treasure.svg"),
  local("./app/js/core/side-quest-catalog.js"),
  local("./app/js/core/capital-ai-service.js"),
  local("./app/js/core/simulation-locations.js"),
  local("./app/js/core/location-chief-catalog.js"),
  local("./app/js/core/side-quest-service.js"),
  local("./app/js/ui/market-view.js"),
  local("./app/js/core/market-service.js"),
  local("./app/js/core/player-social-service.js"),
  local("./app/js/ui/player-social-view.js"),
  local("./app/css/player-social.css"),
  local("./"),
  local("./index.html"),
  local("./app/"),
  local("./app/index.html"),
  local("./app/css/map-tokens.css"),
  local("./app/css/style.css"),
  local("./app/css/setup-compact.css"),
  local("./app/css/base.css"),
  local("./app/css/management.css"),
  local("./app/css/battle-mobile.css"),
  local("./app/css/game-components.css"),
  local("./app/css/responsive.css"),
  local("./app/css/map-navigation.css"),
  local("./app/css/landscape.css"),
  local("./app/css/map.css"),
  local("./app/css/world-art.css"),
  local("./app/css/battle-duel.css"),
  local("./app/css/battle-tactics.css"),
  local("./app/css/battle-tactics-compact.css"),
  local("./app/js/ui/tactical-battle-help.js"),
  local("./app/js/core/battle-tactics.js"),
  local("./app/js/core/tactical-bonuses.js"),
  local("./app/js/core/tactical-terrain-rules.js"),
  local("./app/js/ui/tactical-combat-effects.js"),
  local("./app/js/core/army-formation.js"),
  local("./app/js/controllers/tactical-battle-controller.js"),
  local("./app/js/ui/tactical-battle-view.js"),
  local("./app/js/ui/tactical-battle-animation.js"),
  local("./app/css/unit-art.css"),
  local("./app/js/main.js"),
  local("./app/js/ui/battle-duel-view.js"),
  local("./app/assets/oldunits/militia-walk.png"),
  local("./app/assets/oldunits/archer-walk.png"),
  local("./app/assets/oldunits/light-cavalry-walk.png"),
  local("./app/assets/units/hero-player.png"),
  local("./app/assets/units/militia-walk-6.png"),
  local("./app/assets/units/archer-walk-6.png"),
  local("./app/assets/units/light-cavalry-walk-6.png"),
  local("./app/assets/units/spearman-walk.png"),
  local("./app/assets/units/swordsman-walk.png"),
  local("./app/assets/units/heavy-infantry-walk.png"),
  local("./app/assets/units/heavy-cavalry-walk.png"),
  local("./app/assets/units/mounted-archer-walk.png"),
  local("./app/assets/units/chaos-raider-walk.png"),
  local("./app/js/core/battle-duel/state.js"),
  local("./app/js/core/battle-duel/commands.js"),
  local("./app/js/core/battle-duel/resolver.js"),
  local("./app/js/core/battle-duel/health.js"),
  local("./app/js/core/battle-duel/outcome.js"),
  local("./app/js/core/scenario-dialogue.js"),
  local("./app/js/controllers/dialogue-controller.js"),
  local("./app/js/controllers/battle-controller.js"),
  local("./app/js/controllers/location-controller.js"),
  local("./app/js/controllers/location-action-controller.js"),
  local("./app/js/controllers/scenario-action-controller.js"),
  local("./app/js/controllers/location-logistics-controller.js"),
  local("./app/js/controllers/location-logistics-feedback.js"),
  local("./app/js/controllers/relay-controller.js"),
  local("./app/js/controllers/gps-controller.js"),
  local("./app/js/controllers/map-controller.js"),
  local("./app/js/controllers/position-controller.js"),
  local("./app/js/controllers/location-map-model.js"),
  local("./app/js/controllers/map-layer-model.js"),
  local("./app/js/controllers/map-interaction-controller.js"),
  local("./app/js/controllers/multiplayer-controller.js"),
  local("./app/js/controllers/server-game-commands.js"),
  local("./app/js/controllers/player-interaction-controller.js"),
  local("./app/js/ui/player-interaction-view.js"),
  local("./app/js/ui/location-logistics-view.js"),
  local("./app/js/ui/relay-view.js"),
  local("./app/js/core/building-dialogue-catalog.js"),
  local("./app/js/asset-preloader.js"),
  local("./app/js/ui/game-loading-view.js"),
  local("./app/js/startup.js"),
  local("./app/js/startup-assets.js"),
  local("./app/assets/equipment/iron-sword.png"),
  local("./app/assets/equipment/round-shield.png"),
  local("./app/assets/equipment/scout-hood.png"),
  local("./app/assets/equipment/steel-sword.png"),
  local("./app/js/core/multiplayer-launch.js"),
  local("./app/js/core/village-adventure.js"),
  local("./app/js/multiplayer-client.js"),
  local("./app/js/core/multiplayer-world-state.js"),
  local("./app/js/ui/lobby-view.js"),
  local("./app/js/ui/lobby-terrain-view.js"),
  local("./app/js/map/AlliedHeroRenderer.js"),
  local("./app/js/gps.js"),
  local("./app/js/orientation.js"),
  local("./app/js/position-adapter.js"),
  local("./app/js/device-alerts.js"),
  local("./app/js/field-state-storage.js"),
  local("./app/js/terrain-profile-storage.js"),
  local("./app/js/wake-lock.js"),
  local("./app/js/ui/game-setup-view.js"),
  local("./app/js/ui/world-view.js"),
  local("./app/js/core/gps-accuracy-log.js"),
  local("./app/js/core/heading.js"),
  local("./app/js/core/location-intel.js"),
  local("./app/js/core/location-range-policy.js"),
  local("./app/js/core/play-area-presence.js"),
  local("./app/manifest.webmanifest"),
  local("./app/icon.svg"),
  local("./app/assets/welcome-portrait.png"),
  local("./app/assets/welcome-landscape.png"),
  local("./data/scenarios/chaos.json"),
  local("./data/hero-classes.json"),
  local("./data/units.json"),
  local("./data/locations.json"),
];
APP_SHELL.push(
  local("./app/js/ui/garrison-sheet.js"),
  local("./app/js/ui/bottom-sheet.js"),
  local("./app/js/ui/unit-icon.js"),
  local("./app/js/ui/map-view.js"),
  local("./app/js/map/MapRenderer.js"),
  local("./app/js/map/UnitRenderer.js"),
);
APP_SHELL.push(
  local("./app/js/core/hero-progression-config.js"),
  local("./app/js/core/hero-progression-service.js"),
  local("./app/js/core/hero-aptitude.js"),
  local("./data/hero-aptitudes.json"),
);
APP_SHELL.push(local("./app/js/core/army-pursuit.js"));
APP_SHELL.push(local("./app/js/core/ambush-service.js"));
APP_SHELL.push(local("./app/js/core/hero-recovery-service.js"));
APP_SHELL.push(local("./app/js/core/quest-pace-profile.js"));
APP_SHELL.push(local("./app/js/core/hero-class-feature-service.js"));
APP_SHELL.push(local("./app/js/core/scout-watch-beacon.js"));
APP_SHELL.push(
  local("./app/js/core/quest-runtime.js"),
  local("./app/js/core/scenario-runtime-builder.js"),
  local("./app/js/ui/quest-hud.js"),
);
APP_SHELL.push(
  local("./app/js/core/scenario-composer.js"),
  local("./app/js/core/trail.js"),
  local("./app/js/core/world-state.js"),
  local("./data/scenarios/repression.json"),
  local("./data/repression-locations.json"),
);
APP_SHELL.push(
  local("./data/scenarios/granaries-of-the-king.json"),
  local("./data/granaries-locations.json"),
);
APP_SHELL.push(
  local("./app/js/ui/dialogue-view.js"),
  local("./app/assets/characters/armand-valgrise.png"),
  local("./app/assets/characters/marshal-aldren.png"),
  local("./app/assets/portraits/hero-wanderer.png"),
  local("./app/assets/portraits/hero-ranger.png"),
  local("./app/assets/portraits/hero-mage.png"),
  local("./app/assets/effects/fog-cloud.png"),
  local("./app/assets/icons/watch-message.png"),
);
APP_SHELL.push(
  local("./app/js/core/item-catalog.js"),
  local("./app/js/core/hero-item-catalog.js"),
  local("./app/js/core/item-acquisition-service.js"),
  local("./app/js/core/item-stack.js"),
  local("./app/js/core/slot-container.js"),
  local("./app/js/core/inventory-service.js"),
  local("./app/js/ui/inventory-view.js"),
);
APP_SHELL.push(local("./app/js/ui/loot-stock-sheet.js"));
APP_SHELL.push(local("./app/js/ui/stock-slots-view.js"));
APP_SHELL.push(
  local("./app/js/core/equipment-service.js"),
  local("./app/js/ui/equipment-view.js"),
);
APP_SHELL.push(local("./app/js/core/setup-placement-service.js"));
APP_SHELL.push(local("./app/js/core/hero-concealment-service.js"));
APP_SHELL.push(local("./app/js/core/hero-trace-service.js"));
APP_SHELL.push(local("./app/js/ui/debug-pause-control.js"));
APP_SHELL.push(local("./app/js/core/chaos-wave-service.js"));
APP_SHELL.push(
  local("./app/js/core/deadline-service.js"),
  local("./app/js/core/result-evaluation-service.js"),
  local("./app/js/core/location-dismantling-service.js"),
);
self.addEventListener("install", (event) =>
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll(
          // Les visuels du monde arrivent progressivement depuis la page.
          APP_SHELL.filter((url) => !url.includes("/app/assets/")).map(
            (url) => new Request(url, { cache: "default" }),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                (key.startsWith("rpg-gps-field-") && key !== CACHE) ||
                key === "rpg-gps-map-packages-v1",
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  // Les API et outils serveur doivent toujours refléter la version et l'état actifs.
  // Aucun repli hors ligne : une ancienne liste de parties serait trompeuse.
  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/api/") ||
      /^\/(dashboard|editor)(\/|$)/.test(url.pathname) ||
      url.pathname === "/health")
  ) {
    event.respondWith(fetch(event.request, { cache: "no-store" }));
    return;
  }
  if (url.hostname.includes("tile.openstreetmap.org")) return;
  if (
    url.origin === self.location.origin &&
    url.pathname.includes("/app/assets/")
  ) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        const response = await fetch(event.request);
        if (response.ok) await cache.put(event.request, response.clone());
        return response;
      }),
    );
    return;
  }
  if (url.origin === self.location.origin && url.pathname.includes("/app/")) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" })
        .then((response) => {
          if (response.ok)
            caches
              .open(CACHE)
              .then((cache) => cache.put(event.request, response.clone()));
          return response;
        })
        .catch(() => caches.match(event.request)),
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ??
        fetch(event.request).then((response) => {
          if (response.ok || response.type === "opaque")
            caches
              .open(CACHE)
              .then((cache) => cache.put(event.request, response.clone()));
          return response;
        }),
    ),
  );
});
