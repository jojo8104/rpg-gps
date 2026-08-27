import { AutonomousGroup } from "./autonomous-group.js";
import { SetupPlacementService } from "./setup-placement-service.js";
import { QuestDeadlineService } from "./quest-deadline-service.js";
import { distanceMeters } from "./geo.js";

/** Applique les effets déclaratifs d'événements sans dépendre de l'interface. */
export class ScenarioEffectResolver {
  apply(event, game) {
    return event.effects.filter((effect) => game.matchesScenarioCondition?.(effect.condition) ?? true).map((effect) => this.#applyEffect(effect, game));
  }

  #applyEffect(effect, game) {
    switch (effect.type) {
      case "showNarration": {
        const text = ScenarioEffectResolver.#requireText(effect.text, "Le texte de narration");
        const entry = { type: "narration", text, eventId: game.activeScenarioEventId };
        game.eventLog.push(entry);
        return entry;
      }
      case "showReport": {
        const lines = (effect.fragments ?? []).filter((fragment) => game.matchesScenarioCondition(fragment.condition)).map((fragment) => ScenarioEffectResolver.#requireText(fragment.text, "Une ligne de rapport"));
        const entry = { type: "scenario_report", reportId: ScenarioEffectResolver.#requireText(effect.reportId, "Le rapport"), lines, text: lines.join("\n"), eventId: game.activeScenarioEventId };
        game.eventLog.push(entry); return entry;
      }
      case "offerQuest": {
        const id = ScenarioEffectResolver.#requireText(effect.questId, "La quête proposée"); const startPhaseId = ScenarioEffectResolver.#requireText(effect.startPhaseId, "La première phase de quête");
        const offered = game.offerQuest({ id, startPhaseId, title: ScenarioEffectResolver.#requireText(effect.title, "Le titre de quête"), description: ScenarioEffectResolver.#requireText(effect.description, "La description de quête"), briefingLines: effect.briefingLines ?? [] });
        return { type: "quest_offered", questId: id, startPhaseId, offered, eventId: game.activeScenarioEventId };
      }
      case "revealLocation": {
        const location = game.getLocationForScenarioSlot(effect.locationSlotId);
        location.visibility = "discovered";
        game.players.forEach((player) => player.discoverLocation(location.id, 2));
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
      case "setLocationOwner": {
        const location = game.getLocationForScenarioSlot(effect.locationSlotId); location.setOwner(effect.ownerId ?? null); location.setController(effect.controllerId ?? effect.ownerId ?? null);
        const entry = { type: "location_owner_changed", locationId: location.id, ownerId: location.ownerId, controllerId: location.controllerId, eventId: game.activeScenarioEventId }; game.eventLog.push(entry); return entry;
      }
      case "destroyLocationImprovement": {
        const location = game.getLocationForScenarioSlot(effect.locationSlotId); const destroyed = location.destroyImprovement(ScenarioEffectResolver.#requireText(effect.improvementId, "L'amélioration"));
        const entry = { type: "location_improvement_destroyed", locationId: location.id, improvementId: effect.improvementId, destroyed, eventId: game.activeScenarioEventId }; game.eventLog.push(entry); return entry;
      }
      case "setFlag": {
        const value = game.worldState.set(ScenarioEffectResolver.#requireText(effect.path, "Le drapeau"), effect.value);
        const entry = { type: "world_flag_changed", path: effect.path, value, eventId: game.activeScenarioEventId }; game.eventLog.push(entry); return entry;
      }
      case "setNpcStatus": {
        const npc = game.worldState.getNpc(ScenarioEffectResolver.#requireText(effect.npcId, "Le PNJ")); if (npc === null) throw new RangeError("Le PNJ n'existe pas."); npc.setStatus(effect.status);
        const entry = { type: "npc_status_changed", npcId: npc.id, status: npc.status, eventId: game.activeScenarioEventId }; game.eventLog.push(entry); return entry;
      }
      case "adjustNpcRelation": {
        const npc = game.worldState.getNpc(ScenarioEffectResolver.#requireText(effect.npcId, "Le PNJ")); if (npc === null) throw new RangeError("Le PNJ n'existe pas."); const relation = npc.adjustRelation(effect.amount);
        const entry = { type: "npc_relation_changed", npcId: npc.id, relation, eventId: game.activeScenarioEventId }; game.eventLog.push(entry); return entry;
      }
      case "incrementNpcGrade": {
        const npc = game.worldState.getNpc(ScenarioEffectResolver.#requireText(effect.npcId, "Le PNJ")); if (npc === null) throw new RangeError("Le PNJ n'existe pas."); const grade = npc.incrementGrade(effect.amount ?? 1);
        const entry = { type: "npc_grade_changed", npcId: npc.id, grade, eventId: game.activeScenarioEventId }; game.eventLog.push(entry); return entry;
      }
      case "copyNpcFieldToFlag": {
        const npc = game.worldState.getNpc(ScenarioEffectResolver.#requireText(effect.npcId, "Le PNJ")); if (npc === null || !(effect.field in npc)) throw new RangeError("Le champ du PNJ n'existe pas.");
        const value = game.worldState.set(ScenarioEffectResolver.#requireText(effect.path, "Le drapeau"), npc[effect.field]); return { type: "npc_field_persisted", npcId: npc.id, field: effect.field, path: effect.path, value, eventId: game.activeScenarioEventId };
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
      case "depositCarriedItem": {
        const hero = ScenarioEffectResolver.#heroFor(effect, game); const destination = game.getLocationForScenarioSlot(effect.destinationLocationSlotId); const itemId = ScenarioEffectResolver.#requireText(effect.itemId, "L'objet déposé");
        const index = hero.carriedLoot.findIndex((entry) => entry.itemId === itemId); const item = index < 0 ? null : hero.carriedLoot.splice(index, 1)[0];
        if (item !== null) destination.depositItem(item);
        const entry = { type: "quest_item_deposited", heroId: hero.id, itemId, destinationLocationId: destination.id, deposited: item !== null, eventId: game.activeScenarioEventId }; game.eventLog.push(entry); return entry;
      }
      case "grantHeroResource": {
        const hero = ScenarioEffectResolver.#heroFor(effect, game); const resource = ScenarioEffectResolver.#requireText(effect.resource, "La ressource"); const amount = ScenarioEffectResolver.#positiveInteger(effect.amount, "La récompense");
        hero.addResource(resource, amount); const entry = { type: "hero_resource_granted", heroId: hero.id, resource, amount, eventId: game.activeScenarioEventId };
        game.eventLog.push(entry); return entry;
      }
      case "depositHeroResource": {
        const hero = ScenarioEffectResolver.#heroFor(effect, game); const destination = game.getLocationForScenarioSlot(effect.destinationLocationSlotId);
        const resource = ScenarioEffectResolver.#requireText(effect.resource, "La ressource livrée"); const amount = ScenarioEffectResolver.#positiveInteger(effect.amount, "La quantité livrée");
        if (hero.getResourceAmount(resource) < amount) throw new RangeError("Le héros ne transporte pas assez de ressources pour cette livraison.");
        const deposited = destination.depositResource(resource, amount);
        if (deposited !== amount) throw new RangeError("Le lieu ne peut pas recevoir toute la livraison.");
        hero.spendResource(resource, amount);
        const entry = { type: "hero_resource_deposited", heroId: hero.id, destinationLocationId: destination.id, resource, amount, eventId: game.activeScenarioEventId };
        game.eventLog.push(entry); return entry;
      }
      case "collectLocationResource": {
        const hero = ScenarioEffectResolver.#heroFor(effect, game); const source = game.getLocationForScenarioSlot(effect.sourceLocationSlotId);
        const resource = ScenarioEffectResolver.#requireText(effect.resource, "La ressource collectée"); const amount = ScenarioEffectResolver.#positiveInteger(effect.amount, "La quantité collectée");
        if ((source.resources.stock[resource] ?? 0) < amount) throw new RangeError("Le lieu ne possède pas assez de ressources pour cette collecte.");
        source.resources.stock[resource] -= amount; hero.addResource(resource, amount);
        const entry = { type: "location_resource_collected", heroId: hero.id, sourceLocationId: source.id, resource, amount, eventId: game.activeScenarioEventId };
        game.eventLog.push(entry); return entry;
      }
      case "transferLocationResource": {
        const source = game.getLocationForScenarioSlot(effect.sourceLocationSlotId);
        const destination = game.getLocationForScenarioSlot(effect.destinationLocationSlotId);
        const resource = ScenarioEffectResolver.#requireText(effect.resource, "La ressource transférée");
        const requestedAmount = ScenarioEffectResolver.#positiveInteger(effect.amount, "La quantité demandée");
        const available = Math.max(0, Math.floor(source.resources.stock[resource] ?? 0));
        const amount = Math.min(requestedAmount, available);
        const deposited = amount === 0 ? 0 : destination.depositResource(resource, amount);
        source.resources.stock[resource] = available - deposited;
        if (effect.resultFlagPath !== undefined) game.worldState.set(ScenarioEffectResolver.#requireText(effect.resultFlagPath, "Le drapeau du résultat"), deposited);
        const entry = { type: "location_resource_transferred", sourceLocationId: source.id, destinationLocationId: destination.id, resource, requestedAmount, amount: deposited, eventId: game.activeScenarioEventId };
        game.eventLog.push(entry); return entry;
      }
      case "startEvacuation": {
        const source = game.getLocationForScenarioSlot(effect.sourceLocationSlotId); const hero = ScenarioEffectResolver.#heroFor(effect, game);
        const timing = game.coordinateMode === "simulation" && effect.simulationDurationMinutes
          ? { minutes: ScenarioEffectResolver.#positiveInteger(effect.simulationDurationMinutes, "La durée d'évacuation simulée"), distanceMeters: null, paceMode: game.setup.rules.travelPaceMode }
          : effect.timing ? new QuestDeadlineService().calculateMinutes({ origin: game.getLocationForScenarioSlot(effect.timing.originLocationSlotId).position, destination: source.position, paceMode: game.setup.rules.travelPaceMode, baseMinutes: effect.timing.baseMinutes ?? 1, calmMetersPerMinute: effect.timing.calmMetersPerMinute ?? 60, sportMetersPerMinute: effect.timing.sportMetersPerMinute ?? 100, minimumMinutes: effect.timing.minimumMinutes ?? 1, maximumMinutes: effect.timing.maximumMinutes ?? 12 }) : { minutes: ScenarioEffectResolver.#positiveInteger(effect.durationMinutes, "La durée d'évacuation"), distanceMeters: null, paceMode: game.setup.rules.travelPaceMode };
        const durationMs = timing.minutes * 60_000;
        const id = ScenarioEffectResolver.#requireText(effect.evacuationId, "L'évacuation"); const startedAt = game.now();
        game.evacuationStates[id] = { id, playerId: hero.playerId, sourceLocationId: source.id, startedAt, expiresAt: startedAt + durationMs, deadlineCausesFailure: effect.deadlineCausesFailure !== false, initialPopulation: source.population ?? 0, initialResources: structuredClone(source.resources.stock), initialHeroResources: structuredClone(hero.resources), initialStructures: Object.values(source.infrastructure).reduce((sum, level) => sum + level, 0), departedAt: null };
        const entry = { type: "evacuation_started", evacuationId: id, sourceLocationId: source.id, expiresAt: startedAt + durationMs, durationMinutes: timing.minutes, distanceMeters: timing.distanceMeters, paceMode: timing.paceMode, eventId: game.activeScenarioEventId }; game.eventLog.push(entry); return entry;
      }
      case "startQuestDeadline": {
        const id = ScenarioEffectResolver.#requireText(effect.deadlineId, "Le délai de quête");
        const origin = game.getLocationForScenarioSlot(effect.originLocationSlotId); const destination = game.getLocationForScenarioSlot(effect.destinationLocationSlotId);
        const timing = game.coordinateMode === "simulation" && effect.simulationDurationMinutes
          ? { minutes: ScenarioEffectResolver.#positiveInteger(effect.simulationDurationMinutes, "La durée simulée"), distanceMeters: null, paceMode: game.setup.rules.travelPaceMode }
          : new QuestDeadlineService().calculateMinutes({ origin: origin.position, destination: destination.position, paceMode: game.setup.rules.travelPaceMode, baseMinutes: effect.baseMinutes ?? 1, calmMetersPerMinute: effect.calmMetersPerMinute ?? 60, sportMetersPerMinute: effect.sportMetersPerMinute ?? 100, minimumMinutes: effect.minimumMinutes ?? 1, maximumMinutes: effect.maximumMinutes ?? 30 });
        const startedAt = game.now(); game.questDeadlines[id] = { id, label: effect.label ?? "Temps restant", startedAt, expiresAt: startedAt + timing.minutes * 60_000, completedAt: undefined, failedAt: undefined };
        const entry = { type: "quest_deadline_started", deadlineId: id, expiresAt: game.questDeadlines[id].expiresAt, durationMinutes: timing.minutes, distanceMeters: timing.distanceMeters, paceMode: timing.paceMode, eventId: game.activeScenarioEventId }; game.eventLog.push(entry); return entry;
      }
      case "completeQuestDeadline": {
        const id = ScenarioEffectResolver.#requireText(effect.deadlineId, "Le délai de quête"); const deadline = game.questDeadlines[id];
        if (!deadline) throw new RangeError("Le délai de quête n'existe pas.");
        deadline.completedAt = game.now();
        const entry = { type: "quest_deadline_completed", deadlineId: id, completedAt: deadline.completedAt, eventId: game.activeScenarioEventId }; game.eventLog.push(entry); return entry;
      }
      case "spawnAttackGroup": {
        const target = game.getLocationForScenarioSlot(effect.targetLocationSlotId);
        const speed = Number(game.coordinateMode === "simulation" ? (effect.simulationSpeedUnitsPerSecond ?? (effect.simulationSpeedMetersPerSecond ?? 12_000) / 40_000) : effect.speedMetersPerSecond ?? .15);
        const configuredDistance = game.coordinateMode === "simulation" ? effect.simulationDistanceUnits : effect.originDistanceMeters;
        const evacuationTiming = effect.travelDurationFromEvacuationId ? game.evacuationStates[effect.travelDurationFromEvacuationId] : null;
        const travelDurationMinutes = evacuationTiming ? (evacuationTiming.expiresAt - evacuationTiming.startedAt) / 60_000 : effect.travelDurationMinutes;
        const distance = Number(travelDurationMinutes ? speed * travelDurationMinutes * 60 : configuredDistance ?? 100);
        const directionDegrees = Number(effect.directionDegrees ?? 180);
        const preferred = ScenarioEffectResolver.#radialPosition(target.position, distance, directionDegrees, game.coordinateMode);
        const placement = new SetupPlacementService();
        let origin = placement.resolveInside({ playArea: game.setup.playArea, preferred });
        const distanceBetween = game.coordinateMode === "simulation" ? (first, second) => Math.hypot(first.latitude - second.latitude, first.longitude - second.longitude) : distanceMeters;
        if (effect.useFarthestBoundaryWhenClamped === true && distanceBetween(target.position, origin) + .01 < distance) origin = placement.generate({ playArea: game.setup.playArea, count: 1, occupied: [target.position] })[0];
        if (evacuationTiming) evacuationTiming.expiresAt = evacuationTiming.startedAt + distanceBetween(origin, target.position) / speed * 1_000;
        const engagementRadius = Number(game.coordinateMode === "simulation" ? effect.simulationEngagementRadiusUnits ?? 8 : effect.engagementRadiusMeters ?? game.setup.rules.engagementRadiusMeters);
        const mission = effect.stationary === true
          ? { kind: "guard", center: { ...origin }, engagementRadiusMeters: engagementRadius, coordinateMode: game.coordinateMode }
          : { kind: "attack_location", targetId: target.id, coordinateMode: game.coordinateMode, speedMetersPerSecond: speed };
        const group = new AutonomousGroup({ id: ScenarioEffectResolver.#requireText(effect.groupId, "Le groupe autonome"), type: "army", owner: { kind: "faction", id: effect.factionId ?? "chaos" }, factionId: effect.factionId ?? "chaos", position: origin, behavior: "aggressive", mission, army: { units: [{ id: `${effect.groupId}-unit`, ownerPlayerId: effect.factionId ?? "chaos", typeId: effect.unitTypeId ?? "militia", quantity: Number(effect.quantity ?? 5), rank: effect.rank ?? (Number(effect.quantity ?? 5) > 6 ? "corporal" : "soldier") }] } });
        game.addAutonomousGroup(group); const entry = { type: "attack_group_spawned", groupId: group.id, targetLocationId: target.id, origin, eventId: game.activeScenarioEventId }; game.eventLog.push(entry); return entry;
      }
      case "spawnPursuitGroup": {
        const hero = ScenarioEffectResolver.#heroFor(effect, game);
        const source = game.getLocationForScenarioSlot(effect.sourceLocationSlotId);
        const destination = game.getLocationForScenarioSlot(effect.destinationLocationSlotId);
        const ratio = Number(effect.corridorRatio);
        if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) throw new RangeError("La position sur l'axe de poursuite doit être comprise entre zéro et un.");
        const preferred = {
          latitude: source.position.latitude + (destination.position.latitude - source.position.latitude) * ratio,
          longitude: source.position.longitude + (destination.position.longitude - source.position.longitude) * ratio,
        };
        const origin = new SetupPlacementService().resolveInside({ playArea: game.setup.playArea, preferred });
        const groupId = ScenarioEffectResolver.#requireText(effect.groupId, "Le groupe de poursuivants");
        const group = new AutonomousGroup({
          id: groupId, type: "army", owner: { kind: "faction", id: effect.factionId ?? "bandits" }, factionId: effect.factionId ?? "bandits",
          position: origin, behavior: "aggressive",
          mission: { kind: "pursue", targetId: hero.id, coordinateMode: game.coordinateMode, speedMetersPerSecond: Number(effect.speedMetersPerSecond ?? 2.4), role: effect.role ?? "harrier" },
          army: { units: [{ id: `${groupId}-unit`, ownerPlayerId: effect.factionId ?? "bandits", typeId: effect.unitTypeId ?? "militia", quantity: Number(effect.quantity ?? 3), rank: effect.rank ?? "soldier" }] },
        });
        game.addAutonomousGroup(group);
        const entry = { type: "pursuit_group_spawned", groupId, targetHeroId: hero.id, origin, corridorRatio: ratio, role: group.mission.role, eventId: game.activeScenarioEventId };
        game.eventLog.push(entry); return entry;
      }
      case "assignWagons": {
        const hero = ScenarioEffectResolver.#heroFor(effect, game); const result = game.assignWagons({ playerId: hero.playerId, heroId: hero.id, wagons: effect.wagons });
        return { type: "wagons_assigned", heroId: hero.id, success: result.success, addedSlots: result.success ? result.slotCapacity - hero.baseBagSlotCount : 0, eventId: game.activeScenarioEventId };
      }
      case "returnWagons": {
        const hero = ScenarioEffectResolver.#heroFor(effect, game); const result = game.returnWagons({ playerId: hero.playerId, heroId: hero.id, wagonIds: effect.wagonIds });
        return { type: "wagons_returned", heroId: hero.id, success: result.success, wagonIds: result.success ? result.wagons.map((wagon) => wagon.id) : [], removedSlots: result.removedSlots ?? 0, eventId: game.activeScenarioEventId };
      }
      case "completeEvacuation": {
        const hero = ScenarioEffectResolver.#heroFor(effect, game); const destination = game.getLocationForScenarioSlot(effect.destinationLocationSlotId); const state = game.evacuationStates[effect.evacuationId];
        if (!state) throw new RangeError("L'évacuation n'existe pas.");
        const packages = hero.carriedLoot.filter((item) => item.itemId === "population" && item.metadata?.originLocationId === state.sourceLocationId); const people = packages.reduce((sum, item) => sum + item.quantity, 0);
        hero.carriedLoot = hero.carriedLoot.filter((item) => !packages.includes(item)); if (people > 0) destination.addPopulation(people);
        const unloadedResources = {}; Object.entries(hero.resources).forEach(([resource, amount]) => { const evacuated = Math.max(0, Math.floor(amount - (state.initialHeroResources?.[resource] ?? 0))); if (evacuated <= 0) return; const deposited = destination.depositResource(resource, evacuated); if (deposited > 0) { hero.spendResource(resource, deposited); unloadedResources[resource] = deposited; } });
        const initialResourceTotal = Object.entries(state.initialResources).filter(([id]) => id !== "population").reduce((sum, [, amount]) => sum + amount, 0); const remainingResourceTotal = Object.entries(state.resourcesRemaining ?? {}).filter(([id]) => id !== "population").reduce((sum, [, amount]) => sum + amount, 0);
        const structuresSaved = Math.max(0, state.initialStructures - (state.structuresRemaining ?? state.initialStructures));
        const result = game.resultEvaluationService.evaluate({ metrics: [{ id: "population", value: people, target: Math.max(1, state.initialPopulation), weight: 4 }, { id: "resources", value: Math.max(0, initialResourceTotal - remainingResourceTotal), target: Math.max(1, initialResourceTotal), weight: 2 }, { id: "structures", value: structuresSaved, target: Math.max(1, state.initialStructures), weight: 2 }] });
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
  static #radialPosition(origin, distance, directionDegrees, coordinateMode) {
    const radians = directionDegrees * Math.PI / 180;
    if (coordinateMode === "simulation") return { latitude: origin.latitude + Math.cos(radians) * distance, longitude: origin.longitude + Math.sin(radians) * distance };
    return {
      latitude: origin.latitude + Math.cos(radians) * distance / 111_320,
      longitude: origin.longitude + Math.sin(radians) * distance / (111_320 * Math.max(.01, Math.cos(origin.latitude * Math.PI / 180))),
    };
  }
  static #heroFor(effect, game) {
    const playerId = ScenarioEffectResolver.#requireText(effect.playerId ?? "local", "Le joueur récompensé"); const player = game.getPlayer(playerId); const hero = player?.heroIds.map((id) => game.getHero(id)).find((candidate) => candidate !== null) ?? null;
    if (hero === null) throw new RangeError("Le héros récompensé n'existe pas."); return hero;
  }
}
