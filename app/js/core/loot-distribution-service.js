import { BattleLoot } from "./battle-loot.js";

export class LootDistributionService {
  createReward({ id, battle, extraLoot = [], now = () => Date.now() }) {
    if (battle.status !== "finished" || battle.winnerTeamId === null) return null;
    const winners = battle.teams.find((team) => team.id === battle.winnerTeamId)?.heroes.filter((hero) => hero.state === "active") ?? [];
    if (winners.length === 0) return null;
    const rawScores = winners.map((hero) => battle.state.contributions[hero.playerId]?.total ?? 0);
    const total = rawScores.reduce((sum, score) => sum + score, 0);
    const shares = winners.map((hero, index) => ({ playerId: hero.playerId, heroId: hero.sourceId, contribution: rawScores[index], ratio: total > 0 ? rawScores[index] / total : 1 / winners.length }));
    const entries = [...battle.state.loot, ...extraLoot].filter((entry) => entry.protected !== true && !isBarricade(entry)).map((entry) => ({ ...structuredClone(entry), allocations: {} }));
    if (entries.length === 0) return null;
    entries.filter((entry) => entry.portable).forEach((entry) => allocate(entry, shares));
    return new BattleLoot({ id, battleId: battle.id, entries, shares, now });
  }
}

function isBarricade(entry) { return ["barricade", "barricades"].includes(entry?.itemId); }

function allocate(entry, shares) {
  const targets = shares.map((share) => ({ share, exact: entry.quantity * share.ratio }));
  let allocated = 0;
  targets.forEach(({ share, exact }) => { const quantity = Math.floor(exact); entry.allocations[share.playerId] = quantity; allocated += quantity; });
  targets.sort((first, second) => (second.exact - Math.floor(second.exact)) - (first.exact - Math.floor(first.exact)) || second.share.contribution - first.share.contribution || first.share.playerId.localeCompare(second.share.playerId));
  for (let index = 0; allocated < entry.quantity; index += 1, allocated += 1) entry.allocations[targets[index % targets.length].share.playerId] += 1;
}
