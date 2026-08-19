import { HERO_COMMAND_RANKS, UNIT_RANKS } from "../core/rank-system.js";

const label = (ranks, id) => ranks.find((rank) => rank.id === id)?.label ?? id;

/** Résumé post-combat : aucune mutation métier, uniquement une lecture du rapport. */
export function renderBattleResultView({ element, battle, result, playerId, playerTeamId, onReturnToMap }) {
  const victory = battle.winnerTeamId === playerTeamId;
  const heroRows = result.heroProgression.filter((entry) => entry.playerId === playerId).map((entry) => {
    const promotion = entry.previousRank !== entry.rank ? ` · ${label(HERO_COMMAND_RANKS, entry.previousRank)} → ${label(HERO_COMMAND_RANKS, entry.rank)}` : "";
    return `<li><strong>${entry.name}</strong><span>+${entry.experienceGained} XP${promotion}</span></li>`;
  }).join("");
  const ownedUnitIds = new Set(battle.teams.find((team) => team.id === playerTeamId)?.units.filter((unit) => unit.playerId === playerId).map((unit) => unit.sourceId) ?? []);
  const battleUnits = new Map(battle.teams.flatMap((team) => team.units).map((unit) => [unit.sourceId, unit]));
  const unitName = (entry) => entry.name ?? battleUnits.get(entry.unitId)?.name ?? battleUnits.get(entry.unitId)?.typeName ?? "Unité";
  const unitRows = result.consequences.survivors.filter((entry) => ownedUnitIds.has(entry.unitId)).map((entry) => {
    const promotion = entry.previousRank !== entry.rank ? ` · ${label(UNIT_RANKS, entry.previousRank)} → ${label(UNIT_RANKS, entry.rank)}` : "";
    return `<li><strong>${unitName(entry)}</strong><span>${entry.combatants ?? entry.quantity} aptes · ${entry.wounded ?? 0} blessés · ${entry.dead ?? 0} morts · +${entry.experienceGained} XP${promotion}</span></li>`;
  }).join("");
  const losses = result.consequences.losses.filter((entry) => ownedUnitIds.has(entry.unitId));
  const lossRows = losses.map((entry) => `<li><strong>${unitName(entry)}</strong><span>Unité perdue</span></li>`).join("");
  const lootRows = result.lootSite?.entries.map((entry) => {
    const allocated = entry.allocations?.[playerId] ?? 0;
    return `<li><strong>${entry.itemId}</strong><span>${entry.portable ? `${allocated} attribué(s)` : "laissé sur le champ de bataille"}</span></li>`;
  }).join("") ?? "";
  element.innerHTML = `<section class="battle-result ${victory ? "is-victory" : "is-defeat"}"><p class="eyebrow">Résultat du combat</p><h3>${victory ? "Victoire" : battle.winnerTeamId === null ? "Issue indécise" : "Défaite"}</h3><section><h4>Héros</h4><ul>${heroRows || "<li>Aucune progression</li>"}</ul></section><section><h4>Unités survivantes</h4><ul>${unitRows || "<li>Aucune unité survivante</li>"}</ul>${lossRows ? `<h4>Unités perdues</h4><ul>${lossRows}</ul>` : ""}</section><section><h4>Butin potentiel</h4><ul>${lootRows || "<li>Aucun butin signalé</li>"}</ul><p>Le butin doit être recherché et récupéré physiquement sur le champ de bataille.</p></section><button type="button" data-return-map>Retourner sur la carte</button></section>`;
  element.querySelector("[data-return-map]").addEventListener("click", onReturnToMap);
}
