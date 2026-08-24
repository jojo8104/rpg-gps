import { AutonomousGroup } from "./autonomous-group.js";
import { SetupPlacementService } from "./setup-placement-service.js";

/** Applique les effets déclaratifs d'événements sans dépendre de l'interface. */
export class ScenarioEffectResolver {
  apply(event, game) {
    return event.effects.map((effect) => this.#applyEffect(effect, game));
  }

  #applyEffect(effect, game) {
    switch (effect.type) {
      case "showNarration": {
        const text = ScenarioEffectResolver.#requireText(effect.text, "Le texte de narration");
        const entry = { type: "narration", text, eventId: game.activeScenarioEventId };
        game.eventLog.push(entry);
        return entry;
      }
      case "revealLocation": {
        const location = game.getLocationForScenarioSlot(effect.locationSlotId);
        location.visibility = "discovered";
        const entry = { type: "location_revealed", locationId: location.id, eventId: game.activeScenarioEventId };
        game.eventLog.push(entry);
        return entry;
      }
      case "setLocationState": {
        const location = game.getLocationForScenarioSlot(effect.locationSlotId);
        location.state = ScenarioEffectResolver.#requireText(effect.state, "L'état du lieu");
        const entry = { type: "location_state_changed", locationId: location.id, state: location.state, eventId: game.activeScenarioEventId };
        game.eventLog.push(entry);
        return entry;
      }
      case "awardHeroExperience": {
        const hero = ScenarioEffectResolver.#heroFor(effect, game);
        const amount = ScenarioEffectResolver.#positiveInteger(effect.amount, "La récompense d'expérience");
        game.gainHeroExperience({ heroId: hero.id, amount, source: `quest:${game.activeScenarioEventId}` });
        const entry = { type: "hero_experience_awarded", heroId: hero.id, amount, eventId: game.activeScenarioEventId };
        game.eventLog.push(entry); return entry;
      }
      case "grantCarriedItem": {
        const hero = ScenarioEffectResolver.#heroFor(effect, game); const itemId = ScenarioEffectResolver.#requireText(effect.itemId, "L'objet de quête");
        if (!hero.carriedLoot.some((entry) => entry.itemId === itemId)) hero.addCarriedLoot([{ id: `${itemId}-${game.activeScenarioEventId}`, itemId, quantity: 1, valuePerUnit: 1 }]);
        const entry = { type: "quest_item_granted", heroId: hero.id, itemId, eventId: game.activeScenarioEventId };
        game.eventLog.push(entry); return entry;
      }
      case "removeCarriedItem": {
        const hero = ScenarioEffectResolver.#heroFor(effect, game); const itemId = ScenarioEffectResolver.#requireText(effect.itemId, "L'objet de quête");
        const index = hero.carriedLoot.findIndex((entry) => entry.itemId === itemId); if (index >= 0) hero.carriedLoot.splice(index, 1);
        const entry = { type: "quest_item_removed", heroId: hero.id, itemId, eventId: game.activeScenarioEventId };
        game.eventLog.push(entry); return entry;
      }
      case "grantHeroResource": {
        const hero = ScenarioEffectResolver.#heroFor(effect, game); const resource = ScenarioEffectResolver.#requireText(effect.resource, "La ressource"); const amount = ScenarioEffectResolver.#positiveInteger(effect.amount, "La récompense");
        hero.addResource(resource, amount); const entry = { type: "hero_resource_granted", heroId: hero.id, resource, amount, eventId: game.activeScenarioEventId };
        game.eventLog.push(entry); return entry;
      }
      case "startEvacuation": {
        const source = game.getLocationForScenarioSlot(effect.sourceLocationSlotId); const hero = ScenarioEffectResolver.#heroFor(effect, game); const durationMs = ScenarioEffectResolver.#positiveInteger(effect.durationMinutes, "La durée d'évacuation") * 60_000;
        const id = ScenarioEffectResolver.#requireText(effect.evacuationId, "L'évacuation"); const startedAt = game.now();
        game.evacuationStates[id] = { id, sourceLocationId: source.id, startedAt, expiresAt: startedAt + durationMs, initialPopulation: source.population ?? 0, initialResources: structuredClone(source.resources.stock), initialHeroResources: structuredClone(hero.resources), initialStructures: Object.values(source.infrastructure).reduce((sum, level) => sum + level, 0), departedAt: null };
        const entry = { type: "evacuation_started", evacuationId: id, sourceLocationId: source.id, expiresAt: startedAt + durationMs, eventId: game.activeScenarioEventId }; game.eventLog.push(entry); return entry;
      }
      case "spawnAttackGroup": {
        const target = game.getLocationForScenarioSlot(effect.targetLocationSlotId); const distance = Number(effect.originDistanceMeters ?? 100);
        const origin = new SetupPlacementService().findPosition({ playArea: game.setup.playArea, origin: target.position, preferredDistance: distance, preferredDirectionDegrees: Number(effect.directionDegrees ?? 180), occupied: game.locations.map((location) => location.position), minimumSpacing: Math.min(30, distance / 3) });
        const group = new AutonomousGroup({ id: ScenarioEffectResolver.#requireText(effect.groupId, "Le groupe autonome"), type: "army", owner: { kind: "faction", id: effect.factionId ?? "chaos" }, factionId: effect.factionId ?? "chaos", position: origin, behavior: "aggressive", mission: { kind: "attack_location", targetId: target.id, speedMetersPerSecond: Number(effect.speedMetersPerSecond ?? .15) }, army: { units: [{ id: `${effect.groupId}-unit`, ownerPlayerId: effect.factionId ?? "chaos", typeId: effect.unitTypeId ?? "militia", quantity: Number(effect.quantity ?? 5), rank: "soldier" }] } });
        game.addAutonomousGroup(group); const entry = { type: "attack_group_spawned", groupId: group.id, targetLocationId: target.id, origin, eventId: game.activeScenarioEventId }; game.eventLog.push(entry); return entry;
      }
      case "assignWagons": {
        const hero = ScenarioEffectResolver.#heroFor(effect, game); const result = game.assignWagons({ playerId: hero.playerId, heroId: hero.id, wagons: effect.wagons });
        return { type: "wagons_assigned", heroId: hero.id, success: result.success, addedSlots: result.success ? result.slotCapacity - hero.baseBagSlotCount : 0, eventId: game.activeScenarioEventId };
      }
      case "completeEvacuation": {
        const hero = ScenarioEffectResolver.#heroFor(effect, game); const destination = game.getLocationForScenarioSlot(effect.destinationLocationSlotId); const state = game.evacuationStates[effect.evacuationId];
        if (!state) throw new RangeError("L'évacuation n'existe pas.");
        const packages = hero.carriedLoot.filter((item) => item.itemId === "population" && item.metadata?.originLocationId === state.sourceLocationId); const people = packages.reduce((sum, item) => sum + item.quantity, 0);
        hero.carriedLoot = hero.carriedLoot.filter((item) => !packages.includes(item)); if (people > 0) destination.addPopulation(people);
        const unloadedResources = {}; Object.entries(hero.resources).forEach(([resource, amount]) => { const evacuated = Math.max(0, Math.floor(amount - (state.initialHeroResources?.[resource] ?? 0))); if (evacuated <= 0) return; const deposited = destination.depositResource(resource, evacuated); if (deposited > 0) { hero.spendResource(resource, deposited); unloadedResources[resource] = deposited; } });
        const initialResourceTotal = Object.entries(state.initialResources).filter(([id]) => id !== "population").reduce((sum, [, amount]) => sum + amount, 0); const remainingResourceTotal = Object.entries(state.resourcesRemaining ?? {}).filter(([id]) => id !== "population").reduce((sum, [, amount]) => sum + amount, 0);
        const structuresSaved = Math.max(0, state.initialStructures - (state.structuresRemaining ?? state.initialStructures)); const onTime = game.now() <= state.expiresAt ? 1 : 0;
        const result = game.resultEvaluationService.evaluate({ metrics: [{ id: "population", value: people, target: Math.max(1, state.initialPopulation), weight: 4 }, { id: "resources", value: Math.max(0, initialResourceTotal - remainingResourceTotal), target: Math.max(1, initialResourceTotal), weight: 2 }, { id: "structures", value: structuresSaved, target: Math.max(1, state.initialStructures), weight: 2 }, { id: "deadline", value: onTime, target: 1, weight: 2 }] });
        state.completedAt = game.now(); state.result = result; state.peopleDelivered = people;
        const entry = { type: "evacuation_completed", evacuationId: state.id, destinationLocationId: destination.id, people, unloadedResources, result, eventId: game.activeScenarioEventId }; game.eventLog.push(entry); return entry;
      }
      default:
        throw new RangeError(`Le type d'effet "${effect.type}" n'est pas encore pris en charge.`);
    }
  }

  static #requireText(value, label) {
    if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} doit être un texte non vide.`);
    return value.trim();
  }

  static #positiveInteger(value, label) { if (!Number.isInteger(value) || value <= 0) throw new RangeError(`${label} doit être un entier positif.`); return value; }
  static #heroFor(effect, game) {
    const playerId = ScenarioEffectResolver.#requireText(effect.playerId ?? "local", "Le joueur récompensé"); const player = game.getPlayer(playerId); const hero = player?.heroIds.map((id) => game.getHero(id)).find((candidate) => candidate !== null) ?? null;
    if (hero === null) throw new RangeError("Le héros récompensé n'existe pas."); return hero;
  }
}
