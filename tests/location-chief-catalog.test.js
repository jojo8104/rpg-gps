import test from "node:test";
import assert from "node:assert/strict";
import { Location } from "../app/js/core/location.js";
import { LocationChiefService } from "../app/js/core/location-chief-service.js";
import { LocationAccessPolicy } from "../app/js/core/location-access-policy.js";
import { resolveLocationChief } from "../app/js/core/location-chief-catalog.js";
import { Game } from "../app/js/core/game.js";
import { Hero } from "../app/js/core/hero.js";

const create = (type, extra = {}) => new Location({ id: "site", name: "Les Roches", type, source: "test", population: 10, position: { latitude: 0, longitude: 0 }, ...extra });
const service = new LocationChiefService();
for (const [type, title] of Object.entries({ village: "Chef du village", town: "Bourgmestre", capital: "Bourgmestre", camp: "Chef d’expédition", fort: "Seigneur du fortin", mine: "Chef des mineurs", quarry: "Chef des carriers", "lumber-camp": "Chef des bûcherons" })) {
  test(`${type} : responsable accessible avec accueil et dialogue fonctionnel`, () => {
    const location = create(type);
    const policy = new LocationAccessPolicy();
    assert.equal(policy.can("p", location, "talkChief"), true);
    const conversation = service.getConversation({ location });
    assert.equal(conversation.title, title);
    assert.ok(conversation.openingLines[0]);
    const result = service.select({ location, optionId: conversation.options[0].id });
    assert.equal(result.success, true);
    assert.ok(result.lines[0]);
    const restored = create(type, location.toJSON());
    assert.deepEqual(service.getConversation({ location: restored }), conversation);
    location.ownerId = "enemy";
    assert.equal(policy.can("p", location, "talkChief"), false);
    location.ownerId = null; location.population = 0;
    assert.equal(policy.can("p", location, "talkChief"), false);
  });
}
test("le rôle suit le type du lieu sans modifier les personnages de scénario", () => {
  const location = create("camp");
  assert.equal(resolveLocationChief(location).title, "Chef d’expédition");
  location.type = "town";
  assert.equal(resolveLocationChief(location).title, "Bourgmestre");
  const custom = create("camp", { chief: { name: "Armand", title: "Maréchal", openingLines: ["Mes ordres."], secondaryQuestIds: ["mission"] } });
  custom.type = "town";
  assert.equal(resolveLocationChief(custom), custom.chief);
  assert.deepEqual(service.getConversation({ location: custom }).options.map(o => o.id), ["quest:mission"]);
  assert.equal(resolveLocationChief(create("quest")), null);
});
test("Game autorise les dialogues par défaut uniquement pour un héros présent et contrôlé", () => {
  const location = create("quarry");
  const hero = new Hero({ id: "h", playerId: "p", name: "H" });
  const game = { getHero: () => hero, getLocation: () => location, locationAccessPolicy: new LocationAccessPolicy(),
    locationChiefService: service, eventLog: [], now: () => 0, isObjectiveCompleted: () => false };
  const input = { playerId: "p", heroId: "h", locationId: location.id, optionId: "dialogue:local-affairs" };
  const select = (args = input) => Game.prototype.selectLocationChiefOption.call(game, args);
  assert.equal(select().reason, "chief_unavailable");
  location.heroIds.push(hero.id);
  assert.equal(select({ ...input, playerId: "other" }).success, false);
  assert.equal(select().success, true);
  assert.equal(game.eventLog[0].kind, "dialogue");
  assert.equal(select({ ...input, optionId: "trade-offer:fake" }).success, false);
});
