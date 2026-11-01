export function referenceOptions(path, project, catalog = {}) {
  const key = path.at(-1),
    actions = project.quest.actions;
  if (["initialNodeId", "nextNodeId"].includes(key)) {
    const dialogue = project.dialogues?.[path[1]];
    return [
      { id: "", name: "Aucun / terminer" },
      ...(dialogue?.nodes ?? []).map((node) => ({
        id: node.id,
        name: node.text?.slice(0, 50) || node.id,
      })),
    ];
  }
  if (key === "typeId")
    return [{ id: "", name: "Choisir…" }, ...(catalog.unitTypes ?? [])];
  if (key === "strategy")
    return [
      "random",
      "fixed",
      "distance",
      "area-relative",
      "player-walk",
      "validated-cell",
    ].map((id) => ({ id, name: id }));
  const list = (entries) => [
    { id: "", name: "Choisir…" },
    ...new Map(
      entries.filter(Boolean).map((entry) => {
        const value =
          typeof entry === "string" ? { id: entry, name: entry } : entry;
        return [
          value.id,
          { id: value.id, name: value.name ?? value.title ?? value.id },
        ];
      }),
    ).values(),
  ];
  if (
    [
      "lieu",
      "origine",
      "destinataire",
      "locationId",
      "locationSlotId",
      "targetLocationId",
      "originLocationId",
    ].includes(key)
  )
    return list([
      ...(project.world.locations ?? []),
      ...project.quest.prerequisites
        .filter((entry) => ["lieu", "marqueur"].includes(entry.type))
        .map((entry) => ({
          id: entry.id,
          name: entry.properties?.name ?? entry.id,
        })),
    ]);
  if (["quoi", "itemId"].includes(key))
    return list([
      ...(catalog.items ?? []),
      ...(catalog.resources ?? []),
      ...(project.assets?.items ?? []),
    ]);
  if (key === "resource")
    return list(catalog.resources ?? ["gold", "food", "wood", "stone", "iron"]);
  if (
    ["giverNpcId", "speakerId"].includes(key) ||
    (key === "qui" && path.includes("dialogue"))
  )
    return list(project.assets?.npcs ?? []);
  if (key === "dialogueId" || (key === "id" && path.includes("dialogue")))
    return list(Object.keys(project.dialogues ?? {}));
  if (["actionId", "from", "to"].includes(key))
    return list(
      actions.map((action) => ({
        id: action.id,
        name: action.label ?? action.id,
      })),
    );
  if (key === "questId")
    return list([project.quest, ...(project.campaign?.quests ?? [])]);
  if (key === "qui")
    return list([
      ...(project.world.locations ?? []),
      ...(project.assets?.groups ?? []),
      ...project.quest.prerequisites.filter((entry) => entry.type === "ga"),
    ]);
  if (key === "when")
    return ["accepted", "published", "ActionCompleted"].map((id) => ({
      id,
      name: {
        accepted: "À l’acceptation",
        published: "À la publication",
        ActionCompleted: "Après une action",
      }[id],
    }));
  return null;
}
