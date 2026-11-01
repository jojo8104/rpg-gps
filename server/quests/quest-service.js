import { consumeAstralInteraction } from "../../app/js/core/astral-interaction.js";
import { QuestEngine } from "../../app/js/core/quest-engine.js";
import { applyQuestModification } from "./quest-modification.js";
import { Game } from "../../app/js/core/game.js";
import { Location } from "../../app/js/core/location.js";
import { AutonomousGroup } from "../../app/js/core/autonomous-group.js";
import {
  LocationSpacingPolicy,
  placedLocations,
} from "../../app/js/core/location-spacing-policy.js";
import { getItemDefinition } from "../../app/js/core/item-catalog.js";
import { mapLocationEnabled } from "../../app/js/core/player-map-visibility.js";
import { locationWorldContext } from "../../app/js/core/scenario-location-world-policy.js";
import { syncScenarioLocationAppearances } from "../../app/js/core/scenario-location-appearance.js";
import {
  bindQuestToScenarioLocations,
  bindDialoguesToScenarioLocations,
} from "./scenario-location-resolver.js";

/** Service serveur isolé : aucun résultat métier fourni par le client n'est accepté.
 * getGame/replaceGame permettent une restauration complète en cas d'erreur.
 */
export class QuestService {
  constructor({
    definitions,
    getGame,
    replaceGame,
    dialogues = {},
    now = Date.now,
  }) {
    if (typeof getGame !== "function" || typeof replaceGame !== "function")
      throw new TypeError("Le service exige les accès au monde serveur.");
    this.getGame = getGame;
    this.replaceGame = replaceGame;
    const boundDefinitions = definitions.map((definition) =>
      bindQuestToScenarioLocations(definition, getGame()),
    );
    this.dialogues = bindDialoguesToScenarioLocations(
      dialogues,
      getGame(),
      boundDefinitions,
    );
    this.now = now;
    const saved = getGame().questEngineState;
    this.world = structuredClone(
      saved?.world ?? { objects: {}, conversations: {}, distanceOrigins: {} },
    );
    this.engine = new QuestEngine({
      definitions: boundDefinitions,
      snapshot: saved?.engine ?? null,
      now,
      adapter: {
        transaction: (operation) => this.#transaction(operation),
        save: (engine) => {
          syncScenarioLocationAppearances(this.getGame(), engine);
          this.getGame().questEngineState = {
            engine,
            world: structuredClone(this.world),
          };
        },
        canAccess: (condition, actor, instance) =>
          this.#condition(condition, actor, instance),
        participants: (mode, actor) => this.#participants(mode, actor),
        perform: (action, actor, instance, intent) => {
          const result = this.#perform(action, actor, instance, intent);
          const location =
            this.getGame().getLocation(action.lieu) ??
            this.getGame().getLocation(`${instance.id}:${action.lieu}`);
          if (location)
            consumeAstralInteraction(
              this.getGame(),
              actor.playerId,
              "questEngineCommand",
              { locationId: location.id },
              result,
            );
          return result;
        },
        applyEffect: (effect, actor, instance) =>
          this.#effect(effect, actor, instance),
        create: (prerequisite, actor, instance) =>
          this.#create(prerequisite, actor, instance),
        actorFor: (playerId) => this.#actor(playerId),
        activate: (action, instance) => {
          if (action.action !== "Parcourir") return;
          this.world.distanceOrigins[`${instance.id}:${action.id}`] =
            Object.fromEntries(
              instance.playerIds.map((id) => {
                const hero = this.getGame().getHero(this.#actor(id).heroId);
                return [id, hero.travelProgress.totalDistanceMeters];
              }),
            );
        },
      },
    });
    for (const slot of getGame().scenario?.locationSlots ?? []) {
      const removal = slot.world?.removal;
      if (removal?.actionId) {
        const definition = this.engine.definitions.get(removal.questId);
        if (definition && !definition.getAction(removal.actionId))
          throw new RangeError(
            `Action de disparition inconnue : ${removal.actionId}.`,
          );
      }
      const rule = slot.appearance;
      if (rule?.on !== "ActionCompleted") continue;
      const quest = this.engine.definitions.get(rule.questId);
      if (quest && !quest.getAction(rule.actionId))
        throw new RangeError(
          `Action d’apparition inconnue : ${rule.actionId}.`,
        );
    }
    syncScenarioLocationAppearances(getGame(), this.engine.toJSON());
  }

  #transaction(operation) {
    const gameSnapshot = this.getGame().toJSON(),
      worldSnapshot = structuredClone(this.world);
    try {
      return operation();
    } catch (error) {
      this.world = worldSnapshot;
      this.replaceGame(Game.fromJSON(gameSnapshot, { now: this.now }));
      throw error;
    }
  }

  #actor(playerId) {
    const game = this.getGame();
    const hero = game.heroes.find(
      (entry) => entry.playerId === playerId && entry.state === "active",
    );
    if (!game.getPlayer(playerId) || !hero)
      throw new Error("Acteur serveur indisponible.");
    return { playerId, heroId: hero.id };
  }

  /** playerId vient exclusivement de la session authentifiée, jamais du corps client. */
  command(playerId, command) {
    const actor = this.#actor(playerId);
    switch (command.type) {
      case "publish":
        return this.engine.publish(command.questId, actor);
      case "accept": {
        const quest = this.engine.definitions.get(command.questId);
        const hero = this.getGame().getHero(actor.heroId);
        if (quest?.locationSlotId && !this.#present(hero, quest.locationSlotId))
          return no("not_at_quest_giver");
        const result = this.engine.accept({
          questId: command.questId,
          mode: command.mode,
          actor,
        });
        if (result.success) this.#advanceModifiers(actor);
        return result;
      }
      case "act": {
        const result = this.engine.act({
          instanceId: command.instanceId,
          actionId: command.actionId,
          intent: { choiceId: command.choiceId, battleId: command.battleId },
          actor,
        });
        if (result.success) this.#advanceModifiers(actor);
        return result;
      }
      case "abandon":
        return this.engine.abandon(command.instanceId, actor);
      default:
        throw new Error("Commande de quête inconnue.");
    }
  }

  dispatchOfficialEvent(event, playerId) {
    const actor = this.#actor(playerId);
    const result = this.engine.dispatch(event, actor);
    const automatic = new Set([
      "Atteindre",
      "Parcourir",
      "Construire",
      "Combattre",
    ]);
    for (const instance of this.engine
      .toJSON()
      .instances.filter(
        (entry) =>
          entry.status === "active" && entry.playerIds.includes(playerId),
      )) {
      const quest = this.engine.definitions.get(instance.questId);
      for (const action of quest.actions) {
        if (!automatic.has(action.action)) continue;
        this.engine.act({
          instanceId: instance.id,
          actionId: action.id,
          actor,
          intent: { battleId: event.battleId },
        });
      }
    }
    this.#advanceModifiers(actor);
    return result;
  }

  #advanceModifiers(actor) {
    // Le graphe est acyclique : chaque bloc peut être appliqué une seule fois.
    const limit = [...this.engine.definitions.values()].reduce(
      (sum, quest) => sum + quest.actions.length,
      0,
    );
    for (let n = 0; n < limit; n++) {
      const state = this.engine.toJSON();
      let candidate = null;
      for (const instance of state.instances.filter(
        (instance) =>
          instance.status === "active" &&
          instance.playerIds.includes(actor.playerId),
      )) {
        const quest = this.engine.definitions.get(instance.questId);
        const action = quest.actions.find(
          (action) =>
            action.action === "Modifier" &&
            instance.actions[action.id]?.status === "active",
        );
        if (action) {
          candidate = {
            instanceId: instance.id,
            actionId: action.id,
            actor,
            intent: {},
          };
          break;
        }
      }
      if (!candidate || !this.engine.act(candidate).success) break;
    }
  }

  #participants(mode, actor) {
    if (mode !== "equipe") return [actor.playerId];
    const participants = this.getGame().setup.participants;
    const player = participants.find(
      (entry) => entry.playerId === actor.playerId,
    );
    if (!player?.teamId)
      throw new Error("Le joueur n'appartient pas à une équipe.");
    return participants
      .filter((entry) => entry.teamId === player.teamId)
      .map((entry) => entry.playerId);
  }

  #condition(condition, actor, instance) {
    if (condition === null || condition === "none") return true;
    if (!condition || typeof condition !== "object")
      throw new Error("Condition inconnue.");
    const game = this.getGame(),
      hero = game.getHero(actor.heroId);
    switch (condition.type) {
      case "locationPlaced":
      case "locationVisible": {
        const location =
          game.getLocation(condition.locationId) ??
          (instance
            ? game.getLocation(`${instance.id}:${condition.locationId}`)
            : null);
        if (!location || ["dismissed", "destroyed"].includes(location.state))
          return false;
        if (condition.type === "locationVisible")
          return mapLocationEnabled(location, game, actor.playerId);
        const { placement } = locationWorldContext(location, game);
        return !placement || placement.status === "placed";
      }
      case "territoryOccupation": {
        const teamId = game.territoryService.teamFor(game, actor.playerId);
        if (
          !Number.isFinite(condition.minimumRatio) ||
          condition.minimumRatio < 0 ||
          condition.minimumRatio > 1
        )
          throw new RangeError(
            "Le taux territorial doit être compris entre zéro et un.",
          );
        return (
          (game.territoryState?.view?.occupation?.[teamId] ?? 0) >=
          condition.minimumRatio
        );
      }
      case "questCompleted":
        return (
          this.engine?.state.instances.some(
            (entry) =>
              entry.questId === condition.questId &&
              entry.playerIds.includes(actor.playerId) &&
              entry.status === "completed",
          ) ?? false
        );
      case "actionCompleted":
        return instance?.actions[condition.actionId]?.status === "completed";
      case "hasResource":
        return (
          hero.getResourceAmount(condition.resource) >=
          positive(condition.amount)
        );
      case "hasItem":
        return (
          hero.carriedLoot
            .filter((entry) => entry.itemId === condition.itemId)
            .reduce((sum, entry) => sum + entry.quantity, 0) >=
          positive(condition.amount ?? 1)
        );
      case "flag":
        return game.worldState.get(condition.path) === condition.equals;
      default:
        throw new Error(`Condition inconnue : ${condition.type}.`);
    }
  }

  #present(hero, locationId, instance = null) {
    const location =
      this.getGame().getLocation(locationId) ??
      (instance
        ? this.getGame().getLocation(`${instance.id}:${locationId}`)
        : null);
    return location &&
      mapLocationEnabled(location, this.getGame(), hero.playerId) &&
      location.heroIds.includes(hero.id)
      ? location
      : null;
  }

  #perform(action, actor, instance, intent) {
    const game = this.getGame(),
      hero = game.getHero(actor.heroId);
    if (!hero || hero.state !== "active" || hero.playerId !== actor.playerId)
      return no("actor_unavailable");
    if (action.action === "Modifier") {
      applyQuestModification(
        game,
        actor,
        instance,
        action.modification,
        action.id,
      );
      return yes();
    }
    if (action.action === "Atteindre")
      return this.#present(hero, action.lieu, instance)
        ? yes()
        : no("not_at_location");
    if (action.action === "Parcourir") {
      const key = `${instance.id}:${action.id}`;
      const distance = hero.travelProgress.totalDistanceMeters ?? 0;
      // Baseline enregistrée par le serveur à l'acceptation / au déblocage.
      const origin = this.world.distanceOrigins[key]?.[actor.playerId];
      return origin !== undefined && distance - origin >= action.distance
        ? yes()
        : no("distance_not_reached");
    }
    if (action.action === "Parler")
      return this.#talk(action, actor, instance, intent);
    if (action.action === "Construire") {
      const location = this.#present(hero, action.lieu, instance);
      if (
        !location ||
        !game.locationAccessPolicy.can(actor.playerId, location, "build")
      )
        return no("construction_access");
      const goal = action.goal;
      const complete = goal.improvementId
        ? (location.infrastructure[goal.improvementId] ?? 0) >=
          positive(goal.level ?? 1)
        : goal.type
          ? location.type === goal.type
          : goal.level
            ? location.level >= positive(goal.level)
            : false;
      return complete ? yes() : no("construction_not_completed");
    }
    if (action.action === "Combattre") {
      const battle = game.battles.find((entry) => entry.id === intent.battleId);
      if (!battle || battle.status !== "finished")
        return no("battle_not_finished");
      if (
        battle.finishedAt < instance.actions[action.id].activatedAt ||
        Object.values(instance.actions).some(
          (state) => state.evidenceId === battle.id,
        )
      )
        return no("battle_already_used_or_too_old");
      const own = battle.teams.find((team) =>
        team.heroes.some((entry) => entry.sourceId === hero.id),
      );
      const enemy = battle.teams.find((team) => team.id !== own?.id);
      const createdGroup = this.engine.definitions
        .get(instance.questId)
        .prerequisites.find(
          (entry) => entry.type === "ga" && entry.id === action.qui,
        );
      const targetMatches = createdGroup
        ? enemy?.autonomousGroupId ===
          (createdGroup.scope === "world"
            ? action.qui
            : `${instance.id}:${action.qui}`)
        : battle.sourceLocationId === action.qui ||
          enemy?.heroes.some((entry) => entry.sourceId === action.qui) ||
          enemy?.autonomousGroupId === action.qui;
      if (!own || !targetMatches) return no("required_victory_missing");
      const output =
        battle.winnerTeamId === own.id
          ? "victory"
          : battle.winnerTeamId === enemy?.id
            ? "defeat"
            : "draw";
      if (action.outputs?.includes(output))
        return { success: true, output, evidenceId: battle.id };
      return output === "victory" && !action.outputs
        ? { success: true, evidenceId: battle.id }
        : no("required_victory_missing");
    }
    const locationId =
      action.action === "Prendre" ? action.origine : action.destinataire;
    const location = this.#present(hero, locationId, instance);
    if (!location) return no("not_at_location");
    if (
      !game.locationAccessPolicy.can(
        actor.playerId,
        location,
        action.action === "Prendre"
          ? location.type === "quest"
            ? "inspect"
            : "talkChief"
          : "deposit",
      )
    )
      return no("location_access");
    return this.#transfer(action, actor, instance, location);
  }

  #transfer(action, actor, instance, location) {
    const game = this.getGame(),
      hero = game.getHero(actor.heroId),
      amount = action.combien;
    const poolKey = `${instance.id}:${location.id}:${action.quoi}`;
    const pool =
      this.world.objects[poolKey] ??
      this.world.objects[`world:${location.id}:${action.quoi}`];
    if (action.action === "Prendre") {
      if (!pool || pool.quantity < amount)
        return no("quest_stock_insufficient");
      if (pool.type === "ressource") hero.addResource(action.quoi, amount);
      else
        hero.carriedLoot.push({
          id: `${instance.id}:${action.id}`,
          itemId: action.quoi,
          quantity: amount,
        });
      if (
        game.inventoryService.getHeroBagState(hero).usedSlots >
        game.inventoryService.getHeroBagSlotCount(hero)
      )
        throw new Error("Bagages insuffisants.");
      pool.quantity -= amount;
      return yes();
    }
    if (Object.hasOwn(hero.resources, action.quoi)) {
      if (hero.getResourceAmount(action.quoi) < amount)
        return no("resources_insufficient");
      const result = game.depositLocationResource({
        playerId: actor.playerId,
        heroId: hero.id,
        locationId: location.id,
        resourceName: action.quoi,
        amount,
      });
      if (!result.success || result.deposited !== amount)
        throw new Error(
          "Le destinataire ne peut pas recevoir la quantité complète.",
        );
    } else {
      if (
        hero.carriedLoot
          .filter((entry) => entry.itemId === action.quoi)
          .reduce((sum, entry) => sum + entry.quantity, 0) < amount
      )
        return no("item_missing");
      let remaining = amount;
      for (const entry of [...hero.carriedLoot]) {
        if (entry.itemId !== action.quoi || !remaining) continue;
        const quantity = Math.min(entry.quantity, remaining);
        location.depositItem({
          ...entry,
          id: `${instance.id}:${action.id}:${entry.id}`,
          quantity,
        });
        entry.quantity -= quantity;
        remaining -= quantity;
      }
      hero.carriedLoot = hero.carriedLoot.filter((entry) => entry.quantity > 0);
    }
    return yes();
  }

  #talk(action, actor, instance, intent) {
    const definition = this.dialogues[action.dialogue.id];
    if (
      !definition ||
      definition.speakerId !== action.dialogue.qui ||
      !this.#present(
        this.getGame().getHero(actor.heroId),
        definition.locationId,
        instance,
      )
    )
      return no("dialogue_unavailable");
    const key = `${instance.id}:${action.id}`;
    const current = this.world.conversations[key] ?? {
      nodeId: definition.initialNodeId,
    };
    this.world.conversations[key] = current;
    const node = definition.nodes.find((entry) => entry.id === current.nodeId);
    if (!node) throw new Error("Nœud de dialogue inconnu.");
    const choices = (node.choices ?? []).filter((choice) =>
      (choice.conditions ?? []).every((condition) =>
        this.#condition(condition, actor, instance),
      ),
    );
    if (!intent.choiceId)
      return {
        success: false,
        reason: "dialogue_pending",
        dialogue: {
          lines: node.lines,
          ...(definition.portrait ? { portrait: definition.portrait } : {}),
          ...(definition.portraitEditor
            ? {
                portraitEditor: definition.portraitEditor,
                appearance: definition.appearance,
              }
            : {}),
          choices: choices.map((choice) => ({
            id: choice.id,
            label: choice.label,
          })),
        },
      };
    const choice = choices.find((entry) => entry.id === intent.choiceId);
    if (!choice) return no("dialogue_choice_unavailable");
    if (action.outputs?.includes(choice.goal))
      return { success: true, output: choice.goal };
    if (!action.outputs && choice.goal === action.dialogue.goal) return yes();
    if (!choice.nextNodeId) return no("dialogue_goal_missing");
    current.nodeId = choice.nextNodeId;
    const next = definition.nodes.find((entry) => entry.id === current.nodeId);
    if (!next) throw new Error("Suite de dialogue inconnue.");
    return {
      success: false,
      reason: "dialogue_pending",
      dialogue: {
        lines: next.lines,
        ...(definition.portrait ? { portrait: definition.portrait } : {}),
        ...(definition.portraitEditor
          ? {
              portraitEditor: definition.portraitEditor,
              appearance: definition.appearance,
            }
          : {}),
      },
    };
  }

  #create(prerequisite, actor, instance) {
    const game = this.getGame();
    if (prerequisite.type === "ga") {
      const id =
        prerequisite.scope === "world"
          ? prerequisite.id
          : `${instance.id}:${prerequisite.id}`;
      if (game.getAutonomousGroup(id)) {
        if (
          prerequisite.scope === "world" &&
          game
            .getAutonomousGroup(id)
            .history.some(
              (entry) =>
                entry.type === "quest_created" &&
                entry.questId === instance.questId &&
                entry.creationId === prerequisite.id,
            )
        )
          return;
        throw new Error("Identifiant de GA déjà utilisé.");
      }
      const locationCreation = this.engine.definitions
        .get(instance.questId)
        ?.prerequisites.find((entry) => entry.id === prerequisite.locationId);
      const location = prerequisite.locationId
        ? game.getLocation(
            locationCreation && locationCreation.scope !== "world"
              ? `${instance.id}:${prerequisite.locationId}`
              : prerequisite.locationId,
          )
        : null;
      if (prerequisite.locationId && !location)
        throw new Error("Lieu du GA absent.");
      const properties = structuredClone(prerequisite.properties);
      if (
        properties.owner?.kind === "location" &&
        !prerequisite.belongsToLocation
      ) {
        const ownerCreation = this.engine.definitions
          .get(instance.questId)
          ?.prerequisites.find((entry) => entry.id === properties.owner.id);
        let ownerId =
          ownerCreation && ownerCreation.scope !== "world"
            ? `${instance.id}:${properties.owner.id}`
            : properties.owner.id;
        ownerId =
          game.scenarioLocationBindings.find(
            (binding) => binding.locationSlotId === ownerId,
          )?.locationId ?? ownerId;
        if (!game.getLocation(ownerId))
          throw new Error("Lieu propriétaire du GA absent.");
        properties.owner.id = ownerId;
      }
      const position = location
        ? { ...location.position }
        : properties.position;
      if (!game.setup.playArea.allowsPlacement(position))
        throw new Error("GA de quête hors zone.");
      const group = new AutonomousGroup({
        ...properties,
        id,
        position,
        ...(location ? { originLocationId: location.id } : {}),
        ...(prerequisite.belongsToLocation
          ? { owner: { kind: "location", id: location.id } }
          : {}),
      });
      for (const unit of group.army.units)
        if (!game.unitDefinitions.has(unit.typeId))
          throw new Error(`Type d’unité du GA inconnu : ${unit.typeId}.`);
      game.addAutonomousGroup(group);
      group.history.push({
        type: "quest_created",
        questId: instance.questId,
        creationId: prerequisite.id,
      });
      return;
    }
    if (["lieu", "marqueur"].includes(prerequisite.type)) {
      const id =
        prerequisite.scope === "world"
          ? prerequisite.id
          : `${instance.id}:${prerequisite.id}`;
      if (
        prerequisite.scope === "world" &&
        game.getLocation(id)?.source === "quest-engine"
      )
        return;
      if (game.getLocation(id))
        throw new Error("Identifiant de lieu déjà utilisé.");
      const location = new Location({
        ...prerequisite.properties,
        id,
        source: "quest-engine",
      });
      if (!game.setup.playArea.allowsPlacement(location.position))
        throw new Error("Lieu de quête hors zone.");
      const spacing = new LocationSpacingPolicy({
        setup: game.setup,
        coordinateMode: game.coordinateMode,
      });
      if (
        !spacing.check(location, location.position, placedLocations(game))
          .success
      )
        throw new Error("Lieu de quête trop proche d’un lieu existant.");
      game.locations.push(location);
    } else {
      const quantity = positive(prerequisite.quantity ?? 1),
        itemId = prerequisite.itemId ?? prerequisite.resource;
      const location =
        game.getLocation(prerequisite.locationId) ??
        game.getLocation(`${instance.id}:${prerequisite.locationId}`);
      if (!itemId || !location)
        throw new Error("Pré requis sans objet ou lieu valide.");
      if (prerequisite.when === "published" && prerequisite.scope !== "world")
        throw new Error("Une création à la publication exige la portée world.");
      const key = `${prerequisite.scope === "world" ? "world" : instance.id}:${location.id}:${itemId}`;
      if (prerequisite.scope === "world" && this.world.objects[key]) return;
      if (this.world.objects[key]) throw new Error("Stock de quête déjà créé.");
      this.world.objects[key] = { type: prerequisite.type, quantity, itemId };
    }
  }

  #effect(effect, actor, instance) {
    const game = this.getGame();
    const recipients =
      effect.recipient === "participants"
        ? instance.playerIds.map((id) => this.#actor(id))
        : [actor];
    for (const recipient of recipients) {
      const hero = game.getHero(recipient.heroId);
      switch (effect.type) {
        case "xp":
          game.gainHeroExperience({
            heroId: hero.id,
            amount: positive(effect.amount),
            source: "quest",
          });
          break;
        case "resource":
          hero.addResource(effect.resource, positive(effect.amount));
          break;
        case "item":
          if (!getItemDefinition(effect.itemId))
            throw new Error("Récompense item inconnue.");
          hero.carriedLoot.push({
            id: `${instance.id}:reward:${hero.id}:${hero.carriedLoot.length}`,
            itemId: effect.itemId,
            quantity: positive(effect.amount ?? 1),
          });
          break;
        case "revealLocation":
          const revealed =
            game.getLocation(effect.locationId) ??
            game.getLocation(`${instance.id}:${effect.locationId}`);
          if (!revealed) throw new Error("Lieu à révéler inconnu.");
          game.getPlayer(recipient.playerId).discoverLocation(revealed.id, 2);
          break;
        case "flag":
          if (recipients.length > 1 && recipient !== recipients[0]) break;
          game.worldState.set(effect.path, effect.value);
          break;
        case "narration":
          game.eventLog.push({
            type: "quest_narration",
            playerId: recipient.playerId,
            text: effect.text,
            at: this.now(),
          });
          break;
        default:
          throw new Error(`Conséquence inconnue : ${effect.type}.`);
      }
      if (
        game.inventoryService.getHeroBagState(hero).usedSlots >
        game.inventoryService.getHeroBagSlotCount(hero)
      )
        throw new Error("Récompense impossible : bagages pleins.");
    }
  }
}

function positive(value) {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new Error("La quantité doit être un entier positif.");
  return value;
}
function yes() {
  return { success: true };
}
function no(reason) {
  return { success: false, reason };
}
