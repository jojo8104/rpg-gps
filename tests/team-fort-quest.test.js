import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Game } from "../app/js/core/game.js";
import { createQuickGameSetup } from "../app/js/ui/game-setup-view.js";
import {
  startLocalTeamFortTest,
  teamFortPreparation,
  teamFortReward,
} from "../app/js/core/team-fort-quest.js";
import {
  createMultiplayerWorldState,
  applyMultiplayerWorldState,
} from "../app/js/core/multiplayer-world-state.js";

const definitions = JSON.parse(
  readFileSync(new URL("../data/units.json", import.meta.url)),
);
function fixture(count = 2) {
  let time = 1000;
  const participants = Array.from({ length: count }, (_, i) => ({
    playerId: `p${i}`,
    name: `Joueur ${i}`,
    teamId: "green",
  }));
  const game = new Game({
    setup: {
      id: "fort",
      name: "Fort",
      mode: "organizer",
      scenarioId: "test",
      playerCount: count,
      teams: [{ id: "green", name: "Alliés", factionId: "kingdom" }],
      playArea: {
        id: "a",
        name: "Zone",
        polygon: [
          { latitude: 0, longitude: 0 },
          { latitude: 0, longitude: 100 },
          { latitude: 80, longitude: 100 },
          { latitude: 80, longitude: 0 },
        ],
      },
      participants,
    },
    coordinateMode: "simulation",
    now: () => time,
    heroClasses: [
      {
        id: "warrior",
        name: "Guerrier",
        authorityBonus: 2,
        abilityIds: [],
        startingUnits: [],
      },
    ],
    unitDefinitions: definitions,
    locations: [
      {
        id: "capital",
        name: "Capitale",
        type: "capital",
        source: "test",
        ownerId: "kingdom",
        position: { latitude: 50, longitude: 50 },
        population: 30,
      },
    ],
  });
  const heroes = participants.map((player) =>
    game.chooseHero(player.playerId, { name: player.name, classId: "warrior" }),
  );
  game.getLocation("capital").heroIds = heroes.map((hero) => hero.id);
  return {
    game,
    heroes,
    setTime: (value) => {
      time = value;
    },
  };
}
function accept(game, hero, recipient = hero) {
  return game.selectLocationChiefOption({
    playerId: hero.playerId,
    heroId: hero.id,
    locationId: "capital",
    optionId: `team-fort:accept:${recipient.id}`,
  });
}
function finishWorks(game, quest, hero) {
  const camp = game.getLocation(quest.locationId);
  camp.heroIds = [hero.id];
  const plan = teamFortPreparation(quest.participantCount);
  for (const [resource, amount] of Object.entries(plan.remainingCosts))
    if (amount > 0) hero.addResource(resource, amount);
  const input = {
    playerId: hero.playerId,
    heroId: hero.id,
    locationId: camp.id,
  };
  for (const [id, level] of [
    ["barricades", 3],
    ["watch_post", 2],
  ]) {
    while ((camp.infrastructure[id] ?? 0) < level)
      assert.equal(
        game.buildCampImprovement({ ...input, improvementId: id }).success,
        true,
        id,
      );
  }
  assert.equal(game.evolveCamp({ ...input, branchId: "fort" }).success, true);
  return { camp, input };
}

test("briefing collectif, choix du porteur et mandat unique", () => {
  const { game, heroes } = fixture();
  const [a, b] = heroes;
  const briefing = game.selectLocationChiefOption({
    playerId: a.playerId,
    heroId: a.id,
    locationId: "capital",
    optionId: "team-fort:briefing",
  });
  assert.equal(briefing.success, true);
  assert.equal(briefing.options.length, 2);
  assert.equal(game.teamFortQuestService.quests.length, 0);
  const result = accept(game, a, b);
  assert.equal(result.success, true);
  assert.equal(a.carriedLoot.length, 0);
  assert.equal(
    b.carriedLoot.filter((item) => item.itemId === "authority_writ").length,
    1,
  );
  assert.equal(accept(game, b).success, false);
  assert.equal(
    game.getPlayer(a.playerId).getLocationKnowledge(result.quest.locationId),
    3,
  );
});

for (const count of [2, 4, 6])
  test(`travaux collectifs réels et récompense unique pour ${count} joueurs`, () => {
    const { game, heroes, setTime } = fixture(count);
    const { quest } = accept(game, heroes[0]);
    const worker = heroes[1];
    const { camp, input } = finishWorks(game, quest, worker);
    assert.equal(quest.status, "active");
    worker.addUnit({
      id: "spearmen",
      ownerPlayerId: worker.playerId,
      typeId: "spearman",
      rank: "soldier",
      quantity: 6,
    });
    setTime(601000);
    assert.equal(game.garrisonUnit({ ...input, unitId: "spearmen" }), true);
    assert.equal(quest.status, "completed");
    assert.equal(quest.completedAt, 601000);
    assert.equal(camp.garrison.units.length, 1);
    const amounts = heroes.map((hero) => hero.getResourceAmount("gold"));
    const restored = Game.fromJSON(game.toJSON(), { now: () => 999999 });
    restored.teamFortQuestService.check(restored);
    assert.deepEqual(
      restored.heroes.map((hero) => hero.getResourceAmount("gold")),
      amounts,
    );
    assert.equal(restored.teamFortQuestService.quests[0].completedAt, 601000);
    assert.equal(
      restored.heroes[0].carriedLoot.some(
        (item) => item.itemId === "authority_writ",
      ),
      true,
    );
  });

test("le mandat équipé permet les lanciers en plus d’une armée existante, y compris après sauvegarde", () => {
  const {
    game,
    heroes: [hero],
  } = fixture(1);
  hero.addUnit({
    id: "militia1",
    ownerPlayerId: hero.playerId,
    typeId: "militia",
    quantity: 6,
  });
  hero.addUnit({
    id: "militia2",
    ownerPlayerId: hero.playerId,
    typeId: "militia",
    quantity: 6,
  });
  const result = startLocalTeamFortTest(game, {
    heroId: hero.id,
    participantCount: 4,
    position: { latitude: 50, longitude: 50 },
  });
  assert.equal(result.success, true);
  const input = {
    playerId: hero.playerId,
    heroId: hero.id,
    locationId: result.quest.supplyLocationId,
    unitId: `${result.quest.id}-spearmen`,
  };
  assert.equal(game.withdrawGarrisonUnit(input), false);
  const before = game.getHeroAuthority(hero.id).maximum;
  assert.equal(
    game.equipHeroItem({
      playerId: hero.playerId,
      heroId: hero.id,
      packageId: `${result.quest.id}-writ`,
    }).success,
    true,
  );
  assert.equal(game.getHeroAuthority(hero.id).maximum, before + 3);
  assert.equal(game.withdrawGarrisonUnit(input), true);
  const restored = Game.fromJSON(game.toJSON());
  assert.equal(restored.getHeroAuthority(hero.id).maximum, before + 3);
  assert.equal(
    restored.teamFortQuestService.forPlayer(hero.playerId).participantCount,
    4,
  );
});

test("refus sans rassemblement, hors équipe, bagages pleins et test réseau", () => {
  const {
    game,
    heroes: [a, b],
  } = fixture();
  game.getLocation("capital").heroIds = [a.id];
  assert.equal(accept(game, a).success, false);
  game.getLocation("capital").heroIds.push(b.id);
  game.setup.participants[1].teamId = "red";
  assert.equal(accept(game, a).success, false);
  game.setup.participants[1].teamId = "green";
  a.addResource("wood", 20 * a.bagSlotCount);
  assert.equal(accept(game, a).reason, "hero_bag_full");
  assert.equal(game.teamFortQuestService.quests.length, 0);
  assert.equal(
    startLocalTeamFortTest(game, {
      heroId: a.id,
      participantCount: 2,
      position: { latitude: 50, longitude: 50 },
    }).success,
    false,
  );
});

test("la garnison seule ne suffit pas ; ni mauvais type, grade ou effectif", () => {
  const {
    game,
    heroes: [a],
  } = fixture();
  const { quest } = accept(game, a);
  const camp = game.getLocation(quest.locationId);
  camp.garrison.addUnit({
    id: "u",
    ownerPlayerId: a.playerId,
    typeId: "spearman",
    quantity: 6,
  });
  game.teamFortQuestService.check(game);
  assert.equal(quest.status, "active");
  camp.type = "fort";
  const unit = camp.garrison.units[0];
  for (const patch of [
    { typeId: "militia", rank: "soldier", quantity: 6 },
    { typeId: "spearman", rank: "corporal", quantity: 6 },
    { typeId: "spearman", rank: "soldier", quantity: 5 },
  ]) {
    Object.assign(unit, patch);
    game.teamFortQuestService.check(game);
    assert.equal(quest.status, "active");
  }
});

test("barème dégressif et synchronisation de l’état partagé", () => {
  assert.deepEqual(teamFortReward(0), { gold: 40, experience: 200 });
  assert.deepEqual(teamFortReward(900000), { gold: 30, experience: 150 });
  assert.deepEqual(teamFortReward(3600000), { gold: 20, experience: 100 });
  const {
    game,
    heroes: [a, b],
  } = fixture();
  const { quest } = accept(game, a);
  const target = fixture().game;
  applyMultiplayerWorldState(target, createMultiplayerWorldState(game));
  assert.equal(target.teamFortQuestService.forPlayer(b.playerId).id, quest.id);
  assert.equal(
    target.locationAccessPolicy.can(
      b.playerId,
      target.getLocation(quest.locationId),
      "build",
    ),
    true,
  );
  assert.equal(
    target.locationAccessPolicy.can(
      "enemy",
      target.getLocation(quest.locationId),
      "build",
    ),
    false,
  );
});

test("le test local avec PNJ permet toute la mission avec les transferts normaux", () => {
  const game = new Game({
    setup: createQuickGameSetup(),
    coordinateMode: "simulation",
    unitDefinitions: definitions,
    heroClasses: [
      {
        id: "warrior",
        name: "Guerrier",
        authorityBonus: 2,
        abilityIds: [],
        startingUnits: [],
      },
    ],
  });
  const hero = game.chooseHero("local", {
    name: "Testeur",
    classId: "warrior",
  });
  const result = startLocalTeamFortTest(game, {
    heroId: hero.id,
    participantCount: 6,
    position: { latitude: 50, longitude: 50 },
  });
  assert.equal(result.success, true);
  const quest = result.quest;
  const depot = game.getLocation(quest.supplyLocationId);
  const camp = game.getLocation(quest.locationId);
  const actor = { playerId: "local", heroId: hero.id };
  assert.equal(
    game.equipHeroItem({ ...actor, packageId: `${quest.id}-writ` }).success,
    true,
  );
  for (const [resourceName, amount] of Object.entries(
    teamFortPreparation(6).remainingCosts,
  )) {
    if (!amount) continue;
    depot.heroIds = [hero.id];
    camp.heroIds = [];
    const collected = game.transferLocationResource({
      ...actor,
      locationId: depot.id,
      resourceName,
      amount,
      direction: "to_hero",
    });
    assert.equal(collected.success, true);
    assert.equal(depot.resources.stock[resourceName], 0);
    depot.heroIds = [];
    camp.heroIds = [hero.id];
    assert.equal(
      game.transferLocationResource({
        ...actor,
        locationId: camp.id,
        resourceName,
        amount,
        direction: "to_location",
      }).success,
      true,
    );
  }
  for (const [improvementId, target] of [
    ["barricades", 3],
    ["watch_post", 2],
  ])
    while (camp.infrastructure[improvementId] < target)
      assert.equal(
        game.buildCampImprovement({
          ...actor,
          locationId: camp.id,
          improvementId,
        }).success,
        true,
      );
  assert.equal(
    game.evolveCamp({ ...actor, locationId: camp.id, branchId: "fort" })
      .success,
    true,
  );
  depot.heroIds = [hero.id];
  camp.heroIds = [];
  assert.equal(
    game.withdrawGarrisonUnit({
      ...actor,
      locationId: depot.id,
      unitId: `${quest.id}-spearmen`,
    }),
    true,
  );
  depot.heroIds = [];
  camp.heroIds = [hero.id];
  assert.equal(
    game.garrisonUnit({
      ...actor,
      locationId: camp.id,
      unitId: `${quest.id}-spearmen`,
    }),
    true,
  );
  assert.equal(quest.status, "completed");
  assert.equal(game.teamFortQuestService.quests.length, 1);
});

test("les alliés participants peuvent approvisionner le stock commun, pas les étrangers", () => {
  const {
    game,
    heroes: [a, b],
  } = fixture();
  const { quest } = accept(game, a);
  const camp = game.getLocation(quest.locationId);
  camp.heroIds = [b.id];
  b.addResource("wood", 5);
  assert.equal(
    game.canPerformLocationAction({
      playerId: b.playerId,
      locationId: camp.id,
      action: "manageReserves",
    }),
    true,
  );
  assert.equal(
    game.transferLocationResource({
      playerId: b.playerId,
      heroId: b.id,
      locationId: camp.id,
      resourceName: "wood",
      amount: 5,
      direction: "to_location",
    }).success,
    true,
  );
  assert.equal(camp.resources.stock.wood, 30);
  assert.equal(
    game.locationAccessPolicy.can("outsider", camp, "manageReserves"),
    false,
  );
  camp.controllerId = "enemy";
  assert.equal(game.locationAccessPolicy.can(b.playerId, camp, "build"), false);
  assert.equal(
    game.locationAccessPolicy.can(b.playerId, camp, "manageReserves"),
    false,
  );
});
