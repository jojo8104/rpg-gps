import { campDevelopmentState } from "../../app/js/core/camp-development-state.js";
import { CampImprovementService } from "../../app/js/core/camp-improvement-service.js";
import { LocationProgressionService } from "../../app/js/core/location-progression-service.js";
import { Location } from "../../app/js/core/location.js";
import { Hero } from "../../app/js/core/hero.js";
import { CampInstallationService } from "../../app/js/core/camp-installation-service.js";
import { ExceptionalExpeditionService } from "../../app/js/core/exceptional-expedition-service.js";
import { ExteriorSearchService } from "../../app/js/core/exterior-search-service.js";
import { createHmac, randomBytes } from "node:crypto";
import { LocationAccessPolicy } from "../../app/js/core/location-access-policy.js";
import { ExplorationClueService } from "../../app/js/core/exploration-clue-service.js";
import { ExplorationRumorService } from "../../app/js/core/exploration-rumor-service.js";

// Les anciennes sauvegardes sans graine n’ont pas de clé persistante. Leurs
// éventuels identifiants publics sont valables pour cette session serveur.
const legacyProjectionKey = randomBytes(32);

/** Les identifiants exposés ne permettent pas de décoder une cellule cible. */
export function explorationPublicId(state, playerId, kind, id) {
  const key = state?.explorationState?.generation?.seed ?? legacyProjectionKey;
  return `exploration-${kind}-${createHmac("sha256", key)
    .update(JSON.stringify([state?.setup?.id, playerId, kind, id]))
    .digest("hex")
    .slice(0, 32)}`;
}

/** Projection serveur à liste de champs autorisés ; aucune règle de découverte. */
export function createExplorationProjection(
  state,
  playerId,
  { now = Date.now(), visibleLocationIds = new Set() } = {},
) {
  const privateState = state?.explorationState;
  const knownPlayer = (state?.players ?? []).some(
    (entry) => entry.id === playerId,
  );
  const ownHeroes = new Set(
    (state?.heroes ?? [])
      .filter((hero) => hero.playerId === playerId)
      .map((hero) => hero.id),
  );
  const ownGroups = new Set(
    (state?.autonomousGroups ?? [])
      .filter(
        (group) =>
          group.owner?.kind === "player" && group.owner.id === playerId,
      )
      .map((group) => group.id),
  );
  const access = new LocationAccessPolicy({
    participants: state?.setup?.participants,
    rules: state?.setup?.rules,
  });
  access.teamFortQuests = state?.teamFortQuestState ?? [];
  const ownStocks = new Set(
    (state?.locations ?? [])
      .filter(
        (location) =>
          visibleLocationIds.has(location.id) &&
          access.can(playerId, location, "manageReserves"),
      )
      .map((location) => location.id),
  );
  const raw = (key) => privateState?.[key] ?? [];
  const clueOffers = [];
  const rumorOffers = [];
  if (privateState && knownPlayer) {
    const service = new ExplorationClueService({
      explorationState: privateState,
    });
    const rumors = new ExplorationRumorService({
      explorationState: privateState,
      locations: state.locations ?? [],
    });
    for (const hero of state.heroes ?? []) {
      if (!ownHeroes.has(hero.id) || hero.state !== "active") continue;
      for (const location of state.locations ?? []) {
        if (
          !visibleLocationIds.has(location.id) ||
          !location.heroIds?.includes(hero.id) ||
          location.state === "destroyed" ||
          access.getRelation(playerId, location) === "enemy"
        )
          continue;
        for (const source of ["tavern", "equipment", "chief"]) {
          const context = {
            hero,
            location,
            canManageReserves: access.can(playerId, location, "manageReserves"),
            canTavern: access.can(playerId, location, "visitTavern"),
            canTalkChief: access.can(playerId, location, "talkChief"),
            canTrade: access.can(playerId, location, "trade"),
          };
          const options = service.offers(context, source);
          const explanations = rumors.offers(context, source);
          if (explanations.length)
            rumorOffers.push({
              heroId: hero.id,
              locationId: location.id,
              source,
              options: explanations.map((option) => ({
                ...option,
                id: option.id.replace(
                  /^(rumor-action:(?:listen|explain):)(.+)$/,
                  (_match, prefix, id) =>
                    `${prefix}${explorationPublicId(state, playerId, "series", id)}`,
                ),
              })),
            });
          if (options.length)
            clueOffers.push({
              heroId: hero.id,
              locationId: location.id,
              source,
              options: options.map((option) => ({
                ...option,
                id: option.id.replace(
                  /^(clue-action:(?:take|sell):)(.+)$/,
                  (_match, prefix, id) =>
                    `${prefix}${explorationPublicId(state, playerId, "clue", id)}`,
                ),
              })),
            });
        }
      }
    }
  }
  const byId = (key) => new Map(raw(key).map((entry) => [entry.id, entry]));
  const cells = byId("cells"),
    sites = byId("sites"),
    clues = byId("clues"),
    series = byId("clueSeries");
  const searches = byId("searches"),
    expeditions = byId("expeditions");
  const publicId = (kind, id) => explorationPublicId(state, playerId, kind, id);
  const campDevelopments = [];
  if (privateState && knownPlayer) {
    const progression = new LocationProgressionService({
      mode: state.setup.rules.locationMode,
    });
    const camps = new CampImprovementService({
      progressionService: progression,
    });
    for (const rawLocation of state.locations ?? [])
      if (
        rawLocation.terrain &&
        visibleLocationIds.has(rawLocation.id) &&
        access.can(playerId, rawLocation, "build")
      ) {
        const location = new Location(rawLocation);
        for (const rawHero of state.heroes ?? [])
          if (ownHeroes.has(rawHero.id)) {
            const hero = location.heroIds.includes(rawHero.id)
              ? new Hero(rawHero)
              : null;
            campDevelopments.push({
              locationId: location.id,
              heroId: rawHero.id,
              development: campDevelopmentState(
                location,
                hero,
                camps,
                progression,
              ),
            });
          }
      }
  }
  const installationControls = [];
  if (privateState && knownPlayer) {
    const service = new CampInstallationService({ ...state, now: () => now });
    for (const hero of state.heroes ?? [])
      if (ownHeroes.has(hero.id)) {
        const controls = service.controls(hero.id);
        if (controls) installationControls.push(controls);
      }
  }
  const expeditionControls = [];
  if (privateState && knownPlayer) {
    const service = new ExceptionalExpeditionService({
      ...state,
      now: () => now,
    });
    for (const hero of state.heroes ?? [])
      if (ownHeroes.has(hero.id)) {
        const controls = service.controls(hero.id);
        if (controls)
          expeditionControls.push({
            ...controls,
            sites: controls.sites.map((site) => ({
              ...site,
              id: publicId("site", site.id),
            })),
          });
      }
  }
  const searchControls = [];
  if (privateState && knownPlayer) {
    const service = new ExteriorSearchService({ ...state, now: () => now });
    for (const hero of state.heroes ?? [])
      if (ownHeroes.has(hero.id)) {
        const controls = service.controls(hero.id);
        if (controls)
          searchControls.push({
            ...controls,
            activeSearchId: controls.activeSearchId
              ? publicId("search", controls.activeSearchId)
              : null,
            clues: controls.clues.map((clue) => ({
              ...clue,
              id: publicId("clue", clue.id),
            })),
          });
      }
  }

  const rumorPurchases = byId("rumorPurchases");
  const publicRumorPurchases = new Map(
    [...rumorPurchases]
      .filter(
        ([, entry]) =>
          knownPlayer && entry.playerId === playerId && entry.at <= now,
      )
      .map(([id, entry]) => [
        id,
        {
          id: publicId("rumor-purchase", id),
          text: entry.text,
          outcome: entry.outcome,
          at: entry.at,
        },
      ]),
  );
  const rumorKnowledge = byId("rumorKnowledge");
  const publicRumors = new Map(
    [...rumorKnowledge]
      .filter(([, entry]) => knownPlayer && entry.playerId === playerId)
      .map(([id, entry]) => [
        id,
        {
          id: publicId("rumor", id),
          text: entry.text,
          learnedAt: entry.learnedAt,
          source: entry.source,
          ...(visibleLocationIds.has(entry.locationId)
            ? { locationId: entry.locationId }
            : {}),
        },
      ]),
  );
  const announcements = byId("announcements");
  const futureAnnouncementMessages = new Set(
    [...announcements.values()]
      .filter((entry) => entry.dueAt > now)
      .map((entry) => entry.message),
  );
  const publicAnnouncements = new Map(
    [...announcements]
      .filter(([, entry]) => knownPlayer && entry.dueAt <= now)
      .map(([id, entry]) => [
        id,
        {
          id: publicId("announcement", id),
          name: entry.name,
          message: entry.message,
          at: entry.dueAt,
        },
      ]),
  );
  const knownCells = new Set(),
    knownSites = new Set();
  if (knownPlayer)
    for (const entry of raw("discoveries")) {
      if (entry.playerId !== playerId) continue;
      (entry.targetKind === "cell" ? knownCells : knownSites).add(
        entry.targetId,
      );
    }
  const discoveryGrid =
    privateState && knownPlayer
      ? new ExteriorSearchService({ ...state, now: () => now }).grid()
      : null;
  const cellPositions = new Map(
    (discoveryGrid?.cells ?? []).map((cell) => [cell.id, cell.center]),
  );
  const publicCells = new Map(
    [...cells]
      .filter(([id]) => knownCells.has(id))
      .map(([id, cell]) => [
        id,
        {
          id,
          ...(cellPositions.has(id)
            ? { position: structuredClone(cellPositions.get(id)) }
            : {}),
          row: cell.row,
          column: cell.column,
          resource: cell.suppressedByLocationIds?.length
            ? "none"
            : cell.resource,
          ...(cell.campLocationId && visibleLocationIds.has(cell.campLocationId)
            ? { campLocationId: cell.campLocationId }
            : {}),
        },
      ]),
  );
  const publicSites = new Map();
  for (const site of sites.values()) {
    if (
      !knownSites.has(site.id) ||
      (site.hostLocationId && !visibleLocationIds.has(site.hostLocationId))
    )
      continue;
    publicSites.set(site.id, {
      id: publicId("site", site.id),
      type: site.type,
      status: site.status,
      ...(site.hostLocationId
        ? { hostLocationId: site.hostLocationId }
        : { position: structuredClone(site.position) }),
    });
  }
  const holds = (clue) => {
    if (
      !knownPlayer ||
      !["active", "obsolete"].includes(clue.status) ||
      !clue.holder
    )
      return false;
    const { kind, id } = clue.holder;
    return (
      (kind === "player" && id === playerId) ||
      (kind === "hero" && ownHeroes.has(id)) ||
      (kind === "group" && ownGroups.has(id)) ||
      (kind === "location" && ownStocks.has(id))
    );
  };
  const publicClues = new Map();
  for (const clue of clues.values()) {
    if (!holds(clue)) continue;
    const item = {
      id: publicId("clue", clue.id),
      kind: clue.kind,
      status: clue.status,
      medium: clue.medium,
      ...(sites.get(clue.siteId)?.name
        ? { siteName: sites.get(clue.siteId).name }
        : {}),
    };
    if (clue.kind === "localization") {
      const source = series.get(clue.seriesId);
      const index =
        source?.fragments.findIndex(
          (fragment) => fragment.id === clue.fragmentId,
        ) ?? -1;
      if (index < 0) continue;
      Object.assign(item, {
        text: source.fragments[index].text,
        seriesId: publicId("series", source.id),
        fragmentIndex: index + 1,
        fragmentCount: source.fragments.length,
      });
    } else item.text = clue.text;
    publicClues.set(clue.id, item);
  }
  const preparation = (source) => ({
    clueIds: (source?.clueIds ?? [])
      .filter((id) => publicClues.has(id))
      .map((id) => publicClues.get(id).id),
    npcIds: [...(source?.npcIds ?? [])],
    volunteers: (source?.volunteers ?? []).map(({ unitId, quantity }) => ({
      unitId,
      quantity,
    })),
    mounts: { ...source?.mounts },
    equipment: { ...source?.equipment },
    resources: { ...source?.resources },
  });
  const publicSearches = new Map();
  for (const search of searches.values()) {
    if (
      !knownPlayer ||
      search.playerId !== playerId ||
      !ownHeroes.has(search.heroId)
    )
      continue;
    const resolved =
      search.status === "resolved" &&
      Number.isFinite(search.result?.at) &&
      search.result.at <= now;
    publicSearches.set(search.id, {
      id: publicId("search", search.id),
      heroId: search.heroId,
      position: structuredClone(search.position),
      status:
        search.status === "resolved" && !resolved ? "preparing" : search.status,
      startedAt: search.startedAt,
      cooldownUntil: search.cooldownUntil,
      discretionPenaltyUntil: search.discretionPenaltyUntil,
      preparation: preparation(search.preparation),
      gauge: search.gauge
        ? {
            clues: search.gauge.clues,
            specialists: search.gauge.specialists,
            resources: search.gauge.resources,
            total: search.gauge.total,
            chance: search.gauge.chance,
          }
        : null,
      ...(resolved
        ? {
            result: {
              ...publicResult(search.result),
              ...(search.result.message
                ? { message: search.result.message }
                : {}),
            },
          }
        : {}),
    });
  }
  const publicExpeditions = new Map();
  for (const mission of expeditions.values()) {
    if (
      !knownPlayer ||
      mission.playerId !== playerId ||
      !(mission.heroId
        ? ownHeroes.has(mission.heroId)
        : ownGroups.has(mission.groupId) ||
          ownHeroes.has(mission.engagement?.preparerHeroId))
    )
      continue;
    const completed =
      mission.status === "completed" &&
      Number.isFinite(mission.completedAt) &&
      mission.completedAt <= now &&
      (!Number.isFinite(mission.result?.at) || mission.result.at <= now);
    const site = publicSites.get(mission.siteId);
    publicExpeditions.set(mission.id, {
      id: publicId("expedition", mission.id),
      kind: mission.kind,
      heroId: mission.heroId,
      groupId: mission.groupId,
      status:
        mission.status === "completed" && !completed
          ? "returning"
          : mission.status,
      createdAt: mission.createdAt,
      departedAt: mission.departedAt,
      resolvesAt: mission.resolvesAt,
      ...(visibleLocationIds.has(mission.originLocationId)
        ? { originLocationId: mission.originLocationId }
        : {}),
      ...(site ? { siteId: site.id } : {}),
      ...(knownCells.has(mission.cellId) ? { cellId: mission.cellId } : {}),
      preparation: preparation(mission.preparation),
      preparerHeroId: mission.engagement?.preparerHeroId ?? mission.heroId,
      breakdown: mission.engagement?.breakdown ?? null,
      chance: mission.engagement?.chance ?? null,
      scores: {
        expedition: mission.scores.expedition,
        power: mission.scores.power,
        narrative: mission.scores.narrative,
      },
      ...(completed
        ? {
            completedAt: mission.completedAt,
            result: publicResult(mission.result),
          }
        : {}),
    });
  }
  const view = {
    campDevelopments,
    installationControls,
    expeditionControls,
    searchControls,
    rumorOffers,
    rumors: [...publicRumors.values()],
    rumorPurchases: [...publicRumorPurchases.values()],
    announcements: [...publicAnnouncements.values()],
    clueOffers,
    version: 1,
    playerId,
    grid: knownPlayer ? structuredClone(privateState?.grid ?? null) : null,
    cells: [...publicCells.values()],
    sites: [...publicSites.values()],
    clues: [...publicClues.values()],
    searches: [...publicSearches.values()],
    expeditions: [...publicExpeditions.values()],
  };
  const publicRecords = [
    [rumorPurchases, publicRumorPurchases],
    [rumorKnowledge, publicRumors],
    [announcements, publicAnnouncements],
    [cells, publicCells],
    [sites, publicSites],
    [clues, publicClues],
    [searches, publicSearches],
    [expeditions, publicExpeditions],
  ];
  const cellsByCoordinates = new Map(
    [...cells.values()].map((cell) => [`${cell.row}:${cell.column}`, cell]),
  );
  const sitesByCell = new Map(
    [...sites.values()].map((site) => [site.cellId, site]),
  );
  const fragmentKey = (fragment) =>
    JSON.stringify([fragment.id, fragment.text]);
  const privateFragments = new Set(
    [...series.values()].flatMap((entry) => entry.fragments.map(fragmentKey)),
  );
  const readableFragments = new Map();
  const privateTexts = new Set([
    ...[...rumorPurchases.values()].map((entry) => entry.text),
    ...[...rumorKnowledge.values()].map((entry) => entry.text),
    ...[...series.values()].flatMap((entry) =>
      entry.fragments.map((fragment) => fragment.text),
    ),
    ...[...clues.values()]
      .filter((clue) => clue.kind === "search")
      .map((clue) => clue.text),
  ]);
  const readableTexts = new Set(
    [
      ...publicClues.values(),
      ...publicRumors.values(),
      ...publicRumorPurchases.values(),
    ].map((clue) => clue.text),
  );
  for (const [id, clue] of publicClues) {
    if (clue.kind !== "localization") continue;
    const original = clues.get(id);
    const fragment = series.get(original.seriesId).fragments[
      clue.fragmentIndex - 1
    ];
    readableFragments.set(fragmentKey(fragment), clue);
  }
  const outcomeSignatures = new Map();
  for (const outcome of [
    ...raw("sites").flatMap((entry) => [entry.rewards, entry.resolution]),
    ...raw("searches").map((entry) => entry.result),
    ...raw("expeditions").map((entry) => entry.result),
  ].filter(Boolean)) {
    // Ne pas confondre un simple {success: true} ou un objet vide d’un autre
    // système avec une issue privée : seules les issues identifiables comptent.
    if (
      !Number.isFinite(outcome.at) &&
      typeof outcome.eventId !== "string" &&
      !Object.hasOwn(outcome, "roll") &&
      !Object.hasOwn(outcome, "randomRoll")
    )
      continue;
    const shape = Object.keys(outcome).sort().join("|");
    if (!outcomeSignatures.has(shape)) outcomeSignatures.set(shape, new Set());
    outcomeSignatures.get(shape).add(stableJson(outcome));
  }
  const privateGroups = new Map(
    raw("expeditions")
      .filter((entry) => entry.groupId)
      .map((entry) => [entry.groupId, entry]),
  );
  const legacyZones = new Map(
    (state?.resourceZones ?? []).map((zone) => [zone.id, zone]),
  );
  const zoneView = (id) => {
    const zone = legacyZones.get(id);
    if (!knownPlayer || !zone?.discoveredByPlayerIds?.includes(playerId))
      return undefined;
    return {
      id: zone.id,
      resourceId: zone.resourceId,
      locationType: zone.locationType,
      position: structuredClone(zone.position),
      discoveryRadius: zone.discoveryRadius,
      productionRate: zone.productionRate,
      discoveredByPlayerIds: [playerId],
      locationId: visibleLocationIds.has(zone.locationId)
        ? zone.locationId
        : null,
    };
  };

  function sanitize(value) {
    if (
      futureAnnouncementMessages.has(
        typeof value === "string" ? value : value?.message,
      )
    )
      return undefined;
    if (value && (value === privateState || value === privateState?.generation))
      return undefined;
    if (typeof value === "string") {
      const rumorAction = /^rumor-action:(listen|explain):(.+)$/.exec(value);
      if (rumorAction)
        return `rumor-action:${rumorAction[1]}:${publicId("series", rumorAction[2])}`;
      const clueAction = /^clue-action:(take|sell):(.+)$/.exec(value);
      if (clueAction)
        return `clue-action:${clueAction[1]}:${publicId("clue", clueAction[2])}`;
      if (value === privateState?.generation?.seed) return undefined;
      if (privateTexts.has(value) && !readableTexts.has(value))
        return undefined;
      for (const [source, allowed] of publicRecords)
        if (source.has(value)) return allowed.get(value)?.id;
      if (series.has(value))
        return [...publicClues.values()].some(
          (clue) => clue.seriesId === publicId("series", value),
        )
          ? publicId("series", value)
          : undefined;
      if (legacyZones.has(value)) return zoneView(value)?.id;
    }
    if (!value || typeof value !== "object") return value;
    if (value.specialistId && value.cellId && value.roll !== undefined)
      return undefined;
    if (
      (value.kind === "grid" && Array.isArray(value.steps)) ||
      (value.kind === "location" && value.designation)
    )
      return undefined;
    if (Array.isArray(value))
      return value.flatMap((entry) => {
        const projected = sanitize(entry);
        return projected === undefined ? [] : [projected];
      });
    if (
      Array.isArray(value.cells) &&
      Array.isArray(value.sites) &&
      Array.isArray(value.clues)
    )
      return undefined;
    if (
      value.algorithm === "exploration-v1" ||
      (value.seed && value.seed === privateState?.generation?.seed)
    )
      return undefined;
    if (privateGroups.has(value.id)) {
      const mission = privateGroups.get(value.id);
      const allowed = publicExpeditions.get(mission.id);
      const {
        mission: _mission,
        movement,
        cargo,
        history,
        message,
        ...body
      } = value;
      const { id, ...publicBody } = body;
      return {
        id,
        ...sanitize(publicBody),
        mission: allowed
          ? {
              kind: allowed.kind,
              expeditionId: allowed.id,
              status: allowed.status,
            }
          : null,
        movement: null,
        cargo: [],
        history: [],
        message: null,
      };
    }
    for (const [source, allowed] of publicRecords)
      if (source.has(value.id)) return structuredClone(allowed.get(value.id));
    if (legacyZones.has(value.id)) return zoneView(value.id);
    if (series.has(value.id)) {
      const owned = [...publicClues.values()].filter(
        (clue) => clue.seriesId === publicId("series", value.id),
      );
      return owned.length
        ? {
            id: publicId("series", value.id),
            fragments: structuredClone(owned),
          }
        : undefined;
    }
    if (
      Number.isInteger(value.row) &&
      Number.isInteger(value.column) &&
      typeof value.resource === "string"
    ) {
      const cell = cellsByCoordinates.get(`${value.row}:${value.column}`);
      return structuredClone(publicCells.get(cell?.id));
    }
    if (
      ["artifact", "treasure", "dungeon"].includes(value.type) &&
      value.cellId
    ) {
      const site = sitesByCell.get(value.cellId);
      return structuredClone(publicSites.get(site?.id));
    }
    if (privateFragments.has(fragmentKey(value)))
      return structuredClone(readableFragments.get(fragmentKey(value)));
    if (clues.has(value.itemId)) {
      const clue = publicClues.get(value.itemId);
      if (!clue && value.allocations?.[playerId] > 0)
        return {
          id: publicId("clue", value.itemId),
          itemId: publicId("clue", value.itemId),
          quantity: value.quantity,
          portable: value.portable,
          valuePerUnit: 5,
          allocations: { [playerId]: value.allocations[playerId] },
        };
      return clue
        ? {
            id: clue.id,
            itemId: clue.id,
            quantity: value.quantity,
            valuePerUnit: value.valuePerUnit ?? 5,
            occupiedSlots: value.occupiedSlots,
          }
        : undefined;
    }
    // Une issue recopiée sans son enveloppe de mission n’est pas un résultat public.
    const candidates = outcomeSignatures.get(
      Object.keys(value).sort().join("|"),
    );
    if (candidates?.has(stableJson(value))) return undefined;
    // Aucun événement d’exploration brut ne constitue un contrat public. Les
    // états de recherche/mission ci-dessus publient leurs seuls résultats mûrs.
    if (
      /^(?:exploration_|exceptional_|clue_|treasure_|artifact_|dungeon_)/.test(
        value.type ?? "",
      )
    )
      return undefined;
    if (value.type === "resource_zone_discovered") {
      const zone = zoneView(value.zoneId);
      return zone
        ? {
            type: value.type,
            at: value.at,
            playerId,
            zoneId: zone.id,
            locationId: zone.locationId,
          }
        : undefined;
    }
    if (value.targetKind && value.targetId && value.playerId !== playerId)
      return undefined;
    // Une copie partielle peut perdre son id mais garder un lien vers une cible.
    for (const key of [
      "siteId",
      "targetSiteId",
      "zoneId",
      "targetId",
      "clueId",
      "seriesId",
    ])
      for (const [source, allowed] of publicRecords)
        if (source.has(value[key]))
          return structuredClone(allowed.get(value[key]));
    if (
      series.has(value.seriesId) ||
      (value.targetSiteId && sites.has(value.targetSiteId))
    )
      return undefined;
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, child]) => {
        if (key === "terrain" && child) {
          const permitted =
            value.ownerId === playerId ||
            value.controllerId === playerId ||
            knownCells.has(child.cellId);
          return permitted
            ? [[key, { cellId: child.cellId, resource: child.resource }]]
            : [];
        }
        if (clues.has(key)) {
          const clue = publicClues.get(key);
          return clue && Number.isFinite(child) ? [[clue.id, child]] : [];
        }
        if (
          publicRecords.some(([source]) => source.has(key)) ||
          series.has(key)
        )
          return [];
        if (
          [
            "explorationState",
            "discoveryAttempts",
            "explorationSeed",
            "explorationGeneration",
            "explorationResult",
            "randomRoll",
            "actualChance",
            "roll",
            "randomSeed",
            "randomState",
            "rngState",
            "authentic",
            "processedEventIds",
            "rewardsApplied",
          ].includes(key)
        )
          return [];
        if (key === "explorationView") return [[key, structuredClone(view)]];
        if (key === "resourceZones")
          return [
            [
              key,
              (child ?? []).flatMap((zone) => {
                const item = zoneView(zone.id);
                return item ? [item] : [];
              }),
            ],
          ];
        const projected = sanitize(child);
        return projected === undefined ? [] : [[key, projected]];
      }),
    );
  }
  return { view, sanitize };
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

function publicResult(source) {
  const result = {};
  if (typeof source?.success === "boolean") result.success = source.success;
  for (const key of [
    "gold",
    "experience",
    "heroDamage",
    "moraleDelta",
    "cargoPending",
  ])
    if (Number.isFinite(source?.[key])) result[key] = source[key];
  if (typeof source?.message === "string") result.message = source.message;
  if (typeof source?.reason === "string") result.reason = source.reason;
  if (Array.isArray(source?.pendingItems))
    result.pendingItems = source.pendingItems
      .filter(
        (i) =>
          typeof i.itemId === "string" &&
          Number.isSafeInteger(i.quantity) &&
          i.quantity >= 0,
      )
      .map(({ itemId, quantity }) => ({ itemId, quantity }));
  if (Array.isArray(source?.troopDamage))
    result.troopDamage = source.troopDamage.map(
      ({ unitId, damage, participants, remaining }) => ({
        unitId,
        damage,
        participants,
        remaining,
      }),
    );
  if (Array.isArray(source?.items))
    result.items = source.items
      .filter(
        (item) =>
          typeof item.itemId === "string" &&
          Number.isFinite(item.quantity) &&
          item.quantity > 0,
      )
      .map(({ itemId, quantity }) => ({ itemId, quantity }));
  return result;
}
