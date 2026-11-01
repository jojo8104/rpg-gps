import { createPortraitAppearance } from "./portrait-catalog.js";

const ROTATION_CYCLES = 6;
const LOCATION_CAPACITY = Object.freeze({ camp: 2, village: 3, town: 4, capital: 6, fort: 3 });

export const TAVERN_NPC_CATALOG = Object.freeze([
  npc("geologist", "Géologue", "specialist", { gold: 30 }, { itemId: "specialist_geologist" }, 1),
  npc("explorer", "Explorateur aguerri", "specialist", { gold: 25 }, { itemId: "specialist_adventurer" }, 1),
  npc("cartographer", "Cartographe", "specialist", { gold: 25 }, { itemId: "specialist_cartographer" }, 2),
  npc("veteran_miner", "Mineur aguerri", "worker", { gold: 45 }, { itemId: "specialist_miner", productionResource: "iron", productionBonus: 1 }, 2),
  npc("veteran_lumberjack", "Bûcheron aguerri", "worker", { gold: 40 }, { itemId: "specialist_lumberjack", productionResource: "wood", productionBonus: 1 }, 2),
  npc("master_farmer", "Maître fermier", "worker", { gold: 40 }, { itemId: "specialist_farmer", productionResource: "food", productionBonus: 1 }, 2),
  npc("drill_officer", "Officier instructeur", "officer", { gold: 65 }, { itemId: "officer_drill", unitExperience: 40 }, 3),
  npc("veteran_captain", "Capitaine vétéran", "officer", { gold: 90 }, { itemId: "officer_veteran", unitExperience: 80 }, 4, "quest_recruit_veteran_captain"),
  npc("arms_master", "Maître d’armes", "trainer", { gold: 80 }, { heroStat: "attack", statBonus: 1, heroExperience: 50 }, 3),
  npc("court_tactician", "Tacticien de cour", "trainer", { gold: 95 }, { heroStat: "defense", statBonus: 1, heroExperience: 75 }, 4),
  npc("wandering_sage", "Sage itinérant", "trainer", { gold: 110 }, { heroStat: "command", statBonus: 1, heroExperience: 100 }, 5, "quest_recruit_wandering_sage"),
]);

/** Pool mondial et rotation des PNJ de taverne, sans dépendance au DOM. */
export class TavernNpcService {
  constructor(snapshot = null) {
    this.state = snapshot ? structuredClone(snapshot) : {
      rotation: 0,
      cyclesUntilRotation: 0,
      assignments: {},
      acquiredNpcIds: [],
    };
  }

  advance(locations, cycles = 1) {
    this.state.cyclesUntilRotation -= cycles;
    if (this.state.cyclesUntilRotation > 0 && Object.keys(this.state.assignments).length)
      return { rotated: false, cyclesUntilRotation: this.state.cyclesUntilRotation };
    this.rotate(locations);
    return { rotated: true, cyclesUntilRotation: this.state.cyclesUntilRotation };
  }

  rotate(locations) {
    const taverns = locations.filter((location) =>
      (location.infrastructure?.tavern ?? 0) > 0 && location.state !== "destroyed");
    const acquired = new Set(this.state.acquiredNpcIds);
    const available = TAVERN_NPC_CATALOG.filter((entry) => !acquired.has(entry.id));
    const assignments = {};
    let cursor = available.length ? this.state.rotation % available.length : 0;
    for (const location of taverns) {
      const rank = locationRank(location);
      const eligible = available.filter((entry) => entry.minimumLocationRank <= rank);
      const capacity = Math.max(1, (LOCATION_CAPACITY[location.type] ?? 1) + (location.infrastructure.tavern ?? 1) - 1);
      assignments[location.id] = [];
      for (let slot = 0; slot < capacity && eligible.length; slot += 1) {
        const candidate = eligible[(cursor + slot) % eligible.length];
        if (!Object.values(assignments).flat().includes(candidate.id)) assignments[location.id].push(candidate.id);
      }
      cursor += capacity;
    }
    this.state.assignments = assignments;
    this.state.rotation += 1;
    this.state.cyclesUntilRotation = ROTATION_CYCLES;
    return assignments;
  }

  getOffers(location) {
    return (this.state.assignments[location.id] ?? [])
      .map((id) => TAVERN_NPC_CATALOG.find((entry) => entry.id === id))
      .filter(Boolean)
      .map((entry) => ({ ...structuredClone(entry), remainingCycles: this.state.cyclesUntilRotation,
        appearance: createPortraitAppearance({ identity: `tavern-npc:${entry.id}`, locationType: "tavern", role: entry.kind }),
      }));
  }

  acquire({ location, locations = [location], hero, npcId, completedQuestIds = [] }) {
    const offer = this.getOffers(location).find((entry) => entry.id === npcId);
    if (!offer) return { success: false, reason: "npc_unavailable" };
    if (offer.questId && !completedQuestIds.includes(offer.questId))
      return { success: false, reason: "npc_quest_required", questId: offer.questId };
    const missingResources = Object.entries(offer.costs)
      .filter(([id, amount]) => hero.getResourceAmount(id) < amount)
      .map(([id]) => id);
    if (missingResources.length) return { success: false, reason: "insufficient_resources", missingResources };
    Object.entries(offer.costs).forEach(([id, amount]) => hero.spendResource(id, amount));
    const targetLocation = applyEffect(offer, location, hero);
    this.state.acquiredNpcIds.push(offer.id);
    this.state.assignments[location.id] = (this.state.assignments[location.id] ?? []).filter((id) => id !== offer.id);
    return { success: true, npc: offer, effect: structuredClone(offer.effect), targetLocationId: targetLocation?.id ?? location.id };
  }

  toJSON() { return structuredClone(this.state); }

  applyLocationWorkers(location) {
    const workers = [
      ["specialist_miner", "iron"],
      ["specialist_lumberjack", "wood"],
      ["specialist_farmer", "food"],
    ];
    const previous = location.statistics.tavernWorkerProductionBonus ?? {};
    for (const [itemId, resourceId] of workers) {
      const bonus = Math.floor(location.resources.stock[itemId] ?? 0);
      location.resources.production[resourceId] = Math.max(0,
        (location.resources.production[resourceId] ?? 0) - (previous[resourceId] ?? 0) + bonus);
      previous[resourceId] = bonus;
    }
    location.statistics.tavernWorkerProductionBonus = previous;
    location.features.resourceProduction ||= Object.values(location.resources.production).some((amount) => amount > 0);
    return structuredClone(previous);
  }
}

function npc(id, name, kind, costs, effect, minimumLocationRank, questId = null) {
  return Object.freeze({ id, name, kind, costs: Object.freeze(costs), effect: Object.freeze(effect), minimumLocationRank, questId });
}
function locationRank(location) {
  return { camp: 1, village: 2, fort: 2, town: 3, capital: 5 }[location.type] ?? 0;
}
function applyEffect(npc, location, hero) {
  const effect = npc.effect;
  if (npc.kind !== "trainer" && effect.itemId) hero.addResource(effect.itemId, 1);
  if (npc.kind === "trainer" && effect.heroStat) hero.statGrowth[effect.heroStat] += effect.statBonus;
  return location;
}
