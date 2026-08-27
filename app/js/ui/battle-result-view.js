import { HERO_COMMAND_RANKS, UNIT_RANKS } from "../core/rank-system.js";
import { renderLootStockSheet } from "./loot-stock-sheet.js";

const label = (ranks, id) => ranks.find((rank) => rank.id === id)?.label ?? id;

/** Résumé post-combat : aucune mutation métier, uniquement une lecture du rapport. */
export function renderBattleResultView({ element, battle, result, playerId, playerTeamId, bag, lootMessage = "", onCollectLoot, onReturnToMap }) {
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
  element.innerHTML = `<section class="battle-result ${victory ? "is-victory" : "is-defeat"}"><header class="battle-result__header"><p class="eyebrow">Résultat du combat</p><h3>${victory ? "Victoire" : battle.winnerTeamId === null ? "Issue indécise" : "Défaite"}</h3></header><div class="battle-result__panels"><section><h4>Héros</h4><ul>${heroRows || "<li>Aucune progression</li>"}</ul></section><section><h4>Unités survivantes</h4><ul>${unitRows || "<li>Aucune unité survivante</li>"}</ul>${lossRows ? `<h4>Unités perdues</h4><ul>${lossRows}</ul>` : ""}</section><section class="battle-result__loot"><h4>Butin</h4><div data-result-loot></div></section></div><footer class="battle-result__actions"><button type="button" data-return-map>Retourner sur la carte</button></footer></section>`;
  const lootElement = element.querySelector("[data-result-loot]");
  if (result.battleLoot && bag && onCollectLoot) renderLootStockSheet({ element: lootElement, site: result.battleLoot, playerId, bag, message: lootMessage, onCollect: onCollectLoot, embedded: true });
  else if (result.battleLoot) {
    const entries = result.battleLoot.entries.filter((entry) => entry.portable && (entry.allocations?.[playerId] ?? 0) > 0);
    lootElement.innerHTML = `${lootMessage ? `<p class="sheet-feedback" role="status">${lootMessage}</p>` : ""}<ul>${entries.map((entry) => `<li><strong>${entry.itemId}</strong><span>${entry.allocations[playerId]} attribué(s)</span></li>`).join("") || "<li>Tout le butin a été récupéré.</li>"}</ul>${entries.length ? '<button type="button" data-collect-result-loot>Récupérer le butin</button>' : ""}`;
    lootElement.querySelector("[data-collect-result-loot]")?.addEventListener("click", () => element.dispatchEvent(new CustomEvent("battle-loot-collect", { bubbles: true })));
  } else lootElement.innerHTML = "<p>Aucun butin attribué.</p>";
  element.querySelector("[data-return-map]").addEventListener("click", onReturnToMap);
}
