import { UNIT_RANKS } from "../core/rank-system.js";

export function unitExperienceProgress(unit) {
  const currentIndex = UNIT_RANKS.findIndex((rank) => rank.id === unit.rank);
  const currentRank = UNIT_RANKS[Math.max(0, currentIndex)];
  const nextRank = UNIT_RANKS[currentIndex + 1] ?? null;
  if (nextRank === null) return { currentRank, nextRank, value: 100, label: `${unit.experience} XP · grade maximal` };
  const interval = Math.max(1, nextRank.experience - currentRank.experience);
  const earned = Math.max(0, unit.experience - currentRank.experience);
  const value = Math.min(100, earned / interval * 100);
  return { currentRank, nextRank, value, label: `${unit.experience}/${nextRank.experience} XP` };
}

export function renderUnitExperienceBar(unit, { detailed = false } = {}) {
  const progress = unitExperienceProgress(unit);
  return `<div class="unit-xp${detailed ? " unit-xp--detailed" : " unit-xp--compact"}"><div class="unit-xp__bar" role="progressbar" aria-label="${progress.label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progress.value)}"><i style="width:${progress.value}%"></i><small>${progress.label}</small></div></div>`;
}
