import {
  closeSheet,
  renderLocationSheet,
  renderLocationTab,
} from "../ui/bottom-sheet.js";
import {
  renderMarketView,
  updateMarketView,
  tradeMessage,
} from "../ui/market-view.js";
import {
  renderLocationDetail,
  updateLocationDetail,
  renderWorldDirectory,
} from "../ui/world-view.js";
import { renderGarrisonSheet } from "../ui/garrison-sheet.js";
import { buildLocationIntel } from "../core/location-intel.js";

// Possède les lieux affichés et leurs vues de ressources. Les règles restent
// dans Game ; chaque action relit la session pour suivre les états serveur.
export function createLocationController({
  sheet,
  worldContent,
  getSession,
  mappedLocations,
  descriptions,
  positionFor,
  switchView,
  focusMap,
  onAction,
  onChange,
  applyAuthoritativeGameState,
  isPaused,
  isLandscape,
  isWorldVisible,
  onDeferredRender,
  views = {},
}) {
  const ui = { sheet, worldContent };
  const {
    tab = renderLocationTab,
    sheetView = renderLocationSheet,
    market = renderMarketView,
    updateMarket = updateMarketView,
    detail = renderLocationDetail,
    updateDetail = updateLocationDetail,
    directory = renderWorldDirectory,
    garrison = renderGarrisonSheet,
  } = views;
  let currentLocationId = null,
    activeGarrisonLocationId = null,
    worldSelectedLocationId = null,
    worldMessage = "",
    initialWorldActionMenu = null,
    generation = 0;
  const worldFilters = { search: "", type: "", owner: "", sort: "distance" };
  function selectLocation(id, { compact = false, expanded = false } = {}) {
    const location = mappedLocations().find((item) => item.id === id);
    if (!location) {
      currentLocationId = null;
      closeSheet(ui.sheet);
      return;
    }
    activeGarrisonLocationId = null;
    currentLocationId = id;
    const landscape = isLandscape();
    const keepExpanded = !compact && ui.sheet.dataset.expandedLocationId === id;
    if (landscape || (!expanded && !keepExpanded)) {
      tab({
        element: ui.sheet,
        location,
        onOpen: () =>
          landscape
            ? openLocationDetail(id)
            : selectLocation(id, { expanded: true }),
      });
      return;
    }
    sheetView({
      element: ui.sheet,
      location,
      onClose: () => selectLocation(id, { compact: true }),
      onAction: onAction,
      onOpenWorld: (interactionMenu = null) =>
        openLocationDetail(id, interactionMenu),
      onOpenReserves: () => openLocationDetail(id, "reserves"),
      onOpenGarrison: () => openGarrisonManager(id),
    });
  }
  function marketViewState(location) {
    const { game, hero, playerId: localPlayerId } = getSession();
    return {
      element: ui.sheet,
      location,
      hero,
      service: game.marketService,
      canTrade:
        location.heroIds.includes(hero.id) &&
        game.locationAccessPolicy.can(localPlayerId, location, "trade"),
    };
  }

  function refreshOpenResourceViews() {
    const { game } = getSession();
    if (!game || isPaused()) return;
    const marketId = ui.sheet.querySelector("[data-market-location]")?.dataset
      .marketLocation;
    if (!ui.sheet.hidden && marketId) {
      const location = game.getLocation(marketId);
      if (location) updateMarket(marketViewState(location));
    }
    if (worldSelectedLocationId && isWorldVisible()) {
      const location = directoryLocations().find(
        (item) => item.id === worldSelectedLocationId,
      );
      if (location) updateDetail({ element: ui.worldContent, location });
    }
  }

  function openMarket(locationId, message = "") {
    const { game } = getSession();
    const location = game.getLocation(locationId);
    if (!location) return;
    if (updateMarket({ ...marketViewState(location), message })) return;
    market({
      ...marketViewState(location),
      message,
      onClose: () => closeSheet(ui.sheet),
      onTrade: async (transaction) => {
        const revision = generation;
        const {
          game,
          hero,
          playerId: localPlayerId,
          authoritative: authoritativeServerReady,
          client: multiplayerClient,
        } = getSession();
        const input = {
          playerId: localPlayerId,
          heroId: hero.id,
          locationId,
          ...transaction,
        };
        let feedback;
        try {
          let result;
          if (authoritativeServerReady) {
            const response = await multiplayerClient.sendGameCommand(
              "tradeAtLocation",
              [input],
            );
            result = response.result;
            if (revision !== generation) return;
            if (response.game?.state)
              applyAuthoritativeGameState(response.game.state);
          } else result = game.tradeAtLocation(input);
          feedback = tradeMessage(result ?? { success: false });
          onChange();
        } catch (error) {
          feedback = "Échange non confirmé. Réessayez après synchronisation.";
        }
        if (
          revision === generation &&
          !ui.sheet.hidden &&
          ui.sheet.querySelector("[data-market-location]")?.dataset
            .marketLocation === locationId
        )
          openMarket(locationId, feedback);
      },
    });
  }

  function directoryLocations() {
    const { game, hero, playerId: localPlayerId, data } = getSession();
    const player = game.getPlayer(localPlayerId);
    return mappedLocations().map((snapshot) => {
      const location = game.getLocation(snapshot.id);
      const ownerPlayer = location.ownerId
        ? game.getPlayer(location.ownerId)
        : null;
      const ownerName =
        location.ownerId === "kingdom"
          ? "Royaume"
          : (ownerPlayer?.name ?? location.ownerId);
      const owner = location.ownerId
        ? {
            id: location.ownerId,
            name: ownerName,
            color:
              location.ownerId === localPlayerId
                ? "#62a8ff"
                : location.ownerId === "bandits"
                  ? "#d86868"
                  : "#d8b862",
          }
        : null;
      const heroes = location.heroIds
        .map((id) => game.getHero(id))
        .filter((item) => item && item.id !== hero.id)
        .map((item) => ({
          ...item,
          className:
            data.heroClasses.find((heroClass) => heroClass.id === item.classId)
              ?.name ?? item.classId,
        }));
      return {
        ...buildLocationIntel({
          location,
          snapshot,
          knowledgeLevel: game.heroClassFeatureService.informationLevel(
            hero,
            player.getLocationKnowledge(location.id),
          ),
          owner,
          heroes,
          description:
            descriptions[location.id] ??
            "Un lieu dont l'histoire reste à découvrir.",
        }),
        campDevelopment: game.canPerformLocationAction({
          playerId: player.id,
          locationId: location.id,
          action: "build",
        })
          ? snapshot.campDevelopment
          : null,
      };
    });
  }
  function filteredDirectoryLocations() {
    const search = worldFilters.search.trim().toLocaleLowerCase("fr");
    const locations = directoryLocations().filter(
      (location) =>
        (!search || location.name.toLocaleLowerCase("fr").includes(search)) &&
        (!worldFilters.type || location.nature === worldFilters.type) &&
        (!worldFilters.owner ||
          (worldFilters.owner === "known"
            ? location.owner.id
            : !location.owner.id)),
    );
    const compare =
      worldFilters.sort === "name"
        ? (a, b) => a.name.localeCompare(b.name, "fr")
        : worldFilters.sort === "type"
          ? (a, b) => a.nature.localeCompare(b.nature, "fr")
          : worldFilters.sort === "owner"
            ? (a, b) => a.owner.name.localeCompare(b.owner.name, "fr")
            : (a, b) => a.distance - b.distance;
    return locations.sort(compare);
  }
  function openLocationDetail(id, actionMenu = null) {
    activeGarrisonLocationId = null;
    worldSelectedLocationId = id;
    worldMessage = "";
    initialWorldActionMenu = actionMenu;
    closeSheet(ui.sheet);
    switchView("world");
  }
  function showLocationOnMap(id) {
    const location = directoryLocations().find((item) => item.id === id);
    const position = location?.position ?? positionFor(id);
    if (!position) return;
    switchView("map");
    focusMap(position);
  }

  function openGarrisonManager(locationId, message = "") {
    const { game, hero, playerId: localPlayerId } = getSession();
    const location = game.getLocation(locationId);
    if (!location) return;
    activeGarrisonLocationId = locationId;
    currentLocationId = locationId;
    garrison({
      element: ui.sheet,
      location,
      hero,
      playerId: localPlayerId,
      unitDefinitions: game.unitDefinitions,
      message,
      onClose: () => {
        activeGarrisonLocationId = null;
        closeSheet(ui.sheet);
      },
      onTransfer: async ({ direction, unitId }) => {
        const revision = generation;
        try {
          const { game, hero, playerId: localPlayerId } = getSession();
          const success =
            direction === "deposit"
              ? await game.garrisonUnit({
                  playerId: localPlayerId,
                  heroId: hero.id,
                  locationId,
                  unitId,
                })
              : await game.withdrawGarrisonUnit({
                  playerId: localPlayerId,
                  heroId: hero.id,
                  locationId,
                  unitId,
                });
          if (revision !== generation || success == null) return;
          renderWorld();
          openGarrisonManager(
            locationId,
            success
              ? direction === "deposit"
                ? "Unité affectée à la garnison."
                : "Unité reprise dans votre armée."
              : "Transfert impossible : vérifiez les slots, la capacité de l’armée et le propriétaire de l’unité.",
          );
        } catch (error) {
          if (revision === generation)
            openGarrisonManager(
              locationId,
              `Transfert non confirmé : ${error.message}`,
            );
        }
      },
    });
  }
  function renderWorld() {
    const { game } = getSession();
    if (isPaused()) {
      onDeferredRender();
      return;
    }
    if (!game || !ui.worldContent) return;
    const locations = filteredDirectoryLocations();
    if (!worldSelectedLocationId)
      return directory({
        element: ui.worldContent,
        locations,
        types: [
          ...new Set(directoryLocations().map((location) => location.nature)),
        ].sort(),
        filters: worldFilters,
        onFilter: (key, value) => {
          worldFilters[key] = value;
          renderWorld();
          if (key === "search") {
            const input = ui.worldContent.querySelector(
              '[data-filter="search"]',
            );
            input?.focus();
            input?.setSelectionRange(value.length, value.length);
          }
        },
        onOpen: openLocationDetail,
        onShowMap: showLocationOnMap,
      });
    const allLocations = directoryLocations().sort((a, b) =>
      a.name.localeCompare(b.name, "fr"),
    );
    const index = Math.max(
      0,
      allLocations.findIndex((item) => item.id === worldSelectedLocationId),
    );
    const location = allLocations[index];
    if (!location) {
      worldSelectedLocationId = null;
      return renderWorld();
    }
    const initialActionMenu = initialWorldActionMenu;
    initialWorldActionMenu = null;
    detail({
      element: ui.worldContent,
      location,
      index,
      total: allLocations.length,
      initialActionMenu,
      onBack: () => {
        worldSelectedLocationId = null;
        worldMessage = "";
        switchView("map");
        selectLocation(location.id, { compact: true });
      },
      onPrevious: () => {
        if (index > 0) {
          worldSelectedLocationId = allLocations[index - 1].id;
          worldMessage = "";
          renderWorld();
        }
      },
      onNext: () => {
        if (index < allLocations.length - 1) {
          worldSelectedLocationId = allLocations[index + 1].id;
          worldMessage = "";
          renderWorld();
        }
      },
      onShowMap: () => showLocationOnMap(location.id),
      onAction: async (action) => {
        currentLocationId = location.id;
        await onAction(action, { returnToWorld: true });
      },
      onOpenGarrison: () => openGarrisonManager(location.id),
    });
  }
  return {
    select: selectLocation,
    openDetail: openLocationDetail,
    showOnMap: showLocationOnMap,
    openGarrison: openGarrisonManager,
    openMarket,
    refreshResources: refreshOpenResourceViews,
    renderWorld,
    get selectedId() {
      return currentLocationId;
    },
    set selectedId(value) {
      currentLocationId = value;
    },
    get garrisonId() {
      return activeGarrisonLocationId;
    },
    set garrisonId(value) {
      activeGarrisonLocationId = value;
    },
    set message(value) {
      worldMessage = value;
    },
    reset() {
      generation++;
      currentLocationId =
        activeGarrisonLocationId =
        worldSelectedLocationId =
        initialWorldActionMenu =
          null;
      worldMessage = "";
      Object.assign(worldFilters, {
        search: "",
        type: "",
        owner: "",
        sort: "distance",
      });
    },
  };
}
