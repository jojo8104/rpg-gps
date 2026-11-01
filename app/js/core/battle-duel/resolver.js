import { nextDuelEncounter } from "./state.js";
import { applyTroopDamage, ensureTroopHealth } from "./health.js";

const DAMAGE_MULTIPLIER = 2;
const HERO_DUEL_DAMAGE_MULTIPLIER = 3;
const MORALE_LOSS_FACTOR = 6;

const playable = (troop) =>
  troop.count > 0 &&
  !["ROUTED", "DESTROYED", "INCAPACITATED"].includes(troop.tacticalState);
const cavalry = (troop) => /caval|mounted|horse/i.test(troop.typeId ?? "");
const ranged = (troop) => troop.range > 1;
const speedOf = (entity) => Math.max(0.1, Number(entity.speed) || 0.1);

export function techniqueBonuses(entity, order, pass = 1, opening = false) {
  const speed = speedOf(entity);
  if (opening && ranged(entity)) return { attack: speed * 2, defense: 0 };
  if (order === "DEFEND" || order === "SPEAR_WALL")
    return { attack: 0, defense: speed };
  if (order === "CHARGE" && cavalry(entity) && pass === 1)
    return { attack: speed, defense: 0 };
  return { attack: speed / 2, defense: speed / 2 };
}
const entity = (state, player, id) =>
  id === "HERO"
    ? {
        ...player.hero,
        ownerId: player.id,
        count: 1,
        morale: 10,
        range: 1,
        speed: player.hero.speed ?? 3,
        isHero: true,
      }
    : state.troops.find((troop) => troop.id === id);
const activeSelection = (state, player, choice) =>
  choice.cards
    .map((id) => entity(state, player, id))
    .filter((item) => item && (item.isHero ? item.health > 0 : playable(item)));

const ambushMultiplier = (state, entity, stat) => {
  const ambush = state.ambush;
  if (!ambush || state.round > ambush.expiresAfterRound || entity.isHero)
    return 1;
  if (stat === "attack" && entity.ownerId === ambush.attackerTeamId)
    return ambush.attackerAttackMultiplier;
  if (stat === "defense" && entity.ownerId !== ambush.attackerTeamId)
    return ambush.defenderDefenseMultiplier;
  return 1;
};

export function attackValue(
  attacker,
  target,
  order,
  targetOrder,
  encounter,
  bonus,
  pass,
  opening,
  defenseMultiplier = 1,
) {
  if (encounter.twist.id === "NO_CAVALRY" && cavalry(attacker)) return 0;
  if (encounter.twist.id === "NO_RANGED" && ranged(attacker)) return 0;
  if (encounter.twist.id === "HERO_ONLY" && !attacker.isHero) return 0;
  if (encounter.twist.id === "NO_TECHNIQUE") {
    order = "ATTACK";
    targetOrder = "ATTACK";
  }
  const offensive = techniqueBonuses(attacker, order, pass, opening);
  const defensive = techniqueBonuses(target, targetOrder, pass, opening);
  let power = attacker.attack + bonus + offensive.attack;
  if (!attacker.isHero) power *= attacker.count * (0.65 + attacker.morale / 20);
  if (opening) power *= speedOf(attacker) / speedOf(target);
  if (encounter.terrain.id === "FOREST" && cavalry(attacker)) power *= 0.75;
  if (encounter.terrain.id === "HILL" && ranged(attacker)) power *= 1.15;
  if (encounter.terrain.id === "RIVER" && cavalry(attacker)) power *= 0.8;
  if (encounter.weather.id === "RAIN" && ranged(attacker)) power *= 0.75;
  if (encounter.weather.id === "FOG" && ranged(attacker)) power *= 0.8;
  if (encounter.weather.id === "SNOW") power *= 0.9;
  const defense =
    (target.defense + defensive.defense) *
    defenseMultiplier *
    (encounter.twist.id === "CAMP_ASSAULT" &&
    target.ownerId === encounter.raidTarget
      ? 1.2
      : 1);
  const damage = Math.max(
    1,
    Math.floor(
      (power * DAMAGE_MULTIPLIER) / (defense + (target.isHero ? 3 : 5)),
    ),
  );
  // Accélère aussi les duels où une forte défense réduit le coup au minimum.
  return attacker.isHero && target.isHero
    ? damage * HERO_DUEL_DAMAGE_MULTIPLIER
    : damage;
}

function exchange(
  state,
  result,
  choices,
  bonusByPlayer,
  pass,
  opening = false,
) {
  const snapshot = structuredClone(state);
  const damageByTroop = new Map();
  const heroDamage = new Map();
  for (const player of snapshot.players) {
    const opponent = snapshot.players.find((entry) => entry.id !== player.id);
    const attackers = activeSelection(snapshot, player, choices[player.id]);
    const defenders = activeSelection(snapshot, opponent, choices[opponent.id]);
    const target = defenders[0] ?? entity(snapshot, opponent, "HERO");
    for (const attacker of attackers) {
      if (opening && !ranged(attacker)) continue;
      const amount = attackValue(
        {
          ...attacker,
          attack:
            attacker.attack * ambushMultiplier(snapshot, attacker, "attack"),
        },
        {
          ...target,
          defense:
            target.defense * ambushMultiplier(snapshot, target, "defense"),
        },
        choices[player.id].order,
        choices[opponent.id].order,
        snapshot.encounter,
        bonusByPlayer[player.id],
        pass,
        opening,
      );
      if (amount === 0) {
        result.events.push({
          type: "BLOCKED",
          attackerId: attacker.id,
          targetId: target.id,
          pass,
          opening,
        });
        continue;
      }
      if (target.isHero)
        heroDamage.set(
          opponent.id,
          (heroDamage.get(opponent.id) ?? 0) + amount,
        );
      else {
        const packets = damageByTroop.get(target.id) ?? [];
        packets.push(amount);
        damageByTroop.set(target.id, packets);
      }
      result.events.push({
        type: "STRIKE",
        attackerId: attacker.id,
        targetId: target.id,
        ownerId: player.id,
        damage: amount,
        targetIsHero: Boolean(target.isHero),
        pass,
        opening,
      });
      result.impact[player.id] += amount;
    }
  }
  for (const troop of state.troops) {
    const packets = damageByTroop.get(troop.id);
    if (!packets) continue;
    const before = troop.count;
    const deadBefore = troop.deadCount;
    const applied = applyTroopDamage(troop, packets);
    const losses = before - troop.count;
    if (losses > 0)
      troop.morale = Math.max(
        0,
        troop.morale - Math.ceil((losses * MORALE_LOSS_FACTOR) / before),
      );
    result.casualties[troop.id] =
      (result.casualties[troop.id] ?? 0) + troop.deadCount - deadBefore;
    result.troopDamage[troop.id] =
      (result.troopDamage[troop.id] ?? 0) + applied;
    if (troop.count === 0 && troop.woundedCount === 0)
      troop.tacticalState = "DESTROYED";
    else if (troop.count === 0) troop.tacticalState = "INCAPACITATED";
    else if (troop.morale === 0) troop.tacticalState = "ROUTED";
  }
  for (const player of state.players) {
    const amount = Math.min(player.hero.health, heroDamage.get(player.id) ?? 0);
    player.hero.health -= amount;
    result.heroDamage[player.id] = (result.heroDamage[player.id] ?? 0) + amount;
    if (!player.hero.health) player.hero.state = "GHOST";
  }
  result.passes.push({
    pass,
    opening,
    troops: state.troops
      .filter((troop) => choices[troop.ownerId].cards.includes(troop.id))
      .map((troop) => ({
        id: troop.id,
        count: troop.count,
        woundedCount: troop.woundedCount,
        deadCount: troop.deadCount,
        morale: troop.morale,
        tacticalState: troop.tacticalState,
      })),
  });
}

function rewardWinner(state, result, winnerId) {
  if (!winnerId) return;
  const player = state.players.find((entry) => entry.id === winnerId);
  const reward = state.encounter.reward;
  if (
    state.encounter.scene === "CAMP_RAID" &&
    winnerId === state.encounter.raidTarget
  )
    return;
  if (reward.id === "ATTACK_BOOST") player.nextAttackBonus += reward.amount;
  else if (reward.id === "DIVERSION") player.extraCardsNext = 1;
  else if (reward.id === "WAGON") {
    state.pendingRaidTarget = state.players.find(
      (entry) => entry.id !== winnerId,
    ).id;
  } else if (reward.id === "RAID") {
    player.spoils.wood += reward.amount;
  } else if (reward.id === "GOLD") player.spoils.gold += reward.amount;
  else if (reward.id === "XP") player.spoils.xp += reward.amount;
  else if (reward.id === "WOOD") player.spoils.wood += reward.amount;
  result.reward = { ownerId: winnerId, ...reward };
}

export function resolveDuel(input) {
  if (
    input.phase !== "RESOLVING" ||
    !input.players.every((player) => player.locked)
  )
    throw new Error("Les deux choix doivent être verrouillés.");
  const state = structuredClone(input);
  for (const troop of state.troops) ensureTroopHealth(troop);
  const choices = state.pendingChoices;
  const result = {
    round: state.round,
    encounter: structuredClone(state.encounter),
    choices: structuredClone(choices),
    events: [],
    casualties: {},
    troopDamage: {},
    passes: [],
    heroDamage: {},
    impact: Object.fromEntries(state.players.map((player) => [player.id, 0])),
    winnerId: null,
    reward: null,
    combatants: Object.fromEntries(
      state.players.map((player) => [
        player.id,
        choices[player.id].cards.map((id) => {
          const card = entity(state, player, id);
          return {
            id: card.id,
            type: card.isHero ? player.hero.name : card.type,
            typeId: card.typeId ?? null,
            isHero: Boolean(card.isHero),
            range: card.range ?? 1,
            maxCount: card.isHero
              ? player.hero.maxHealth
              : (card.maxCount ?? card.count),
            woundedCount: card.isHero ? 0 : (card.woundedCount ?? 0),
            woundedBefore: card.isHero ? 0 : (card.woundedCount ?? 0),
            deadBefore: card.isHero ? 0 : card.deadCount,
            deadCount: card.isHero ? 0 : card.deadCount,
            before: card.isHero ? card.health : card.count,
            after: null,
          };
        }),
      ]),
    ),
  };
  const fleeing = state.players.filter((player) => choices[player.id].flee);
  if (fleeing.length) {
    state.phase = "FINISHED";
    state.finishReason = "FLEE";
    state.winnerId =
      fleeing.length === 2
        ? null
        : state.players.find((player) => !choices[player.id].flee).id;
    result.winnerId = state.winnerId;
    result.events.push({
      type: "FLEE",
      playerIds: fleeing.map((player) => player.id),
    });
    state.lastResult = result;
    state.history.push(result);
    state.pendingChoices = {};
    return state;
  }
  const played = state.players.filter(
    (player) => choices[player.id].cards.length,
  );
  for (const player of state.players)
    if (choices[player.id].cards.length) player.extraCardsNext = 0;
  if (!played.length) {
    for (const player of state.players) {
      player.hero.health = Math.max(0, player.hero.health - 1);
      result.heroDamage[player.id] = 1;
      if (!player.hero.health) player.hero.state = "GHOST";
    }
    result.events.push({ type: "FATIGUE", damage: 1 });
  } else {
    const bonusByPlayer = Object.fromEntries(
      state.players.map((player) => [
        player.id,
        choices[player.id].cards.length ? player.nextAttackBonus : 0,
      ]),
    );
    for (const player of state.players)
      if (choices[player.id].cards.length) player.nextAttackBonus = 0;
    const canContinue = () =>
      state.players.every(
        (player) =>
          player.hero.health > 0 &&
          (!choices[player.id].cards.length ||
            activeSelection(state, player, choices[player.id]).length > 0),
      );
    if (
      state.players.some((player) =>
        activeSelection(state, player, choices[player.id]).some(ranged),
      )
    )
      exchange(state, result, choices, bonusByPlayer, 0, true);
    const passLimit =
      state.encounter.twist.id === "DUEL_TO_DEATH" && played.length === 2
        ? 200
        : 3;
    for (let pass = 1; pass <= passLimit && canContinue(); pass++)
      exchange(state, result, choices, bonusByPlayer, pass);
    if (played.length === 1) result.winnerId = played[0].id;
    else if (
      result.impact[state.players[0].id] !== result.impact[state.players[1].id]
    )
      result.winnerId = state.players.reduce((best, player) =>
        result.impact[player.id] > result.impact[best.id] ? player : best,
      ).id;
    if (played.length === 2) {
      const standing = state.players.filter(
        (player) =>
          activeSelection(state, player, choices[player.id]).length > 0,
      );
      if (standing.length < 2) result.winnerId = standing[0]?.id ?? null;
    }
    const fallen = state.players.filter(
      (player) => player.hero.state === "GHOST",
    );
    if (fallen.length)
      result.winnerId =
        fallen.length === 2
          ? null
          : state.players.find((player) => player.hero.state !== "GHOST").id;
    if (state.encounter.twist.id === "MORTAL_GROUND" && result.winnerId) {
      for (const troop of state.troops.filter(
        (troop) => troop.ownerId !== result.winnerId,
      )) {
        troop.count = 0;
        troop.soldierHealth.fill(0);
        ensureTroopHealth(troop);
        troop.tacticalState = "DESTROYED";
      }
      result.events.push({
        type: "MORTAL_LOSS",
        loserId: state.players.find((player) => player.id !== result.winnerId)
          .id,
      });
    }
    rewardWinner(state, result, result.winnerId);
  }
  const ghosts = state.players.filter(
    (player) => player.hero.state === "GHOST",
  );
  if (ghosts.length) {
    state.phase = "FINISHED";
    state.finishReason = "HERO_DEFEATED";
    state.winnerId =
      ghosts.length === 2
        ? null
        : state.players.find((player) => player.hero.state !== "GHOST").id;
  } else {
    state.round += 1;
    state.phase = "CHOICE";
    if (state.encounter.scene === "CAMP_RAID") state.pendingRaidTarget = null;
    state.encounter = nextDuelEncounter(state);
    for (const player of state.players) player.locked = false;
  }
  state.lastResult = result;
  for (const player of state.players)
    for (const card of result.combatants[player.id]) {
      const current = card.isHero
        ? player.hero
        : state.troops.find((troop) => troop.id === card.id);
      card.after = card.isHero ? current.health : current.count;
      if (!card.isHero) {
        card.woundedCount = current.woundedCount;
        card.deadCount = current.deadCount;
      }
    }
  state.history.push(result);
  state.pendingChoices = {};
  return state;
}
