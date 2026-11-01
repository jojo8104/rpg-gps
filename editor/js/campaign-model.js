export function ensureCampaign(project) {
  project.campaign ??= {
    id: project.world.scenarioId,
    name: project.world.name,
    intro: "Une aventure composée de plusieurs quêtes.",
    initialQuestIds: [],
    quests: [],
  };
  return project.campaign;
}
export function storeCurrentQuest(project) {
  const campaign = ensureCampaign(project);
  const index = campaign.quests.findIndex(
    (entry) => entry.id === project.quest.id,
  );
  const copy = structuredClone(project.quest);
  if (index < 0) {
    campaign.quests.push(copy);
    if (!campaign.initialQuestIds.length)
      campaign.initialQuestIds.push(copy.id);
  } else campaign.quests[index] = copy;
  return copy;
}
export function addCampaignQuest(project, incoming) {
  if (
    !incoming?.quest ||
    !Array.isArray(incoming.quest.actions) ||
    !incoming.quest.id?.trim() ||
    !incoming.quest.title?.trim()
  )
    throw new Error(
      "Importez une fiche de quête avec id, title et actions, ou un projet d’éditeur.",
    );
  const campaign = ensureCampaign(project);
  if (campaign.quests.some((entry) => entry.id === incoming.quest.id))
    throw new Error(
      "Cette quête est déjà dans le scénario. Ouvrez-la pour la modifier.",
    );
  for (const image of incoming.media?.images ?? []) {
    const existing = project.media?.images.find(
      (entry) => entry.id === image.id,
    );
    if (existing && existing.dataUrl !== image.dataUrl)
      throw new Error(`Image ${image.id} déjà utilisée avec un autre contenu.`);
  }
  for (const [id, dialogue] of Object.entries(incoming.dialogues ?? {}))
    if (
      project.dialogues[id] &&
      JSON.stringify(project.dialogues[id]) !== JSON.stringify(dialogue)
    )
      throw new Error(`Dialogue ${id} déjà utilisé avec un autre contenu.`);
  for (const place of incoming.world?.locations ?? []) {
    const existing = project.world.locations.find(
      (entry) => entry.id === place.id,
    );
    if (existing && existing.type !== place.type)
      throw new Error(
        `Le lieu ${place.id} possède un autre type dans ce monde.`,
      );
  }
  Object.assign(project.dialogues, structuredClone(incoming.dialogues ?? {}));
  project.media ??= { images: [] };
  for (const image of incoming.media?.images ?? [])
    if (!project.media.images.some((entry) => entry.id === image.id))
      project.media.images.push(structuredClone(image));
  for (const slot of incoming.world?.locationSlots ?? [])
    if (!project.world.locationSlots.some((entry) => entry.id === slot.id))
      project.world.locationSlots.push(structuredClone(slot));
  for (const place of incoming.world?.locations ?? [])
    if (!project.world.locations.some((entry) => entry.id === place.id)) {
      const copy = structuredClone(place);
      if (
        !incoming.world.playArea &&
        incoming.world.locationSlots?.find((slot) => slot.id === place.id)
          ?.defaultPlacement?.strategy === "random"
      )
        delete copy.position;
      project.world.locations.push(copy);
    }
  for (const kind of ["npcs", "groups", "items"]) {
    project.assets ??= {};
    project.assets[kind] ??= [];
    for (const entry of incoming.assets?.[kind] ?? [])
      if (!project.assets[kind].some((existing) => existing.id === entry.id))
        project.assets[kind].push(structuredClone(entry));
  }
  campaign.quests.push(structuredClone(incoming.quest));
  if (!campaign.initialQuestIds.length)
    campaign.initialQuestIds.push(incoming.quest.id);
}
export function switchCampaignQuest(project, id) {
  const campaign = ensureCampaign(project);
  if (campaign.quests.some((quest) => quest.id === project.quest.id))
    storeCurrentQuest(project);
  const next = campaign.quests.find((entry) => entry.id === id);
  if (!next) throw new Error("Quête absente du scénario.");
  project.editor.questLayouts ??= {};
  project.editor.questLayouts[project.quest.id] = {
    positions: structuredClone(project.editor.positions),
    viewport: structuredClone(project.editor.viewport),
  };
  project.quest = structuredClone(next);
  const layout = project.editor.questLayouts[id];
  project.editor.positions = structuredClone(layout?.positions ?? {});
  project.editor.viewport = structuredClone(
    layout?.viewport ?? { x: 70, y: 70, zoom: 1 },
  );
}
export function linkCampaignQuests(
  project,
  from,
  to,
  outcome,
  conditions = [],
) {
  const campaign = ensureCampaign(project);
  if (from === to)
    throw new Error("Une quête ne peut pas s’enchaîner sur elle-même.");
  const source =
    from === project.quest.id
      ? project.quest
      : campaign.quests.find((entry) => entry.id === from);
  if (!source || !campaign.quests.some((entry) => entry.id === to))
    throw new Error("Les deux quêtes doivent appartenir au scénario.");
  source.transitions ??= [];
  if (
    source.transitions.some(
      (entry) => entry.questId === to && entry.outcome === outcome,
    )
  )
    throw new Error("Cet enchaînement existe déjà.");
  source.transitions.push({
    questId: to,
    outcome,
    conditions: structuredClone(conditions),
  });
  if (from === project.quest.id) storeCurrentQuest(project);
}
