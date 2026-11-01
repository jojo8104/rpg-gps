import { Location } from "./location.js";
import { LocationSpacingPolicy, placedLocations } from "./location-spacing-policy.js";
import { Unit } from "./unit.js";
import {
  CAMP_IMPROVEMENTS,
  CAMP_EVOLUTION_BRANCHES,
} from "./camp-improvement-service.js";

export const AUTHORITY_WRIT_ID = "authority_writ";
export const TEAM_FORT_TITLE = "Un fort pour le royaume";

/** Shared mission rules. The local harness changes team size, never completion rules. */
export class TeamFortQuestService {
  constructor(state = []) {
    this.quests = structuredClone(state);
  }

  toJSON() {
    return structuredClone(this.quests);
  }

  forPlayer(playerId) {
    return (
      this.quests.find((quest) => quest.playerIds.includes(playerId)) ?? null
    );
  }

  participants(game, hero, capital) {
    const teamId = game.setup.participants.find(
      (entry) => entry.playerId === hero.playerId,
    )?.teamId;
    if (!teamId) return [];
    return game.heroes
      .filter(
        (entry) =>
          entry.state === "active" &&
          capital.heroIds.includes(entry.id) &&
          game.setup.participants.some(
            (player) =>
              player.playerId === entry.playerId && player.teamId === teamId,
          ),
      )
      .filter(
        (entry, index, list) =>
          list.findIndex((other) => other.playerId === entry.playerId) ===
          index,
      );
  }

  options(game, hero, location) {
    if (game.questSystemEnabled === false) return [];
    if (!hero || location.type !== "capital" || this.forPlayer(hero.playerId))
      return [];
    const participants = this.participants(game, hero, location);
    if (
      participants.length < 2 ||
      participants.some((entry) => this.forPlayer(entry.playerId))
    )
      return [];
    return [
      {
        id: "team-fort:briefing",
        label: `Quête d’équipe : ${TEAM_FORT_TITLE}`,
      },
    ];
  }

  select(game, hero, location, optionId) {
    if (game.questSystemEnabled === false)
      return { success: false, reason: "quest_system_disabled" };
    const participants = this.participants(game, hero, location);
    if (
      location.type !== "capital" ||
      participants.length < 2 ||
      !participants.some((entry) => entry.id === hero.id) ||
      participants.some((entry) => this.forPlayer(entry.playerId))
    )
      return { success: false, reason: "team_fort_unavailable" };
    if (optionId === "team-fort:briefing") {
      return {
        success: true,
        lines: [
          "La route a besoin d’un fort. Achevez les travaux du camp et installez une unité de lanciers au grade Soldat, de l’origine de votre choix.",
          this.briefing(participants.length),
          "Le chronomètre démarre à l’acceptation. Le participant choisi reçoit l’unique Mandat d’autorité (+3 autorité une fois équipé), qu’il pourra garder. Choisissez son porteur pour accepter ensemble.",
        ],
        options: participants.map((entry) => ({
          id: `team-fort:accept:${entry.id}`,
          label: `Accepter · mandat à ${entry.name}`,
        })),
      };
    }
    if (!optionId.startsWith("team-fort:accept:"))
      return { success: false, reason: "team_fort_unavailable" };
    const recipient = participants.find(
      (entry) => entry.id === optionId.slice("team-fort:accept:".length),
    );
    if (!recipient) return { success: false, reason: "team_fort_unavailable" };
    return this.start(game, {
      participants,
      recipient,
      origin: location.position,
    });
  }

  briefing(count) {
    const plan = teamFortPreparation(count);
    const costs = Object.entries(plan.remainingCosts)
      .filter(([, amount]) => amount > 0)
      .map(
        ([id, amount]) =>
          `${amount} ${{ wood: "bois", stone: "pierres", iron: "fer", gold: "or" }[id]}`,
      )
      .join(", ");
    return `${count} participants : camp niveau 3, population et expérience déjà suffisantes ; barricades ${plan.infrastructure.barricades}/3, poste de guet ${plan.infrastructure.watch_post}/2. Travaux et transformation : ${costs}. Par participant : 20 or et 100 XP garantis, jusqu’à 20 or et 100 XP supplémentaires ; le bonus diminue sur 30 minutes.`;
  }

  start(game, { participants, recipient, origin, simulatedCount = null }) {
    if (game.questSystemEnabled === false)
      return { success: false, reason: "quest_system_disabled" };
    if (
      !participants.length ||
      participants.some((entry) => this.forPlayer(entry.playerId))
    )
      return { success: false, reason: "team_fort_already_started" };
    if (game.inventoryService.getHeroBagState(recipient).freeSlots < 1)
      return { success: false, reason: "hero_bag_full" };
    const count = simulatedCount ?? participants.length;
    const plan = teamFortPreparation(count);
    const position = campPosition(game, origin);
    if (!position) return { success: false, reason: "team_fort_no_space" };
    const id = `team-fort-${recipient.playerId}`;
    const camp = new Location({
      id,
      name: "Camp du rempart",
      type: "camp",
      source: "team-quest",
      position,
      visibility: "visible",
      ownerId: recipient.playerId,
      controllerId: recipient.playerId,
      interactionRadius: game.coordinateMode === "simulation" ? 5 : 25,
      detectionRadius: game.coordinateMode === "simulation" ? 15 : 100,
      level: 3,
      population: 12,
      populationCapacity: 25,
      defenseSlots: 2,
      features: { garrison: true, upgradeable: true, resourceProduction: true },
      infrastructure: plan.infrastructure,
      resources: { stock: plan.stock, storageCapacity: 500 },
    });
    game.locationProgressionService.initialize(camp);
    game.campImprovementService.applyEffects(camp);
    camp.progression.experience =
      game.locationProgressionService.getExperienceRequired(camp);
    const quest = {
      id,
      title: TEAM_FORT_TITLE,
      status: "active",
      locationId: camp.id,
      playerIds: participants.map((entry) => entry.playerId),
      heroIds: participants.map((entry) => entry.id),
      recipientHeroId: recipient.id,
      controllerId: recipient.playerId,
      participantCount: count,
      localTest: simulatedCount !== null,
      startedAt: game.now(),
      completedAt: null,
      reward: null,
    };
    recipient.addCarriedLoot([
      {
        id: `${id}-writ`,
        itemId: AUTHORITY_WRIT_ID,
        quantity: 1,
        valuePerUnit: 1,
      },
    ]);
    game.locations.push(camp);
    this.quests.push(quest);
    for (const playerId of quest.playerIds)
      game.getPlayer(playerId)?.discoverLocation(camp.id, 3);
    return {
      success: true,
      quest,
      lines: [
        "Mission acceptée. Le camp est indiqué dans votre journal.",
        this.briefing(count),
        "Équipez le Mandat d’autorité dans Héros → Accessoire avant d’acheminer les lanciers.",
      ],
    };
  }

  check(game) {
    if (game.questSystemEnabled === false) return [];
    for (const quest of this.quests) {
      if (quest.status !== "active") continue;
      const camp = game.getLocation(quest.locationId);
      if (!camp || (camp.controllerId ?? camp.ownerId) !== quest.controllerId)
        continue;
      const unit = camp.garrison.units.find(
        (entry) =>
          entry.typeId === "spearman" &&
          entry.rank === "soldier" &&
          entry.quantity === entry.maxQuantity &&
          entry.state === "active",
      );
      if (camp.type !== "fort" || !unit) continue;
      quest.status = "completed";
      quest.completedAt = game.now();
      quest.reward = teamFortReward(quest.completedAt - quest.startedAt);
      // State changes first: reconnects and repeated checks cannot pay twice.
      for (const heroId of quest.heroIds) {
        const hero = game.getHero(heroId);
        if (!hero) continue;
        hero.addResource("gold", quest.reward.gold);
        game.gainHeroExperience({
          heroId,
          amount: quest.reward.experience,
          source: "team-fort",
        });
      }
      game.eventLog.push({
        type: "team_fort_completed",
        questId: quest.id,
        at: quest.completedAt,
      });
    }
  }
}

export function teamFortPreparation(count) {
  if (!Number.isInteger(count) || count < 2 || count > 64)
    throw new RangeError("Effectif attendu : 2 à 64 joueurs.");
  const infrastructure = {
    housing: 2,
    depot: 2,
    barricades: count <= 2 ? 3 : 2,
    watch_post: count <= 2 ? 2 : count <= 4 ? 1 : 0,
  };
  const stock =
    count <= 2
      ? { wood: 25, stone: 15, iron: 5, gold: 15 }
      : count <= 4
        ? { wood: 15, stone: 10, gold: 15 }
        : { gold: 15 };
  const remainingCosts = { ...CAMP_EVOLUTION_BRANCHES.fort.costs };
  for (const [id, target] of [
    ["barricades", 3],
    ["watch_post", 2],
  ]) {
    for (let level = infrastructure[id]; level < target; level++) {
      for (const [resource, amount] of Object.entries(
        CAMP_IMPROVEMENTS[id].levels[level].costs,
      ))
        remainingCosts[resource] = (remainingCosts[resource] ?? 0) + amount;
    }
  }
  for (const [resource, amount] of Object.entries(stock))
    remainingCosts[resource] = Math.max(0, remainingCosts[resource] - amount);
  return { infrastructure, stock, remainingCosts };
}

export function teamFortReward(elapsedMs) {
  const bonus = Math.max(0, 1 - Math.max(0, elapsedMs) / (30 * 60_000));
  return {
    gold: 20 + Math.floor(20 * bonus),
    experience: 100 + Math.floor(100 * bonus),
  };
}

function campPosition(game, origin) {
  const spacing = new LocationSpacingPolicy({ setup: game.setup, coordinateMode: game.coordinateMode });
  const camp = { id: "team-fort-candidate", type: "camp", interactionRadius: 25 };
  const occupied = placedLocations(game);
  for (const radius of game.coordinateMode === "simulation"
    ? [18, 12, 8]
    : [0.0015, 0.001, 0.0006]) {
    for (let step = 0; step < 16; step++) {
      const angle = (step * Math.PI) / 8;
      const position = {
        latitude: origin.latitude + Math.sin(angle) * radius,
        longitude: origin.longitude + Math.cos(angle) * radius,
      };
      if (!game.setup.playArea.allowsPlacement(position) || !spacing.check(camp, position, occupied).success) continue;
      if (game.coordinateMode === "simulation") {
        if (Object.values(position).every((value) => value >= 5 && value <= 95))
          return position;
      } else if (game.setup.playArea.allowsPlacement(position)) return position;
    }
  }
  return null;
}

/** Explicit solo fixture, never exposed as a server command. Supplies still need transport. */
export function startLocalTeamFortTest(
  game,
  { heroId, participantCount, position },
) {
  const hero = game.getHero(heroId);
  const humanParticipants = game.setup.participants.filter(
    (entry) =>
      !game.locationAccessPolicy.enemyControllerIds.has(entry.playerId),
  );
  if (
    !hero ||
    humanParticipants.length !== 1 ||
    humanParticipants[0].playerId !== hero.playerId ||
    game.coordinateMode !== "simulation"
  )
    return { success: false, reason: "local_simulation_only" };
  const definition = game.unitDefinitions.get("spearman");
  if (!definition) return { success: false, reason: "spearman_unavailable" };
  const result = game.teamFortQuestService.start(game, {
    participants: [hero],
    recipient: hero,
    origin: position,
    simulatedCount: participantCount,
  });
  if (!result.success) return result;
  const depot = new Location({
    id: `${result.quest.id}-supplies`,
    name: "Dépôt de test — ressources et lanciers",
    type: "village",
    source: "team-quest-test",
    position,
    visibility: "visible",
    ownerId: hero.playerId,
    controllerId: hero.playerId,
    population: 30,
    populationCapacity: 40,
    defenseSlots: 3,
    interactionRadius: 5,
    detectionRadius: 15,
    heroIds: [hero.id],
    features: { garrison: true, resourceProduction: true },
    resources: {
      stock: teamFortPreparation(participantCount).remainingCosts,
      storageCapacity: 500,
    },
    garrison: {
      units: [
        new Unit({
          id: `${result.quest.id}-spearmen`,
          ownerPlayerId: hero.playerId,
          typeId: "spearman",
          rank: "soldier",
          quantity: 6,
          healthPerSoldier: definition.stats?.healthPerSoldier ?? 11,
        }).toJSON(),
      ],
    },
  });
  game.locations.push(depot);
  game.getPlayer(hero.playerId)?.discoverLocation(depot.id, 3);
  result.quest.supplyLocationId = depot.id;
  return result;
}
