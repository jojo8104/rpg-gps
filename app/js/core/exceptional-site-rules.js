export const EXCEPTIONAL_DIFFICULTIES = Object.freeze([40, 70, 100]);
export const EXCEPTIONAL_REWARD_GOLD = Object.freeze({
  treasure: [200, 500, 1000],
  dungeon: [100, 250, 500],
});
export const DUNGEON_EXPERIENCE = Object.freeze([50, 100, 200]);
export const DUNGEON_CONSEQUENCES = Object.freeze({
  success: Object.freeze({ damageRatio: 0.1, moraleDelta: 5 }),
  failure: Object.freeze({ damageRatio: 0.25, moraleDelta: -10 }),
  durationMs: 300000,
});
export function configureExceptionalSite(site, seed = "") {
  let hash = 2166136261;
  for (const c of `${seed}:${site.id}`)
    hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  const index = EXCEPTIONAL_DIFFICULTIES.indexOf(site.requirements?.expedition);
  const tier = index < 0 ? (hash >>> 0) % 3 : index;
  site.requirements ??= {};
  site.requirements.expedition ??= EXCEPTIONAL_DIFFICULTIES[tier];
  if (site.type === "dungeon")
    site.requirements.power ??= EXCEPTIONAL_DIFFICULTIES[tier];
  site.rewards ??= {
    gold: EXCEPTIONAL_REWARD_GOLD[site.type]?.[tier] ?? 0,
    experience: site.type === "dungeon" ? DUNGEON_EXPERIENCE[tier] : 0,
    itemCount: site.type === "treasure" ? 2 : 1,
    powerful: site.type === "artifact",
  };
  if (site.type === "dungeon")
    site.rewards.dungeon ??= structuredClone(DUNGEON_CONSEQUENCES);
  return site;
}
export function exceptionalSuccessChance(site, expedition, power = 0) {
  const ratio = expedition / site.requirements.expedition;
  return Math.max(
    0,
    Math.min(
      0.95,
      0.7 *
        (site.type === "dungeon"
          ? Math.min(ratio, power / site.requirements.power)
          : ratio),
    ),
  );
}
