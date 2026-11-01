import { getItemDefinition } from "../core/item-catalog.js";
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function campInstallationDialog({
  controls,
  missions = [],
  feedback = "",
  pending = false,
}) {
  const resource = {
    none: "Terrain vide",
    wood: "Bois",
    stone: "Pierre",
    "fertile-land": "Terre fertile",
    iron: "Fer",
    gold: "Or",
  };
  return `<header><h2>Installer un camp</h2><button type="button" data-camp-close>Fermer</button></header><p>${esc(feedback)}</p><p>Coût : ${Object.entries(
    controls.cost,
  )
    .map(([id, n]) => `${n} ${esc(getItemDefinition(id)?.name ?? id)}`)
    .join(
      ", ",
    )}. Le camp sera de niveau 1, sans habitants ni production automatique.</p><button type="button" data-camp-found ${controls.canFound && !pending ? "" : "disabled"}>Fonder sur ma case actuelle</button><form><fieldset ${pending ? "disabled" : ""}><label>Case prospectée <select data-camp-cell>${controls.targets.map((t) => `<option value="${esc(t.id)}" ${t.available ? "" : "disabled"}>Case ${t.row}, ${t.column} · ${esc(resource[t.resource])}${t.available ? "" : " · indisponible"}</option>`).join("")}</select></label><label>Poste de départ <select data-camp-origin>${controls.origins.map((o) => `<option value="${esc(o.id)}" ${o.affordable ? "" : "disabled"}>${esc(o.name)}${o.affordable ? "" : " · ressources insuffisantes"}</option>`).join("")}</select></label><button type="submit" ${!controls.origins.some((o) => o.affordable) || !controls.targets.some((t) => t.available) ? "disabled" : ""}>Envoyer l’installation</button></fieldset></form><p>Les réserves du poste sont retirées au départ et consommées à la fondation. Si la case n’est plus disponible à l’arrivée, les moyens restants reviennent au poste.</p>${missions.map((m) => `<article><p>Installation · ${esc(m.status)}${m.result?.message ? ` · ${esc(m.result.message)}` : ""}</p>${m.result?.cargoPending > 0 ? `<button type="button" data-camp-unload="${esc(m.id)}" ${pending ? "disabled" : ""}>Décharger le retour</button>` : ""}</article>`).join("")}<p>Seules les cases connues peuvent être utilisées. Une prospection révèle aussi les terrains vides. Les évolutions seront limitées à la ressource de la case.</p>`;
}
