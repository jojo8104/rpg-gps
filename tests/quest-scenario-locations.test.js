import assert from "node:assert/strict";
import test from "node:test";
import { QuestService } from "../server/quests/quest-service.js";
import { bindQuestToScenarioLocations } from "../server/quests/scenario-location-resolver.js";
import { ravitaillementService } from "../server/quests/ravitaillement-integration.js";
import { socialGame } from "./fixtures/player-social-game.js";
import { Location } from "../app/js/core/location.js";
import { ScenarioLocationBinding } from "../app/js/core/scenario-location-binding.js";

test("les fiches distinguent un lieu placé d’un lieu visible et le serveur refuse la présence dans un lieu non placé", () => {
  const { game, heroes } = socialGame();
  const location = new Location({ id: "official-site", name: "Site", type: "village", source: "scenario", position: { latitude: 0, longitude: 0 }, heroIds: [heroes[0].id] });
  game.locations = [location];
  game.scenarioLocationBindings = [new ScenarioLocationBinding({ locationSlotId: "site", locationId: location.id })];
  game.scenarioRuntime = { placements: { site: { locationId: location.id, status: "waiting", world: { role: "world", visibility: "discoverable", lifetime: "persistent" } } } };
  const definitions = ["locationPlaced", "locationVisible"].map(type => ({ id: type, title: type, locationSlotId: "site", publicationCondition: { type, locationId: "site" }, actions: [{ id: "reach", action: "Atteindre", lieu: "site" }] }));
  definitions.push({ id: "presence", title: "Présence", locationSlotId: "site", actions: [{ id: "reach", action: "Atteindre", lieu: "site" }] });
  const service = new QuestService({ definitions, getGame: () => game, replaceGame() {} });
  assert.equal(service.command("a", { type: "publish", questId: "locationPlaced" }).success, false);
  service.command("a", { type: "publish", questId: "presence" });
  assert.equal(service.command("a", { type: "accept", questId: "presence", mode: "solo" }).reason, "not_at_quest_giver");
  game.scenarioRuntime.placements.site.status = "placed";
  assert.equal(service.command("a", { type: "publish", questId: "locationPlaced" }).success, true);
  assert.equal(service.command("a", { type: "publish", questId: "locationVisible" }).success, false);
  game.getPlayer("a").discoverLocation(location.id);
  assert.equal(service.command("a", { type: "publish", questId: "locationVisible" }).success, true);
  assert.equal(service.command("a", { type: "accept", questId: "presence", mode: "solo" }).success, true);
});

function world(ids = ["capital", "village", "fort"]) {
  const locations = ids.map((id) => ({ id: `official-${id}` }));
  return {
    locations,
    scenarioLocationBindings: ids.map((id) => ({
      locationSlotId: id,
      locationId: `official-${id}`,
    })),
    getLocation: (id) => locations.find((location) => location.id === id),
  };
}

test("le service commun lie actions, conditions, effets et dialogues aux lieux existants", () => {
  const game = world();
  const definition = {
    id: "delivery",
    title: "Livraison",
    locationSlotId: "capital",
    accessConditions: [{ type: "atLocation", locationId: "capital" }],
    actions: [
      {
        id: "reach",
        action: "Atteindre",
        lieu: "village",
        rewards: [
          { type: "resource", locationId: "fort", resource: "gold", amount: 1 },
        ],
      },
    ],
  };
  const service = new QuestService({
    definitions: [definition],
    getGame: () => game,
    replaceGame() {},
    dialogues: { greeting: { locationId: "village" } },
  });
  const quest = service.engine.definitions.get("delivery");
  assert.equal(quest.locationSlotId, "official-capital");
  assert.equal(quest.actions[0].lieu, "official-village");
  assert.equal(quest.actions[0].rewards[0].locationId, "official-fort");
  assert.equal(quest.accessConditions[0].locationId, "official-capital");
  assert.equal(service.dialogues.greeting.locationId, "official-village");
  assert.equal(definition.actions[0].lieu, "village");
  assert.equal(game.locations.length, 3);
});

test("un lieu manquant est refusé sans remplacement et un identifiant officiel reste utilisable", () => {
  const game = world();
  assert.throws(
    () =>
      bindQuestToScenarioLocations({ actions: [{ lieu: "missing" }] }, game),
    /absent/,
  );
  assert.equal(
    bindQuestToScenarioLocations(
      { actions: [{ lieu: "official-village" }] },
      game,
    ).actions[0].lieu,
    "official-village",
  );
  assert.equal(game.locations.length, 3);
});

test("les lieux temporaires explicitement déclarés gardent leurs références locales", () => {
  const game = world();
  const definition = {
    prerequisites: [{ id: "temporary", type: "marqueur" }],
    actions: [
      { lieu: "temporary" },
      { origine: "village", destinataire: "fort" },
    ],
  };
  const bound = bindQuestToScenarioLocations(definition, game);
  assert.equal(bound.actions[0].lieu, "temporary");
  assert.equal(bound.actions[1].origine, "official-village");
  assert.equal(bound.actions[1].destinataire, "official-fort");
});

test("le ravitaillement réutilise tous les villages et devient indisponible si un seul manque", () => {
  const ids = [
    "capital",
    "supply-fort",
    ...["gold", "iron", "wood", "stone"].map((resource) => `capital-resource-${resource}-village`),
  ];
  const game = world(ids);
  const service = ravitaillementService({ game }, Date.now);
  assert.ok(service);
  const quest = service.engine.definitions.get("royal-fort-supply");
  assert.equal(
    quest.actions.find((action) => action.id === "take-west").origine,
    "official-capital-resource-stone-village",
  );
  assert.equal(game.locations.length, 6);
  game.locations.pop();
  assert.equal(ravitaillementService({ game }, Date.now), null);
});
