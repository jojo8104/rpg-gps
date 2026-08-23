import { HERO_GRADES, HERO_MAX_LEVEL, HERO_STAT_INCREMENTS, gradeForLevel, levelForExperience, totalXpForLevel, xpToNextLevel } from "./hero-progression-config.js";
import { HeroAptitudeDefinition, nextAptitudeRank } from "./hero-aptitude.js";

/** Progression déterministe et sérialisable d'un héros. */
export class HeroProgressionService {
  constructor({ aptitudeDefinitions = [], now = () => Date.now() } = {}) {
    this.aptitudes = new Map(aptitudeDefinitions.map((definition) => {
      const value = definition instanceof HeroAptitudeDefinition ? definition : new HeroAptitudeDefinition(definition);
      return [value.id, value];
    }));
    this.now = now;
  }

  initializeHero(hero, classDefinition) {
    if (hero.growthPlan.length === 0) hero.growthPlan = createGrowthPlan(hero.id, classDefinition.growthWeights);
    return hero;
  }

  addExperience(hero, amount, source = "unknown", classDefinition) {
    if (!Number.isFinite(amount) || amount <= 0) throw new RangeError("Le gain d'expérience doit être positif.");
    this.initializeHero(hero, classDefinition);
    const previousExperience = hero.experience;
    hero.experience = Math.min(totalXpForLevel(HERO_MAX_LEVEL), hero.experience + amount);
    hero.xpHistory.push({ type: "xp_gain", amount: hero.experience - previousExperience, source, timestamp: this.now() });
    return { amount: hero.experience - previousExperience, source, previousExperience, experience: hero.experience, level: hero.level, availableLevelUps: levelForExperience(hero.experience) - hero.level, maximumLevelReached: hero.level === HERO_MAX_LEVEL };
  }

  levelUp(hero, classDefinition, source = "manual") {
    this.initializeHero(hero, classDefinition);
    if (hero.pendingLevelUps.length > 0) return { success: false, reason: "pending_aptitude_choice" };
    if (hero.level >= HERO_MAX_LEVEL) return { success: false, reason: "maximum_level" };
    if (hero.experience < totalXpForLevel(hero.level + 1)) return { success: false, reason: "insufficient_experience" };
    return { success: true, pending: this.#levelUp(hero, classDefinition, source) };
  }

  selectUpgrade(hero, pendingId, upgradeId) {
    const pending = hero.pendingLevelUps.find((item) => item.id === pendingId);
    if (!pending) return { success: false, reason: "pending_level_up_not_found" };
    const proposal = pending.proposals.find((item) => item.id === upgradeId);
    if (!proposal) return { success: false, reason: "invalid_upgrade" };
    if (nextAptitudeRank(hero.aptitudeRanks[proposal.aptitudeId] ?? null) !== proposal.rank) return { success: false, reason: "stale_upgrade" };
    hero.aptitudeRanks[proposal.aptitudeId] = proposal.rank;
    const definition = this.aptitudes.get(proposal.aptitudeId);
    if (["active", "reaction"].includes(definition?.type)) hero.addSpecialPower(proposal.aptitudeId); else hero.addSkill(proposal.aptitudeId);
    const refreshDefinition = { aptitudeIds: pending.allowedAptitudeIds ?? [], commonAptitudeIds: [] };
    hero.pendingLevelUps.splice(hero.pendingLevelUps.indexOf(pending), 1);
    const history = hero.progressionHistory.find((entry) => entry.pendingLevelUpId === pending.id);
    if (history) history.selectedUpgradeId = proposal.id;
    hero.pendingLevelUps.forEach((item) => { item.proposals = this.#createProposals(hero, refreshDefinition); });
    return { success: true, level: pending.level, aptitudeId: proposal.aptitudeId, rank: proposal.rank, remainingChoices: hero.pendingLevelUps.length };
  }

  getProgress(hero) {
    if (hero.level === HERO_MAX_LEVEL) return { level: hero.level, maximumLevelReached: true, currentLevelXp: 0, xpToNextLevel: 0, nextGrade: null, availableLevelUps: 0, canLevelUp: false };
    const start = totalXpForLevel(hero.level);
    const availableLevelUps = Math.max(0, levelForExperience(hero.experience) - hero.level);
    return { level: hero.level, maximumLevelReached: false, currentLevelXp: Math.min(xpToNextLevel(hero.level), hero.experience - start), xpToNextLevel: xpToNextLevel(hero.level), nextGrade: HERO_GRADES.find((grade) => grade.level > hero.level) ?? null, availableLevelUps, canLevelUp: availableLevelUps > 0 && hero.pendingLevelUps.length === 0 };
  }

  #levelUp(hero, classDefinition, source) {
    hero.level += 1;
    const stat = hero.growthPlan[hero.level - 2]; const amount = HERO_STAT_INCREMENTS[stat];
    hero.statGrowth[stat] += amount;
    if (stat === "health") { hero.maxHealth += amount; hero.health = Math.min(hero.maxHealth, hero.health + amount); }
    if (stat === "command") { hero.maxCommandPoints += amount; hero.commandPoints += amount; }
    const previousGrade = hero.commandRank; const grade = gradeForLevel(hero.level);
    hero.commandRank = grade.id;
    if (grade.id !== previousGrade) { hero.statGrowth.command += 1; hero.maxCommandPoints += 1; hero.commandPoints += 1; }
    const proposals = this.#createProposals(hero, classDefinition);
    const pending = { id: `level-${hero.level}`, level: hero.level, authorityIncrease: 1, statIncrease: { stat, amount }, gradeUnlocked: grade.id === previousGrade ? null : grade.id, allowedAptitudeIds: [...new Set([...(classDefinition.aptitudeIds ?? []), ...(classDefinition.commonAptitudeIds ?? [])])], proposals };
    hero.pendingLevelUps.push(pending);
    const event = { type: "level_up", level: hero.level, xpSource: source, authorityIncrease: 1, statIncrease: { stat, amount }, selectedUpgradeId: null, gradeUnlocked: pending.gradeUnlocked, pendingLevelUpId: pending.id, timestamp: this.now() };
    hero.progressionHistory.push(event);
    return structuredClone(pending);
  }

  #createProposals(hero, classDefinition) {
    const allowedIds = [...new Set([...(classDefinition.aptitudeIds ?? []), ...(classDefinition.commonAptitudeIds ?? [])])];
    let candidates = allowedIds.map((id) => {
      const definition = this.aptitudes.get(id); const rank = nextAptitudeRank(hero.aptitudeRanks[id] ?? null);
      return definition?.supportsClass(hero.classId) && rank ? { id: `${id}_${rank}`, aptitudeId: id, name: definition.name, type: definition.type, scope: definition.scope, rank, description: definition.description, known: Boolean(hero.aptitudeRanks[id]) } : null;
    }).filter(Boolean);
    candidates.sort((first, second) => Number(second.known) - Number(first.known) || stableScore(`${hero.id}:${hero.level}:${first.id}`) - stableScore(`${hero.id}:${hero.level}:${second.id}`));
    if (candidates.length === 1) candidates.push({ ...candidates[0], id: `${candidates[0].id}_alternative`, alternative: true });
    return candidates.slice(0, 2);
  }
}

export function createGrowthPlan(heroId, weights) {
  const bag = Object.entries(weights).flatMap(([stat, count]) => Array.from({ length: count }, () => stat));
  if (bag.length !== HERO_MAX_LEVEL - 1) throw new RangeError("Le sac de progression doit contenir exactement 19 entrées.");
  const random = seededRandom(stableScore(heroId));
  for (let index = bag.length - 1; index > 0; index -= 1) { const target = Math.floor(random() * (index + 1)); [bag[index], bag[target]] = [bag[target], bag[index]]; }
  for (let index = 2; index < bag.length; index += 1) if (bag[index] === bag[index - 1] && bag[index] === bag[index - 2]) { const swap = bag.findIndex((value, candidate) => candidate > index && value !== bag[index]); if (swap !== -1) [bag[index], bag[swap]] = [bag[swap], bag[index]]; }
  return bag;
}
function stableScore(value) { let hash = 2166136261; for (const character of String(value)) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); } return hash >>> 0; }
function seededRandom(seed) { let value = seed || 1; return () => { value += 0x6D2B79F5; let result = value; result = Math.imul(result ^ result >>> 15, result | 1); result ^= result + Math.imul(result ^ result >>> 7, result | 61); return ((result ^ result >>> 14) >>> 0) / 4294967296; }; }
