import { getItemDefinition } from "../core/item-catalog.js";
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function exceptionalExpeditionDialog({
  controls,
  mission,
  sent = [],
  history = [],
  originLocationId = null,
  siteId = null,
  feedback = "",
  pending = false,
}) {
  const source = controls.sources.find(
    (s) => s.originLocationId === originLocationId,
  ) ??
    controls.sources[0] ?? {
      originLocationId: null,
      npcs: [],
      volunteers: [],
      mounts: {},
      equipment: {},
      resources: {},
    };
  const p = mission?.preparation ?? {},
    locked = !!mission;
  const editable =
    !pending &&
    controls.canPrepare !== false &&
    controls.sites.length > 0 &&
    (!mission || mission.status === "preparing");
  const inputs = (category, values) =>
    Object.entries(values)
      .map(
        ([id, max]) =>
          `<label>${esc({ food: "Nourriture", wood: "Bois", beer: "Bière", horse: "Montures", exploration_tools: "Outils d’exploration" }[id] ?? id)} (${max}) <input data-exp-quantity data-category="${category}" data-id="${esc(id)}" type="number" min="0" max="${max}" step="1" value="${p[category]?.[id] ?? 0}"></label>`,
      )
      .join("");
  return `<form><header><h2>Expédition exceptionnelle</h2><button type="button" data-exp-close>Fermer</button></header><p>${esc(feedback)}</p><p>Choisissez vos moyens, rejoignez le site puis lancez la tentative. Les groupes envoyés tentent automatiquement leur chance à l’arrivée.</p><fieldset ${editable ? "" : "disabled"}><label>Site <select data-exp-site ${locked ? "disabled" : ""}>${controls.sites.map((s) => `<option value="${esc(s.id)}" ${s.id === (mission?.siteId ?? siteId) ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select></label><label>Départ <select data-exp-source ${locked ? "disabled" : ""}>${controls.sources.map((s) => `<option value="${esc(s.originLocationId ?? "")}" ${s.originLocationId === source.originLocationId ? "selected" : ""}>${s.originLocationId ? `Poste de prospection · ${esc(s.originName ?? s.originLocationId)}` : "Avec le héros · bagages et troupes"}</option>`).join("")}</select></label><h3>PNJ</h3>${source.npcs.map((n) => `<label><input type="checkbox" data-exp-npc value="${esc(n.id)}" ${p.npcIds?.includes(n.id) ? "checked" : ""}> ${esc(n.name)}</label>`).join("") || "Aucun PNJ disponible."}<h3>Volontaires</h3>${source.volunteers.map((u) => `<label>${esc(u.name)} (${u.quantity} aptes) <input data-exp-volunteer value="${p.volunteers?.find((v) => v.unitId === u.unitId)?.quantity ?? 0}" data-id="${esc(u.unitId)}" type="number" min="0" max="${u.quantity}" step="1"></label>`).join("") || "Aucune troupe disponible."}<h3>Montures, matériel et provisions</h3>${inputs("mounts", source.mounts)}${inputs("equipment", source.equipment)}${inputs("resources", source.resources)}<button type="submit">Actualiser le score</button></fieldset>${mission ? `<p>État : ${esc(mission.status)} · Score : <strong>${mission.scores.expedition ?? 0}</strong>${mission.kind === "dungeon" ? ` · Puissance : ${mission.scores.power ?? 0}` : ""}</p>${mission.breakdown ? `<p>PNJ ${mission.breakdown.npcs}/30 · Volontaires ${mission.breakdown.volunteers}/20 · Montures ${mission.breakdown.mounts}/10 · Matériel ${mission.breakdown.equipment}/20 · Ressources ${mission.breakdown.resources}/20</p>` : ""}${mission.chance == null ? "<p>Probabilité non disponible pour cette préparation.</p>" : `<p>Réussite : ${Math.round(mission.chance * 1000) / 10} %</p>`}${mission.heroId && ["travelling", "resolving"].includes(mission.status) ? `<button type="button" data-exp-resolve ${pending ? "disabled" : ""}>Tenter le site avec le héros</button>` : ""}<button type="button" data-exp-depart ${editable ? "" : "disabled"}>Confirmer le départ avec la préparation enregistrée</button><button type="button" data-exp-cancel ${editable ? "" : "disabled"}>Annuler la préparation</button>` : ""}${sent.length ? `<h3>Expéditions envoyées</h3>${sent.map((m) => `<p>${esc(controls.sites.find((site) => site.id === m.siteId)?.name ?? m.kind)} · ${esc(m.status)} · score ${m.scores.expedition ?? 0}</p>`).join("")}` : ""}${history.length ? `<h3>Résultats et récompenses</h3>${history.map((m) => `<article><p>${esc(m.result?.message ?? "Expédition terminée.")}</p><p>Or : ${m.result?.gold ?? 0} · XP par participant : ${m.result?.experience ?? 0} · Dégâts héros : ${m.result?.heroDamage ?? 0} · Moral : ${m.result?.moraleDelta ?? 0}</p>${m.result?.troopDamage?.map((d) => `<p>Troupe : ${d.participants} participants · ${d.damage} dégâts · ${d.remaining} survivants</p>`).join("") ?? ""}<p>${m.result?.items?.map((i) => `${esc(getItemDefinition(i.itemId)?.name ?? i.itemId)} × ${i.quantity}`).join(", ") ?? ""}</p>${m.result?.pendingItems?.some((i) => i.quantity > 0) || m.result?.cargoPending > 0 ? `<button type="button" data-exp-claim="${esc(m.id)}" ${pending ? "disabled" : ""}>Retirer les items et décharger le retour</button>` : ""}</article>`).join("")}` : ""}<p>Depuis le poste, les moyens sont retirés du stock et de la garnison au départ. Avec le héros, ils doivent rester transportés : toute perte réduit le score. Les indices ne donnent aucun point d’expédition.</p></form>`;
}
