import test from "node:test";
import assert from "node:assert/strict";
import { Quest } from "../app/js/core/quest.js";
import { QuestEngine } from "../app/js/core/quest-engine.js";
import { QuestService } from "../server/quests/quest-service.js";
import { orderedQuestCreations } from "../app/js/core/quest-creations.js";
import { socialGame } from "./fixtures/player-social-game.js";

const camp = {
  id: "camp",
  type: "lieu",
  properties: {
    name: "Camp",
    type: "quest",
    position: { latitude: 0.2, longitude: 0.2 },
  },
};
const guards = {
  id: "guards",
  type: "ga",
  locationId: "camp",
  belongsToLocation: true,
  properties: {
    type: "army",
    owner: { kind: "independent", id: "bandits" },
    army: {
      units: [
        {
          id: "guard-unit",
          ownerPlayerId: "bandits",
          typeId: "militia",
          quantity: 3,
        },
      ],
    },
  },
};
const definition = (prerequisites = [guards, camp]) => ({
  id: "guards-quest",
  title: "Les gardes",
  actions: [{ id: "fight", action: "Combattre", qui: "guards" }],
  prerequisites,
});
function fixture(prerequisites) {
  let { game } = socialGame();
  const service = new QuestService({
    definitions: [definition(prerequisites)],
    getGame: () => game,
    replaceGame: (restored) => {
      game = restored;
    },
    now: () => 1000,
  });
  service.command("a", { type: "publish", questId: "guards-quest" });
  return { service, getGame: () => game };
}

test("un modèle de gobelins alliés conserve sa référence à la création de quête", () => {
  const template = structuredClone(guards);
  template.properties.archetypeId = "goblins";
  template.properties.alignment = "ally";
  const { service, getGame } = fixture([template, camp]);
  const accepted = service.command("a", { type: "accept", questId: "guards-quest" });
  assert.ok(accepted.instance);
  const created = getGame().autonomousGroups.find((group) => group.archetypeId === "goblins");
  assert.ok(created);
  assert.equal(created.alignment, "ally");
  assert.equal(created.toJSON().archetypeId, "goblins");
});

test("création lieu puis GA propriétaire : ordre indépendant, instances isolées, sauvegarde", () => {
  const { service, getGame } = fixture();
  const a = service.command("a", {
    type: "accept",
    questId: "guards-quest",
  }).instance;
  const b = service.command("b", {
    type: "accept",
    questId: "guards-quest",
  }).instance;
  const group = getGame().getAutonomousGroup(`${a.id}:guards`);
  assert.deepEqual(a.created, ["camp", "guards"]);
  assert.deepEqual(group.owner, { kind: "location", id: `${a.id}:camp` });
  assert.equal(group.originLocationId, `${a.id}:camp`);
  assert.deepEqual(
    group.position,
    getGame().getLocation(`${a.id}:camp`).position,
  );
  assert.ok(getGame().getAutonomousGroup(`${b.id}:guards`));
  assert.equal(group.army.units[0].quantity, 3);
  assert.equal(
    getGame()
      .toJSON()
      .autonomousGroups.find((entry) => entry.id === group.id).owner.id,
    `${a.id}:camp`,
  );
});

test("créations communes publiées réutilisées à l’acceptation", () => {
  const { service, getGame } = fixture([
    { ...guards, scope: "world" },
    { ...camp, scope: "world", when: "published" },
  ]);
  service.command("a", { type: "accept", questId: "guards-quest" });
  service.command("b", { type: "accept", questId: "guards-quest" });
  assert.equal(
    getGame().autonomousGroups.filter((entry) => entry.id === "guards").length,
    1,
  );
  assert.equal(getGame().getAutonomousGroup("guards").owner.id, "camp");
});

test("GA créé dès la publication avec provenance sérialisable", () => {
  const { getGame } = fixture([
    { ...guards, scope: "world", when: "published" },
    { ...camp, scope: "world", when: "published" },
  ]);
  assert.equal(
    getGame().getAutonomousGroup("guards").history[0].questId,
    "guards-quest",
  );
  assert.doesNotThrow(() => JSON.stringify(getGame().toJSON()));
});

test("Combattre refuse le groupe d’une autre instance puis accepte la preuve officielle", () => {
  const { service, getGame } = fixture();
  const instance = service.command("a", {
    type: "accept",
    questId: "guards-quest",
  }).instance;
  const hero = getGame().heroes.find((entry) => entry.playerId === "a");
  const battle = {
    id: "proof",
    status: "finished",
    finishedAt: 1001,
    winnerTeamId: "own",
    teams: [
      { id: "own", heroes: [{ sourceId: hero.id }] },
      { id: "enemy", heroes: [], autonomousGroupId: "other:guards" },
    ],
  };
  getGame().battles.push({
    ...battle,
    toJSON() {
      return structuredClone(battle);
    },
  });
  const command = {
    type: "act",
    instanceId: instance.id,
    actionId: "fight",
    battleId: "proof",
  };
  assert.equal(
    service.command("a", command).reason,
    "required_victory_missing",
  );
  getGame().battles[0].teams[1].autonomousGroupId = `${instance.id}:guards`;
  assert.equal(service.command("a", command).success, true);
});

test("échec du GA annule aussi la création du lieu et l’acceptation", () => {
  const { locationId, ...withoutLocation } = guards;
  const { service, getGame } = fixture([
    camp,
    {
      ...withoutLocation,
      belongsToLocation: false,
      dependsOn: ["camp"],
      properties: {
        ...guards.properties,
        position: { latitude: 20, longitude: 20 },
      },
    },
  ]);
  assert.throws(
    () => service.command("a", { type: "accept", questId: "guards-quest" }),
    /hors zone/,
  );
  assert.equal(
    getGame().locations.some((entry) => entry.source === "quest-engine"),
    false,
  );
  assert.equal(service.engine.toJSON().instances.length, 0);
});

test("définitions refusées : cycle, dépendance absente, portée incohérente, GA incomplet", () => {
  for (const entries of [
    [{ ...camp, dependsOn: ["guards"] }, guards],
    [{ ...guards, dependsOn: ["absent"] }, camp],
    [{ ...guards, scope: "world" }, camp],
    [{ ...guards, locationId: undefined }, camp],
  ])
    assert.throws(() => new Quest(definition(entries)));
  assert.deepEqual(
    orderedQuestCreations([guards, camp]).map((entry) => entry.id),
    ["camp", "guards"],
  );
});

test("création filtrée par action et sortie après l’action officielle", () => {
  const created = [],
    actor = { playerId: "a" };
  const engine = new QuestEngine({
    definitions: [
      {
        ...definition([
          camp,
          {
            ...guards,
            when: "ActionCompleted",
            actionId: "arrival",
            output: "success",
          },
        ]),
        actions: [
          { id: "arrival", action: "Atteindre", lieu: "camp" },
          {
            id: "fight",
            action: "Combattre",
            qui: "guards",
            requires: ["arrival"],
          },
        ],
      },
    ],
    adapter: {
      transaction: (operation) => operation(),
      canAccess: () => true,
      participants: () => ["a"],
      perform: () => ({ success: true }),
      applyEffect() {},
      create: (entry) => created.push(entry.id),
    },
  });
  engine.publish("guards-quest", actor);
  const { instance } = engine.accept({ questId: "guards-quest", actor });
  assert.deepEqual(created, ["camp"]);
  engine.act({ instanceId: instance.id, actionId: "arrival", actor });
  assert.deepEqual(created, ["camp", "guards"]);
});
