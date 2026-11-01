const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
export const SEARCH_REASONS = Object.freeze({
  search_hero_unavailable:
    "Le héros doit être actif dans une partie commencée.",
  hero_busy: "Le héros est occupé par un combat.",
  search_outside_area: "Rejoignez une case autorisée du terrain.",
  search_inside_location:
    "Dans un lieu existant, utilisez les interactions du lieu.",
  search_gps_accuracy: "La position GPS est trop imprécise (50 m maximum).",
  search_already_known: "Le site de cette case est déjà découvert.",
  search_cooldown: "La recherche se recharge.",
  search_in_progress: "Une recherche est déjà en préparation.",
  search_moved: "Revenez sur la case où la recherche a été ouverte.",
  search_preparation_invalid:
    "Vérifiez les ressources, les indices et les spécialistes encore transportés.",
  search_empty_preparation: "Ajoutez au moins un moyen de recherche.",
  search_unavailable: "Cette recherche n’est plus disponible.",
});
export function exteriorSearchDialog({
  controls,
  attempt,
  feedback = "",
  pending = false,
}) {
  const prep = attempt?.preparation ?? {},
    gauge = attempt?.gauge ?? { total: 0, chance: 0 };
  const editable =
    controls.canPrepare && attempt?.status === "preparing" && !pending;
  return `<header><h2>Rechercher un trésor, artefact ou donjon</h2><button type="button" data-search-close>Fermer</button></header>
    <p>La recharge et la baisse de discrétion ont commencé dès l’ouverture. Fermer ou annuler ne les supprime pas.</p>
    <p data-search-penalty></p>${feedback ? `<p role="status">${escape(feedback)}</p>` : ""}
    ${attempt?.result?.message ? `<p class="exterior-search-result" role="status">${escape(attempt.result.message)}</p>` : ""}
    <form data-search-form><fieldset ${editable ? "" : "disabled"}><legend>Préparer la recherche</legend>
    <h3>Indices de recherche réutilisables</h3>${controls.clues.map((clue) => `<label><input type="checkbox" data-search-clue value="${escape(clue.id)}" ${(prep.clueIds ?? []).includes(clue.id) ? "checked" : ""}> ${escape(clue.name)}<small>${escape(clue.text)}</small></label>`).join("") || "<p>Aucun indice de recherche transporté. Les cartes de localisation n’augmentent pas la jauge.</p>"}
    <h3>Spécialistes transportés</h3>${controls.specialists.map((npc) => `<label><input type="checkbox" data-search-npc value="${escape(npc.id)}" ${(prep.npcIds ?? []).includes(npc.id) ? "checked" : ""}> ${escape(npc.name)}</label>`).join("") || "<p>Aucun spécialiste transporté.</p>"}
    <h3>Ressources consommées à la validation</h3><div class="exterior-search-resources">${controls.resources.map((resource) => `<label>${escape(resource.name)} · ${resource.available} disponible(s)<input type="number" min="0" step="1" max="${resource.available}" data-search-resource="${escape(resource.id)}" value="${prep.resources?.[resource.id] ?? 0}"></label>`).join("")}</div></fieldset>
    <section aria-label="Jauge de recherche officielle"><meter min="0" max="100" value="${gauge.total}"></meter><strong>${gauge.total}/100</strong><p>Probabilité indicative : ${Math.round(gauge.chance * 100)} %, si un site est présent et si les indices lui correspondent.</p><p>Indices : ${gauge.clues ?? 0}/40 · spécialistes : ${gauge.specialists ?? 0}/30 · ressources : ${gauge.resources ?? 0}/30.</p></section>
    <p>Les quantités validées sont consommées, même si les points sont plafonnés ou si rien n’est découvert. Les indices et spécialistes sont conservés.</p>
    <div class="exterior-search-actions"><button type="button" data-search-prepare ${editable ? "" : "disabled"}>Actualiser la jauge</button><button type="submit" ${editable ? "" : "disabled"}>Valider la recherche</button><button type="button" data-search-cancel ${attempt?.status === "preparing" && !pending ? "" : "disabled"}>Annuler la recherche</button></div></form>`;
}
