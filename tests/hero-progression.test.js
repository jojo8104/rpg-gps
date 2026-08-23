import assert from "node:assert/strict";
import test from "node:test";
import { Hero } from "../app/js/core/hero.js";
import { HeroProgressionService, createGrowthPlan } from "../app/js/core/hero-progression-service.js";
import { DEFAULT_HERO_CLASSES, HERO_GRADES, levelForExperience, totalXpForLevel, xpToNextLevel } from "../app/js/core/hero-progression-config.js";

const aptitudes = [
  { id: "charge", name: "Charge", type: "active", scope: "battle", classIds: ["warrior"] },
  { id: "guard", name: "Garde", type: "reaction", scope: "battle", classIds: ["warrior"] },
  { id: "war_cry", name: "Cri", type: "active", scope: "battle", classIds: ["warrior"] },
  { id: "leadership", name: "Commandement", type: "passive", scope: "stats" },
  { id: "endurance", name: "Endurance", type: "passive", scope: "global" },
  { id: "inspiration", name: "Inspiration", type: "passive", scope: "stats" },
  { id: "tactics", name: "Tactique", type: "passive", scope: "battle" },
];
const warrior = DEFAULT_HERO_CLASSES.find((item) => item.id === "warrior");
const createHero = (id = "hero-a", snapshot = {}) => new Hero({ id, playerId: "p", name: "A", classId: "warrior", baseStats: warrior.baseStats, maxHealth: warrior.baseStats.health, maxCommandPoints: warrior.baseStats.command, commandPoints: warrior.baseStats.command, ...snapshot });
const service = () => new HeroProgressionService({ aptitudeDefinitions: aptitudes, now: () => 123 });
const applyLevel = (progression, hero, definition = warrior) => {
  const result = progression.levelUp(hero, definition); assert.equal(result.success, true);
  const pending = hero.pendingLevelUps[0]; assert.ok(pending);
  assert.equal(progression.selectUpgrade(hero, pending.id, pending.proposals[0].id).success, true);
  return result.pending;
};

test("la courbe d'expérience suit les seuils validés", () => {
  assert.equal(xpToNextLevel(1), 100); assert.equal(xpToNextLevel(7), 700);
  assert.equal(totalXpForLevel(2), 100); assert.equal(totalXpForLevel(5), 1_000); assert.equal(totalXpForLevel(20), 19_000);
  assert.equal(levelForExperience(99), 1); assert.equal(levelForExperience(100), 2);
});

test("100 XP signalent un niveau disponible sans l'appliquer automatiquement", () => {
  const progression = service(); const hero = createHero();
  assert.equal(progression.addExperience(hero, 99, "quest:a", warrior).level, 1);
  assert.equal(progression.addExperience(hero, 1, "quest:b", warrior).availableLevelUps, 1);
  assert.equal(hero.level, 1); assert.equal(progression.getProgress(hero).canLevelUp, true);
  applyLevel(progression, hero); assert.equal(hero.level, 2);
  assert.deepEqual(hero.xpHistory.map((entry) => entry.source), ["quest:a", "quest:b"]);
});

test("un gain important conserve l'excédent et laisse les niveaux au choix du joueur", () => {
  const progression = service(); const hero = createHero();
  const result = progression.addExperience(hero, 650, "battle:fort", warrior);
  assert.equal(hero.level, 1); assert.equal(hero.experience, 650); assert.equal(result.availableLevelUps, 3);
  applyLevel(progression, hero); applyLevel(progression, hero); applyLevel(progression, hero); assert.equal(hero.level, 4);
});

test("le niveau et l'expérience sont plafonnés au niveau 20", () => {
  const progression = service(); const hero = createHero();
  progression.addExperience(hero, 50_000, "scenario:final", warrior);
  assert.equal(hero.level, 1); assert.equal(hero.experience, 19_000); assert.equal(progression.getProgress(hero).availableLevelUps, 19);
  while (hero.level < 20) applyLevel(progression, hero);
  assert.equal(progression.getProgress(hero).maximumLevelReached, true);
});

test("les classes conservent leurs statistiques initiales sans muter la définition", () => {
  const before = structuredClone(warrior.baseStats); const hero = createHero();
  hero.statGrowth.attack = 2;
  assert.deepEqual(warrior.baseStats, before); assert.equal(hero.finalStats.attack, 6); assert.equal(hero.finalStats.health, 25);
});

test("chaque sac contient exactement les 19 progressions pondérées et reste stable", () => {
  const first = createGrowthPlan("stable", warrior.growthWeights); const second = createGrowthPlan("stable", warrior.growthWeights); const other = createGrowthPlan("other", warrior.growthWeights);
  assert.equal(first.length, 19); assert.deepEqual(first, second); assert.notDeepEqual(first, other);
  assert.deepEqual(Object.fromEntries(Object.keys(warrior.growthWeights).map((stat) => [stat, first.filter((item) => item === stat).length])), warrior.growthWeights);
});

test("les trois classes ont leurs statistiques, avantages et sacs exacts", () => {
  const expected = { warrior: [4, 3, 3, 3, 5, 25], ranger: [3, 2, 4, 5, 4, 20], mage: [2, 2, 3, 2, 3, 20] };
  for (const definition of DEFAULT_HERO_CLASSES) {
    assert.deepEqual([definition.baseStats.attack, definition.baseStats.defense, definition.baseStats.morale, definition.baseStats.mobility, definition.baseStats.command, definition.baseStats.health], expected[definition.id]);
    assert.ok(definition.advantage.length > 0); assert.equal(createGrowthPlan(`hero-${definition.id}`, definition.growthWeights).length, 19);
  }
});

test("le sac et les choix en attente survivent à une sérialisation", () => {
  const progression = service(); const hero = createHero("saved"); progression.addExperience(hero, 100, "battle:a", warrior); progression.levelUp(hero, warrior);
  const restored = createHero("saved", hero.toJSON());
  assert.deepEqual(restored.growthPlan, hero.growthPlan); assert.deepEqual(restored.pendingLevelUps, hero.pendingLevelUps); assert.deepEqual(restored.progressionHistory, hero.progressionHistory);
});

test("les propositions sont distinctes et une aptitude ne dépasse pas maître", () => {
  const progression = service(); const hero = createHero(); progression.addExperience(hero, 100, "quest:a", warrior);
  progression.levelUp(hero, warrior);
  const pending = hero.pendingLevelUps[0]; assert.equal(pending.proposals.length, 2); assert.notEqual(pending.proposals[0].id, pending.proposals[1].id);
  const choice = pending.proposals[0]; assert.equal(progression.selectUpgrade(hero, pending.id, choice.id).success, true); assert.equal(hero.aptitudeRanks[choice.aptitudeId], "novice");
  hero.aptitudeRanks[choice.aptitudeId] = "master"; progression.addExperience(hero, 200, "quest:b", warrior); progression.levelUp(hero, warrior);
  assert.equal(hero.pendingLevelUps[0].proposals.some((proposal) => proposal.aptitudeId === choice.aptitudeId), false);
});

test("les grades sont débloqués uniquement aux niveaux 5, 10, 15 et 20", () => {
  const progression = service(); const hero = createHero(); progression.addExperience(hero, 19_000, "test", warrior);
  while (hero.level < 20) applyLevel(progression, hero);
  const promotions = hero.progressionHistory.filter((entry) => entry.gradeUnlocked).map((entry) => entry.level);
  assert.deepEqual(promotions, [5, 10, 15, 20]); assert.equal(hero.commandRank, HERO_GRADES.at(-1).id);
});

test("une progression de PV applique bien cinq points et laisse un historique complet", () => {
  const custom = { ...warrior, growthWeights: { attack: 0, defense: 0, morale: 0, mobility: 0, command: 0, health: 19 } };
  const progression = service(); const hero = createHero("health"); progression.addExperience(hero, 100, "quest:healer", custom);
  progression.levelUp(hero, custom);
  assert.equal(hero.statGrowth.health, 5); assert.equal(hero.maxHealth, 30); assert.deepEqual(hero.progressionHistory[0].statIncrease, { stat: "health", amount: 5 }); assert.equal(hero.progressionHistory[0].authorityIncrease, 1);
});
