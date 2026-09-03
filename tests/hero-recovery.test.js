import assert from "node:assert/strict";
import test from "node:test";
import { Game } from "../app/js/core/game.js";
import { Hero } from "../app/js/core/hero.js";
import { HeroRecoveryService } from "../app/js/core/hero-recovery-service.js";

const playArea = { id: "area", name: "Zone", polygon: [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }, { latitude: 1, longitude: 0 }] };
const setupFor = (players) => ({ id: "recovery", name: "Récupération", mode: "quick", scenarioId: "none", playerCount: players.length, playArea, participants: players.map((id) => ({ playerId: id, name: id })) });
const baseLocation = { id: "base", name: "Refuge", type: "fort", roles: ["spawn"], source: "test", position: { latitude: 0, longitude: 0 }, ownerId: "p1", infrastructure: { healing_tent: 2 }, features: { healing: true } };

test("aucun héros ne récupère naturellement de PV", () => {
  const service = new HeroRecoveryService();
  const hero = new Hero({ id: "hero", playerId: "p1", name: "A", maxHealth: 20, health: 10 });
  assert.equal(service.recover(hero).restoredHealth, 0); assert.equal(hero.health, 10);
  hero.setBattleState({ health: 0, state: "ghost" });
  assert.equal(service.recover(hero, { cycles: 5 }).restoredHealth, 0); assert.equal(hero.health, 0); assert.equal(hero.state, "ghost");
});

test("une localisation de soins ajoute son niveau au soin cyclique", () => {
  const game = new Game({ setup: setupFor(["p1"]), heroClasses: [{ id: "warrior", name: "Guerrier", abilityIds: [] }], locations: [baseLocation] });
  const hero = game.chooseHero("p1", { name: "A", classId: "warrior" }); game.start();
  hero.health = 10; game.getLocation("base").addHero(hero.id);
  const cycle = game.advanceCycle(1, () => 0.5); const recovery = cycle.heroes.find((entry) => entry.heroId === hero.id);
  assert.equal(recovery.naturalHealing, 0); assert.equal(recovery.locationHealing, 2); assert.equal(recovery.restoredHealth, 2); assert.equal(hero.health, 12);
});

test("l'aura du mage soigne automatiquement les autres héros alliés proches", () => {
  const setup = { ...setupFor(["p1", "p2", "p3"]), teams: [{ id: "allies", name: "Alliés", factionId: "f1" }, { id: "enemy", name: "Ennemis", factionId: "f2" }], participants: [{ playerId: "p1", name: "p1", teamId: "allies" }, { playerId: "p2", name: "p2", teamId: "allies" }, { playerId: "p3", name: "p3", teamId: "enemy" }] };
  const classes = [{ id: "mage", name: "Mage", features: { healingAuraRadius: 100, healingAuraPerCycle: 1 } }, { id: "warrior", name: "Guerrier" }];
  let id = 0; const game = new Game({ setup, heroClasses: classes, idGenerator: (prefix) => `${prefix}-${++id}` });
  const mage = game.chooseHero("p1", { name: "Mage", classId: "mage" }); const ally = game.chooseHero("p2", { name: "Allié", classId: "warrior" }); const enemy = game.chooseHero("p3", { name: "Ennemi", classId: "warrior" }); game.start();
  [mage, ally, enemy].forEach((hero) => { hero.health = 10; hero.updatePosition({ latitude: 48.8566, longitude: 2.3522 }); });
  const results = game.recoverHeroes(1); assert.equal(results.find((entry) => entry.heroId === ally.id).auraHealing, 1); assert.equal(ally.health, 11); assert.equal(mage.health, 10); assert.equal(enemy.health, 10);
});

test("un ghost revient uniquement à sa base avec la moitié supérieure de ses PV", () => {
  const locations = [baseLocation, { ...baseLocation, id: "clinic", name: "Clinique", roles: [], ownerId: null }];
  const game = new Game({ setup: setupFor(["p1"]), heroClasses: [{ id: "warrior", name: "Guerrier", abilityIds: [], baseStats: { attack: 1, defense: 1, morale: 1, mobility: 1, command: 3, health: 25 } }], locations });
  const hero = game.chooseHero("p1", { name: "A", classId: "warrior" }); game.start(); hero.setBattleState({ health: 0, state: "ghost" });
  game.getLocation("clinic").addHero(hero.id); assert.equal(game.reviveHeroAtBase({ heroId: hero.id, locationId: "clinic" }).reason, "hero_not_at_base");
  game.getLocation("base").addHero(hero.id); const result = game.reviveHeroAtBase({ heroId: hero.id, locationId: "base" });
  assert.equal(result.success, true); assert.equal(hero.state, "active"); assert.equal(hero.health, 13);
});

test("à zéro PV le héros perd toutes ses troupes et tous ses bagages", () => {
  let sequence = 0; const idGenerator = (prefix) => `${prefix}-${++sequence}`;
  const unitDefinitions = [{ id: "militia", maxQuantity: 10, stats: { attack: 3, defense: 2, speed: 2, range: 1, morale: 4, healthPerSoldier: 10, combatHealthThreshold: 4 }, costs: {} }];
  const heroClasses = [
    { id: "carrier", name: "Porteur", abilityIds: [], startingResources: { gold: 7 }, startingItems: ["iron_sword"], startingUnits: [{ typeId: "militia", quantity: 2 }] },
    { id: "raider", name: "Pillard", abilityIds: [] },
  ];
  const game = new Game({ setup: setupFor(["p1", "p2"]), heroClasses, unitDefinitions, idGenerator });
  const victim = game.chooseHero("p1", { name: "Victime", classId: "carrier" }); const attacker = game.chooseHero("p2", { name: "Attaquant", classId: "raider" }); game.start();
  assert.equal(victim.army.units.length, 1); assert.ok(victim.carriedLoot.length > 0); assert.equal(victim.resources.gold, 7);
  const battle = game.createBattle({ position: { latitude: 0.1, longitude: 0.1 }, teamParticipants: [{ id: "victims", heroIds: [victim.id] }, { id: "attackers", heroIds: [attacker.id] }] });
  const battleAttacker = battle.teams[1].heroes[0]; battleAttacker.attack = 1000; battle.attack(battleAttacker.id, battle.teams[0].heroes[0].id);
  const result = game.resolveBattle(battle.id);
  assert.equal(victim.state, "ghost"); assert.equal(victim.health, 0); assert.equal(victim.army.units.length, 0); assert.equal(victim.carriedLoot.length, 0); assert.equal(victim.resources.gold, 0);
  assert.ok(result.consequences.losses.some((loss) => loss.reason === "hero_became_ghost" && loss.heroId === victim.id));
  assert.ok(result.battleLoot.entries.some((entry) => entry.itemId === "gold" && entry.quantity === 7));
});
