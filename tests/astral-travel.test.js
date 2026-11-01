import test from "node:test";
import assert from "node:assert/strict";
import { Hero } from "../app/js/core/hero.js";
import { HeroClassFeatureService } from "../app/js/core/hero-class-feature-service.js";
import { astralTargetInReach, consumeAstralInteraction } from "../app/js/core/astral-interaction.js";

function fixture(mode = "simulation") {
  let now = 1000;
  const hero = new Hero({ id: "mage", playerId: "p", name: "Mage", classId: "mage", position: { latitude: 0, longitude: 0 } });
  const service = new HeroClassFeatureService({ now: () => now, classDefinitions: [{ id: "mage", features: { astralReachBonus: 15, astralDurationMs: 10000, astralCooldownMs: 600000 } }] });
  const target = { id: "target", playerId: "q", position: { latitude: mode === "gps" ? 0.0001 : 10, longitude: 0 } };
  const game = { coordinateMode: mode, heroes: [hero], heroClassFeatureService: service, getHero: () => target };
  assert.equal(service.beginAstralTravel(hero).success, true);
  return { hero, target, service, game, advance: value => { now += value; } };
}

for (const mode of ["simulation", "gps"]) {
  test(`portée astrale ${mode} : cible unique, positions officielles, expiration exacte`, () => {
    const f = fixture(mode);
    Object.assign(f.hero.classFeatureState.astralTravel, { targetKind: "hero", targetId: f.target.id });
    assert.equal(astralTargetInReach(f.game, f.hero, "hero", f.target), true);
    assert.equal(astralTargetInReach(f.game, f.hero, "group", f.target), false);
    assert.equal(astralTargetInReach(f.game, f.hero, "hero", { ...f.target, id: "other" }), false);
    f.target.position.latitude = mode === "gps" ? 1 : 100;
    assert.equal(astralTargetInReach(f.game, f.hero, "hero", f.target), false);
    f.advance(10000);
    assert.equal(f.service.activeAstralTravel(f.hero), null);
    assert.equal(f.service.cooldownRemaining(f.hero, "astralTravel"), 590000);
  });
}

test("une action refusée ou étrangère ne consomme pas le pouvoir ; une réussite le termine", () => {
  const f = fixture();
  Object.assign(f.hero.classFeatureState.astralTravel, { targetKind: "location", targetId: "village", locationId: "village" });
  consumeAstralInteraction(f.game, "p", "tradeAtLocation", { locationId: "village" }, { success: false });
  assert.ok(f.service.activeAstralTravel(f.hero));
  consumeAstralInteraction(f.game, "p", "tradeAtLocation", { locationId: "other" }, { success: true });
  assert.ok(f.service.activeAstralTravel(f.hero));
  consumeAstralInteraction(f.game, "p", "tradeAtLocation", { locationId: "village" }, { success: true });
  assert.equal(f.service.activeAstralTravel(f.hero), null);
  assert.equal(f.service.interactionRadius(f.hero, 8, "village"), 8);
  assert.equal(f.service.cooldownRemaining(f.hero, "astralTravel"), 600000);
});

test("interaction avec un GA ou un héros : consommation sans déplacer le mage", () => {
  for (const kind of ["group", "hero"]) {
    const f = fixture();
    const original = structuredClone(f.hero.position);
    Object.assign(f.hero.classFeatureState.astralTravel, { targetKind: kind, targetId: "target" });
    consumeAstralInteraction(f.game, "p", kind === "group" ? "createBattle" : "createPlayerEncounterBattle",
      kind === "group" ? { teamParticipants: [{ autonomousGroupId: "target" }] } : { targetHeroId: "target" }, { success: true });
    assert.equal(f.service.activeAstralTravel(f.hero), null);
    assert.deepEqual(f.hero.position, original);
  }
});

test("activation en recharge et sérialisation du pouvoir", () => {
  const f = fixture();
  assert.equal(f.service.beginAstralTravel(f.hero).reason, "ability_on_cooldown");
  const restored = new Hero(f.hero.toJSON());
  assert.deepEqual(f.service.activeAstralTravel(restored), f.service.activeAstralTravel(f.hero));
});
