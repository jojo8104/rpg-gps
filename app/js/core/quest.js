/** Définition versionnée d'une quête, sans DOM ni état de progression local.
 * Le serveur devra interpréter les conditions, déclencheurs et conséquences.
 * Une interaction de lieu décrit le bouton que l'interface pourra afficher.
 */
import { validateQuestActionGraph } from "./quest-action-graph.js";
import { orderedQuestCreations } from "./quest-creations.js";
import { validateQuestModification } from "./quest-modification.js";

import { validateCooperation } from "./cooperation-definition.js";

export class Quest {
  constructor({
    schemaVersion = 1,
    id,
    title,
    description = "",
    actions = [],
    links = [],
    prerequisites = [],
    events = [],
    publicationCondition = null,
    accessConditions = [],
    participationModes = ["solo"],
    cooperation = null,
    locationSlotId = null,
    giverNpcId = null,
    interactionLabel = null,
    dialogueId = null,
    natures = [],
    type = "simple",
    conditions = [],
    locationSlots = [],
    offer = null,
    steps = [],
    initialStepId = steps[0]?.id ?? null,
    childQuestIds = [],
    completionPolicy = "all",
    scenes = [],
    presentation = {},
    outcomes = { success: [], failure: [], abandoned: [] },
    transitions = [],
  } = {}) {
    if (schemaVersion !== 1) throw new RangeError("Version de quête inconnue.");
    if (!["simple", "composite"].includes(type))
      throw new RangeError("La quête doit être simple ou composée.");
    if (!["all", "any"].includes(completionPolicy))
      throw new RangeError(
        "La composition attend tous les enfants ou au moins un.",
      );

    const data = {
      schemaVersion,
      id: requireText(id, "L'identifiant de quête"),
      title: requireText(title, "Le titre de quête"),
      description,
      actions: records(actions, "Les actions"),
      links: records(links, "Les liens d'action"),
      prerequisites: records(prerequisites, "Les pré requis"),
      events: records(events, "Les événements"),
      publicationCondition,
      accessConditions: list(accessConditions, "Les conditions d'accès"),
      participationModes: textList(
        participationModes,
        "Les modes de participation",
      ),
      cooperation,
      locationSlotId,
      giverNpcId,
      interactionLabel,
      dialogueId,
      natures: textList(natures, "Les natures"),
      type,
      conditions: list(conditions, "Les conditions"),
      locationSlots: records(locationSlots, "Les lieux"),
      offer,
      steps: records(steps, "Les étapes"),
      initialStepId,
      childQuestIds: textList(childQuestIds, "Les sous-quêtes"),
      completionPolicy,
      scenes: records(scenes, "Les scènes"),
      presentation,
      outcomes,
      transitions: list(transitions, "Les enchaînements"),
    };
    if (typeof description !== "string")
      throw new TypeError("La description doit être un texte.");
    if (
      type === "simple" &&
      ((data.steps.length === 0 && data.actions.length === 0) ||
        data.childQuestIds.length)
    )
      throw new RangeError(
        "Une quête simple contient des étapes et aucune sous-quête.",
      );
    if (type === "composite" && data.childQuestIds.length === 0)
      throw new RangeError(
        "Une quête composée doit référencer des sous-quêtes.",
      );
    if (data.childQuestIds.includes(data.id))
      throw new RangeError("Une quête ne peut pas être sa propre sous-quête.");
    requireObject(presentation, "La présentation");
    requireObject(outcomes, "Les conséquences");
    for (const outcome of ["success", "failure", "abandoned"])
      list(outcomes[outcome] ?? [], `Les conséquences de ${outcome}`);

    validateCooperation(data);
    validateActions(data);
    validateReferences(data);
    assertJsonData(data);
    Object.assign(this, structuredClone(data));
    freeze(this);
  }

  getStep(stepId) {
    return this.steps.find((step) => step.id === stepId) ?? null;
  }

  getAction(actionId) {
    return this.actions.find((action) => action.id === actionId) ?? null;
  }

  getScene(sceneId) {
    return this.scenes.find((scene) => scene.id === sceneId) ?? null;
  }

  getLocationSlot(slotId) {
    return this.locationSlots.find((slot) => slot.id === slotId) ?? null;
  }

  /** Définitions candidates uniquement : disponibilité et proximité sont validées au serveur. */
  getInteractionsForLocation(locationSlotId, { stepId = null } = {}) {
    if (this.actions.length) {
      return this.actions
        .filter(
          (action) =>
            action.interaction &&
            (action.lieu ?? action.origine ?? action.destinataire) ===
              locationSlotId,
        )
        .map((action) => ({
          id: action.id,
          label: action.interaction,
          actionId: action.id,
          dialogue: structuredClone(action.dialogue ?? null),
        }));
    }
    const steps =
      stepId === null
        ? this.steps
        : this.steps.filter((step) => step.id === stepId);
    return steps.flatMap((step) =>
      (step.interactions ?? [])
        .filter((interaction) => interaction.locationSlotId === locationSlotId)
        .map((interaction) => ({
          ...structuredClone(interaction),
          stepId: step.id,
        })),
    );
  }

  toJSON() {
    return structuredClone({ ...this });
  }

  static fromJSON(definition) {
    return new Quest(definition);
  }
}

function validateReferences(data) {
  const slotIds = new Set(data.locationSlots.map((slot) => slot.id));
  const sceneIds = new Set(data.scenes.map((scene) => scene.id));
  const stepIds = new Set(data.steps.map((step) => step.id));
  const objectiveIds = new Set();
  const interactionIds = new Set();
  const reference = (id, ids, label) => {
    if (id !== undefined && id !== null && !ids.has(id))
      throw new RangeError(
        `${label} référence un identifiant inexistant : ${id}.`,
      );
  };
  reference(data.initialStepId, stepIds, "L'étape initiale");
  if (
    data.type === "simple" &&
    data.actions.length === 0 &&
    data.initialStepId === null
  )
    throw new RangeError("Une quête simple doit définir son étape initiale.");
  if (data.offer !== null) {
    requireObject(data.offer, "La proposition de quête");
    reference(data.offer.locationSlotId, slotIds, "La proposition");
    reference(data.offer.sceneId, sceneIds, "La proposition");
    if (data.offer.interactionLabel !== undefined)
      requireText(data.offer.interactionLabel, "Le bouton de proposition");
  }
  for (const scene of data.scenes) {
    const lines = list(scene.lines ?? [], "Les répliques");
    for (const line of lines) {
      requireObject(line, "Une réplique");
      requireText(line.text, "Le texte d'une réplique");
    }
  }
  for (const step of data.steps) {
    requireText(step.title, "Le titre d'étape");
    if (
      step.objectivePolicy !== undefined &&
      !["all", "any"].includes(step.objectivePolicy)
    )
      throw new RangeError(
        "Une étape attend tous ses objectifs ou au moins un.",
      );
    reference(step.sceneId, sceneIds, "L'étape");
    for (const nextId of textList(
      step.nextStepIds ?? [],
      "Les étapes suivantes",
    ))
      reference(nextId, stepIds, "La transition d'étape");
    const objectives = records(step.objectives ?? [], "Les objectifs");
    const localObjectives = new Set(
      objectives.map((objective) => objective.id),
    );
    for (const objective of objectives) {
      if (objectiveIds.has(objective.id))
        throw new RangeError(
          "Les identifiants d'objectif doivent être uniques dans la quête.",
        );
      objectiveIds.add(objective.id);
      requireText(objective.text, "La consigne d'objectif");
      requireObject(objective.trigger, "Le déclencheur d'objectif");
      requireText(objective.trigger.type, "Le type de déclencheur");
      reference(objective.trigger.locationSlotId, slotIds, "L'objectif");
      list(objective.effects ?? [], "Les conséquences d'objectif");
    }
    for (const interaction of records(
      step.interactions ?? [],
      "Les interactions",
    )) {
      if (interactionIds.has(interaction.id))
        throw new RangeError(
          "Les identifiants d'interaction doivent être uniques dans la quête.",
        );
      interactionIds.add(interaction.id);
      requireText(interaction.label, "Le libellé du bouton");
      requireText(interaction.locationSlotId, "Le lieu de l'interaction");
      reference(interaction.locationSlotId, slotIds, "L'interaction");
      reference(interaction.objectiveId, localObjectives, "L'interaction");
      reference(interaction.sceneId, sceneIds, "L'interaction");
    }
  }
  for (const transition of data.transitions) {
    requireObject(transition, "Un enchaînement de quête");
    requireText(transition.questId, "La quête suivante");
  }
}

export const QUEST_ACTION_TYPES = Object.freeze([
  "Atteindre",
  "Parcourir",
  "Prendre",
  "Donner",
  "Parler",
  "Construire",
  "Combattre",
  "Modifier",
]);

function validateActions(data) {
  const byId = new Map(data.actions.map((action) => [action.id, action]));
  if (
    data.participationModes.length === 0 ||
    data.participationModes.some(
      (mode) => !["solo", "equipe", "competition"].includes(mode),
    )
  )
    throw new RangeError("Mode de participation de quête inconnu.");
  for (const action of data.actions) {
    if (action.action === "Modifier")
      validateQuestModification(action.modification);
    if (!QUEST_ACTION_TYPES.includes(action.action))
      throw new RangeError(`Action de quête inconnue : ${action.action}.`);
    if (Object.hasOwn(action, "timer") || Object.hasOwn(action, "pass"))
      throw new TypeError(
        "Les actions utilisent requires, sans timer ni pass.",
      );
    for (const id of textList(action.requires ?? [], "Les dépendances"))
      if (!byId.has(id) || id === action.id)
        throw new RangeError(`Dépendance d'action invalide : ${id}.`);
    if (["Prendre", "Donner"].includes(action.action)) {
      requireText(action.quoi, "L'objet de l'action");
      if (!Number.isSafeInteger(action.combien) || action.combien <= 0)
        throw new RangeError("La quantité doit être un entier positif.");
      requireText(
        action.action === "Prendre" ? action.origine : action.destinataire,
        "Le lieu de transfert",
      );
    }
    if (
      action.action === "Parcourir" &&
      (!Number.isFinite(action.distance) || action.distance <= 0)
    )
      throw new RangeError("La distance doit être positive, en mètres.");
    if (["Atteindre", "Construire"].includes(action.action))
      requireText(action.lieu, "Le lieu de l'action");
    if (action.action === "Parler") {
      requireObject(action.dialogue, "Le dialogue");
      requireText(action.dialogue.qui, "L'interlocuteur");
      if (!action.outputs)
        requireText(action.dialogue.goal, "Le résultat de dialogue");
    }
    if (action.action === "Combattre") requireText(action.qui, "L'adversaire");
    if (action.action === "Construire")
      requireObject(action.goal, "Le résultat de construction");
    list(action.rewards ?? [], "Les récompenses d'action");
  }
  const visiting = new Set(),
    visited = new Set();
  function visit(id) {
    if (visiting.has(id))
      throw new RangeError("Les dépendances d'action contiennent un cycle.");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id).requires ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  }
  data.actions.forEach((action) => visit(action.id));
  validateQuestActionGraph(data.actions, data.links);
  for (const prerequisite of orderedQuestCreations(data.prerequisites)) {
    if (
      prerequisite.actionId &&
      (!byId.has(prerequisite.actionId) ||
        prerequisite.when !== "ActionCompleted")
    )
      throw new RangeError(
        "La création filtrée par action exige ActionCompleted et une action connue.",
      );
    if (
      prerequisite.output &&
      (!prerequisite.actionId ||
        !(byId.get(prerequisite.actionId)?.outputs ?? ["success"]).includes(
          prerequisite.output,
        ))
    )
      throw new RangeError("Sortie de création inconnue.");
    if (prerequisite.when !== undefined)
      requireText(prerequisite.when, "Le moment de création");
  }
  for (const event of data.events) {
    requireText(event.on, "Le type d'événement");
    list(event.effects ?? [], "Les effets d'événement");
    if (event.actionId !== undefined && !byId.has(event.actionId))
      throw new RangeError("L'événement référence une action inexistante.");
    if (
      event.output !== undefined &&
      (!event.actionId ||
        !(byId.get(event.actionId).outputs ?? ["success"]).includes(
          event.output,
        ))
    )
      throw new RangeError(
        "La réaction référence une sortie d'action inconnue.",
      );
  }
}

function requireText(value, label) {
  if (typeof value !== "string" || !value.trim())
    throw new TypeError(`${label} doit être un texte non vide.`);
  return value.trim();
}

function requireObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`${label} doit être un objet.`);
}

function list(value, label) {
  if (!Array.isArray(value))
    throw new TypeError(`${label} doit être une liste.`);
  return value;
}

function textList(value, label) {
  const result = list(value, label).map((entry) => requireText(entry, label));
  if (new Set(result).size !== result.length)
    throw new RangeError(`${label} contient des doublons.`);
  return result;
}

function records(value, label) {
  const result = list(value, label).map((entry) => {
    requireObject(entry, label);
    return { ...entry, id: requireText(entry.id, label) };
  });
  if (new Set(result.map((entry) => entry.id)).size !== result.length)
    throw new RangeError(`${label} contient des identifiants en double.`);
  return result;
}

function assertJsonData(value, ancestors = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (
    typeof value !== "object" ||
    (!Array.isArray(value) &&
      Object.getPrototypeOf(value) !== Object.prototype) ||
    ancestors.has(value)
  )
    throw new TypeError(
      "Une définition de quête doit contenir uniquement des données JSON sans cycle.",
    );
  ancestors.add(value);
  for (const entry of Object.values(value)) assertJsonData(entry, ancestors);
  ancestors.delete(value);
}

function freeze(value) {
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
}
