import { ensureTroopHealth } from "./health.js";

const TERRAIN = [
  { id: "PLAIN", label: "Plaine" },
  { id: "FOREST", label: "Forêt" },
  { id: "RIVER", label: "Rivière" },
  { id: "HILL", label: "Colline" },
  { id: "RUINS", label: "Ruines" },
];
const WEATHER = [
  { id: "DRY", label: "Temps sec" },
  { id: "RAIN", label: "Pluie" },
  { id: "FOG", label: "Brouillard" },
  { id: "SNOW", label: "Neige" },
];
const REWARDS = [
  { id: "ATTACK_BOOST", label: "+2 attaque au prochain duel", amount: 2 },
  { id: "GOLD", label: "5 pièces d’or", amount: 5 },
  { id: "XP", label: "10 XP", amount: 10 },
  { id: "WOOD", label: "3 bois", amount: 3 },
  {
    id: "DIVERSION",
    label: "Diversion : 2 cartes au prochain duel",
    amount: 1,
  },
  { id: "WAGON", label: "Percée vers le wagon adverse", amount: 1 },
];
const TWISTS = [
  { kind: "RULE", id: "NO_CAVALRY", label: "Cavalerie : aucune attaque" },
  {
    kind: "RULE",
    id: "NO_RANGED",
    label: "Troupes à distance : aucune attaque",
  },
  { kind: "RULE", id: "DUEL_TO_DEATH", label: "Duel à mort" },
  {
    kind: "RULE",
    id: "HERO_ONLY",
    label: "Seul le héros peut infliger des dégâts",
  },
  {
    kind: "RULE",
    id: "NO_TECHNIQUE",
    label: "Techniques sans effet",
  },
];

const hash = (value) => {
  let result = 2166136261;
  for (const char of String(value))
    result = Math.imul(result ^ char.charCodeAt(0), 16777619);
  return result >>> 0;
};
const pick = (items, seed) => structuredClone(items[seed % items.length]);

export function nextDuelEncounter(state) {
  const seed = hash(`${state.id}:${state.round}:${state.seed}`);
  if (state.pendingRaidTarget) {
    return {
      scene: "CAMP_RAID",
      terrain: { id: "CAMP", label: "Campement ennemi" },
      weather: pick(WEATHER, seed >>> 6),
      reward: { id: "RAID", label: "Piller 5 ressources", amount: 5 },
      twist: {
        kind: "RULE",
        id: "CAMP_ASSAULT",
        label: "Le défenseur du camp gagne +20 % de défense",
      },
      raidTarget: state.pendingRaidTarget,
    };
  }
  return {
    scene: "DUEL",
    terrain: pick(TERRAIN, seed),
    weather: pick(WEATHER, seed >>> 4),
    reward: pick(REWARDS, seed >>> 9),
    twist:
      state.round % 9 === 0
        ? {
            kind: "RULE",
            id: "MORTAL_GROUND",
            label: "Terrain mortel : le perdant perd toutes ses troupes",
          }
        : pick(TWISTS, seed >>> 16),
    raidTarget: null,
  };
}

export function createBattleDuelForGame(battle, seed = 0) {
  const state = {
    id: `${battle.id}-duel`,
    mode: "DUEL",
    version: 5,
    seed,
    round: 1,
    phase: "CHOICE",
    winnerId: null,
    finishReason: null,
    players: battle.teams.slice(0, 2).map((team) => {
      const hero = team.heroes[0];
      return {
        id: team.id,
        locked: false,
        commandPointsMax: battle.config?.tactical
          ? (hero.tacticalCommand ?? hero.command ?? 3)
          : (hero.maxCommandPoints ?? hero.command ?? 3),
        nextAttackBonus: 0,
        extraCardsNext: 0,
        spoils: { gold: 0, xp: 0, wood: 0 },
        hero: {
          id: hero.id,
          name: hero.name ?? team.id,
          health: hero.health,
          maxHealth: hero.maxHealth,
          attack: hero.attack,
          defense: hero.defense,
          speed: hero.speed ?? 3,
          state: "ACTIVE",
        },
      };
    }),
    troops: battle.teams.slice(0, 2).flatMap((team) =>
      team.units
        .filter((unit) => unit.combatantCount > 0)
        .map((unit) => ({
          id: unit.id,
          ownerId: team.id,
          type: unit.typeName ?? unit.name ?? unit.typeId ?? "Troupe",
          typeId: unit.typeId ?? null,
          count: unit.combatantCount,
          maxCount:
            unit.maxQuantity ?? unit.initialQuantity ?? unit.combatantCount,
          woundedCount: unit.woundedCount ?? 0,
          morale: unit.morale,
          attack: unit.attack,
          defense: unit.defense,
          range: unit.range,
          speed: unit.speed,
          tacticalState: "READY",
        })),
    ),
    pendingChoices: {},
    pendingRaidTarget: null,
    encounter: null,
    lastResult: null,
    history: [],
  };
  for (const troop of state.troops) {
    const source = battle.teams
      .flatMap((team) => team.units)
      .find((unit) => unit.id === troop.id);
    ensureTroopHealth(troop, source);
  }
  state.encounter = nextDuelEncounter(state);
  return state;
}

export function duelPlayerView(state, playerId) {
  const view = structuredClone(state);
  view.pendingChoices = {
    [playerId]: view.pendingChoices[playerId] ?? null,
  };
  if (view.tactics) {
    view.tactics.options = Object.fromEntries(
      Object.entries(view.tactics.options).filter(
        ([id]) =>
          view.troops.some(
            (troop) => troop.id === id && troop.ownerId === playerId,
          ) || id === `HERO:${playerId}`,
      ),
    );
  }
  // Les réserves adverses restent secrètes ; les unités déployées sont visibles.
  view.troops = view.troops.map((troop) =>
    troop.ownerId === playerId ||
    (state.tactics && state.tactics.positions[troop.id])
      ? troop
      : {
          id: troop.id,
          ownerId: troop.ownerId,
          available:
            troop.count > 0 &&
            !["ROUTED", "DESTROYED", "INCAPACITATED"].includes(
              troop.tacticalState,
            ),
        },
  );
  // Replay frames obey the same visibility rules as the live battlefield.
  if (view.tactics && view.lastResult?.initial) {
    const frames = [
      view.lastResult.initial,
      ...view.lastResult.steps.flatMap((step) => [
        step.movement,
        step.combat,
        step.after,
      ]),
    ];
    for (const frame of frames.filter(Boolean)) {
      frame.troops = frame.troops.map((troop) =>
        troop.ownerId === playerId || frame.positions[troop.id]
          ? troop
          : { id: troop.id, ownerId: troop.ownerId },
      );
    }
  }
  return view;
}
