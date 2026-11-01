export const TACTICAL_BONUS_TYPES = Object.freeze({
  ATTACK: { label: "Attaque +20 %", icon: "⚔" },
  DEFENSE: { label: "Défense +20 %", icon: "🛡" },
  MORALE: { label: "Moral +2", icon: "⚑" },
  XP: { label: "10 XP après le combat", icon: "✦" },
  ITEM: { label: "Épée de fer · butin après victoire", icon: "🎁" },
});
const randomFor = (seed, round) => {
  let value = 2166136261;
  for (const char of `${seed}:bonus:${round}`)
    value = Math.imul(value ^ char.charCodeAt(0), 16777619) >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
};
export function initializeTacticalBonuses(state, battle) {
  const humanTeams = battle.teams.filter((team) =>
    team.heroes.some((hero) =>
      battle.config.humanPlayerIds.includes(hero.playerId),
    ),
  );
  state.tactics.bonuses = {
    seed: battle.config.randomSeed,
    rewardTeams:
      humanTeams.length === 1 ? humanTeams.map((team) => team.id) : [],
    pickup: null,
    buffs: {},
    claims: [],
    itemSpawned: false,
    lastAttempt: 0,
  };
  spawnTacticalBonus(state);
}
export function spawnTacticalBonus(state) {
  const bonuses = state.tactics.bonuses;
  if (!bonuses) return;
  for (const [id, buffs] of Object.entries(bonuses.buffs)) {
    for (const [type, buff] of Object.entries(buffs))
      if (buff.expiresAfterRound < state.round) delete buffs[type];
    if (!Object.keys(buffs).length) delete bonuses.buffs[id];
  }
  if (
    bonuses.pickup ||
    (state.round - 1) % 3 !== 0 ||
    bonuses.lastAttempt === state.round
  )
    return;
  bonuses.lastAttempt = state.round;
  const occupied = Object.values(state.tactics.positions);
  const cells = [];
  for (let y = 1; y <= 3; y++)
    for (let x = 0; x < 3; x++) {
      const terrain = state.tactics.battlefield?.cells[y]?.[x];
      if (terrain?.terrain === "water" && terrain.structure?.kind !== "bridge")
        continue;
      if (!occupied.some((p) => p.x === x && p.y === y)) cells.push({ x, y });
    }
  if (!cells.length) return;
  const random = randomFor(bonuses.seed, state.round),
    position = cells[Math.floor(random() * cells.length)];
  const roll = random();
  let type = ["ATTACK", "DEFENSE", "MORALE"][Math.floor(random() * 3)];
  if (bonuses.rewardTeams.length && roll < 0.05 && !bonuses.itemSpawned) {
    type = "ITEM";
    bonuses.itemSpawned = true;
  } else if (bonuses.rewardTeams.length && roll < 0.2) type = "XP";
  bonuses.pickup = {
    id: `bonus:${state.round}`,
    type,
    position,
    spawnRound: state.round,
  };
}
export function collectTacticalBonus(state, actors, events) {
  const bonuses = state.tactics.bonuses,
    pickup = bonuses?.pickup;
  if (!pickup) return;
  const actor = actors.find((entry) => {
    const p = state.tactics.positions[entry.id];
    return (
      p &&
      p.x === pickup.position.x &&
      p.y === pickup.position.y &&
      (entry.isHero
        ? entry.health > 0
        : entry.count > 0 &&
          !["ROUTED", "DESTROYED", "INCAPACITATED"].includes(
            entry.tacticalState,
          )) &&
      events.some(
        (event) =>
          event.actorId === entry.id &&
          ["move", "advance"].includes(event.type) &&
          !event.harassment,
      ) &&
      !events.some((event) => event.actorId === entry.id && event.harassment)
    );
  });
  if (!actor) return;
  if (["ATTACK", "DEFENSE"].includes(pickup.type)) {
    bonuses.buffs[actor.id] ??= {};
    bonuses.buffs[actor.id][pickup.type] = {
      expiresAfterRound: state.round + 1,
    };
  } else if (pickup.type === "MORALE") {
    if (actor.isHero) {
      const player = state.players.find((p) => p.id === actor.ownerId);
      player.cohesion = Math.min(20, player.cohesion + 2);
    } else {
      const troop = state.troops.find((p) => p.id === actor.id);
      troop.morale = Math.min(10, troop.morale + 2);
    }
  } else if (bonuses.rewardTeams.includes(actor.ownerId)) {
    if (pickup.type === "XP")
      state.players.find((p) => p.id === actor.ownerId).spoils.xp += 10;
    else if (pickup.type === "ITEM")
      bonuses.claims.push({
        id: pickup.id,
        ownerId: actor.ownerId,
        itemId: "iron_sword",
      });
  }
  events.push({
    type: "pickup",
    actorId: actor.id,
    bonusType: pickup.type,
    to: pickup.position,
  });
  bonuses.pickup = null;
}
export function tacticalBuff(state, id, type) {
  const buff = state.tactics.bonuses?.buffs[id]?.[type];
  return buff && buff.expiresAfterRound >= state.round ? 1.2 : 1;
}
export function tacticalBonusLoot(battle) {
  return (battle.duel?.tactics?.bonuses?.claims ?? [])
    .filter((claim) => claim.ownerId === battle.winnerTeamId)
    .map((claim) => ({
      id: `tactical:${battle.id}:${claim.id}`,
      itemId: claim.itemId,
      quantity: 1,
      portable: true,
      valuePerUnit: 30,
    }));
}
