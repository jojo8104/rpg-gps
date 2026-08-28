export const UNIT_RANKS = Object.freeze([
  Object.freeze({
    id: "soldier",
    label: "Soldat",
    experience: 0,
    capacity: 6,
    authorityCost: 1,
  }),
  Object.freeze({
    id: "corporal",
    label: "Caporal",
    experience: 100,
    capacity: 10,
    authorityCost: 2,
  }),
  Object.freeze({
    id: "sergeant",
    label: "Sergent",
    experience: 250,
    capacity: 14,
    authorityCost: 3,
  }),
  Object.freeze({
    id: "warrant-officer",
    label: "Adjudant",
    experience: 500,
    capacity: 18,
    authorityCost: 4,
  }),
  Object.freeze({
    id: "lieutenant",
    label: "Lieutenant",
    experience: 900,
    capacity: 24,
    authorityCost: 5,
  }),
]);

export const HERO_COMMAND_RANKS = Object.freeze([
  Object.freeze({
    id: "captain",
    label: "Capitaine",
    level: 1,
    experience: 0,
    capacity: 3,
  }),
  Object.freeze({
    id: "banneret",
    label: "Banneret",
    level: 5,
    experience: 1_000,
    capacity: 4,
  }),
  Object.freeze({
    id: "commander",
    label: "Commandant",
    level: 10,
    experience: 4_500,
    capacity: 5,
  }),
  Object.freeze({
    id: "lord",
    label: "Seigneur",
    level: 15,
    experience: 10_500,
    capacity: 6,
  }),
  Object.freeze({
    id: "marshal",
    label: "Maréchal",
    level: 20,
    experience: 19_000,
    capacity: 7,
  }),
]);

export function rankForExperience(ranks, experience) {
  return (
    [...ranks].reverse().find((rank) => experience >= rank.experience) ??
    ranks[0]
  );
}
export function requireRank(ranks, rankId, label) {
  const rank = ranks.find((candidate) => candidate.id === rankId);
  if (!rank) throw new RangeError(`${label} inconnu : ${rankId}.`);
  return rank;
}
