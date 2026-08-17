export const UNIT_RANKS = Object.freeze([
  Object.freeze({ id: "soldier", label: "Soldat", experience: 0, capacity: 6 }),
  Object.freeze({ id: "corporal", label: "Caporal", experience: 100, capacity: 10 }),
  Object.freeze({ id: "sergeant", label: "Sergent", experience: 250, capacity: 14 }),
  Object.freeze({ id: "warrant-officer", label: "Adjudant", experience: 500, capacity: 18 }),
  Object.freeze({ id: "lieutenant", label: "Lieutenant", experience: 900, capacity: 24 }),
]);

export const HERO_COMMAND_RANKS = Object.freeze([
  Object.freeze({ id: "captain", label: "Capitaine", experience: 0, capacity: 3 }),
  Object.freeze({ id: "banneret", label: "Banneret", experience: 250, capacity: 4 }),
  Object.freeze({ id: "lord", label: "Seigneur", experience: 600, capacity: 5 }),
  Object.freeze({ id: "marshal", label: "Maréchal", experience: 1_200, capacity: 6 }),
]);

export function rankForExperience(ranks, experience) { return [...ranks].reverse().find((rank) => experience >= rank.experience) ?? ranks[0]; }
export function requireRank(ranks, rankId, label) { const rank = ranks.find((candidate) => candidate.id === rankId); if (!rank) throw new RangeError(`${label} inconnu : ${rankId}.`); return rank; }
