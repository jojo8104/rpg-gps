import { PlayArea } from "./play-area.js";
import { validatePosition } from "./geo.js";
import { LocationSpacingPolicy } from "./location-spacing-policy.js";
import { selectedPreparationLocationIds } from "./preparation-location-selection.js";

export const ORGANIZER_ROLES = [
  "advanced-player",
  "absent",
  "game-master",
  "supreme-npc",
];

/** Règles de préparation exécutées par le serveur, indépendantes du DOM. */
export function updatePartyPreparation(
  current,
  change,
  catalog,
  playArea,
  createQrId,
) {
  if (!change || typeof change !== "object" || Array.isArray(change))
    throw new TypeError("Configuration détaillée invalide.");
  const next = structuredClone(
    current ?? {
      enabled: true,
      organizerRole: "advanced-player",
      date: "",
      excludedQuestIds: [],
      locations: {},
    },
  );
  next.enabled = true;
  if (change.organizerRole !== undefined) {
    if (!ORGANIZER_ROLES.includes(change.organizerRole))
      throw new RangeError("Rôle organisateur inconnu.");
    next.organizerRole = change.organizerRole;
  }
  if (change.character !== undefined) {
    if (typeof change.character !== "string" || change.character.length > 200)
      throw new RangeError(
        "Le personnage doit contenir au plus 200 caractères.",
      );
    next.character = change.character.trim();
  }
  if (change.date !== undefined) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(change.date) ||
      new Date(`${change.date}T12:00:00Z`).toISOString().slice(0, 10) !==
        change.date
    )
      throw new RangeError("Date de partie invalide.");
    next.date = change.date;
  }
  if (change.excludedQuestIds !== undefined) {
    if (!Array.isArray(change.excludedQuestIds))
      throw new TypeError("Sélection de quêtes invalide.");
    const excluded = new Set(change.excludedQuestIds);
    for (const id of excluded) {
      const quest = catalog.quests.find((q) => q.id === id);
      if (!quest || quest.linear)
        throw new RangeError("Une quête linéaire ne peut pas être retirée.");
    }
    if (
      catalog.quests.some(
        (q) => !excluded.has(q.id) && q.requires.some((id) => excluded.has(id)),
      )
    )
      throw new RangeError(
        "Une quête sélectionnée dépend d’une quête retirée.",
      );
    next.excludedQuestIds = [...excluded];
  }
  const retained = selectedPreparationLocationIds(next, catalog);
  next.locations = Object.fromEntries(
    Object.entries(next.locations).filter(([id]) => retained.has(id)),
  );
  if (change.location !== undefined) {
    const { id, placement, visibility, position, walkingDistanceMeters } =
      change.location;
    const definition = catalog.locations.find((l) => l.id === id);
    if (!definition) throw new RangeError("Lieu inconnu.");
    if (!selectedPreparationLocationIds(next, catalog).has(id))
      throw new RangeError("Ce lieu appartient à une quête retirée.");
    const entry = {
      placement: "scenario",
      visibility: definition.defaultVisibility,
      ...next.locations[id],
    };
    if (placement !== undefined) {
      if (!definition.placementOptions.includes(placement))
        throw new RangeError("Placement non autorisé pour ce lieu.");
      if (placement !== entry.placement) delete entry.position;
      entry.placement = placement;
    }
    if (entry.placement === "player-walk") {
      const distance =
        walkingDistanceMeters ?? entry.walkingDistanceMeters ?? 300;
      if (!Number.isFinite(distance) || distance < 10 || distance > 10000)
        throw new RangeError(
          "La distance de marche doit être comprise entre 10 et 10 000 m.",
        );
      entry.walkingDistanceMeters = distance;
    } else {
      if (walkingDistanceMeters !== undefined)
        throw new RangeError(
          "La distance concerne uniquement le placement par les joueurs.",
        );
      delete entry.walkingDistanceMeters;
    }
    if (visibility !== undefined) {
      if (!definition.visibilityOptions.includes(visibility))
        throw new RangeError("Visibilité non autorisée pour ce lieu.");
      entry.visibility = visibility;
    }
    if (entry.placement === "qr") entry.qrId ??= createQrId();
    else delete entry.qrId;
    if (position !== undefined) {
      if (!["map", "qr"].includes(entry.placement))
        throw new RangeError(
          "Ce placement ne reçoit pas de position manuelle.",
        );
      validatePosition(position);
      const area = new PlayArea(playArea);
      if (!area.allowsPlacement(position))
        throw new RangeError(
          "Placez le lieu dans la playarea, hors des exclusions.",
        );
      const spacing = new LocationSpacingPolicy({
        setup: { playArea: area, locationSetup: {} },
      });
      const others = Object.entries(next.locations)
        .filter(([key, value]) => key !== id && value.position)
        .map(([key, value]) => ({
          ...catalog.locations.find((l) => l.id === key),
          position: value.position,
        }));
      if (!spacing.check(definition, position, others).success)
        throw new RangeError(
          "Ce lieu est trop proche d’un autre lieu installé.",
        );
      entry.position = {
        latitude: position.latitude,
        longitude: position.longitude,
      };
    }
    next.locations[id] = entry;
  }
  return next;
}

export function preparationStepProblems(preparation, catalog, playArea) {
  const stages = {
    terrain: [],
    scenario: [],
    locations: [],
    print: [],
    install: [],
  };
  if (!preparation?.enabled) return stages;
  const retained = selectedPreparationLocationIds(preparation, catalog);
  if (!playArea) stages.terrain.push("Valider la playarea.");
  if (preparation.organizerRole === "supreme-npc" && !preparation.character)
    stages.scenario.push("Nommer le personnage du PNJ suprême.");
  for (const [id, entry] of Object.entries(preparation.locations ?? {})) {
    if (!retained.has(id)) continue;
    if (entry.placement === "qr" && !preparation.date && !stages.print.length)
      stages.print.push("Choisir la date de la partie.");
    if (
      ["map", "qr"].includes(entry.placement) &&
      (!entry.position ||
        !playArea ||
        !new PlayArea(playArea).allowsPlacement(entry.position))
    )
      stages[entry.placement === "qr" ? "install" : "locations"].push(
        `Installer ${catalog.locations.find((l) => l.id === id)?.name ?? id}.`,
      );
  }
  return stages;
}

export function preparationProblems(preparation, catalog, playArea) {
  return Object.values(
    preparationStepProblems(preparation, catalog, playArea),
  ).flat();
}

export function applyPartyPreparation(game, preparation) {
  if (!preparation?.enabled) return;
  for (const [slotId, entry] of Object.entries(preparation.locations)) {
    const binding = game.scenarioLocationBindings.find(
      (b) => b.locationSlotId === slotId,
    );
    const location = game.getLocation(binding?.locationId ?? slotId);
    if (!location)
      throw new RangeError(`Lieu préparé absent du moteur : ${slotId}.`);
    if (entry.position) location.position = { ...entry.position };
    if (entry.placement === "qr")
      location.qr = { enabled: true, required: false, id: entry.qrId };
    const slot = game.scenario?.locationSlots.find((s) => s.id === slotId);
    const placement = game.scenarioRuntime?.placements[slotId];
    if (slot?.world)
      slot.world.visibility =
        entry.visibility === "activation" ? "known" : entry.visibility;
    if (placement) {
      if (entry.position)
        Object.assign(placement, {
          position: { ...entry.position },
          status: "placed",
          strategy: "fixed",
        });
      if (placement.world)
        placement.world.visibility =
          entry.visibility === "activation" ? "known" : entry.visibility;
    }
    if (entry.visibility === "discoverable" || entry.visibility === "quest")
      for (const player of game.players) {
        delete player.locationKnowledge[location.id];
        player.discoveredLocationIds = player.discoveredLocationIds.filter(
          (id) => id !== location.id,
        );
      }
  }
}
