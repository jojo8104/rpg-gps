/** Graphe de progression sans DOM. Les conditions sont évaluées par le serveur. */
export function validateQuestActionGraph(actions, links) {
  const byId = new Map(actions.map((action) => [action.id, action]));
  const linkIds = new Set();
  for (const action of actions) {
    const outputs = action.outputs ?? ["success"];
    if (
      !Array.isArray(outputs) ||
      !outputs.length ||
      outputs.some((output) => typeof output !== "string" || !output.trim()) ||
      new Set(outputs).size !== outputs.length
    )
      throw new RangeError(
        "Les sorties d'action doivent être des noms uniques non vides.",
      );
    if (action.join !== undefined && !["all", "any"].includes(action.join))
      throw new RangeError("La jonction attend all ou any.");
    if (
      action.terminalOutcome !== undefined &&
      !["success", "failure"].includes(action.terminalOutcome)
    )
      throw new RangeError("La fin d'action attend success ou failure.");
    if (
      action.outputs &&
      action.action === "Combattre" &&
      outputs.some((output) => !["victory", "defeat", "draw"].includes(output))
    )
      throw new RangeError(
        "Un combat utilise les sorties victory, defeat ou draw.",
      );
    if (
      action.outputs &&
      !["Parler", "Combattre"].includes(action.action) &&
      (outputs.length !== 1 || outputs[0] !== "success")
    )
      throw new RangeError(
        "Cette action utilise uniquement la sortie success.",
      );
  }
  for (const link of links) {
    if (
      !link ||
      typeof link !== "object" ||
      typeof link.id !== "string" ||
      !link.id.trim() ||
      linkIds.has(link.id)
    )
      throw new RangeError("Chaque lien exige un identifiant unique.");
    linkIds.add(link.id);
    if (!byId.has(link.from) || !byId.has(link.to) || link.from === link.to)
      throw new RangeError("Référence de lien invalide.");
    if (!(byId.get(link.from).outputs ?? ["success"]).includes(link.output))
      throw new RangeError("Sortie de lien inconnue.");
    if (byId.get(link.from).terminalOutcome)
      throw new RangeError(
        "Une action de fin ne peut pas avoir de lien sortant.",
      );
    if (link.conditions !== undefined && !Array.isArray(link.conditions))
      throw new TypeError("Les conditions de lien doivent être une liste.");
  }
  // Dépendances et liens appartiennent au même graphe : cycles mixtes interdits.
  const visiting = new Set(),
    visited = new Set();
  const visit = (id) => {
    if (visiting.has(id))
      throw new RangeError("Le graphe d'actions contient un cycle.");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const predecessor of [
      ...(byId.get(id).requires ?? []),
      ...links.filter((link) => link.to === id).map((link) => link.from),
    ])
      visit(predecessor);
    visiting.delete(id);
    visited.add(id);
  };
  actions.forEach((action) => visit(action.id));
}

export function initialQuestActionStatus(action, links) {
  return (action.requires ?? []).length ||
    links.some((link) => link.to === action.id)
    ? "locked"
    : "active";
}

/** Décisions figées à la sortie de l'action source, avant les actions suivantes. */
export function resolveQuestActionLinks(
  quest,
  instance,
  actionId,
  output,
  canAccess,
) {
  instance.links ??= {};
  for (const link of quest.links.filter((entry) => entry.from === actionId)) {
    instance.links[link.id] =
      link.output === output && (link.conditions ?? []).every(canAccess)
        ? "selected"
        : "discarded";
  }
}

/** Propage activation et exclusion jusqu'à stabilisation, sans rejouer les effets. */
export function advanceQuestActionGraph(quest, instance, activate, now) {
  instance.links ??= {};
  let changed;
  do {
    changed = false;
    for (const action of quest.actions) {
      const state = instance.actions[action.id];
      if (state.status !== "locked") continue;
      const dependencies = (action.requires ?? []).map(
        (id) => instance.actions[id],
      );
      const incoming = quest.links.filter((link) => link.to === action.id);
      const decisions = incoming.map(
        (link) => instance.links[link.id] ?? "pending",
      );
      const unavailable =
        dependencies.some((entry) => entry.status === "skipped") ||
        (incoming.length &&
          (action.join === "all"
            ? decisions.includes("discarded")
            : decisions.every((decision) => decision === "discarded")));
      if (unavailable) {
        state.status = "skipped";
        state.skippedAt = now();
        for (const link of quest.links.filter(
          (entry) => entry.from === action.id,
        ))
          instance.links[link.id] = "discarded";
        changed = true;
      } else if (
        dependencies.every((entry) => entry.status === "completed") &&
        (!incoming.length ||
          (action.join === "all"
            ? decisions.every((decision) => decision === "selected")
            : decisions.includes("selected")))
      ) {
        state.status = "active";
        state.activatedAt = now();
        activate(action, instance);
        changed = true;
      }
    }
  } while (changed);
}
