import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { BattleEngine } from "../app/js/core/battle.js";
import { HeroAptitudeDefinition } from "../app/js/core/hero-aptitude.js";

const aptitudeDefinitions = JSON.parse(readFileSync(new URL("../data/hero-aptitudes.json", import.meta.url), "utf8"));

function battleWith({ hero = {}, alliedUnits = [], enemyHero = {}, enemyUnits = [] } = {}) {
  return new BattleEngine({ id: `aptitude-${Math.random()}`, aptitudeDefinitions, config: { randomSeed: 7 }, teams: [
    { id: "allies", heroes: [{ id: "hero", playerId: "allies", maxCommandPoints: 8, commandPoints: 8, ...hero }], units: alliedUnits },
    { id: "enemies", heroes: [{ id: "enemy-hero", playerId: "enemies", maxHealth: 30, health: 30, ...enemyHero }], units: enemyUnits },
  ] });
}

const unit = (id, playerId, values = {}) => ({ id, playerId, attack: 4, defense: 2, speed: 2, morale: 5, quantity: 3, maxQuantity: 3, ...values });

test("le catalogue complet respecte le schéma configurable des aptitudes", () => {
  assert.doesNotThrow(() => aptitudeDefinitions.map((definition) => new HeroAptitudeDefinition(definition)));
});

test("Charge applique les valeurs de son rang à une cible puis expire", () => {
  const battle = battleWith({
    hero: { specialPowerIds: ["charge"], aptitudeRanks: { charge: "advanced" } },
    alliedUnits: [unit("ally", "allies")],
  });
  battle.start();
  const result = battle.activateSpecialPower({ teamId: "allies", userId: "hero", powerId: "charge", cost: 99, targetId: "ally" });
  assert.equal(result.success, true); assert.equal(result.remainingCommandPoints, 7);
  assert.equal(battle.getEffectiveStat("ally", "attack"), 7);
  assert.equal(battle.getEffectiveStat("ally", "speed"), 2.5);
  battle.tick(7_000);
  assert.equal(battle.getEffectiveStat("ally", "attack"), 4);
  assert.ok(battle.eventLog.some((event) => event.type === "special_power_expired" && event.powerId === "charge"));
});

test("un pouvoir ciblé invalide ne dépense pas de commandement", () => {
  const battle = battleWith({ hero: { specialPowerIds: ["charge"], aptitudeRanks: { charge: "novice" } }, alliedUnits: [unit("ally", "allies")] });
  battle.start();
  const result = battle.activateSpecialPower({ teamId: "allies", userId: "hero", powerId: "charge", targetId: "enemy-hero" });
  assert.equal(result.reason, "invalid_target"); assert.equal(battle.getEntity("hero").commandPoints, 8);
});

test("Magie offensive inflige des dégâts immédiats selon son rang", () => {
  const battle = battleWith({ hero: { specialPowerIds: ["offensive_magic"], aptitudeRanks: { offensive_magic: "master" } } });
  battle.start();
  const result = battle.activateSpecialPower({ teamId: "allies", userId: "hero", powerId: "offensive_magic", targetId: "enemy-hero" });
  assert.equal(result.success, true); assert.equal(result.remainingCommandPoints, 6);
  assert.equal(battle.getEntity("enemy-hero").health, 15);
  assert.ok(battle.eventLog.some((event) => event.type === "special_power_damage" && event.damage === 15));
});

test("Magie protectrice réduit réellement les dégâts reçus", () => {
  const battle = battleWith({
    hero: { specialPowerIds: ["protective_magic"], aptitudeRanks: { protective_magic: "master" } },
    alliedUnits: [unit("protected", "allies", { defense: 0, soldierHealth: [10, 10, 10] })],
    enemyUnits: [unit("attacker", "enemies", { attack: 5, damageMin: 10, damageMax: 10, quantity: 1, maxQuantity: 1 })],
  });
  battle.start(); battle.activateSpecialPower({ teamId: "allies", userId: "hero", powerId: "protective_magic", targetId: "protected" });
  const result = battle.attack("attacker", "protected");
  assert.equal(result.damageReduction, 0.4); assert.ok(result.damage < result.rolledDamage);
});

test("les aptitudes passives modifient automatiquement les statistiques compatibles", () => {
  const battle = battleWith({
    hero: { skillIds: ["tactics", "harassment"], aptitudeRanks: { tactics: "advanced", harassment: "novice" } },
    alliedUnits: [unit("archer", "allies", { tags: ["ranged"] }), unit("militia", "allies", { tags: ["infantry"] })],
  });
  assert.equal(battle.getEffectiveStat("archer", "attack"), 7);
  assert.equal(battle.getEffectiveStat("archer", "defense"), 4);
  assert.equal(battle.getEffectiveStat("archer", "speed"), 2.1);
  assert.equal(battle.getEffectiveStat("militia", "attack"), 6);
  assert.equal(battle.getEffectiveStat("militia", "speed"), 2);
});

test("Cri de guerre affecte toute l'armée et Repli tactique déclenche la retraite", () => {
  const battle = battleWith({
    hero: { specialPowerIds: ["war_cry", "tactical_retreat"], aptitudeRanks: { war_cry: "novice", tactical_retreat: "advanced" } },
    alliedUnits: [unit("first", "allies"), unit("second", "allies")],
  });
  battle.start();
  battle.activateSpecialPower({ teamId: "allies", userId: "hero", powerId: "war_cry" });
  assert.equal(battle.getEffectiveStat("first", "morale"), 7); assert.equal(battle.getEffectiveStat("second", "morale"), 7);
  const retreat = battle.activateSpecialPower({ teamId: "allies", userId: "hero", powerId: "tactical_retreat", targetId: "first" });
  assert.equal(retreat.success, true); assert.equal(battle.getEntity("first").retreating, true); assert.equal(battle.getEntity("first").retreatReason, "tactical");
});

test("les définitions et effets actifs sont sérialisables", () => {
  const battle = battleWith({ hero: { specialPowerIds: ["charge"], aptitudeRanks: { charge: "novice" } }, alliedUnits: [unit("ally", "allies")] });
  battle.start(); battle.activateSpecialPower({ teamId: "allies", userId: "hero", powerId: "charge", targetId: "ally" });
  const saved = battle.toJSON();
  assert.equal(saved.aptitudeDefinitions.length, aptitudeDefinitions.length);
  assert.equal(saved.teams[0].units[0].activeEffects.length, 2);
  assert.doesNotThrow(() => JSON.stringify(saved));
});
