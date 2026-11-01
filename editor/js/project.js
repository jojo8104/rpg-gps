/** Données d'édition uniquement. Aucune règle ou progression de partie locale. */
export const ACTION_META = {
  Modifier: {
    icon: "✎",
    color: "amber",
    description: "Modifier une cible",
    defaults: {
      modification: {
        target: "hero",
        property: "resource",
        operation: "remove",
        key: "gold",
        amount: 20,
      },
      interaction: "Appliquer la modification",
    },
  },
  Atteindre: {
    icon: "◎",
    color: "blue",
    description: "Rejoindre un lieu",
    defaults: { lieu: "" },
  },
  Parcourir: {
    icon: "↝",
    color: "blue",
    description: "Parcourir une distance",
    defaults: { distance: 500 },
  },
  Prendre: {
    icon: "↓",
    color: "amber",
    description: "Récupérer un objet ou une ressource",
    defaults: {
      origine: "",
      quoi: "food",
      combien: 1,
      interaction: "Récupérer",
    },
  },
  Donner: {
    icon: "↑",
    color: "amber",
    description: "Livrer un objet ou une ressource",
    defaults: {
      destinataire: "",
      quoi: "food",
      combien: 1,
      interaction: "Remettre",
    },
  },
  Parler: {
    icon: "❝",
    color: "violet",
    description: "Dialoguer et choisir un chemin",
    defaults: { lieu: "", interaction: "Parler" },
  },
  Construire: {
    icon: "⌂",
    color: "green",
    description: "Atteindre un état de construction",
    defaults: { lieu: "", goal: { level: 1 } },
  },
  Combattre: {
    icon: "⚔",
    color: "rose",
    description: "Vérifier un combat officiel",
    defaults: { qui: "" },
  },
};
export function uniqueId(prefix, entries) {
  let index = 1;
  while (entries.some((entry) => entry.id === `${prefix}-${index}`)) index++;
  return `${prefix}-${index}`;
}
export function newProject() {
  return {
    format: "rpg-gps-editor",
    version: 1,
    quest: {
      schemaVersion: 1,
      id: "nouvelle-quete",
      title: "Une nouvelle aventure",
      description: "",
      type: "simple",
      participationModes: ["solo"],
      actions: [],
      links: [],
      prerequisites: [],
      events: [],
      accessConditions: [],
      publicationCondition: null,
      outcomes: { success: [], failure: [], abandoned: [] },
      transitions: [],
    },
    dialogues: {},
    world: {
      scenarioId: "monde-aventure",
      name: "Monde de l’aventure",
      locationSlots: [],
      locations: [],
      playArea: null,
    },
    editor: {
      positions: {},
      viewport: { x: 80, y: 90, zoom: 1 },
      map: { latitude: 48.8566, longitude: 2.3522, zoom: 16 },
    },
  };
}
export function importProject(value, baseWorld = null) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Un objet JSON est attendu.");
  const project =
    value.format === "rpg-gps-editor"
      ? structuredClone(value)
      : { ...newProject(), quest: structuredClone(value) };
  if (
    project.version !== 1 ||
    !project.quest ||
    !Array.isArray(project.quest.actions)
  )
    throw new Error("Format de projet ou de quête non reconnu.");
  project.dialogues ??= {};
  project.media ??= { images: [] };
  if (!Array.isArray(project.media.images))
    throw new Error("La bibliothèque d’images doit être une liste.");
  project.assets ??= { npcs: [], groups: [], items: [] };
  for (const kind of ["npcs", "groups", "items"]) project.assets[kind] ??= [];
  project.quest.links ??= [];
  project.quest.prerequisites ??= [];
  project.quest.events ??= [];
  project.quest.outcomes ??= { success: [], failure: [], abandoned: [] };
  project.quest.accessConditions ??= [];
  project.quest.transitions ??= [];
  project.world ??= baseWorld ? structuredClone(baseWorld) : newProject().world;
  if (value.format !== "rpg-gps-editor" && baseWorld)
    project.world = structuredClone(baseWorld);
  project.editor ??= newProject().editor;
  project.editor.positions ??= {};
  project.editor.viewport ??= { x: 80, y: 90, zoom: 1 };
  project.editor.map ??= newProject().editor.map;
  arrangeMissing(project);
  return project;
}
export function arrangeMissing(project, force = false) {
  const actions = project.quest.actions,
    depths = new Map();
  const depth = (id, visiting = new Set()) => {
    if (depths.has(id)) return depths.get(id);
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const action = actions.find((entry) => entry.id === id);
    const previous = [
      ...(action?.requires ?? []),
      ...project.quest.links
        .filter((link) => link.to === id)
        .map((link) => link.from),
    ];
    const result = previous.length
      ? Math.min(
          12,
          1 +
            Math.max(
              ...previous.map((entry) => depth(entry, new Set(visiting))),
            ),
        )
      : 0;
    depths.set(id, result);
    return result;
  };
  const rows = new Map();
  for (const action of actions) {
    const column = depth(action.id),
      row = rows.get(column) ?? 0;
    rows.set(column, row + 1);
    if (force || !project.editor.positions[action.id])
      project.editor.positions[action.id] = { x: column * 330, y: row * 210 };
  }
}
export function addAction(project, type, position) {
  if (!ACTION_META[type]) throw new Error("Type d’action inconnu.");
  const id = uniqueId(type.toLowerCase(), project.quest.actions);
  const action = {
    id,
    action: type,
    label: ACTION_META[type].description,
    ...structuredClone(ACTION_META[type].defaults),
    requires: [],
    rewards: [],
  };
  if (type === "Parler") {
    action.dialogue = {
      id: "dialogue-" + id,
      qui: "pnj",
      goal: "conversation-terminee",
    };
    project.dialogues[action.dialogue.id] = {
      speakerId: "pnj",
      locationId: "",
      initialNodeId: "accueil",
      nodes: [
        {
          id: "accueil",
          lines: [
            {
              speaker: "Interlocuteur",
              text: "Votre conversation commence ici.",
            },
          ],
          choices: [
            {
              id: "continuer",
              label: "Continuer",
              goal: "conversation-terminee",
            },
          ],
        },
      ],
    };
  }
  project.quest.actions.push(action);
  project.editor.positions[id] = position ?? {
    x: project.quest.actions.length * 40,
    y: project.quest.actions.length * 40,
  };
  return action;
}
export function removeAction(project, id) {
  project.quest.actions = project.quest.actions.filter(
    (entry) => entry.id !== id,
  );
  project.quest.links = project.quest.links.filter(
    (link) => link.from !== id && link.to !== id,
  );
  for (const action of project.quest.actions)
    action.requires = (action.requires ?? []).filter((entry) => entry !== id);
  delete project.editor.positions[id];
}
export function renameAction(project, before, after) {
  if (
    !after.trim() ||
    project.quest.actions.some(
      (entry) => entry.id === after && entry.id !== before,
    )
  )
    throw new Error("L’identifiant doit être unique et non vide.");
  project.quest.actions.find((entry) => entry.id === before).id = after;
  for (const action of project.quest.actions)
    action.requires = (action.requires ?? []).map((id) =>
      id === before ? after : id,
    );
  for (const creation of project.quest.prerequisites)
    if (creation.actionId === before) creation.actionId = after;
  for (const link of project.quest.links) {
    if (link.from === before) link.from = after;
    if (link.to === before) link.to = after;
  }
  const replace = (value) => {
    if (Array.isArray(value)) return value.forEach(replace);
    if (!value || typeof value !== "object") return;
    for (const [key, entry] of Object.entries(value)) {
      if (key === "actionId" && entry === before) value[key] = after;
      else replace(entry);
    }
  };
  replace(project.quest);
  replace(project.world);
  project.editor.positions[after] = project.editor.positions[before];
  if (before !== after) delete project.editor.positions[before];
}
export function addLink(project, from, output, to) {
  if (from === to)
    throw new Error("Une action ne peut pas se relier à elle-même.");
  if (
    project.quest.links.some(
      (entry) =>
        entry.from === from && entry.output === output && entry.to === to,
    )
  )
    throw new Error("Ce lien existe déjà.");
  const link = {
    id: uniqueId("lien", project.quest.links),
    from,
    output,
    to,
    conditions: [],
  };
  project.quest.links.push(link);
  return link;
}
export function actionOutputs(action) {
  return action.outputs ?? ["success"];
}
export function addLocation(project, type = "village") {
  const id = uniqueId("lieu", project.world.locationSlots);
  project.world.locationSlots.push({
    id,
    type,
    defaultPlacement: { strategy: "random" },
    world: { role: "world", visibility: "known", lifetime: "persistent" },
    appearance: { on: "immediate" },
  });
  const location = {
    id,
    name: "Nouveau lieu",
    type,
    source: "scenario",
    interactionRadius: 25,
    detectionRadius: 75,
    roles: [],
  };
  project.world.locations.push(location);
  return location;
}
export function renameLocation(project, before, after) {
  if (
    !after.trim() ||
    project.world.locations.some(
      (entry) => entry.id === after && entry.id !== before,
    )
  )
    throw new Error("Identifiant de lieu manquant ou dupliqué.");
  project.world.locations.find((entry) => entry.id === before).id = after;
  project.world.locationSlots.find((entry) => entry.id === before).id = after;
  const fields = new Set([
    "lieu",
    "origine",
    "destinataire",
    "locationId",
    "locationSlotId",
    "targetLocationId",
    "originLocationId",
  ]);
  const visit = (value) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== "object") return;
    for (const [key, entry] of Object.entries(value)) {
      if (fields.has(key) && entry === before) value[key] = after;
      else visit(entry);
    }
  };
  visit(project.quest);
  visit(project.dialogues);
  visit(project.world.locationSlots);
  visit(project.assets);
  visit(project.campaign?.quests);
}
