import { validateStrategicProject } from "../../app/js/core/strategic-event-definition.js";
import { Quest, QUEST_ACTION_TYPES } from "../../app/js/core/quest.js";
import { validateEditorAssets } from "./editor-assets.js";
import { validateProjectMedia } from "./editor-media.js";
import { Scenario } from "../../app/js/core/scenario.js";
import { Location } from "../../app/js/core/location.js";
import { PlayArea } from "../../app/js/core/play-area.js";
import { LocationSpacingPolicy } from "../../app/js/core/location-spacing-policy.js";
import {
  ITEM_DEFINITIONS,
  getItemDefinition,
} from "../../app/js/core/item-catalog.js";
import { questCatalog } from "../quests/quest-catalog.js";
import {
  preparationGameData,
  preparationBindings,
} from "../lobby/preparation-catalog.js";

const resources = ["gold", "wood", "stone", "iron", "food"];
const locationFields = new Set([
  "locationSlotId",
  "locationId",
  "lieu",
  "origine",
  "destinataire",
  "targetLocationId",
]);
const conditionFields = {
  locationPlaced: ["locationId"],
  locationVisible: ["locationId"],
  territoryOccupation: ["minimumRatio"],
  questCompleted: ["questId"],
  actionCompleted: ["actionId"],
  hasResource: ["resource", "amount"],
  hasItem: ["itemId"],
  flag: ["path", "equals"],
};
const effectFields = {
  xp: ["amount"],
  resource: ["resource", "amount"],
  item: ["itemId"],
  revealLocation: ["locationId"],
  flag: ["path", "value"],
  narration: ["text"],
  failQuest: [],
};
const positive = (value) => Number.isSafeInteger(value) && value > 0;

function scenarioFor(world) {
  return {
    id: world.scenarioId || "editor-world",
    name: world.name || "Monde de la quête",
    intro: "Monde préparé avec l’éditeur de quêtes.",
    initialPhaseId: "editor-idle",
    phases: [
      {
        id: "editor-idle",
        title: "Quêtes à actions",
        description: "Progression assurée par le moteur de quêtes à actions.",
        objectives: [],
        transitions: [],
      },
    ],
    locationSlots: world.locationSlots ?? [],
  };
}

export function getEditorCatalog() {
  const locations = preparationGameData.scenario.locationSlots.map((slot) => {
    const binding = preparationBindings.find(
      (entry) => entry.locationSlotId === slot.id,
    );
    const location = preparationGameData.locations.find(
      (entry) => entry.id === binding?.locationId,
    );
    const editorLocation = location
      ? { ...structuredClone(location), id: slot.id }
      : {
          id: slot.id,
          name: slot.id,
          type: slot.type,
          source: "scenario",
          interactionRadius: 25,
          detectionRadius: 75,
        };
    if (
      slot.defaultPlacement?.strategy === "fixed" &&
      slot.defaultPlacement.position
    )
      editorLocation.position = structuredClone(slot.defaultPlacement.position);
    return {
      slot: structuredClone(slot),
      location: editorLocation,
    };
  });
  return {
    actions: QUEST_ACTION_TYPES,
    unitTypes: preparationGameData.unitDefinitions.map((unit) => ({
      id: unit.id,
      name: unit.name ?? unit.id,
    })),
    resources,
    items: Object.values(ITEM_DEFINITIONS).map(({ id, name, category }) => ({
      id,
      name,
      category,
    })),
    locationTypes: [...new Set(locations.map((entry) => entry.slot.type))],
    locations,
    samples: questCatalog.map(({ definition, dialogues, editorProject }) => {
      const used = new Set();
      const visit = (value) => {
        if (Array.isArray(value)) return value.forEach(visit);
        if (!value || typeof value !== "object") return;
        for (const [key, entry] of Object.entries(value)) {
          if (locationFields.has(key) && typeof entry === "string")
            used.add(entry);
          else visit(entry);
        }
      };
      visit(definition);
      visit(dialogues);
      const relevant = locations.filter((entry) => used.has(entry.slot.id));
      return {
        id: definition.id,
        title: definition.title,
        project: {
          format: "rpg-gps-editor",
          version: 1,
          quest: structuredClone(definition),
          dialogues: structuredClone(dialogues),
          world: {
            name: "Monde de « " + definition.title + " »",
            scenarioId: "editor-" + definition.id,
            locationSlots: relevant.map((entry) => entry.slot),
            locations: relevant.map((entry) => entry.location),
            playArea: null,
          },
          editor: { positions: {}, viewport: { x: 70, y: 70, zoom: 1 } },
          ...(editorProject
            ? {
                ...structuredClone(editorProject),
                quest: structuredClone(
                  (
                    editorProject.campaign?.quests ?? [editorProject.quest]
                  ).find((quest) => quest.id === definition.id),
                ),
              }
            : {}),
        },
      };
    }),
  };
}

/** Validation de conception uniquement : aucun état de partie n'est lu ou modifié. */
function validateSingleEditorProject(input) {
  const errors = [],
    warnings = [];
  const error = (path, message) => errors.push({ path, message });
  const warn = (path, message) => warnings.push({ path, message });
  if (!input || typeof input !== "object" || Array.isArray(input))
    return {
      valid: false,
      errors: [
        { path: "project", message: "Le projet doit être un objet JSON." },
      ],
      warnings,
    };
  if (input.format !== "rpg-gps-editor" || input.version !== 1)
    error(
      "project",
      "Format de projet inconnu (rpg-gps-editor, version 1 attendus).",
    );
  const world = input.world ?? {};
  const media = validateProjectMedia(input, error);
  let quest, scenario, area;
  try {
    quest = new Quest(input.quest);
    if (!quest.actions.length || quest.type !== "simple")
      throw new Error("Une quête simple à actions est requise.");
  } catch (issue) {
    error("quest", issue.message);
  }
  try {
    scenario = new Scenario(scenarioFor(world));
  } catch (issue) {
    error("world.locationSlots", issue.message);
  }
  if (world.playArea) {
    try {
      area = new PlayArea(world.playArea);
    } catch (issue) {
      error("world.playArea", issue.message);
    }
  } else
    warn(
      "world.playArea",
      "Aucune play area liée : les contraintes géographiques seront vérifiées lors du placement en partie.",
    );
  const customAssets = validateEditorAssets(input, { error, warn, area });
  const slots = Array.isArray(world.locationSlots) ? world.locationSlots : [];
  const locations = Array.isArray(world.locations) ? world.locations : [];
  if (!Array.isArray(world.locations))
    error("world.locations", "Les lieux doivent être une liste.");
  const ids = new Set(slots.map((slot) => slot.id));
  const created = new Set(
    (quest?.prerequisites ?? [])
      .filter((entry) => ["lieu", "marqueur"].includes(entry.type))
      .map((entry) => entry.id),
  );
  const knownLocation = (id, path) => {
    if (!ids.has(id) && !created.has(id))
      error(
        path,
        `Lieu inconnu : ${id}. Ajoutez-le au monde ou aux créations.`,
      );
  };
  const seen = new Set(),
    placed = [];
  for (const [index, definition] of locations.entries()) {
    const path = `world.locations.${index}`;
    if (!definition || typeof definition !== "object") {
      error(path, "Fiche de lieu invalide.");
      continue;
    }
    if (seen.has(definition.id)) error(path, "Identifiant de lieu en double.");
    seen.add(definition.id);
    const slot = slots.find((entry) => entry.id === definition.id);
    if (!slot)
      error(path, "Le lieu doit avoir un emplacement logique correspondant.");
    else if (slot.type !== definition.type)
      error(path, "Le type du lieu et celui de son emplacement diffèrent.");
    if (slot?.defaultPlacement?.strategy === "fixed" && !definition.position)
      error(
        path + ".position",
        "Un lieu en placement fixe doit avoir une position sur la carte.",
      );
    if (
      definition.position &&
      slot?.defaultPlacement?.strategy === "fixed" &&
      slot.defaultPlacement.position &&
      (definition.position.latitude !==
        slot.defaultPlacement.position?.latitude ||
        definition.position.longitude !==
          slot.defaultPlacement.position?.longitude)
    )
      error(
        path + ".position",
        "La position du lieu et celle du placement fixe doivent correspondre.",
      );
    try {
      const location = new Location({
        ...definition,
        position: definition.position ?? { latitude: 0, longitude: 0 },
      });
      if (definition.position) {
        if (area && !area.allowsPlacement(location.position))
          error(
            path + ".position",
            "Position hors de la play area ou dans une exclusion.",
          );
        placed.push(location);
      } else if (area)
        warn(
          path + ".position",
          "Lieu non placé : le placement reste à définir.",
        );
    } catch (issue) {
      error(path, issue.message);
    }
  }
  for (const slot of slots) {
    if (!seen.has(slot.id))
      error("world.locationSlots", `Fiche de lieu manquante : ${slot.id}.`);
    for (const rule of [slot.appearance, slot.world?.removal]) {
      if (!rule || rule.on === "immediate") continue;
      if (
        rule.questId === quest?.id &&
        rule.actionId &&
        !quest.getAction(rule.actionId)
      )
        error(
          `world.${slot.id}`,
          `Action de déclenchement inconnue : ${rule.actionId}.`,
        );
      else if (rule.questId && rule.questId !== quest?.id)
        warn(
          `world.${slot.id}`,
          `Déclencheur lié à une autre quête : ${rule.questId}.`,
        );
    }
  }
  const validateConditions = (conditions, path, instance = true) => {
    if (!Array.isArray(conditions)) {
      error(path, "Les conditions doivent former une liste.");
      return;
    }
    for (const [index, condition] of conditions.entries()) {
      const at = `${path}.${index}`,
        fields = conditionFields[condition?.type];
      if (!fields) {
        error(at, "Type de condition inconnu.");
        continue;
      }
      for (const field of fields)
        if (condition[field] === undefined || condition[field] === "")
          error(at, `Champ requis : ${field}.`);
      if (condition.locationId) knownLocation(condition.locationId, at);
      if (
        condition.type === "actionCompleted" &&
        (!instance || !quest?.getAction(condition.actionId))
      )
        error(
          at,
          "actionCompleted exige une action connue et une instance de quête.",
        );
      if (
        ["hasResource", "hasItem"].includes(condition.type) &&
        !positive(condition.amount ?? (condition.type === "hasItem" ? 1 : 0))
      )
        error(at, "La quantité doit être un entier positif.");
      if (
        condition.type === "hasResource" &&
        !resources.includes(condition.resource)
      )
        error(at, "Ressource inconnue.");
      if (
        condition.type === "territoryOccupation" &&
        (!Number.isFinite(condition.minimumRatio) ||
          condition.minimumRatio < 0 ||
          condition.minimumRatio > 1)
      )
        error(at, "Le taux doit être compris entre 0 et 1.");
    }
  };
  const validateEffects = (effects, path, allowFailure = false) => {
    if (!Array.isArray(effects)) {
      error(path, "Les effets doivent former une liste.");
      return;
    }
    for (const [index, effect] of effects.entries()) {
      const at = `${path}.${index}`,
        fields = effectFields[effect?.type];
      if (!fields || (effect.type === "failQuest" && !allowFailure)) {
        error(at, "Type d’effet indisponible dans ce contexte.");
        continue;
      }
      for (const field of fields)
        if (effect[field] === undefined || effect[field] === "")
          error(at, `Champ requis : ${field}.`);
      if (
        ["xp", "resource", "item"].includes(effect.type) &&
        !positive(effect.amount ?? (effect.type === "item" ? 1 : 0))
      )
        error(at, "La quantité doit être un entier positif.");
      if (effect.type === "resource" && !resources.includes(effect.resource))
        error(at, "Ressource inconnue.");
      if (
        effect.type === "item" &&
        !getItemDefinition(effect.itemId) &&
        !customAssets.itemIds.has(effect.itemId)
      )
        error(at, "Objet absent du catalogue des récompenses.");
      if (effect.locationId) knownLocation(effect.locationId, at);
      if (effect.recipient !== undefined && effect.recipient !== "participants")
        error(
          at,
          "Destinataire attendu : participants, ou champ absent pour l’acteur.",
        );
    }
  };
  if (quest) {
    if (quest.locationSlotId)
      knownLocation(quest.locationSlotId, "quest.locationSlotId");
    if (
      quest.publicationCondition !== null &&
      quest.publicationCondition !== "none"
    )
      validateConditions(
        [quest.publicationCondition],
        "quest.publicationCondition",
        false,
      );
    validateConditions(quest.accessConditions, "quest.accessConditions", false);
    for (const action of quest.actions) {
      const path = `action:${action.id}`;
      if (
        action.action === "Modifier" &&
        action.modification.property === "item" &&
        !getItemDefinition(action.modification.key)
      )
        error(
          path,
          "L’objet à modifier doit être intégré au catalogue actif du serveur.",
        );
      for (const key of ["lieu", "origine", "destinataire", "targetLocationId"])
        if (action[key]) knownLocation(action[key], path);
      validateEffects(action.rewards ?? [], path + ".rewards");
      if (
        ["Prendre", "Donner"].includes(action.action) &&
        !resources.includes(action.quoi) &&
        !getItemDefinition(action.quoi) &&
        !quest.prerequisites.some((entry) => entry.itemId === action.quoi)
      )
        warn(
          path,
          "Objet de quête personnalisé : vérifier son transport et son usage dans le jeu.",
        );
      if (
        action.action === "Prendre" &&
        !quest.prerequisites.some(
          (entry) =>
            (entry.itemId ?? entry.resource) === action.quoi &&
            entry.locationId === action.origine,
        )
      )
        warn(
          path,
          "Aucun stock de création correspondant : Prendre utilise un stock réservé à la quête, pas le stock économique ordinaire.",
        );
      if (
        action.action === "Combattre" &&
        !action.targetLocationId &&
        !ids.has(action.qui)
      )
        warn(
          path,
          "Cible de combat externe : sa présence devra être garantie par le monde en jeu.",
        );
      if (
        action.action === "Construire" &&
        !action.goal?.improvementId &&
        !action.goal?.type &&
        !positive(action.goal?.level)
      )
        error(
          path,
          "Précisez une amélioration, un type ou un niveau à atteindre.",
        );
      if (action.action === "Parler") {
        const dialogue = input.dialogues?.[action.dialogue.id];
        if (!dialogue) {
          error(path, "Dialogue absent du projet.");
          continue;
        }
        if (dialogue.speakerId !== action.dialogue.qui)
          error(path, "Le PNJ du dialogue et celui de l’action diffèrent.");
        if (action.lieu !== dialogue.locationId)
          error(
            path,
            "Le lieu du bouton et celui du dialogue doivent correspondre.",
          );
        for (const goal of action.outputs ?? [action.dialogue.goal])
          if (
            !(dialogue.nodes ?? []).some((node) =>
              (node.choices ?? []).some((choice) => choice.goal === goal),
            )
          )
            error(path, `Aucun choix ne produit la sortie ${goal}.`);
      }
    }
    for (const link of quest.links)
      validateConditions(link.conditions ?? [], `link:${link.id}`);
    for (const event of quest.events) {
      validateConditions(event.conditions ?? [], `event:${event.id}`);
      validateEffects(event.effects ?? [], `event:${event.id}`, true);
    }
    for (const [outcome, effects] of Object.entries(quest.outcomes))
      validateEffects(effects, "quest.outcomes." + outcome);
    for (const transition of quest.transitions)
      validateConditions(transition.conditions ?? [], "quest.transitions");
    for (const entry of quest.prerequisites) {
      const path = `prerequisite:${entry.id}`;
      if (["lieu", "marqueur"].includes(entry.type)) {
        try {
          const location = new Location({
            ...entry.properties,
            id: entry.id,
            source: "quest-engine",
          });
          if (area && !area.allowsPlacement(location.position))
            error(path, "Création hors de la zone autorisée.");
          placed.push(location);
        } catch (issue) {
          error(path, issue.message);
        }
      } else if (entry.type === "ga") {
        if (entry.locationId) knownLocation(entry.locationId, path);
        for (const unit of entry.properties.army?.units ?? [])
          if (
            !preparationGameData.unitDefinitions.some(
              (definition) => definition.id === unit.typeId,
            )
          )
            error(path, `Type d’unité du GA inconnu : ${unit.typeId}.`);
        const position = entry.locationId ? null : entry.properties.position;
        if (
          position &&
          (!Number.isFinite(position.latitude) ||
            Math.abs(position.latitude) > 90 ||
            !Number.isFinite(position.longitude) ||
            Math.abs(position.longitude) > 180)
        )
          error(path, "Coordonnées du GA invalides.");
        if (position && area && !area.allowsPlacement(position))
          error(path, "GA hors de la zone autorisée.");
      } else {
        knownLocation(entry.locationId, path);
        if (!positive(entry.quantity ?? 1))
          error(path, "La quantité créée doit être un entier positif.");
        if (entry.type === "ressource" && !resources.includes(entry.resource))
          error(path, "Ressource inconnue.");
        if (entry.type === "item" && !entry.itemId)
          error(path, "Identifiant d’objet obligatoire.");
        if (entry.when === "published" && entry.scope !== "world")
          error(path, "Un stock créé à la publication exige la portée world.");
      }
    }
  }
  if (
    !input.dialogues ||
    typeof input.dialogues !== "object" ||
    Array.isArray(input.dialogues)
  )
    error("dialogues", "Le catalogue des dialogues doit être un objet.");
  else
    for (const [id, dialogue] of Object.entries(input.dialogues)) {
      const path = "dialogue:" + id;
      if (
        !dialogue ||
        !Array.isArray(dialogue.nodes) ||
        !dialogue.nodes.length
      ) {
        error(path, "Le dialogue doit contenir des nœuds.");
        continue;
      }
      if (!dialogue.speakerId) error(path, "Interlocuteur manquant.");
      knownLocation(dialogue.locationId, path);
      const nodeIds = new Set(dialogue.nodes.map((node) => node.id));
      if (
        nodeIds.size !== dialogue.nodes.length ||
        nodeIds.has(undefined) ||
        nodeIds.has("")
      )
        error(path, "Identifiants de nœuds manquants ou dupliqués.");
      if (!nodeIds.has(dialogue.initialNodeId))
        error(path, "Nœud initial absent.");
      for (const node of dialogue.nodes) {
        if (!Array.isArray(node.lines) || !Array.isArray(node.choices)) {
          error(path, "Chaque nœud exige lines et choices.");
          continue;
        }
        if (
          node.lines.some(
            (line) => typeof line?.text !== "string" || !line.text.trim(),
          )
        )
          error(path, "Réplique vide ou invalide.");
        if (
          new Set(node.choices.map((choice) => choice.id)).size !==
          node.choices.length
        )
          error(path, "Identifiants de choix dupliqués.");
        for (const choice of node.choices) {
          if (
            !choice.id ||
            !choice.label ||
            (!choice.goal && !choice.nextNodeId)
          )
            error(path, "Chaque choix exige id, label et goal ou nextNodeId.");
          if (choice.nextNodeId && !nodeIds.has(choice.nextNodeId))
            error(path, "Suite de dialogue inexistante.");
          validateConditions(choice.conditions ?? [], path);
        }
      }
    }
  if (area) {
    const spacing = new LocationSpacingPolicy({
      setup: { playArea: area },
      coordinateMode: "gps",
    });
    for (const [index, location] of placed.entries()) {
      const check = spacing.check(
        location,
        location.position,
        placed.slice(0, index),
      );
      if (!check.success)
        error(
          `world.${location.id}`,
          `Trop proche de ${check.conflictingLocationId} : ${Math.round(check.distance)} m, minimum ${Math.ceil(check.minimumDistance)} m.`,
        );
    }
  }
  const valid = errors.length === 0;
  const normalized = valid
    ? {
        ...structuredClone(input),
        quest: quest.toJSON(),
        ...(input.media ? { media: { images: media.images } } : {}),
        world: {
          ...structuredClone(world),
          locationSlots: scenario.toJSON().locationSlots,
          playArea: area?.toJSON() ?? null,
        },
      }
    : undefined;
  return {
    valid,
    errors,
    warnings,
    ...(valid
      ? {
          project: normalized,
          files: {
            ...customAssets.files,
            quest: { name: quest.id + ".json", data: quest.toJSON() },
            dialogues: {
              name: quest.id + "-dialogues.json",
              data: input.dialogues,
            },
            scenario: { name: "scenario.json", data: scenario.toJSON() },
            locations: {
              name: "locations.json",
              data: locations.map((entry) =>
                new Location({
                  ...entry,
                  position: entry.position ?? { latitude: 0, longitude: 0 },
                }).toJSON(),
              ),
            },
            placements: {
              name: "placements.json",
              data: slots
                .filter((slot) =>
                  locations.some(
                    (entry) => entry.id === slot.id && entry.position,
                  ),
                )
                .map((slot) => ({
                  locationSlotId: slot.id,
                  locationId: slot.id,
                  position: locations.find((entry) => entry.id === slot.id)
                    .position,
                })),
            },
            playArea: { name: "play-area.json", data: area?.toJSON() ?? null },
          },
          summary: {
            actions: quest.actions.length,
            links: quest.links.length,
            locations: slots.length,
            areaSquareMeters: area?.getAreaSquareMeters() ?? null,
          },
        }
      : {}),
  };
}

export function validateEditorProject(input) {
  const strategicErrors = validateStrategicProject(input ?? {});
  if (strategicErrors.length)
    return { valid: false, errors: strategicErrors, warnings: [] };
  const report = validateSingleEditorProject(input);
  if (
    report.valid &&
    ((input.strategicEvents?.length ?? 0) ||
      input.quest?.cooperation ||
      input.campaign?.quests?.some((q) => q.cooperation))
  ) {
    report.warnings.push({
      path: "strategicEvents",
      message:
        "Coopération et événements stratégiques : définitions de conception conservées et exportées ; exécution serveur des votes, invitations et phases tactiques à développer.",
    });
    report.files.strategic = {
      name: "strategic-events.json",
      data: {
        events: input.strategicEvents ?? [],
        blocks: input.strategicBlocks ?? [],
      },
    };
  }
  if (!input?.campaign) return report;
  const campaign = input.campaign,
    errors = report.errors,
    warnings = report.warnings;
  const fail = (message) => errors.push({ path: "campaign", message });
  if (
    !Array.isArray(campaign.quests) ||
    !Array.isArray(campaign.initialQuestIds)
  ) {
    fail("Les quêtes et les quêtes de départ doivent être des listes.");
    return { ...report, valid: false, files: undefined };
  }
  if (
    !campaign.quests.length ||
    campaign.quests.some(
      (quest) =>
        !quest || typeof quest !== "object" || !Array.isArray(quest.actions),
    )
  ) {
    fail("Ajoutez au moins une fiche de quête complète au scénario.");
    return { ...report, valid: false, files: undefined, project: undefined };
  }
  const quests = campaign.quests.map((quest) =>
    quest.id === input.quest?.id ? input.quest : quest,
  );
  const ids = new Set(quests.map((quest) => quest.id));
  if (ids.size !== quests.length)
    fail("Les identifiants de quête doivent être uniques dans le scénario.");
  if (!campaign.initialQuestIds.length)
    fail("Choisissez au moins une quête de départ.");
  for (const id of campaign.initialQuestIds)
    if (!ids.has(id)) fail(`Quête de départ inconnue : ${id}.`);
  const files = { ...(report.files ?? {}) },
    normalized = [];
  for (const quest of quests) {
    const result = validateSingleEditorProject({ ...input, quest });
    for (const issue of result.errors)
      errors.push({
        path: `campaign.${quest.id}.${issue.path}`,
        message: `${quest.title ?? quest.id} : ${issue.message}`,
      });
    for (const issue of result.warnings)
      if (
        !warnings.some(
          (entry) =>
            entry.path === issue.path && entry.message === issue.message,
        )
      )
        warnings.push({ ...issue, path: `campaign.${quest.id}.${issue.path}` });
    for (const transition of quest.transitions ?? []) {
      if (!ids.has(transition.questId))
        fail(
          `La quête ${quest.id} référence une suite absente du scénario : ${transition.questId}.`,
        );
      if (
        transition.outcome &&
        !["success", "failure", "abandoned"].includes(transition.outcome)
      )
        fail(`Issue inconnue dans l’enchaînement de ${quest.id}.`);
    }
    if (result.valid) {
      normalized.push(result.files.quest.data);
      files[`campaignQuest:${quest.id}`] = {
        name: `quests/${quest.id}.json`,
        data: result.files.quest.data,
      };
    }
  }
  const visiting = new Set(),
    visited = new Set();
  const walk = (id) => {
    if (visiting.has(id))
      throw new Error(
        "Le scénario contient un cycle d’enchaînements entre quêtes.",
      );
    if (visited.has(id)) return;
    visiting.add(id);
    for (const link of quests.find((quest) => quest.id === id)?.transitions ??
      [])
      if (ids.has(link.questId)) walk(link.questId);
    visiting.delete(id);
    visited.add(id);
  };
  try {
    for (const id of ids) walk(id);
  } catch (issue) {
    fail(issue.message);
  }
  const reachable = new Set();
  const visit = (id) => {
    if (reachable.has(id)) return;
    reachable.add(id);
    for (const link of quests.find((quest) => quest.id === id)?.transitions ??
      [])
      if (ids.has(link.questId)) visit(link.questId);
  };
  for (const id of campaign.initialQuestIds) visit(id);
  for (const id of ids)
    if (!reachable.has(id))
      warnings.push({
        path: "campaign",
        message: `Quête ${id} inaccessible depuis les quêtes de départ.`,
      });
  try {
    const scenario = new Scenario({
      ...(report.files?.scenario.data ?? scenarioFor(input.world ?? {})),
      id: campaign.id,
      name: campaign.name,
      intro: campaign.intro,
    });
    files.scenario = { name: "scenario.json", data: scenario.toJSON() };
  } catch (issue) {
    fail(issue.message);
  }
  if (errors.length)
    return { ...report, valid: false, files: undefined, project: undefined };
  files.campaign = {
    name: "quest-campaign.json",
    data: {
      scenarioId: campaign.id,
      initialQuestIds: campaign.initialQuestIds,
      questIds: [...ids],
      strategicBlocks: structuredClone(input.strategicBlocks ?? []),
    },
  };
  warnings.push({
    path: "campaign",
    message:
      "Le ZIP nécessite une intégration manuelle. Enregistrer dans le jeu met à jour le catalogue ; redémarrer le serveur puis créer une nouvelle partie pour charger ces définitions.",
  });
  return {
    ...report,
    valid: true,
    files,
    project: {
      ...report.project,
      campaign: { ...structuredClone(campaign), quests: normalized },
    },
    summary: { ...report.summary, quests: quests.length },
  };
}
