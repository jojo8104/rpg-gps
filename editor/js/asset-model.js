import { uniqueId } from "./project.js";
export function ensureAssets(project) {
  project.assets ??= {};
  for (const kind of ["npcs", "groups", "items"]) project.assets[kind] ??= [];
  return project.assets;
}
export function addAsset(project, kind, { archetypeId = null } = {}) {
  const assets = ensureAssets(project);
  const id = uniqueId(
    { npcs: "pnj", groups: "ga", items: "objet" }[kind],
    assets[kind],
  );
  const entry =
    kind === "npcs"
      ? {
          id,
          name: "Nouveau PNJ",
          role: "Interlocuteur",
          locationId: "",
          dialogueId: "",
          description: "",
        }
      : kind === "items"
        ? {
            id,
            name: "Nouvel objet",
            category: "unique",
            icon: "◆",
            description: "",
            usage: "",
            equipmentSlot: null,
            modifiers: {},
          }
        : {
            id,
            type: "rogue",
            ...(archetypeId ? { archetypeId } : {}),
            alignment: "neutral",
            owner: { kind: "independent", id: "independent" },
            position: {
              latitude: project.editor.map.latitude,
              longitude: project.editor.map.longitude,
            },
            behavior: "passive",
            status: "idle",
            army: { units: [] },
            cargo: [],
            mission: null,
            detectionMultiplier: 1,
            concealmentMultiplier: 1,
          };
  assets[kind].push(entry);
  return entry;
}
export function renameAsset(project, kind, before, after) {
  const list = ensureAssets(project)[kind];
  if (
    !after.trim() ||
    list.some((entry) => entry.id === after && entry.id !== before)
  )
    throw new Error("L’identifiant doit être unique et non vide.");
  list.find((entry) => entry.id === before).id = after;
  const fields =
    kind === "npcs"
      ? ["giverNpcId", "speakerId"]
      : kind === "items"
        ? ["itemId"]
        : [];
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    for (const [key, entry] of Object.entries(value)) {
      if (fields.includes(key) && entry === before) value[key] = after;
      else visit(entry);
    }
  };
  visit(project.quest);
  visit(project.dialogues);
  visit(project.assets);
  visit(project.campaign?.quests);
  for (const action of [
    project.quest,
    ...(project.campaign?.quests ?? []),
  ].flatMap((quest) => quest.actions)) {
    if (
      kind === "npcs" &&
      action.action === "Parler" &&
      action.dialogue?.qui === before
    )
      action.dialogue.qui = after;
    if (
      kind === "groups" &&
      action.action === "Combattre" &&
      action.qui === before
    )
      action.qui = after;
    if (kind === "items" && action.quoi === before) action.quoi = after;
  }
}
