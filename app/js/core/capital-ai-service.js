import { Hero } from "./hero.js";
import { Unit } from "./unit.js";
import { Army } from "./army.js";
import { AutonomousGroup } from "./autonomous-group.js";
import { HERO_EQUIPMENT_SLOTS } from "./equipment-service.js";
import { totalXpForLevel } from "./hero-progression-config.js";
import {
  maximumAuthority,
  usedAuthority,
  unitAuthorityCost,
} from "./authority-system.js";
import { UNIT_RANKS } from "./rank-system.js";
import { distanceMeters } from "./geo.js";
import {
  LocationSpacingPolicy,
  placedLocations,
} from "./location-spacing-policy.js";

export const CAPITAL_BOSS_ID = "capital-marshal";
export const CAPITAL_RESOURCES = ["gold", "iron", "wood", "stone"];
const ACTIVE = new Set([
  "idle",
  "traveling",
  "arrived",
  "interrupted",
  "ambushing",
]);

/** Économie et décisions de la capitale. Les stocks, trajets et combats restent ceux du moteur. */
export class CapitalAiService {
  initialize(game) {
    if (
      !game.worldState.get("capitalAi.enabled") ||
      game.worldState.get("capitalAi.initialized")
    )
      return;
    const capital = game.getLocationForScenarioSlot("capital");
    if (
      !capital ||
      !game.heroClasses.has("warrior") ||
      !game.unitDefinitions.has("heavy-cavalry")
    )
      return;
    capital.ownerId = capital.controllerId = "kingdom";
    this.placeEconomy(game, capital);
    capital.garrison = new Army({
      units: ["heavy-cavalry", "heavy-infantry", "heavy-infantry"].map(
        (typeId, index) =>
          this.unit(
            game,
            `capital-guard-${index}`,
            typeId,
            "kingdom",
            "warrant-officer",
          ),
      ),
    });
    const boss = this.createHero(
      game,
      CAPITAL_BOSS_ID,
      "warrior",
      15,
      "kingdom",
    );
    boss.name = "Maréchal Aldren";
    boss.position = { ...capital.position };
    boss.equipment = Object.fromEntries(
      HERO_EQUIPMENT_SLOTS.map(({ id }) => [id, `royal_boss_${id}`]),
    );
    game.equipmentService.recalculateModifiers(boss);
    boss.maxCommandPoints = boss.commandPoints = boss.finalStats.command;
    // Une unité de chaque type lourd, dans les limites d'autorité et de grade.
    this.fillArmy(game, boss, ["heavy-cavalry", "heavy-infantry"]);
    game.heroes.push(boss);
    capital.addHero(boss.id);
    game.worldState.set("capitalAi.initialized", true);
    game.worldState.set("capitalAi.nextDecisionAt", game.now());
    game.worldState.set("capitalAi.serial", 0);
    this.ensureConvoys(game, capital);
  }

  createHero(game, id, classId, level, playerId) {
    const definition = game.heroClasses.get(classId);
    const hero = new Hero({
      id,
      name: `${definition.name} du Chaos`,
      playerId,
      classId,
      baseStats: definition.baseStats,
      maxCommandPoints: definition.baseStats.command,
    });
    game.heroProgressionService.initializeHero(hero, definition);
    if (level > 1)
      game.heroProgressionService.addExperience(
        hero,
        totalXpForLevel(level),
        "capital_recruitment",
        definition,
      );
    while (hero.level < level) {
      const result = game.heroProgressionService.levelUp(
        hero,
        definition,
        "capital_recruitment",
      );
      if (!result.success) break;
      const pending = hero.pendingLevelUps[0];
      if (pending?.proposals.length)
        game.heroProgressionService.selectUpgrade(
          hero,
          pending.id,
          pending.proposals[0].id,
        );
      else hero.pendingLevelUps = [];
    }
    hero.health = hero.maxHealth;
    return hero;
  }

  economicRadius(game) {
    const ratio = game.worldState.get("capitalAi.resourceRadiusRatio", 0.5);
    const maximum = game.worldState.get(
      "capitalAi.resourceRadiusMaximumMeters",
      600,
    );
    if (
      !Number.isFinite(ratio) ||
      ratio <= 0 ||
      ratio > 1 ||
      !Number.isFinite(maximum) ||
      maximum <= 0
    )
      throw new RangeError(
        "Le ratio économique doit être entre zéro et un et son plafond positif.",
      );
    const area = game.setup.playArea;
    if (game.coordinateMode !== "simulation")
      return Math.min(
        maximum,
        Math.sqrt(area.getAreaSquareMeters() / Math.PI) * ratio,
      );
    // La carte fictive utilise des coordonnées planes, pas des degrés GPS.
    const polygonArea = (polygon) => {
      const origin = polygon[0];
      let twiceArea = 0;
      for (let index = 0; index < polygon.length; index++) {
        const point = polygon[index],
          next = polygon[(index + 1) % polygon.length];
        twiceArea +=
          (point.longitude - origin.longitude) *
            (next.latitude - origin.latitude) -
          (next.longitude - origin.longitude) *
            (point.latitude - origin.latitude);
      }
      return Math.abs(twiceArea) / 2;
    };
    const surface = Math.max(
      0,
      polygonArea(area.polygon) -
        (area.excludedPolygons ?? []).reduce(
          (sum, polygon) => sum + polygonArea(polygon),
          0,
        ),
    );
    return Math.sqrt(surface / Math.PI) * ratio;
  }

  placeEconomy(game, capital) {
    const radius = this.economicRadius(game);
    const spacing = new LocationSpacingPolicy({
      setup: game.setup,
      coordinateMode: game.coordinateMode,
    });
    const placements = [];
    const manualPosition = (location) => {
      const slotId =
        game.scenarioLocationBindings.find((b) => b.locationId === location.id)
          ?.locationSlotId ?? location.id;
      const config = game.setup.locationSetup.placements?.[slotId];
      return config?.strategy === "fixed" && config.position
        ? config.position
        : null;
    };
    const occupied = placedLocations(game).filter(
      (location) =>
        (!location.roles.includes("capital-economy") ||
          manualPosition(location)) &&
        location.state !== "destroyed",
    );
    CAPITAL_RESOURCES.forEach((resource, index) => {
      const mine = game.getLocation(`capital-resource-${resource}`);
      const village = game.getLocation(`capital-resource-${resource}-village`);
      if (!mine || !village) return;
      const direction = 45 + index * 90;
      const position =
        manualPosition(mine) ??
        this.nearPosition(
          game,
          capital.position,
          radius,
          direction,
          occupied,
          mine,
        );
      placements.push({ locationId: mine.id, position });
      occupied.push({ ...mine, position });
      const nearby =
        manualPosition(village) ??
        this.nearPosition(
          game,
          position,
          Math.max(
            spacing.requiredDistance(mine, village) * 1.1,
            Math.min(
              game.coordinateMode === "simulation" ? 8 : 180,
              radius * 0.28,
            ),
          ),
          direction + 90,
          occupied,
          village,
        );
      placements.push({ locationId: village.id, position: nearby });
      occupied.push({ ...village, position: nearby });
    });
    const result = game.updateLocationPositions(placements);
    if (!result.success)
      throw new RangeError(
        `Placement de l’économie refusé : ${result.reason}.`,
      );
  }

  nearPosition(game, origin, radius, direction, occupied, location = null) {
    const spacing = new LocationSpacingPolicy({
      setup: game.setup,
      coordinateMode: game.coordinateMode,
    });
    for (let scale = 1; scale > 0.00001; scale /= 2) {
      for (let turn = 0; turn < 12; turn++) {
        const angle = ((direction + turn * 30) * Math.PI) / 180;
        const metersPerLatitude =
          game.coordinateMode === "simulation" ? 1 : 111320;
        const metersPerLongitude =
          game.coordinateMode === "simulation"
            ? 1
            : 111320 * Math.cos((origin.latitude * Math.PI) / 180);
        const position = {
          latitude:
            origin.latitude +
            (Math.cos(angle) * radius * scale) / metersPerLatitude,
          longitude:
            origin.longitude +
            (Math.sin(angle) * radius * scale) / metersPerLongitude,
        };
        if (
          Number.isFinite(position.latitude) &&
          Number.isFinite(position.longitude) &&
          Math.abs(position.latitude) <= 90 &&
          Math.abs(position.longitude) <= 180 &&
          game.setup.playArea.allowsPlacement(position) &&
          (!location || spacing.check(location, position, occupied).success) &&
          occupied.every(
            (point) =>
              this.distance(game, point.position ?? point, position) >
              radius * scale * 0.2,
          )
        )
          return position;
      }
    }
    throw new RangeError(
      "La zone est trop étroite pour placer l’économie de la capitale.",
    );
  }

  unit(game, id, typeId, ownerPlayerId, rank = "soldier", quantity = null) {
    const definition = game.unitDefinitions.get(typeId);
    const grade = UNIT_RANKS.find((entry) => entry.id === rank);
    return new Unit({
      id,
      typeId,
      ownerPlayerId,
      rank,
      experience: grade.experience,
      quantity: quantity ?? grade.capacity,
      healthPerSoldier: definition.stats.healthPerSoldier,
      combatHealthThreshold: definition.stats.combatHealthThreshold,
    });
  }

  fillArmy(game, hero, types) {
    const authority = maximumAuthority(
      hero,
      game.heroClasses.get(hero.classId),
    );
    for (const type of types.slice(0, hero.maxUnitStacks)) {
      if (!game.unitDefinitions.has(type)) continue;
      const unit = this.unit(game, `${hero.id}-${type}`, type, hero.playerId);
      if (
        usedAuthority(hero, game.unitDefinitions) +
          unitAuthorityCost(unit, game.unitDefinitions) <=
        authority
      )
        hero.addUnit(unit);
    }
    // Promouvoir uniformément sans dépasser le budget d'autorité du héros.
    for (const grade of UNIT_RANKS.slice(1)) {
      for (let index = 0; index < hero.army.units.length; index++) {
        const old = hero.army.units[index];
        const replacement = this.unit(
          game,
          old.id,
          old.typeId,
          hero.playerId,
          grade.id,
        );
        const cost =
          usedAuthority(hero, game.unitDefinitions) -
          unitAuthorityCost(old, game.unitDefinitions) +
          unitAuthorityCost(replacement, game.unitDefinitions);
        if (cost <= authority) hero.army.units[index] = replacement;
      }
    }
  }

  turnHostile(game) {
    this.initialize(game);
    if (
      !game.worldState.get("capitalAi.initialized") ||
      game.worldState.get("capitalAi.hostile")
    )
      return false;
    const capital = game.getLocationForScenarioSlot("capital");
    for (const location of game.locations.filter(
      (entry) =>
        entry.id === capital.id || entry.roles.includes("capital-economy"),
    )) {
      if ((location.controllerId ?? location.ownerId) !== "kingdom") continue;
      location.ownerId = location.controllerId = "chaos";
      location.features.capturable = location.features.battle = true;
      location.garrison.units.forEach((unit) => {
        unit.ownerPlayerId = "chaos";
      });
    }
    const boss = game.getHero(CAPITAL_BOSS_ID);
    boss.playerId = "chaos";
    boss.army.units.forEach((unit) => {
      unit.ownerPlayerId = "chaos";
    });
    for (const group of game.autonomousGroups.filter(
      (entry) =>
        entry.originLocationId === capital.id && entry.owner.id === "kingdom",
    )) {
      group.owner.id = group.factionId = "chaos";
      group.army.units.forEach((unit) => {
        unit.ownerPlayerId = "chaos";
      });
    }
    game.worldState.set("capitalAi.hostile", true);
    game.eventLog.push({
      type: "capital_corrupted",
      locationId: capital.id,
      at: game.now(),
    });
    return true;
  }

  ensureConvoys(game, capital) {
    const radius = this.economicRadius(game);
    const destinations = game.locations.filter(
      (location) =>
        location.id !== capital.id &&
        location.state !== "destroyed" &&
        location.ownerId === capital.ownerId &&
        (location.roles.includes("capital-economy") ||
          this.distance(game, capital.position, location.position) <= radius),
    );
    for (const destination of destinations) {
      for (const [resourceId, production] of Object.entries(
        destination.resources.production,
      )) {
        if (!(production > 0) || !CAPITAL_RESOURCES.includes(resourceId))
          continue;
        if (
          game.autonomousGroups.some(
            (group) =>
              group.originLocationId === capital.id &&
              group.mission?.destinationLocationId === destination.id &&
              group.mission?.resourceId === resourceId &&
              group.mission?.active !== false &&
              ACTIVE.has(group.status),
          )
        )
          continue;
        const escortCosts = game.unitDefinitions.get("militia")?.costs;
        if (!escortCosts) continue;
        const totalCosts = { ...game.tradingConvoyService.config.creationCost };
        for (const [id, amount] of Object.entries(escortCosts))
          totalCosts[id] = (totalCosts[id] ?? 0) + amount;
        if (
          Object.entries(totalCosts).some(
            ([id, amount]) => (capital.resources.stock[id] ?? 0) < amount,
          )
        )
          continue;
        const result = game.tradingConvoyService.create({
          locations: game.locations,
          playerId: capital.ownerId,
          originLocationId: capital.id,
          destinationLocationId: destination.id,
          resourceId,
          coordinateMode: game.coordinateMode,
          now: game.now(),
        });
        if (result.success) {
          spend(capital.resources.stock, escortCosts);
          result.group.army.addUnit(
            this.unit(
              game,
              `${result.group.id}-escort`,
              "militia",
              capital.ownerId,
              "soldier",
              1,
            ),
          );
          game.autonomousGroups.push(result.group);
        }
      }
    }
  }

  update(game, now) {
    if (game.questSystemEnabled === false) return;
    if (game.worldState.get("capitalAi.defeated")) {
      if (game.status === "started") game.finish("capital_liberated");
      return;
    }
    this.initialize(game);
    if (!game.worldState.get("capitalAi.initialized")) return;
    const capital = game.getLocationForScenarioSlot("capital");
    if (
      capital.state === "destroyed" ||
      !["kingdom", "chaos"].includes(capital.controllerId ?? capital.ownerId)
    )
      return;
    if (now < game.worldState.get("capitalAi.nextDecisionAt", 0)) return;
    game.worldState.set("capitalAi.nextDecisionAt", now + 30_000);
    this.ensureConvoys(game, capital);
    if (!game.worldState.get("capitalAi.hostile")) return;
    const groups = game.autonomousGroups.filter(
      (group) =>
        group.originLocationId === capital.id &&
        group.type === "army" &&
        ACTIVE.has(group.status),
    );
    for (const group of groups) {
      // Une cible déjà capturée ne doit pas immobiliser une seconde armée.
      const inBattle = game.battles.some(
        (battle) =>
          battle.status !== "finished" &&
          battle.teams.some((team) =>
            team.heroes.some(
              (hero) => hero.sourceId === `autonomous-group-${group.id}`,
            ),
          ),
      );
      if (
        group.status === "interrupted" &&
        group.interruption === null &&
        !inBattle
      )
        group.status = "idle";
      if (!inBattle) this.assignMission(game, group);
    }
    const serial = game.worldState.get("capitalAi.serial", 0);
    // Alterner construction et recrutement réserve une part aux deux usages.
    const defenseTurn = game.worldState.get("capitalAi.defenseTurn", true);
    game.worldState.set("capitalAi.defenseTurn", !defenseTurn);
    if (defenseTurn) {
      this.improveDefense(game, capital);
      return;
    }
    if (groups.length >= 4) return;
    const players = game.heroes.filter(
      (hero) =>
        game.getPlayer(hero.playerId) &&
        !game.locationAccessPolicy.enemyControllerIds.has(hero.playerId) &&
        hero.state === "active",
    );
    if (!players.length) return;
    const level = Math.max(
      1,
      Math.min(
        20,
        Math.round(
          players.reduce((sum, hero) => sum + hero.level, 0) / players.length,
        ),
      ),
    );
    const classes = ["warrior", "ranger", "mage"].filter((id) =>
      game.heroClasses.has(id),
    );
    const commander = this.createHero(
      game,
      `capital-captain-${serial}`,
      classes[serial % classes.length],
      level,
      "chaos",
    );
    const preferences =
      commander.classId === "mage"
        ? ["militia", "archer", "spearman"]
        : commander.classId === "ranger"
          ? ["archer", "militia", "light-cavalry"]
          : ["spearman", "militia", "heavy-infantry"];
    this.fillArmy(game, commander, preferences);
    if (!commander.army.units.length) return;
    const costs = { gold: 20 + level * 5 };
    for (const unit of commander.army.units)
      for (const [resource, amount] of Object.entries(
        game.unitDefinitions.get(unit.typeId).costs,
      ))
        costs[resource] = (costs[resource] ?? 0) + amount * unit.quantity;
    if (!spend(capital.resources.stock, costs)) return;
    const group = new AutonomousGroup({
      id: `capital-army-${serial}`,
      type: "army",
      owner: { kind: "faction", id: "chaos" },
      factionId: "chaos",
      originLocationId: capital.id,
      position: capital.position,
      behavior: "aggressive",
      army: commander.army,
      commander: { ...commander.toJSON(), army: { units: [] } },
    });
    game.autonomousGroups.push(group);
    game.worldState.set("capitalAi.serial", serial + 1);
    this.assignMission(game, group);
    game.eventLog.push({
      type: "capital_army_recruited",
      groupId: group.id,
      classId: commander.classId,
      level,
      costs,
      at: now,
    });
  }

  assignMission(game, group) {
    if (!["idle", "arrived", "mission_failed"].includes(group.status)) return;
    const nearby = game.locations.find(
      (location) =>
        location.ownerId === "chaos" &&
        location.state !== "destroyed" &&
        this.distance(game, group.position, location.position) < 2 &&
        location.id !== group.originLocationId,
    );
    if (
      nearby &&
      nearby.garrison.units.length < Math.max(1, nearby.defenseSlots) &&
      group.army.units.length > 0
    ) {
      nearby.garrison.addUnit(group.army.units.pop());
      game.eventLog.push({
        type: "capital_garrison_reinforced",
        locationId: nearby.id,
        groupId: group.id,
        at: game.now(),
      });
      if (!group.army.units.length) {
        group.status = "completed";
        group.mission = null;
        return;
      }
    }
    const candidates = game.locations.filter(
      (location) =>
        location.state !== "destroyed" &&
        game.getPlayer(location.controllerId ?? location.ownerId) &&
        game.locationAccessPolicy.canCapture("chaos", location),
    );
    const heroes = game.heroes.filter(
      (hero) =>
        hero.state === "active" &&
        hero.position &&
        game.getPlayer(hero.playerId) &&
        !game.locationAccessPolicy.enemyControllerIds.has(hero.playerId),
    );
    const targets = [
      ...candidates.map((location) => ({
        targetId: location.id,
        kind: "attack_location",
        position: location.position,
      })),
      ...heroes.map((hero) => ({
        targetId: hero.id,
        kind: "pursue",
        position: hero.position,
      })),
    ].sort(
      (a, b) =>
        this.distance(game, group.position, a.position) -
        this.distance(game, group.position, b.position),
    );
    const target = targets[0];
    if (!target) return;
    group.status = "idle";
    group.mission = {
      kind: target.kind,
      targetId: target.targetId,
      coordinateMode: game.coordinateMode,
      speedMetersPerSecond: 1.2,
    };
  }

  improveDefense(game, capital) {
    const locations = game.locations
      .filter(
        (location) =>
          location.ownerId === "chaos" &&
          location.state !== "destroyed" &&
          (location.id === capital.id ||
            location.roles.includes("capital-economy") ||
            game.eventLog.some(
              (entry) =>
                entry.type === "location_captured" &&
                entry.locationId === location.id,
            )),
      )
      .sort((a, b) => (a.defenseBonus ?? 0) - (b.defenseBonus ?? 0));
    for (const location of locations) {
      if (
        location.improvements.filter((entry) =>
          entry.id.startsWith("capital-defense-"),
        ).length >= 3
      )
        continue;
      const costs = { wood: 15, stone: 10, iron: 3 };
      if (!spend(capital.resources.stock, costs)) return;
      location.improvements.push({
        id: `capital-defense-${location.improvements.length}`,
        type: "defense",
        defenseBonus: 2,
        militiaCapacityBonus: 0,
        destroyed: false,
      });
      location.defenseSlots = Math.max(location.defenseSlots, 2);
      game.eventLog.push({
        type: "capital_defense_built",
        locationId: location.id,
        costs,
        at: game.now(),
      });
      return;
    }
  }

  distance(game, first, second) {
    return game.coordinateMode === "simulation"
      ? Math.hypot(
          first.latitude - second.latitude,
          first.longitude - second.longitude,
        )
      : distanceMeters(first, second);
  }
}

function spend(stock, costs) {
  if (Object.entries(costs).some(([id, amount]) => (stock[id] ?? 0) < amount))
    return false;
  for (const [id, amount] of Object.entries(costs))
    stock[id] = (stock[id] ?? 0) - amount;
  return true;
}
