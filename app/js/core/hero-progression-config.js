export const HERO_MAX_LEVEL = 20;
export const HERO_STAT_NAMES = Object.freeze([
  "attack",
  "defense",
  "morale",
  "mobility",
  "command",
  "health",
]);

export const HERO_STAT_INCREMENTS = Object.freeze({
  attack: 1,
  defense: 1,
  morale: 1,
  mobility: 1,
  command: 1,
  health: 5,
});

export const HERO_GRADES = Object.freeze([
  Object.freeze({ level: 1, id: "captain", name: "Capitaine", capacity: 3 }),
  Object.freeze({ level: 5, id: "banneret", name: "Banneret", capacity: 4 }),
  Object.freeze({
    level: 10,
    id: "commander",
    name: "Commandant",
    capacity: 5,
  }),
  Object.freeze({ level: 15, id: "lord", name: "Seigneur", capacity: 6 }),
  Object.freeze({ level: 20, id: "marshal", name: "Maréchal", capacity: 7 }),
]);

export const DEFAULT_HERO_CLASSES = Object.freeze([
  createClass({
    id: "warrior",
    name: "Guerrier",
    advantage:
      "Combattant et chef militaire : commandement et autorité supérieurs.",
    features: { role: "fighter", visionRadius: 45 },
    baseStats: {
      attack: 4,
      defense: 3,
      morale: 3,
      mobility: 3,
      command: 5,
      health: 25,
    },
    growthWeights: {
      attack: 5,
      defense: 4,
      morale: 2,
      mobility: 2,
      command: 4,
      health: 2,
    },
    aptitudeIds: ["charge", "guard", "war_cry"],
  }),
  createClass({
    id: "ranger",
    name: "Éclaireur",
    advantage:
      "Détection, discrétion, renseignement et maîtrise des embuscades.",
    features: {
      role: "scout",
      visionRadius: 75,
      detectionMultiplier: 1.5,
      concealmentMultiplier: 0.65,
      informationLevelBonus: 1,
      canPlaceWatchBeacon: true,
      maximumWatchBeacons: 3,
      watchBeaconRadius: 75,
      ignoresAmbushPenalty: true,
    },
    baseStats: {
      attack: 3,
      defense: 2,
      morale: 4,
      mobility: 5,
      command: 4,
      health: 20,
    },
    growthWeights: {
      attack: 3,
      defense: 2,
      morale: 4,
      mobility: 5,
      command: 3,
      health: 2,
    },
    aptitudeIds: ["ambush", "harassment", "tactical_retreat"],
  }),
  createClass({
    id: "mage",
    name: "Mage",
    advantage:
      "Divination, voyage astral et soins automatiques des héros alliés proches.",
    features: {
      role: "arcane_support",
      visionRadius: 45,
      divinationDiameterByGrade: {
        captain: 45,
        banneret: 75,
        commander: 120,
        lord: 180,
        marshal: 270,
      },
      divinationCooldownMs: 300000,
      divinationDurationMs: 60000,
      astralReachBonusByGrade: {
        captain: 15,
        banneret: 25,
        commander: 40,
        lord: 60,
        marshal: 90,
      },
      astralCooldownMs: 600000,
      astralDurationMs: 300000,
      healingAuraRadiusByGrade: {
        captain: 15,
        banneret: 25,
        commander: 40,
        lord: 60,
        marshal: 90,
      },
      healingAuraPerCycle: 1,
    },
    baseStats: {
      attack: 2,
      defense: 2,
      morale: 3,
      mobility: 2,
      command: 3,
      health: 20,
    },
    growthWeights: {
      attack: 3,
      defense: 2,
      morale: 4,
      mobility: 2,
      command: 5,
      health: 3,
    },
    aptitudeIds: ["offensive_magic", "protective_magic", "control_magic"],
  }),
]);

export function xpToNextLevel(level) {
  requireLevel(level);
  return level >= HERO_MAX_LEVEL ? 0 : level * 100;
}
export function totalXpForLevel(level) {
  requireLevel(level);
  return 50 * level * (level - 1);
}
export function levelForExperience(experience) {
  if (!Number.isFinite(experience) || experience < 0)
    throw new RangeError("L'expérience doit être positive ou nulle.");
  let level = 1;
  while (level < HERO_MAX_LEVEL && experience >= totalXpForLevel(level + 1))
    level += 1;
  return level;
}
export function gradeForLevel(level) {
  requireLevel(level);
  return (
    [...HERO_GRADES].reverse().find((grade) => level >= grade.level) ??
    HERO_GRADES[0]
  );
}
export function nextGradeForLevel(level) {
  requireLevel(level);
  return HERO_GRADES.find((grade) => grade.level > level) ?? null;
}
export function classDefinitionFor(id) {
  return (
    DEFAULT_HERO_CLASSES.find((definition) => definition.id === id) ?? null
  );
}

function createClass(definition) {
  return Object.freeze({
    ...definition,
    features: Object.freeze({ ...(definition.features ?? {}) }),
    baseStats: Object.freeze({ ...definition.baseStats }),
    growthWeights: Object.freeze({ ...definition.growthWeights }),
    aptitudeIds: Object.freeze([...definition.aptitudeIds]),
    commonAptitudeIds: Object.freeze([
      "leadership",
      "endurance",
      "inspiration",
      "tactics",
    ]),
  });
}
function requireLevel(level) {
  if (!Number.isInteger(level) || level < 1 || level > HERO_MAX_LEVEL)
    throw new RangeError(
      `Le niveau doit être compris entre 1 et ${HERO_MAX_LEVEL}.`,
    );
}
