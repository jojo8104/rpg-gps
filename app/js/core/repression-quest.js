import { astralTargetInReach } from "./astral-interaction.js";
import { AutonomousGroup } from "./autonomous-group.js";
import { distanceMeters } from "./geo.js";

const PROVOST = "repression-provost";
const KNIGHT = "repression-knight";
const RETURN_PHASES = new Set([
  "return-journey",
  "return-after-investigation",
  "repression-failed-return",
]);
const flag = (game, key) => game.worldState.get(`repression.${key}`);
const set = (game, key, value) =>
  game.worldState.set(`repression.${key}`, value);
const location = (game, slot) =>
  game.scenarioLocationBindings.some((b) => b.locationSlotId === slot)
    ? game.getLocationForScenarioSlot(slot)
    : null;

/** Règles de La Répression : aucun accès au DOM, état sauvegardé dans WorldState. */
export const RepressionQuest = {
  enabled(game) {
    return (
      game.questSystemEnabled !== false &&
      Boolean(game.scenario?.getPhase("repression-prison"))
    );
  },
  actor(game) {
    return (
      game.getHero(game.activeQuestActorId) ??
      game.heroes.find((h) => game.getPlayer(h.playerId))
    );
  },
  distance(game, a, b) {
    return game.coordinateMode === "simulation"
      ? Math.hypot(a.latitude - b.latitude, a.longitude - b.longitude)
      : distanceMeters(a, b);
  },
  offset(game, origin, meters, degrees) {
    const angle = (degrees * Math.PI) / 180;
    const scale = game.coordinateMode === "simulation" ? 1 : 111320;
    return {
      latitude: origin.latitude + (Math.cos(angle) * meters) / scale,
      longitude:
        origin.longitude +
        (Math.sin(angle) * meters) /
          (scale *
            (scale === 1 ? 1 : Math.cos((origin.latitude * Math.PI) / 180))),
    };
  },
  placement(game, slot, position) {
    if (!this.enabled(game) || slot !== "seditious-village")
      return { success: true };
    const village = location(game, slot);
    const capital = location(game, "capital");
    const minimum =
      game.coordinateMode === "simulation"
        ? 15
        : game.setup.rules.travelPaceMode === "sport"
          ? 150
          : 75;
    if (capital && this.distance(game, position, capital.position) < minimum)
      return { success: false, reason: "provost_too_close_to_capital" };
    const occupied = game.locations.filter(
      (l) => l.id !== village.id && l.visibility !== "hidden",
    );
    const spacing = game.coordinateMode === "simulation" ? 5 : 50;
    if (
      occupied.some((l) => this.distance(game, position, l.position) < spacing)
    )
      return { success: false, reason: "provost_requires_50m_spacing" };
    const separation = game.coordinateMode === "simulation" ? 6 : 30;
    const next = Array.from({ length: 24 }, (_, i) =>
      this.offset(game, position, separation, i * 15),
    ).find(
      (p) =>
        game.setup.playArea.allowsPlacement(p) &&
        occupied.every((l) => this.distance(game, p, l.position) >= spacing),
    );
    return next
      ? { success: true, villagePosition: next }
      : { success: false, reason: "no_room_for_provost_and_village" };
  },
  spawn(game) {
    if (game.getAutonomousGroup(PROVOST)) return;
    const village = location(game, "seditious-village");
    const origin = flag(game, "provostPosition") ?? village.position;
    village.setOwner(null);
    village.setController(null);
    const commander = (id, playerId, name) => ({
      id,
      playerId,
      name,
      maxCommandPoints: 6,
      baseStats: {
        attack: 6,
        defense: 6,
        morale: 5,
        mobility: 1,
        command: 6,
        health: 30,
      },
    });
    game.addAutonomousGroup(
      new AutonomousGroup({
        id: PROVOST,
        type: "army",
        owner: { kind: "faction", id: "kingdom" },
        factionId: "kingdom",
        position: origin,
        behavior: "passive",
        mission: { kind: "guard", questId: "repression" },
        commander: commander("royal_provost", "kingdom", "Le prévôt royal"),
        army: {
          units: [
            {
              id: "provost-heavy-infantry",
              ownerPlayerId: "kingdom",
              typeId: "heavy-infantry",
              rank: "sergeant",
              quantity: 14,
            },
          ],
        },
      }),
    );
    game.addAutonomousGroup(
      new AutonomousGroup({
        id: KNIGHT,
        type: "army",
        owner: { kind: "independent", id: "ruined_knight" },
        position: village.position,
        behavior: "passive",
        status: "garrisoned",
        mission: { kind: "guard", questId: "repression" },
        commander: commander(
          "ruined_knight",
          "ruined_knight",
          "Le chevalier de Montfaucon",
        ),
        army: village.garrison.toJSON(),
      }),
    );
    // La garnison reste la source persistante unique des miliciens.
    game.getAutonomousGroup(KNIGHT).army = village.garrison;
  },
  actionAllowed(game, locationId, action) {
    if (
      !this.enabled(game) ||
      location(game, "seditious-village")?.id !== locationId
    )
      return null;
    const phase = game.scenarioState.currentPhaseId;
    if (
      [
        "locate-village",
        "village-arrival",
        "arrival",
        "knight-conversation",
        "negotiation",
      ].includes(phase)
    )
      return false;
    if (["royal-assault", "village-defense"].includes(phase))
      return action === "attack";
    return null;
  },
  choiceAllowed(game, id, hero) {
    if (!this.enabled(game)) return true;
    if (id === "TALK_PROVOST") {
      const group = game.getAutonomousGroup(PROVOST);
      return Boolean(
        hero?.state === "active" &&
          group &&
          hero.position &&
          (this.distance(game, hero.position, group.position) <=
            (game.coordinateMode === "simulation" ? 8 : 18) ||
            astralTargetInReach(game, hero, "group", group)),
      );
    }
    if (
      [
        "ASSAULT_VILLAGE",
        "NEGOTIATE",
        "ULTIMATUM",
        "INVESTIGATE",
        "SUPPORT_PROVOST",
        "DEFEND_VILLAGE",
        "STAND_ASIDE",
      ].includes(id)
    ) {
      const village = location(game, "seditious-village");
      return Boolean(
        hero?.state === "active" &&
          hero.position &&
          village &&
          (this.distance(game, hero.position, village.position) <=
            village.interactionRadius ||
            astralTargetInReach(game, hero, "location", village)),
      );
    }
    return true;
  },
  effect(game, action) {
    const hero = this.actor(game);
    if (action === "spawn") this.spawn(game);
    if (action === "ambush" && hero) {
      const total = hero.army.units.reduce((n, u) => n + u.quantity, 0);
      let wounds = Math.min(Math.max(0, total - 1), Math.ceil(total * 0.25));
      const first = hero.army.units.find((u) => u.quantity > 0);
      if (first) first.lose(1);
      for (const unit of hero.army.units)
        for (let i = 0; i < unit.soldierHealth.length && wounds > 0; i++) {
          if (unit.soldierHealth[i] > unit.combatHealthThreshold) {
            unit.soldierHealth[i] = Math.max(1, unit.combatHealthThreshold);
            wounds--;
          }
        }
      set(game, "ambushLosses", {
        dead: total > 0 ? 1 : 0,
        wounded:
          Math.min(Math.max(0, total - 1), Math.ceil(total * 0.25)) - wounds,
      });
    }
    if (action === "failed-assault" || action === "failed-defense") {
      set(game, "missionFailed", true);
      set(game, "prisonRequired", true);
      if (hero && action === "failed-defense")
        hero.setBattleState({ health: 0, state: "ghost" });
      const placement = game.scenarioRuntime?.placements["attacked-convoy"];
      if (placement) placement.status = "cancelled";
    }
    if (action === "ignore-convoy") {
      const convoy = location(game, "attacked-convoy");
      convoy.visibility = "hidden";
      convoy.state = "dismissed";
      set(game, "convoyDismissed", true);
    }
    if (action === "return") {
      const village = location(game, "seditious-village"),
        capital = location(game, "capital");
      const placement = game.scenarioRuntime?.placements["attacked-convoy"];
      if (placement) {
        placement.minimumDistanceMeters = Math.max(
          0.01,
          this.distance(game, village.position, capital.position) * 0.25,
        );
        placement.confirmations = 1;
      }
      if (flag(game, "provostDefeated")) {
        village.setOwner(null);
        village.setController(null);
        set(game, "prisonRequired", true);
      }
      for (const id of [PROVOST, KNIGHT]) {
        const group = game.getAutonomousGroup(id);
        if (group) group.status = "resolved";
      }
    }
    if (action === "report") set(game, "reportPresented", true);
    return { type: "repression_effect", action };
  },
  preparePlacements(game) {
    if (!this.enabled(game) || game.coordinateMode !== "simulation") return;
    const placement = game.scenarioRuntime?.placements["seditious-village"];
    if (placement && !placement.simulationScaled) {
      placement.minimumDistanceMeters /= 10;
      placement.minimumDistanceFromOriginMeters /= 10;
      placement.simulationScaled = true;
    }
  },
  blocksRevival(game, hero) {
    return Boolean(
      this.enabled(game) &&
        hero &&
        !flag(game, "released") &&
        (hero.classFeatureState.repressionPrisoner ||
          flag(game, "prisonRequired")),
    );
  },
  updatePlacements(game, updates, position) {
    if (!this.enabled(game)) return updates;
    const convoy = updates.find((u) => u.slotId === "attacked-convoy");
    if (convoy && game.scenarioState.currentPhaseId !== "return-journey")
      return updates.filter((u) => u !== convoy);
    if (
      convoy?.status === "ready" &&
      !flag(game, "missionFailed") &&
      !flag(game, "convoyDismissed")
    ) {
      const result = game.placeScenarioLocation({
        locationSlotId: "attacked-convoy",
        position,
      });
      if (result.success) convoy.quest = result.quest;
    }
    return updates;
  },
  arrival(game, event) {
    if (
      !this.enabled(game) ||
      event.type !== "LocationEntered" ||
      event.locationId !== location(game, "capital")?.id
    )
      return;
    const phase = game.scenarioState.currentPhaseId;
    if (!RETURN_PHASES.has(phase) && phase !== "repression-prison") return;
    const hero = game.getHero(event.actorId) ?? this.actor(game);
    if (!hero) return;
    const returned = [...(flag(game, "returnedPlayerIds") ?? [])];
    if (!returned.includes(hero.playerId)) returned.push(hero.playerId);
    set(game, "returnedPlayerIds", returned);
    if (
      flag(game, "prisonRequired") &&
      !hero.classFeatureState.repressionPrisoner
    ) {
      hero.resources = {};
      hero.carriedLoot = [];
      hero.equipment = {};
      hero.equipmentModifiers = Object.fromEntries(
        Object.keys(hero.equipmentModifiers).map((key) => [key, 0]),
      );
      hero.wagons = [];
      hero.army.units = [];
      for (const l of game.locations)
        l.garrison.units = l.garrison.units.filter(
          (u) => u.ownerPlayerId !== hero.playerId,
        );
      for (const group of game.autonomousGroups)
        if (group.owner.kind === "player" && group.owner.id === hero.playerId) {
          group.army.units = [];
          group.cargo = [];
          group.status = "confiscated";
        }
      hero.classFeatureState.repressionPrisoner = true;
      hero.setBattleState({ health: 0, state: "ghost" });
    }
  },
  settleArrival(game, event, result) {
    if (
      !this.enabled(game) ||
      event.type !== "LocationEntered" ||
      event.locationId !== location(game, "capital")?.id ||
      !flag(game, "reportPresented") ||
      flag(game, "released")
    )
      return result;
    if (!flag(game, "prisonRequired")) {
      set(game, "questCompleted", true);
      return result;
    }
    if (game.scenarioState.currentPhaseId !== "repression-prison")
      return result;
    const applied = game.triggerScenarioEvent("repression-imprisoned");
    const released = game.questRuntime.dispatch(
      { type: "RepressionReturnChecked" },
      game,
    );
    return {
      type: "quest_progressed",
      phaseId: result?.phaseId ?? "repression-prison",
      completedObjectiveIds: result?.completedObjectiveIds ?? [],
      phaseCompleted: false,
      nextPhaseId: released?.nextPhaseId ?? "repression-prison",
      appliedEvents: [
        ...(result?.appliedEvents ?? []),
        ...(applied ? [applied] : []),
        ...(released?.appliedEvents ?? []),
      ],
    };
  },
  release(game) {
    const returned = flag(game, "returnedPlayerIds") ?? [];
    const participants = game.setup.participants.map((p) => p.playerId);
    if (!participants.every((id) => returned.includes(id))) return false;
    for (const hero of game.heroes.filter(
      (h) => h.classFeatureState.repressionPrisoner,
    )) {
      hero.classFeatureState.repressionPrisoner = false;
      hero.setBattleState({ health: hero.maxHealth, state: "active" });
      hero.army.addUnit({
        id: `repression-loyal-${hero.id}`,
        ownerPlayerId: hero.playerId,
        typeId: "militia",
        rank: "soldier",
        quantity: 6,
      });
    }
    set(game, "released", true);
    set(game, "questCompleted", true);
    set(game, "escapeCapitalAvailable", true);
    return true;
  },
  battleTeams(game, sourceLocationId, teams) {
    if (
      !this.enabled(game) ||
      sourceLocationId !== location(game, "seditious-village")?.id
    )
      return teams;
    const phase = game.scenarioState.currentPhaseId;
    if (!["royal-assault", "village-defense"].includes(phase)) return teams;
    this.spawn(game);
    game.getAutonomousGroup(KNIGHT).army = location(
      game,
      "seditious-village",
    ).garrison;
    const playerTeam = teams.find((t) =>
      t.heroIds?.some((id) => game.getPlayer(game.getHero(id)?.playerId)),
    );
    if (!playerTeam) return teams;
    const enemyId = teams.find((t) => t !== playerTeam)?.id ?? "bandits";
    return phase === "royal-assault"
      ? [
          { ...playerTeam, autonomousGroupId: PROVOST },
          {
            id: enemyId,
            autonomousGroupId: KNIGHT,
            locationId: sourceLocationId,
          },
        ]
      : [
          {
            ...playerTeam,
            autonomousGroupId: KNIGHT,
            locationId: sourceLocationId,
          },
          { id: enemyId, autonomousGroupId: PROVOST },
        ];
  },
};
