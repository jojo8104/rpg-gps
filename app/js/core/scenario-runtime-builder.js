import { distanceMeters, validatePosition } from "./geo.js";
import { distanceForPace } from "./quest-pace-profile.js";
import { SetupPlacementService } from "./setup-placement-service.js";

const STRATEGIES = new Set(["fixed", "distance", "area-relative"]);

/** Matérialise les emplacements abstraits du scénario à partir du setup de partie. */
export class ScenarioRuntimeBuilder {
  build({ scenario, setup, bindings, locations }) {
    if (scenario === null) return null;
    const placementOverrides = setup.locationSetup.placements ?? {};
    const bindingBySlot = new Map(bindings.map((binding) => [binding.locationSlotId, binding]));
    const locationById = new Map(locations.map((location) => [location.id, location]));
    const placements = {};

    for (const slot of scenario.locationSlots) {
      const binding = bindingBySlot.get(slot.id) ?? null;
      const location = binding === null ? null : locationById.get(binding.locationId) ?? null;
      const config = { ...(slot.defaultPlacement ?? { strategy: "fixed" }), ...(placementOverrides[slot.id] ?? {}) };
      if (!STRATEGIES.has(config.strategy)) throw new RangeError(`Stratégie de placement inconnue pour ${slot.id}.`);
      if (binding === null || location === null) throw new RangeError(`Le lieu de scénario ${slot.id} doit être associé avant le démarrage.`);

      if (config.strategy === "fixed") {
        const position = config.position ?? location.position;
        validatePosition(position);
        if (!setup.playArea.contains(position)) throw new RangeError(`Le placement fixe ${slot.id} doit être situé dans la PlayArea.`);
        placements[slot.id] = { strategy: "fixed", status: "placed", locationId: location.id, position: { ...position } };
        continue;
      }

      if (config.strategy === "area-relative") {
        const originSlotId = requiredText(config.originLocationSlotId, "Le lieu d'origine du placement relatif");
        const originPlacement = placements[originSlotId];
        if (originPlacement?.status !== "placed") throw new RangeError(`Le lieu d'origine ${originSlotId} doit être placé avant ${slot.id}.`);
        const areaRatio = ratio(config.areaRadiusRatio ?? 0.25, "Le ratio de distance dans la PlayArea");
        const equivalentRadius = Math.sqrt(setup.playArea.getAreaSquareMeters() / Math.PI);
        const minimumDistance = nonNegative(config.minimumDistanceMeters ?? 0, "La distance minimale");
        const maximumDistance = positive(config.maximumDistanceMeters ?? Number.MAX_SAFE_INTEGER, "La distance maximale");
        if (maximumDistance < minimumDistance) throw new RangeError("La distance maximale doit être supérieure à la distance minimale.");
        const preferredDistance = Math.max(minimumDistance, Math.min(maximumDistance, equivalentRadius * areaRatio));
        const position = new SetupPlacementService().findPosition({
          playArea: setup.playArea,
          origin: originPlacement.position,
          preferredDistance,
          preferredDirectionDegrees: config.directionDegrees ?? 0,
        });
        placements[slot.id] = { strategy: "area-relative", status: "placed", locationId: location.id, position, originLocationSlotId: originSlotId, preferredDistanceMeters: preferredDistance, areaRadiusRatio: areaRatio };
        continue;
      }

      const minimumDistanceMeters = positive(distanceForPace(config.minimumDistanceMetersByPace, setup.rules?.travelPaceMode ?? "calm", config.minimumDistanceMeters ?? 300), "La distance de placement");
      const maximumAccuracyMeters = positive(config.maximumAccuracyMeters ?? 50, "La précision GPS maximale");
      const confirmations = positiveInteger(config.confirmations ?? 2, "Le nombre de confirmations");
      placements[slot.id] = {
        strategy: "distance", status: "waiting", locationId: location.id,
        minimumDistanceMeters, maximumAccuracyMeters, confirmations,
        activationPhaseId: config.activationPhaseId ?? null,
        origin: null, distanceMeters: 0, confirmationCount: 0, position: null,
      };
    }

    return { scenarioId: scenario.id, placements };
  }

  start(runtime, position, phaseId = null) {
    if (runtime === null) return [];
    validatePosition(position);
    const started = [];
    Object.entries(runtime.placements).forEach(([slotId, placement]) => {
      if (placement.strategy !== "distance" || placement.status !== "waiting") return;
      if (placement.activationPhaseId !== null && placement.activationPhaseId !== phaseId) return;
      placement.origin = { ...position };
      placement.status = "walking";
      started.push(slotId);
    });
    return started;
  }

  update(runtime, { position, accuracy = null }) {
    if (runtime === null) return [];
    validatePosition(position);
    const updates = [];
    Object.entries(runtime.placements).forEach(([slotId, placement]) => {
      if (placement.strategy !== "distance" || placement.status !== "walking") return;
      placement.distanceMeters = distanceMeters(placement.origin, position);
      const accurate = accuracy === null || (Number.isFinite(accuracy) && accuracy <= placement.maximumAccuracyMeters);
      const beyondThreshold = placement.distanceMeters >= placement.minimumDistanceMeters;
      placement.confirmationCount = accurate && beyondThreshold ? placement.confirmationCount + 1 : 0;
      if (placement.confirmationCount >= placement.confirmations) placement.status = "ready";
      updates.push({ slotId, status: placement.status, distanceMeters: placement.distanceMeters, minimumDistanceMeters: placement.minimumDistanceMeters });
    });
    return updates;
  }

  place(runtime, slotId, position) {
    if (runtime === null) return { success: false, reason: "scenario_unavailable" };
    validatePosition(position);
    const placement = runtime.placements[slotId];
    if (placement === undefined) return { success: false, reason: "placement_not_found" };
    if (placement.status === "placed") return { success: false, reason: "already_placed" };
    if (placement.status !== "ready") return { success: false, reason: "placement_not_ready" };
    placement.status = "placed";
    placement.position = { ...position };
    return { success: true, slotId, locationId: placement.locationId, position: { ...position } };
  }
}

function positive(value, label) { if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} doit être positive.`); return value; }
function nonNegative(value, label) { if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} doit être positive ou nulle.`); return value; }
function ratio(value, label) { if (!Number.isFinite(value) || value <= 0 || value > 1) throw new RangeError(`${label} doit être compris entre zéro et un.`); return value; }
function requiredText(value, label) { if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} doit être un texte non vide.`); return value.trim(); }
function positiveInteger(value, label) { if (!Number.isInteger(value) || value <= 0) throw new RangeError(`${label} doit être un entier positif.`); return value; }
