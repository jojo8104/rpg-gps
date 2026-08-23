export const CAMP_DEVELOPMENT_SLOTS = Object.freeze({ 1: 2, 2: 3, 3: 4 });

export const CAMP_IMPROVEMENTS = Object.freeze({
  housing: improvement("Tentes d'habitation", "fundamental", "population", 1, [
    level({ wood: 5 }, "Réduit le mécontentement lié à l'arrivée de population."),
    level({ wood: 10, stone: 5 }, "Améliore l'intégration de la population."),
  ]),
  barricades: improvement("Barricades", "fundamental", "defense", 1, [
    level({ wood: 8 }, "Renforce les points de vie du camp."),
    level({ wood: 15, stone: 5 }, "Renforce davantage les points de vie du camp."),
    level({ wood: 20, stone: 10 }, "Prépare une évolution militaire."),
  ]),
  depot: improvement("Dépôt", "development", "logistics", 1, [
    level({ wood: 10 }, "Ajoute 4 slots universels.", { infrastructureStorage: 4 }),
    level({ wood: 15, stone: 5 }, "Ajoute 8 slots universels.", { infrastructureStorage: 8 }),
    level({ wood: 20, stone: 10, iron: 2 }, "Ajoute 14 slots universels.", { infrastructureStorage: 14 }),
  ]),
  trading_post: improvement("Comptoir de commerce", "development", "economy", 1, [
    level({ wood: 8, gold: 5 }, "Débloque le commerce du camp."),
    level({ wood: 12, gold: 10 }, "Améliore le commerce du camp."),
  ]),
  workshop: improvement("Atelier de chantier", "development", "logistics", 1, [
    level({ wood: 10, iron: 2 }, "Prépare les travaux et le démantèlement."),
    level({ wood: 15, stone: 5, iron: 3 }, "Améliore les travaux et la récupération."),
  ]),
  watch_post: improvement("Poste de guet", "development", "defense", 1, [
    level({ wood: 8 }, "Améliore la surveillance du camp."),
    level({ wood: 12, iron: 2 }, "Améliore encore la surveillance."),
  ]),
  healing_tent: improvement("Tente de soins", "development", "population", 2, [
    level({ wood: 10, gold: 5 }, "Débloque les soins des unités."),
    level({ wood: 15, gold: 10 }, "Prépare une infirmerie de campagne."),
  ]),
  hunting_lodge: improvement("Relais de chasse", "development", "economy", 2, [
    level({ wood: 10 }, "Produit de la nourriture et recrute des archers."),
    level({ wood: 15, iron: 2 }, "Augmente la production et le recrutement."),
  ]),
  prospecting_post: improvement("Poste de prospection", "development", "information", 3, [
    level({ wood: 15, gold: 10, iron: 2 }, "Débloque les futures missions de prospection."),
  ]),
  messenger_relay: improvement("Relais de messagers", "development", "information", 3, [
    level({ wood: 10, gold: 10 }, "Débloque les futurs messages physiques."),
  ]),
});

export const CAMP_LEVEL_REQUIREMENTS = Object.freeze({
  1: Object.freeze({ population: 6, fundamentals: { housing: 1, barricades: 1 }, developmentCategories: 1, costs: Object.freeze({ wood: 20, gold: 10 }) }),
  2: Object.freeze({ population: 12, fundamentals: { housing: 2, barricades: 2 }, developmentCategories: 2, costs: Object.freeze({ wood: 35, stone: 15, gold: 20 }) }),
});

export class CampImprovementService {
  constructor({ progressionService }) { this.progressionService = progressionService; }

  getState(location) {
    if (location.type !== "camp") return null;
    const improvements = Object.entries(CAMP_IMPROVEMENTS).map(([id, definition]) => {
      const currentLevel = location.infrastructure[id] ?? 0;
      const nextLevel = currentLevel + 1;
      const next = definition.levels[nextLevel - 1] ?? null;
      return { id, name: definition.name, slotType: definition.slotType, category: definition.category, minimumCampLevel: definition.minimumCampLevel, level: currentLevel, maximumLevel: definition.levels.length, nextLevel, next, available: next !== null && location.level >= definition.minimumCampLevel };
    });
    const developmentUsed = improvements.filter((entry) => entry.slotType === "development" && entry.level > 0).length;
    return { slots: { used: developmentUsed, maximum: CAMP_DEVELOPMENT_SLOTS[location.level] }, improvements };
  }

  build(location, improvementId) {
    if (location.type !== "camp") return { success: false, reason: "not_a_camp" };
    const definition = CAMP_IMPROVEMENTS[improvementId];
    if (!definition) return { success: false, reason: "unknown_improvement" };
    if (location.level < definition.minimumCampLevel) return { success: false, reason: "camp_level_too_low" };
    const currentLevel = location.infrastructure[improvementId] ?? 0;
    const next = definition.levels[currentLevel];
    if (!next) return { success: false, reason: "maximum_improvement_level" };
    const state = this.getState(location);
    if (definition.slotType === "development" && currentLevel === 0 && state.slots.used >= state.slots.maximum) return { success: false, reason: "no_development_slot" };
    if (!hasResources(location.resources.stock, next.costs)) return { success: false, reason: "insufficient_resources", costs: { ...next.costs } };
    spendResources(location.resources.stock, next.costs);
    location.infrastructure[improvementId] = currentLevel + 1;
    this.applyEffects(location);
    const experienceGained = definition.slotType === "fundamental" ? 15 + currentLevel * 5 : 20 + currentLevel * 10;
    this.progressionService.awardExperience(location, experienceGained, `improvement_${improvementId}_${currentLevel + 1}`);
    return { success: true, improvementId, level: currentLevel + 1, costs: { ...next.costs }, experienceGained };
  }

  applyEffects(location) {
    if (location.type !== "camp") return null;
    const depotLevel = location.infrastructure.depot ?? 0;
    location.resources.infrastructureStorage = CAMP_IMPROVEMENTS.depot.levels[depotLevel - 1]?.effects.infrastructureStorage ?? 0;
    location.recalculateStorageCapacity();
    location.features.garrison = true;
    location.features.healing = (location.infrastructure.healing_tent ?? 0) > 0;
    location.features.trade = (location.infrastructure.trading_post ?? 0) > 0;
    location.features.watch = (location.infrastructure.watch_post ?? 0) > 0;
    location.features.prospecting = (location.infrastructure.prospecting_post ?? 0) > 0;
    location.features.messaging = (location.infrastructure.messenger_relay ?? 0) > 0;
    const huntingLevel = location.infrastructure.hunting_lodge ?? 0;
    location.features.resourceProduction = huntingLevel > 0;
    location.resources.production.food = huntingLevel;
    location.features.recruitment = huntingLevel > 0;
    if (huntingLevel > 0 && !location.recruitment.availableUnitTypeIds.includes("archer")) location.recruitment.availableUnitTypeIds.push("archer");
    if (huntingLevel > 0) {
      location.recruitment.production.archer = huntingLevel;
      location.recruitment.stock.archer ??= 0;
      location.recruitment.capacities.archer = Math.max(location.recruitment.capacities.archer ?? 0, Math.floor((location.population ?? 0) / 4));
    }
    this.progressionService.initialize(location);
    return this.getState(location);
  }

  getLevelUpStatus(location) {
    if (location.type !== "camp") return { eligible: false, reason: "not_a_camp" };
    const requirements = CAMP_LEVEL_REQUIREMENTS[location.level];
    if (!requirements) return { eligible: false, reason: "maximum_level", blockers: [] };
    const requiredExperience = this.progressionService.getExperienceRequired(location);
    const categories = new Set(this.getState(location).improvements.filter((entry) => entry.slotType === "development" && entry.level > 0).map((entry) => entry.category));
    const blockers = [];
    if ((location.population ?? 0) < requirements.population) blockers.push(`Population ${location.population ?? 0}/${requirements.population}`);
    if (location.progression.experience < requiredExperience) blockers.push(`XP ${location.progression.experience}/${requiredExperience}`);
    Object.entries(requirements.fundamentals).forEach(([id, level]) => { if ((location.infrastructure[id] ?? 0) < level) blockers.push(`${CAMP_IMPROVEMENTS[id].name} ${location.infrastructure[id] ?? 0}/${level}`); });
    if (categories.size < requirements.developmentCategories) blockers.push(`Catégories ${categories.size}/${requirements.developmentCategories}`);
    if (!hasResources(location.resources.stock, requirements.costs)) blockers.push(`Ressources : ${formatCosts(requirements.costs)}`);
    return { eligible: blockers.length === 0, blockers, costs: { ...requirements.costs }, requiredExperience, requiredPopulation: requirements.population, requiredCategories: requirements.developmentCategories };
  }

  levelUp(location) {
    const status = this.getLevelUpStatus(location);
    if (!status.eligible) return { success: false, reason: status.reason ?? "requirements_not_met", status };
    spendResources(location.resources.stock, status.costs);
    const result = this.progressionService.levelUp(location);
    if (!result.success) return result;
    this.applyEffects(location);
    return { ...result, costs: status.costs };
  }
}

function improvement(name, slotType, category, minimumCampLevel, levels) { return Object.freeze({ name, slotType, category, minimumCampLevel, levels: Object.freeze(levels) }); }
function level(costs, description, effects = {}) { return Object.freeze({ costs: Object.freeze(costs), description, effects: Object.freeze(effects) }); }
function hasResources(stock, costs) { return Object.entries(costs).every(([id, amount]) => (stock[id] ?? 0) >= amount); }
function spendResources(stock, costs) { Object.entries(costs).forEach(([id, amount]) => { stock[id] = (stock[id] ?? 0) - amount; }); }
function formatCosts(costs) { return Object.entries(costs).map(([id, amount]) => `${amount} ${id}`).join(", "); }
