import assert from "node:assert/strict";
import test from "node:test";
import { BattleEngine, BattleState } from "../app/js/core/battle.js";

const createBattle = () => new BattleEngine({ id: "battle-1", teams: [
  { id: "red", heroes: [{ id: "hero-red", playerId: "red", attack: 5, defense: 2, speed: 2 }], units: [{ id: "unit-red", playerId: "red", attack: 20, defense: 3, speed: 3, range: 1, quantity: 10, maxQuantity: 10 }] },
  { id: "blue", heroes: [{ id: "hero-blue", playerId: "blue", attack: 5, defense: 2, speed: 2 }], units: [] },
] });

test("BattleState expose trois lignes abstraites et sérialisables", () => {
  const battle = createBattle();
  assert.equal(battle.state instanceof BattleState, true); assert.equal(battle.teams[0].lines.length, 3);
  assert.equal(battle.teams[0].units[0].lane, 1); assert.equal("position" in battle.teams[0].units[0], false);
  assert.doesNotThrow(() => JSON.stringify(battle.toJSON()));
});

test("les ticks automatisent l'approche, l'attaque et la victoire", () => {
  const battle = createBattle();
  for (let index = 0; index < 100 && battle.status !== "finished"; index += 1) battle.tick(500);
  assert.equal(battle.status, "finished"); assert.equal(battle.winnerTeamId, "red");
  assert.ok(battle.eventLog.some((event) => event.type === "target_acquired"));
  assert.ok(battle.state.contributions.red.total > 0);
});

test("une unité avance selon son comportement propre sans ordre joueur", () => {
  const battle = createBattle(); const unit = battle.teams[0].units[0];
  battle.tick(500);
  assert.equal(unit.behavior, "advance"); assert.ok(unit.progress > 0);
  assert.equal(typeof battle.issueOrder, "undefined");
});

test("l'avance laisse au joueur le temps d'observer le champ de bataille", () => {
  const battle = new BattleEngine({ id: "paced-movement", teams: [
    { id: "red", heroes: [{ id: "hr", playerId: "red" }], units: [{ id: "ur", playerId: "red", attack: 1, defense: 1, speed: 2, quantity: 1, maxQuantity: 1 }] },
    { id: "blue", heroes: [{ id: "hb", playerId: "blue" }], units: [] },
  ] });
  battle.tick(1_500);
  assert.equal(battle.config.advanceTravelBaseMs, 24_000);
  assert.equal(battle.getEntity("ur").progress, 0.125);
});

test("un combat normal attend un compte à rebours de trois secondes", () => {
  const battle = new BattleEngine({ id: "countdown", config: { countdownMs: 3_000 }, teams: [
    { id: "red", heroes: [{ id: "hr", playerId: "red" }], units: [{ id: "ur", playerId: "red", attack: 2, defense: 1, speed: 1, range: 1, quantity: 5, maxQuantity: 5 }] },
    { id: "blue", heroes: [{ id: "hb", playerId: "blue" }], units: [] },
  ] });
  battle.start(); assert.equal(battle.status, "countdown");
  battle.tick(1_000); assert.equal(battle.state.countdownRemainingMs, 2_000); assert.equal(battle.getEntity("ur").progress, 0);
  battle.tick(2_000); assert.equal(battle.status, "active"); assert.equal(battle.getEntity("ur").progress, 0);
  battle.tick(500); assert.ok(battle.getEntity("ur").progress > 0);
});

test("une embuscade commence immédiatement et conserve le délai de révélation du défenseur", () => {
  const battle = new BattleEngine({ id: "ambush", config: { countdownMs: 3_000, ambushTeamId: "red", ambushDefenderRevealDelayMs: 1_500 }, teams: [
    { id: "red", heroes: [{ id: "hr", playerId: "red" }], units: [{ id: "ur", playerId: "red", attack: 2, defense: 1, speed: 1, range: 1, quantity: 5, maxQuantity: 5 }] },
    { id: "blue", heroes: [{ id: "hb", playerId: "blue" }], units: [] },
  ] });
  battle.start(); assert.equal(battle.status, "active");
  battle.tick(500); assert.ok(battle.getEntity("ur").progress > 0);
  assert.equal(battle.toJSON().config.ambushDefenderRevealDelayMs, 1_500);
});

test("après une percée, une unité reste sur sa ligne et inflige des dégâts multipliés au héros ennemi", () => {
  const battle = createBattle(); const unit = battle.teams[0].units[0];
  unit.lane = null;
  battle.assignUnit(unit.id, battle.teams[0].heroes[0].id, 0);
  for (let index = 0; index < 20 && !battle.eventLog.some((event) => event.type === "breakthrough_attack"); index += 1) battle.tick(500);
  const attack = battle.eventLog.find((event) => event.type === "breakthrough_attack");
  assert.equal(unit.lane, 0); assert.equal(attack.targetId, "hero-blue"); assert.equal(attack.multiplier, 1.5);
});

test("une unité déjà déployée ne peut plus changer de ligne", () => {
  const battle = createBattle(); const unit = battle.teams[0].units[0];
  assert.deepEqual(battle.assignUnit(unit.id, battle.teams[0].heroes[0].id, 2), { success: false, reason: "unit_already_deployed" });
  assert.equal(unit.lane, 1);
});

test("deux unités opposées sur la même ligne s'infligent des pertes", () => {
  const battle = new BattleEngine({ id: "unit-damage", teams: [
    { id: "red", heroes: [{ id: "hr", playerId: "red", attack: 1, defense: 1, speed: 1 }], units: [{ id: "ur", playerId: "red", attack: 10, defense: 1, speed: 3, range: 1, quantity: 10, maxQuantity: 10 }] },
    { id: "blue", heroes: [{ id: "hb", playerId: "blue", attack: 1, defense: 1, speed: 1 }], units: [{ id: "ub", playerId: "blue", attack: 10, defense: 1, speed: 3, range: 1, quantity: 10, maxQuantity: 10 }] },
  ] });
  for (let index = 0; index < 12 && battle.getEntity("ur").quantity === 10; index += 1) battle.tick(500);
  assert.ok(battle.getEntity("ur").quantity < 10); assert.ok(battle.getEntity("ub").quantity < 10);
});

test("la reddition termine immédiatement la bataille au profit de l'adversaire", () => {
  const battle = createBattle(); battle.start();
  const result = battle.surrender("red");
  assert.deepEqual(result, { success: true, winnerTeamId: "blue" });
  assert.equal(battle.status, "finished"); assert.equal(battle.teams[0].heroes[0].state, "surrendered");
  assert.equal(battle.teams[0].units[0].state, "captured");
  assert.ok(battle.eventLog.some((event) => event.type === "team_surrendered"));
});

test("une unité de contact attend réellement son adversaire avant de frapper", () => {
  const battle = new BattleEngine({ id: "melee-distance", teams: [
    { id: "red", heroes: [{ id: "hr", playerId: "red" }], units: [{ id: "ur", playerId: "red", attack: 10, defense: 1, speed: 1, range: 1, quantity: 10, maxQuantity: 10 }] },
    { id: "blue", heroes: [{ id: "hb", playerId: "blue" }], units: [{ id: "ub", playerId: "blue", attack: 10, defense: 1, speed: 1, range: 1, quantity: 10, maxQuantity: 10 }] },
  ] });
  battle.getEntity("ur").progress = 0.8;
  battle.getEntity("ub").progress = 0;
  battle.tick(100);
  assert.equal(battle.eventLog.some((event) => event.type === "attack"), false);
});

test("le rapport d'attaque expose les dégâts réellement retirés au héros", () => {
  const battle = createBattle(); const hero = battle.getEntity("hero-blue");
  hero.health = 2;
  const result = battle.attack("unit-red", hero.id);
  const event = battle.eventLog.find((entry) => entry.type === "attack");
  assert.equal(result.damage, 2); assert.ok(result.rolledDamage > result.damage);
  assert.equal(event.damage, 2); assert.equal(event.rolledDamage, result.rolledDamage);
  assert.equal(hero.health, 0);
});

test("all attacks prepared during one tick are resolved simultaneously", () => {
  const battle = new BattleEngine({ id: "simultaneous", teams: [
    { id: "red", heroes: [{ id: "hr", playerId: "red" }], units: [{ id: "ur", playerId: "red", attack: 100, defense: 0, speed: 1, range: 1, quantity: 1, maxQuantity: 1 }] },
    { id: "blue", heroes: [{ id: "hb", playerId: "blue" }], units: [{ id: "ub", playerId: "blue", attack: 100, defense: 0, speed: 1, range: 1, quantity: 1, maxQuantity: 1 }] },
  ] });
  battle.getEntity("ur").progress = 0.8;
  battle.getEntity("ub").progress = 0.8;
  battle.tick(500);
  assert.equal(battle.getEntity("ur").state, "defeated");
  assert.equal(battle.getEntity("ub").state, "defeated");
  assert.equal(battle.eventLog.filter((event) => event.type === "attack").length, 2);
});

test("retreat orders successively select the foremost eligible unit", () => {
  const battle = new BattleEngine({ id: "retreat-order", teams: [
    { id: "red", heroes: [{ id: "hr", playerId: "red" }], units: [
      { id: "front", playerId: "red", attack: 1, defense: 1, speed: 1, quantity: 2, maxQuantity: 2 },
      { id: "rear", playerId: "red", attack: 1, defense: 1, speed: 1, quantity: 2, maxQuantity: 2 },
    ] },
    { id: "blue", heroes: [{ id: "hb", playerId: "blue" }], units: [] },
  ] });
  battle.start(); battle.getEntity("front").progress = 0.8; battle.getEntity("rear").progress = 0.4;
  assert.equal(battle.orderRetreat("red", 1).unitId, "front");
  assert.equal(battle.orderRetreat("red", 1).unitId, "rear");
  assert.deepEqual(battle.orderRetreat("red", 1), { success: false, reason: "no_retreat_candidate" });
});

test("a retreating unit returns to the hand using its retreat statistics", () => {
  const battle = new BattleEngine({ id: "retreat-hand", teams: [
    { id: "red", heroes: [{ id: "hr", playerId: "red" }], units: [{ id: "ur", playerId: "red", attack: 5, defense: 1, speed: 1, range: 1, retreat: { speed: 4, defense: 5, attack: 3, range: 2 }, quantity: 5, maxQuantity: 5 }] },
    { id: "blue", heroes: [{ id: "hb", playerId: "blue" }], units: [] },
  ] });
  battle.start(); const unit = battle.getEntity("ur"); unit.progress = 0.3;
  battle.orderRetreat("red", 1); battle.tick(1_000);
  assert.equal(unit.lane, null); assert.equal(unit.retreating, false); assert.equal(unit.state, "active");
  assert.deepEqual(unit.retreat, { speed: 4, defense: 5, attack: 3, range: 2 });
  assert.ok(battle.eventLog.some((event) => event.type === "unit_returned_to_hand" && event.unitId === "ur"));
});

test("les retraites et pouvoirs spéciaux consomment le commandement du héros", () => {
  const battle = new BattleEngine({ id: "command", teams: [
    { id: "red", heroes: [{ id: "hr", playerId: "red", maxCommandPoints: 3, specialPowerIds: ["rally"] }], units: [{ id: "ur", playerId: "red", attack: 1, defense: 1, speed: 1, quantity: 2, maxQuantity: 2, specialPowerIds: ["charge"] }] },
    { id: "blue", heroes: [{ id: "hb", playerId: "blue" }], units: [] },
  ] });
  battle.start();
  assert.equal(battle.orderRetreat("red", 1).success, true);
  assert.deepEqual(battle.activateSpecialPower({ teamId: "red", userId: "hr", powerId: "rally", cost: 1 }), { success: true, commanderId: "hr", remainingCommandPoints: 1 });
  assert.equal(battle.activateSpecialPower({ teamId: "red", userId: "ur", powerId: "charge", cost: 2 }).reason, "insufficient_command_points");
  assert.equal(battle.eventLog.filter((event) => event.type === "command_spent").length, 2);
});

test("un soldat à quatre PV devient blessé et son unité fuit sans perdre son effectif", () => {
  const battle = new BattleEngine({ id: "wounded-rout", config: { randomSeed: 7 }, teams: [
    { id: "red", heroes: [{ id: "hr", playerId: "red" }], units: [{ id: "ur", playerId: "red", attack: 1, defense: 1, damageMin: 1, damageMax: 1, healthPerSoldier: 10, combatHealthThreshold: 4, quantity: 1, maxQuantity: 1 }] },
    { id: "blue", heroes: [{ id: "hb", playerId: "blue" }], units: [{ id: "ub", playerId: "blue", attack: 1, defense: 1, healthPerSoldier: 5, combatHealthThreshold: 4, soldierHealth: [5], quantity: 1, maxQuantity: 1 }] },
  ] });
  const result = battle.attack("ur", "ub"); const target = battle.getEntity("ub");
  assert.equal(result.damage, 1); assert.equal(target.quantity, 1); assert.equal(target.combatantCount, 0); assert.equal(target.woundedCount, 1);
  assert.equal(target.retreating, true); assert.equal(target.retreatReason, "rout");
});

test("une unité dont tous les soldats sont noirs disparaît", () => {
  const battle = new BattleEngine({ id: "dead-stack", config: { randomSeed: 7 }, teams: [
    { id: "red", heroes: [{ id: "hr", playerId: "red" }], units: [{ id: "ur", playerId: "red", attack: 1, defense: 1, damageMin: 1, damageMax: 1, quantity: 1, maxQuantity: 1 }] },
    { id: "blue", heroes: [{ id: "hb", playerId: "blue" }], units: [{ id: "ub", playerId: "blue", attack: 1, defense: 1, healthPerSoldier: 10, soldierHealth: [1], quantity: 1, maxQuantity: 1 }] },
  ] });
  battle.attack("ur", "ub"); const target = battle.getEntity("ub");
  assert.equal(target.quantity, 0); assert.equal(target.deadCount, 1); assert.equal(target.state, "defeated");
});

test("les jets de dégâts sont reproductibles avec la même graine", () => {
  const options = { id: "seeded", config: { randomSeed: 42 }, teams: [
    { id: "red", heroes: [{ id: "hr", playerId: "red" }], units: [{ id: "ur", playerId: "red", attack: 5, defense: 2, damageMin: 2, damageMax: 5, quantity: 3, maxQuantity: 3 }] },
    { id: "blue", heroes: [{ id: "hb", playerId: "blue" }], units: [{ id: "ub", playerId: "blue", attack: 2, defense: 3, quantity: 3, maxQuantity: 3 }] },
  ] };
  const first = new BattleEngine(options); const second = new BattleEngine(options);
  const firstResult = first.attack("ur", "ub"); const secondResult = second.attack("ur", "ub");
  assert.equal(firstResult.rolledDamage, secondResult.rolledDamage);
  assert.deepEqual(first.getEntity("ub").soldierHealth, second.getEntity("ub").soldierHealth);
});
