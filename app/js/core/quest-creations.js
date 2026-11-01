import { AutonomousGroup } from "./autonomous-group.js";

/** Ordre des créations sérialisées, indépendant de leur ordre dans le fichier. */
export function orderedQuestCreations(entries) {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  if (byId.size !== entries.length)
    throw new Error("Identifiants de création en double.");
  const result = [],
    visiting = new Set(),
    visited = new Set();
  const visit = (entry) => {
    if (visiting.has(entry.id))
      throw new Error("Cycle de dépendances de création.");
    if (visited.has(entry.id)) return;
    if (!["lieu", "marqueur", "item", "ressource", "ga"].includes(entry.type))
      throw new Error("Type de pré requis inconnu.");
    if (
      entry.scope !== undefined &&
      !["world", "instance", ""].includes(entry.scope)
    )
      throw new Error("Portée de création inconnue.");
    if (entry.when === "published" && entry.scope !== "world")
      throw new Error("Une création à la publication exige la portée world.");
    if (!Array.isArray(entry.dependsOn ?? []))
      throw new Error("dependsOn doit être une liste.");
    visiting.add(entry.id);
    const dependencies = new Set(questCreationDependencies(entry, entries));
    if (entry.type === "ga") {
      if (!entry.properties || typeof entry.properties !== "object")
        throw new Error("La création de GA exige properties.");
      if (entry.locationId && byId.has(entry.locationId))
        dependencies.add(entry.locationId);
      if (!entry.locationId && !entry.properties.position)
        throw new Error("Le GA exige un lieu ou une position.");
      if (entry.belongsToLocation && !entry.locationId)
        throw new Error("L’appartenance au lieu exige locationId.");
      if (
        entry.belongsToLocation !== undefined &&
        typeof entry.belongsToLocation !== "boolean"
      )
        throw new Error("belongsToLocation doit être un booléen.");
      new AutonomousGroup({
        ...entry.properties,
        id: entry.id,
        position: entry.properties.position ?? { latitude: 0, longitude: 0 },
        owner: entry.belongsToLocation
          ? { kind: "location", id: entry.locationId }
          : entry.properties.owner,
      });
    }
    for (const id of dependencies) {
      const dependency = byId.get(id);
      if (!dependency)
        throw new Error(`Dépendance de création inconnue : ${id}.`);
      if (
        (entry.when ?? "accepted") === "published" &&
        (dependency.when ?? "accepted") !== "published"
      )
        throw new Error(
          "Une création publiée ne peut dépendre d’une création ultérieure.",
        );
      if (entry.scope === "world" && dependency.scope !== "world")
        throw new Error(
          "Une création commune ne peut dépendre d’une création privée.",
        );
      if (
        id === entry.locationId &&
        !["lieu", "marqueur"].includes(dependency.type)
      )
        throw new Error("Le lieu du GA doit être une création de lieu.");
      visit(dependency);
    }
    visiting.delete(entry.id);
    visited.add(entry.id);
    result.push(entry);
  };
  entries.forEach(visit);
  return result;
}

export function questCreationDependencies(entry, entries) {
  const locations =
    entry.type === "ga"
      ? [
          entry.locationId,
          entry.properties?.owner?.kind === "location"
            ? entry.properties.owner.id
            : null,
        ]
      : [];
  return [
    ...new Set([
      ...(entry.dependsOn ?? []),
      ...locations.filter(
        (id) => id && entries.some((candidate) => candidate.id === id),
      ),
    ]),
  ];
}
