/** Catégories de présentation uniquement, calculées sur les effectifs connus. */
export function armyBannerSize(units) {
  if (!Array.isArray(units)) return null;
  const soldiers = units.reduce(
    (sum, unit) =>
      sum + Math.max(0, Number(unit.combatantCount ?? unit.quantity ?? 0) || 0),
    0,
  );
  return soldiers === 0
    ? null
    : soldiers < 10
      ? "small"
      : soldiers < 30
        ? "medium"
        : "large";
}
export function armyBanner(units, color = "blue", informationLevel = 3) {
  if (informationLevel < 3) return "";
  const size = armyBannerSize(units);
  if (!size) return "";
  const safeColor = ["blue", "green", "red", "gold"].includes(color)
    ? color
    : "gold";
  return `<span class="rpg-army-banner is-${size} is-${safeColor}" aria-hidden="true"><span class="rpg-army-banner__cloth"></span></span>`;
}
