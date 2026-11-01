import { Quest } from "./quest.js";
import {
  orderedQuestCreations,
  questCreationDependencies,
} from "./quest-creations.js";
import {
  initialQuestActionStatus,
  resolveQuestActionLinks,
  advanceQuestActionGraph,
} from "./quest-action-graph.js";

/** Moteur sans DOM. L'adaptateur est fourni exclusivement par le serveur.
 * transaction doit englober les écritures du monde ET la sauvegarde du moteur.
 */
export class QuestEngine {
  constructor({ definitions, adapter, snapshot = null, now = Date.now }) {
    this.definitions = new Map();
    for (const definition of definitions) {
      const quest =
        definition instanceof Quest ? definition : new Quest(definition);
      if (!quest.actions.length || quest.type !== "simple")
        throw new Error(
          "Le moteur attend une fiche à actions ; les anciennes phases et les composites doivent être convertis.",
        );
      if (this.definitions.has(quest.id))
        throw new Error("Identifiant de quête en double.");
      this.definitions.set(quest.id, quest);
    }
    for (const method of [
      "transaction",
      "canAccess",
      "participants",
      "perform",
      "applyEffect",
      "create",
    ])
      if (typeof adapter?.[method] !== "function")
        throw new TypeError(`Adaptateur serveur incomplet : ${method}.`);
    this.adapter = adapter;
    this.now = now;
    this.state = snapshot
      ? structuredClone(snapshot)
      : { version: 1, published: [], instances: [], winners: {} };
    this.#validateState();
  }

  #validateState() {
    const state = this.state;
    if (
      state.version !== 1 ||
      !Array.isArray(state.published) ||
      !Array.isArray(state.instances) ||
      !state.winners ||
      typeof state.winners !== "object"
    )
      throw new Error("État du moteur de quête invalide.");
    const ids = new Set();
    for (const id of state.published) this.#quest(id);
    for (const instance of state.instances) {
      const quest = this.#quest(instance.questId);
      if (
        ids.has(instance.id) ||
        !Array.isArray(instance.playerIds) ||
        !instance.playerIds.length ||
        !quest.participationModes.includes(instance.mode) ||
        !["active", "completed", "failed", "abandoned"].includes(
          instance.status,
        )
      )
        throw new Error("Instance de quête invalide.");
      ids.add(instance.id);
      if (
        !Array.isArray(instance.created) ||
        !Array.isArray(instance.handledEvents) ||
        !instance.actions ||
        typeof instance.actions !== "object"
      )
        throw new Error("Progression de quête invalide.");
      for (const action of quest.actions)
        if (
          !["locked", "active", "completed", "skipped"].includes(
            instance.actions[action.id]?.status,
          )
        )
          throw new Error("État d'action invalide.");
      instance.links ??= {};
      for (const link of quest.links)
        if (
          ![undefined, "selected", "discarded"].includes(
            instance.links[link.id],
          )
        )
          throw new Error("État de lien invalide.");
        else if (
          ["completed", "skipped"].includes(
            instance.actions[link.from].status,
          ) &&
          !instance.links[link.id]
        )
          throw new Error("Décision de lien manquante dans la sauvegarde.");
      for (const action of quest.actions) {
        const progress = instance.actions[action.id];
        if (
          progress.output !== undefined &&
          !(action.outputs ?? ["success"]).includes(progress.output)
        )
          throw new Error("Sortie sauvegardée invalide.");
      }
    }
  }

  #quest(id) {
    const quest = this.definitions.get(id);
    if (!quest) throw new Error(`Quête inconnue : ${id}.`);
    return quest;
  }

  #atomic(operation) {
    const before = this.toJSON();
    try {
      return this.adapter.transaction(() => {
        const result = operation();
        this.adapter.save?.(this.toJSON());
        return structuredClone(result);
      });
    } catch (error) {
      this.state = before;
      throw error;
    }
  }

  publish(questId, actor) {
    return this.#atomic(() => {
      const quest = this.#quest(questId);
      if (!this.adapter.canAccess(quest.publicationCondition, actor, null))
        return refused("publication_condition");
      if (this.state.published.includes(questId))
        return refused("already_published");
      this.state.published.push(questId);
      this.#create(
        quest,
        {
          id: `publication:${questId}`,
          questId,
          playerIds: [],
          created: [],
          mode: "world",
        },
        "published",
        actor,
      );
      return { success: true, questId };
    });
  }

  accept({ questId, mode = "solo", actor }) {
    return this.#atomic(() => {
      const quest = this.#quest(questId);
      if (!this.state.published.includes(questId))
        return refused("not_published");
      if (!quest.participationModes.includes(mode))
        return refused("participation_mode");
      if (mode === "competition" && this.state.winners[questId])
        return refused("competition_finished");
      if (
        !quest.accessConditions.every((condition) =>
          this.adapter.canAccess(condition, actor, null),
        )
      )
        return refused("access_condition");
      const playerIds = [...new Set(this.adapter.participants(mode, actor))];
      if (!playerIds.includes(actor.playerId) || !playerIds.length)
        return refused("participants");
      const existing = this.state.instances.find(
        (instance) =>
          instance.questId === questId &&
          instance.playerIds.some((id) => playerIds.includes(id)),
      );
      if (existing) return refused("already_accepted");
      const instance = {
        id: `${questId}:${mode}:${[...playerIds].sort().join(",")}`,
        questId,
        mode,
        playerIds,
        status: "active",
        acceptedAt: this.now(),
        created: [],
        handledEvents: [],
        links: {},
        actions: Object.fromEntries(
          quest.actions.map((action) => [
            action.id,
            {
              status: initialQuestActionStatus(action, quest.links),
              activatedAt:
                initialQuestActionStatus(action, quest.links) === "active"
                  ? this.now()
                  : null,
            },
          ]),
        ),
      };
      this.state.instances.push(instance);
      for (const action of quest.actions)
        if (instance.actions[action.id].status === "active")
          this.adapter.activate?.(action, instance);
      this.#create(quest, instance, "accepted", actor);
      this.#react(
        quest,
        instance,
        { id: `${instance.id}:accepted`, type: "QuestAccepted" },
        actor,
      );
      return { success: true, instance };
    });
  }

  act({ instanceId, actionId, actor, intent = {} }) {
    return this.#atomic(() => {
      const instance = this.state.instances.find(
        (entry) => entry.id === instanceId,
      );
      if (!instance || !instance.playerIds.includes(actor.playerId))
        return refused("instance_access");
      if (instance.status !== "active") return refused("quest_not_active");
      const quest = this.#quest(instance.questId),
        action = quest.getAction(actionId);
      if (!action || instance.actions[actionId].status !== "active")
        return refused("action_not_active");
      if (action.assignedPlayerId && action.assignedPlayerId !== actor.playerId)
        return refused("action_assigned");
      const result = this.adapter.perform(action, actor, instance, intent);
      if (!result?.success) return result ?? refused("action_rejected");
      const output = result.output ?? "success";
      if (!(action.outputs ?? ["success"]).includes(output))
        throw new Error("Sortie d'action serveur inconnue.");
      instance.actions[actionId] = {
        ...instance.actions[actionId],
        status: "completed",
        playerId: actor.playerId,
        completedAt: this.now(),
        evidenceId: result.evidenceId ?? null,
        output,
      };
      for (const reward of action.rewards ?? [])
        this.adapter.applyEffect(reward, actor, instance);
      // Préserve l'activation des anciennes dépendances avant les réactions.
      advanceQuestActionGraph(
        quest,
        instance,
        (candidate) => this.adapter.activate?.(candidate, instance),
        this.now,
      );
      this.#react(
        quest,
        instance,
        {
          id: `${instance.id}:action:${actionId}`,
          type: "ActionCompleted",
          actionId,
          output,
        },
        actor,
      );
      resolveQuestActionLinks(quest, instance, actionId, output, (condition) =>
        this.adapter.canAccess(condition, actor, instance),
      );
      if (instance.status === "active") {
        advanceQuestActionGraph(
          quest,
          instance,
          (candidate) => this.adapter.activate?.(candidate, instance),
          this.now,
        );
        if (action.terminalOutcome) {
          for (const progress of Object.values(instance.actions))
            if (["active", "locked"].includes(progress.status)) {
              progress.status = "skipped";
              progress.skippedAt = this.now();
            }
          for (const link of quest.links)
            instance.links[link.id] ??= "discarded";
          this.#finish(
            quest,
            instance,
            action.terminalOutcome === "success" ? "completed" : "failed",
            actor,
          );
        }
      }
      if (
        instance.status === "active" &&
        quest.actions.every((candidate) =>
          ["completed", "skipped"].includes(
            instance.actions[candidate.id].status,
          ),
        )
      )
        this.#finish(quest, instance, "completed", actor);
      return { success: true, instance, actionResult: result };
    });
  }

  /** Réservé aux événements produits par les services serveur, jamais à une commande client. */
  dispatch(event, actor) {
    if (!event?.id || !event.type)
      throw new Error("Un événement officiel exige id et type.");
    return this.#atomic(() => {
      for (const instance of this.state.instances.filter(
        (entry) =>
          entry.status === "active" && entry.playerIds.includes(actor.playerId),
      )) {
        const quest = this.#quest(instance.questId);
        this.#react(quest, instance, event, actor);
      }
      return { success: true };
    });
  }

  abandon(instanceId, actor) {
    return this.#atomic(() => {
      const instance = this.state.instances.find(
        (entry) => entry.id === instanceId,
      );
      if (
        !instance ||
        !instance.playerIds.includes(actor.playerId) ||
        instance.status !== "active"
      )
        return refused("instance_access");
      this.#finish(this.#quest(instance.questId), instance, "abandoned", actor);
      return { success: true };
    });
  }

  #create(quest, instance, when, actor, event = {}) {
    for (const prerequisite of orderedQuestCreations(quest.prerequisites)) {
      if (
        (prerequisite.when ?? "accepted") !== when ||
        (prerequisite.actionId && prerequisite.actionId !== event.actionId) ||
        (prerequisite.output && prerequisite.output !== event.output) ||
        instance.created.includes(prerequisite.id)
      )
        continue;
      if (
        !questCreationDependencies(prerequisite, quest.prerequisites).every(
          (id) =>
            instance.created.includes(id) ||
            (this.state.published.includes(quest.id) &&
              quest.prerequisites.find((entry) => entry.id === id)?.when ===
                "published"),
        )
      )
        throw new Error(`Dépendance non créée pour ${prerequisite.id}.`);
      this.adapter.create(prerequisite, actor, instance);
      instance.created.push(prerequisite.id);
    }
  }

  #react(quest, instance, event, actor) {
    this.#create(quest, instance, event.type, actor, event);
    for (const reaction of quest.events) {
      const key = reaction.repeat ? `${reaction.id}:${event.id}` : reaction.id;
      if (
        instance.handledEvents.includes(key) ||
        reaction.on !== event.type ||
        (reaction.output && reaction.output !== event.output) ||
        (reaction.actionId && reaction.actionId !== event.actionId)
      )
        continue;
      if (
        !(reaction.conditions ?? []).every((condition) =>
          this.adapter.canAccess(condition, actor, instance),
        )
      )
        continue;
      instance.handledEvents.push(key);
      for (const effect of reaction.effects ?? []) {
        if (effect.type === "failQuest")
          this.#finish(quest, instance, "failed", actor);
        else this.adapter.applyEffect(effect, actor, instance);
      }
    }
  }

  #finish(quest, instance, status, actor) {
    if (instance.status !== "active") return;
    instance.status = status;
    instance.finishedAt = this.now();
    const outcome =
      status === "completed"
        ? "success"
        : status === "failed"
          ? "failure"
          : "abandoned";
    for (const effect of quest.outcomes[outcome] ?? [])
      this.adapter.applyEffect(effect, actor, instance);
    if (status === "completed" && instance.mode === "competition") {
      this.state.winners[quest.id] = instance.id;
      for (const other of this.state.instances.filter(
        (entry) =>
          entry.questId === quest.id &&
          entry.id !== instance.id &&
          entry.mode === "competition" &&
          entry.status === "active",
      )) {
        const loserActor = this.adapter.actorFor?.(other.playerIds[0]);
        if (!loserActor)
          throw new Error("La compétition exige actorFor côté serveur.");
        this.#finish(quest, other, "failed", loserActor);
      }
    }
    this.#react(
      quest,
      instance,
      { id: `${instance.id}:${status}`, type: "QuestFinished", outcome },
      actor,
    );
    for (const transition of quest.transitions) {
      if (transition.outcome && transition.outcome !== outcome) continue;
      if (
        !(transition.conditions ?? []).every((condition) =>
          this.adapter.canAccess(condition, actor, instance),
        )
      )
        continue;
      const next = this.#quest(transition.questId);
      if (
        !this.state.published.includes(next.id) &&
        this.adapter.canAccess(next.publicationCondition, actor, null)
      ) {
        this.state.published.push(next.id);
        this.#create(
          next,
          {
            id: `publication:${next.id}`,
            questId: next.id,
            playerIds: [],
            created: [],
            mode: "world",
          },
          "published",
          actor,
        );
      }
    }
  }

  interactions(instanceId, playerId, locationId) {
    const instance = this.state.instances.find(
      (entry) => entry.id === instanceId,
    );
    if (
      !instance ||
      instance.status !== "active" ||
      !instance.playerIds.includes(playerId)
    )
      return [];
    return this.#quest(instance.questId)
      .actions.filter(
        (action) =>
          instance.actions[action.id].status === "active" &&
          (!action.assignedPlayerId || action.assignedPlayerId === playerId) &&
          action.interaction &&
          (action.lieu ?? action.origine ?? action.destinataire) === locationId,
      )
      .map((action) => ({
        id: action.id,
        label: action.interaction,
        dialogue: action.dialogue ?? null,
      }));
  }

  toJSON() {
    return structuredClone(this.state);
  }
}

function refused(reason) {
  return { success: false, reason };
}
