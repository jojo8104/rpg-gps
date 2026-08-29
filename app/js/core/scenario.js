/** Définition immuable d'un scénario, indépendante de la partie et de la géographie réelle. */
import { Trail } from "./trail.js";

export class Scenario {
  constructor({
    id,
    name,
    intro,
    initialPhaseId,
    playerStart = {},
    locationSlots = [],
    factions = [],
    trails = [],
    worldState = {},
    phases,
    events = [],
    victoryConditions = [],
    defeatConditions = [],
  }) {
    this.id = Scenario.#requireText(id, "L'identifiant du scénario");
    this.name = Scenario.#requireText(name, "Le nom du scénario");
    this.intro = Scenario.#requireText(intro, "Le contexte initial");
    this.playerStart = Scenario.#createPlayerStart(playerStart);
    this.locationSlots = Scenario.#createRecords(locationSlots, "Les lieux", [
      "id",
      "type",
    ]);
    this.factions = Scenario.#createRecords(factions, "Les factions", [
      "id",
      "name",
    ]);
    Scenario.#requireObject(worldState, "L'état mondial initial");
    this.worldState = structuredClone(worldState);
    if (!Array.isArray(trails))
      throw new TypeError("Les pistes doivent être une liste.");
    this.trails = trails.map((trail) =>
      trail instanceof Trail ? trail : new Trail(trail),
    );
    if (
      new Set(this.trails.map((trail) => trail.id)).size !== this.trails.length
    )
      throw new RangeError("Les identifiants de piste doivent être uniques.");
    const slotIds = new Set(this.locationSlots.map((slot) => slot.id));
    if (
      this.trails.some((trail) => !slotIds.has(trail.destinationLocationSlotId))
    )
      throw new RangeError(
        "La destination d'une piste doit être un lieu du scénario.",
      );
    this.events = Scenario.#createEvents(events);
    this.phases = Scenario.#createPhases(phases);
    const trailById = new Map(this.trails.map((trail) => [trail.id, trail]));
    this.phases
      .flatMap((phase) => phase.objectives)
      .forEach((objective) => {
        if (objective.trigger?.type !== "trailPointInspected") return;
        const trail = trailById.get(objective.trigger.trailId);
        if (trail === undefined)
          throw new RangeError("Un objectif référence une piste inexistante.");
        if (
          !trail.points.some(
            (point) => point.traceId === objective.trigger.traceId,
          )
        )
          throw new RangeError(
            "Un objectif référence un point absent de sa piste.",
          );
      });
    this.initialPhaseId = Scenario.#requireText(
      initialPhaseId,
      "La phase initiale",
    );
    if (!this.phases.some((phase) => phase.id === this.initialPhaseId))
      throw new RangeError("La phase initiale n'existe pas.");
    this.victoryConditions = Scenario.#createTextList(
      victoryConditions,
      "Les conditions de victoire",
    );
    this.defeatConditions = Scenario.#createTextList(
      defeatConditions,
      "Les conditions de défaite",
    );
  }

  getPhase(phaseId) {
    return this.phases.find((phase) => phase.id === phaseId) ?? null;
  }
  getEvent(eventId) {
    return this.events.find((event) => event.id === eventId) ?? null;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      intro: this.intro,
      initialPhaseId: this.initialPhaseId,
      playerStart: {
        resources: { ...this.playerStart.resources },
        unitStacks: this.playerStart.unitStacks.map((stack) => ({ ...stack })),
      },
      locationSlots: this.locationSlots.map((location) =>
        structuredClone(location),
      ),
      factions: this.factions.map((faction) => ({ ...faction })),
      trails: this.trails.map((trail) => trail.toJSON()),
      worldState: structuredClone(this.worldState),
      phases: this.phases.map((phase) => ({
        ...phase,
        objectives: phase.objectives.map((objective) =>
          structuredClone(objective),
        ),
        eventIds: [...phase.eventIds],
        transitions: phase.transitions.map((transition) => ({ ...transition })),
        choices: phase.choices.map((choice) => structuredClone(choice)),
        listeners: phase.listeners.map((listener) => structuredClone(listener)),
      })),
      events: this.events.map((event) => ({
        ...event,
        effects: event.effects.map((effect) => ({ ...effect })),
      })),
      victoryConditions: [...this.victoryConditions],
      defeatConditions: [...this.defeatConditions],
    };
  }

  static #createPhases(phases) {
    if (!Array.isArray(phases) || phases.length === 0)
      throw new RangeError("Le scénario doit contenir au moins une phase.");
    const ids = new Set();
    return phases.map((phase) => {
      Scenario.#requireObject(phase, "Une phase");
      const id = Scenario.#requireText(phase.id, "L'identifiant de phase");
      if (ids.has(id))
        throw new RangeError("Les identifiants de phase doivent être uniques.");
      ids.add(id);
      const objectives = Scenario.#createObjectives(phase.objectives ?? []);
      const eventIds = Scenario.#createTextList(
        phase.eventIds ?? [],
        "Les événements de phase",
      );
      const transitions = Scenario.#createTransitions(phase.transitions ?? []);
      const failure = Scenario.#createFailure(phase.failure);
      const choices = Scenario.#createChoices(phase.choices ?? []);
      const listeners = Scenario.#createListeners(phase.listeners ?? []);
      return {
        id,
        title: Scenario.#requireText(phase.title, "Le titre de phase"),
        description: Scenario.#requireText(
          phase.description,
          "La description de phase",
        ),
        type: Scenario.#requireText(phase.type ?? "main", "Le type de phase"),
        objectives,
        eventIds,
        transitions,
        choices,
        listeners,
        failure,
      };
    });
  }

  static #createPlayerStart(playerStart) {
    Scenario.#requireObject(playerStart, "Les ressources de départ");
    const resources = playerStart.resources ?? {};
    if (
      resources === null ||
      Array.isArray(resources) ||
      typeof resources !== "object"
    )
      throw new TypeError("Les ressources de départ doivent être un objet.");
    const unitStacks = playerStart.unitStacks ?? [];
    if (!Array.isArray(unitStacks))
      throw new TypeError("Les unités de départ doivent être une liste.");
    return {
      resources: Object.fromEntries(
        Object.entries(resources).map(([name, amount]) => {
          if (!Number.isFinite(amount) || amount < 0)
            throw new RangeError(
              "Une ressource de départ doit être positive ou nulle.",
            );
          return [Scenario.#requireText(name, "Le nom de ressource"), amount];
        }),
      ),
      unitStacks: unitStacks.map((stack) => {
        Scenario.#requireObject(stack, "Une unité de départ");
        if (!Number.isInteger(stack.quantity) || stack.quantity <= 0)
          throw new RangeError(
            "L'effectif de départ doit être un entier positif.",
          );
        return {
          typeId: Scenario.#requireText(stack.typeId, "Le type d'unité"),
          quantity: stack.quantity,
        };
      }),
    };
  }

  static #createObjectives(objectives) {
    if (!Array.isArray(objectives))
      throw new TypeError("Les objectifs doivent être une liste.");
    const ids = new Set();
    return objectives.map((objective) => {
      Scenario.#requireObject(objective, "Un objectif");
      const id = Scenario.#requireText(
        objective.id,
        "L'identifiant d'objectif",
      );
      if (ids.has(id))
        throw new RangeError(
          "Les identifiants d'objectif doivent être uniques dans une phase.",
        );
      ids.add(id);
      const normalized = {
        id,
        text: Scenario.#requireText(objective.text, "Le texte de l'objectif"),
      };
      if (objective.trigger !== undefined) {
        Scenario.#requireObject(objective.trigger, "Le déclencheur d'objectif");
        normalized.trigger = structuredClone(objective.trigger);
        normalized.trigger.type = Scenario.#requireText(
          objective.trigger.type,
          "Le type de déclencheur",
        );
      }
      if (objective.eventId !== undefined)
        normalized.eventId = Scenario.#requireText(
          objective.eventId,
          "L'événement d'objectif",
        );
      return normalized;
    });
  }

  static #createTransitions(transitions) {
    if (!Array.isArray(transitions))
      throw new TypeError("Les transitions doivent être une liste.");
    return transitions.map((transition) => {
      Scenario.#requireObject(transition, "Une transition");
      const result = {
        nextPhase: Scenario.#requireText(
          transition.nextPhase,
          "La phase suivante",
        ),
      };
      if (transition.condition !== undefined)
        result.condition = Scenario.#requireText(
          transition.condition,
          "La condition de transition",
        );
      return result;
    });
  }

  static #createChoices(choices) {
    if (!Array.isArray(choices))
      throw new TypeError("Les choix doivent être une liste.");
    const ids = new Set();
    return choices.map((choice) => {
      Scenario.#requireObject(choice, "Un choix");
      const id = Scenario.#requireText(choice.id, "L'identifiant de choix");
      if (ids.has(id))
        throw new RangeError(
          "Les identifiants de choix doivent être uniques dans une phase.",
        );
      ids.add(id);
      const result = {
        id,
        label: Scenario.#requireText(choice.label, "Le libellé du choix"),
        nextPhase: Scenario.#requireText(
          choice.nextPhase,
          "La phase cible du choix",
        ),
      };
      if (choice.eventId !== undefined)
        result.eventId = Scenario.#requireText(
          choice.eventId,
          "L'événement du choix",
        );
      if (choice.condition !== undefined) {
        Scenario.#requireObject(choice.condition, "La condition du choix");
        result.condition = structuredClone(choice.condition);
      }
      return result;
    });
  }

  static #createListeners(listeners) {
    if (!Array.isArray(listeners))
      throw new TypeError("Les écouteurs de phase doivent être une liste.");
    return listeners.map((listener) => {
      Scenario.#requireObject(listener, "Un écouteur de phase");
      Scenario.#requireObject(listener.trigger, "Le déclencheur d'écoute");
      return {
        trigger: structuredClone(listener.trigger),
        eventId: Scenario.#requireText(listener.eventId, "L'événement écouté"),
      };
    });
  }

  static #createFailure(failure) {
    if (failure === undefined)
      return { policy: "stop", nextPhase: null, eventId: null, scope: "quest" };
    Scenario.#requireObject(failure, "La règle d'échec");
    const policy = Scenario.#requireText(
      failure.policy ?? "stop",
      "La politique d'échec",
    );
    if (!["stop", "continue", "branch"].includes(policy))
      throw new RangeError("La politique d'échec est invalide.");
    const nextPhase =
      failure.nextPhase == null
        ? null
        : Scenario.#requireText(failure.nextPhase, "La phase après échec");
    if (policy === "branch" && nextPhase === null)
      throw new RangeError("Un embranchement d'échec exige une phase cible.");
    const scope = Scenario.#requireText(failure.scope ?? "quest", "La portée de l'échec");
    if (!["quest", "phase"].includes(scope))
      throw new RangeError("La portée de l'échec est invalide.");
    return {
      policy,
      nextPhase,
      scope,
      eventId:
        failure.eventId == null
          ? null
          : Scenario.#requireText(failure.eventId, "L'événement d'échec"),
    };
  }

  static #createEvents(events) {
    if (!Array.isArray(events))
      throw new TypeError("Les événements doivent être une liste.");
    const ids = new Set();
    return events.map((event) => {
      Scenario.#requireObject(event, "Un événement");
      const id = Scenario.#requireText(event.id, "L'identifiant d'événement");
      if (ids.has(id))
        throw new RangeError(
          "Les identifiants d'événement doivent être uniques.",
        );
      ids.add(id);
      if (!Array.isArray(event.effects))
        throw new TypeError("Les effets d'événement doivent être une liste.");
      return {
        id,
        effects: event.effects.map((effect) => ({
          ...effect,
          type: Scenario.#requireText(effect.type, "Le type d'effet"),
        })),
      };
    });
  }

  static #createRecords(records, label, requiredKeys) {
    if (!Array.isArray(records))
      throw new TypeError(`${label} doivent être une liste.`);
    return records.map((record) => {
      Scenario.#requireObject(record, label);
      const normalized = Object.fromEntries(
        requiredKeys.map((key) => [
          key,
          Scenario.#requireText(record[key], `Le champ ${key}`),
        ]),
      );
      if (record.roles !== undefined)
        normalized.roles = Scenario.#createTextList(
          record.roles,
          "Les rôles de lieu",
        );
      if (record.defaultPlacement !== undefined) {
        Scenario.#requireObject(
          record.defaultPlacement,
          "Le placement de lieu",
        );
        normalized.defaultPlacement = structuredClone(record.defaultPlacement);
        normalized.defaultPlacement.strategy = Scenario.#requireText(
          record.defaultPlacement.strategy,
          "La stratégie de placement",
        );
      }
      return normalized;
    });
  }

  static #createTextList(values, label) {
    if (!Array.isArray(values))
      throw new TypeError(`${label} doivent être une liste.`);
    return [
      ...new Set(
        values.map((value) => Scenario.#requireText(value, "Un identifiant")),
      ),
    ];
  }
  static #requireObject(value, label) {
    if (value === null || Array.isArray(value) || typeof value !== "object")
      throw new TypeError(`${label} doit être un objet.`);
  }
  static #requireText(value, label) {
    if (typeof value !== "string" || value.trim() === "")
      throw new TypeError(`${label} doit être un texte non vide.`);
    return value.trim();
  }
}

/** Progression sérialisable d'un scénario dans une partie donnée. */
export class ScenarioState {
  constructor(scenario, { startsActive = true, state = null } = {}) {
    if (!(scenario instanceof Scenario))
      throw new TypeError("L'état doit être créé à partir d'un scénario.");
    if (typeof startsActive !== "boolean")
      throw new TypeError(
        "L'activation initiale du scénario doit être booléenne.",
      );
    this.scenarioId = scenario.id;
    this.currentPhaseId = scenario.initialPhaseId;
    this.phaseStates = Object.fromEntries(
      scenario.phases.map((phase) => [
        phase.id,
        {
          status:
            startsActive && phase.id === scenario.initialPhaseId
              ? "active"
              : "locked",
          objectives: phase.objectives.map((objective) => ({
            ...objective,
            state:
              startsActive && phase.id === scenario.initialPhaseId
                ? "active"
                : "locked",
          })),
        },
      ]),
    );
    this.triggeredEventIds = [];
    if (state !== null) {
      if (
        state.scenarioId !== scenario.id ||
        scenario.getPhase(state.currentPhaseId) === null
      )
        throw new RangeError("L'instantané de scénario est incompatible.");
      this.currentPhaseId = state.currentPhaseId;
      this.phaseStates = structuredClone(state.phaseStates);
      this.triggeredEventIds = [...(state.triggeredEventIds ?? [])];
    }
  }

  getCurrentPhaseState() {
    return this.phaseStates[this.currentPhaseId];
  }
  getObjective(objectiveId) {
    return (
      this.getCurrentPhaseState().objectives.find(
        (objective) => objective.id === objectiveId,
      ) ?? null
    );
  }

  completeObjective(objectiveId) {
    const objective = this.getObjective(objectiveId);
    if (objective === null || objective.state !== "active") return false;
    objective.state = "completed";
    return true;
  }

  completeCurrentPhase() {
    const state = this.getCurrentPhaseState();
    if (
      state.status !== "active" ||
      !state.objectives.every((objective) => objective.state === "completed")
    )
      return false;
    state.status = "completed";
    return true;
  }

  activateOfferedPhase(scenario, phaseId) {
    if (this.getCurrentPhaseState().status === "active") return false;
    const phase = scenario.getPhase(phaseId);
    const state = this.phaseStates[phaseId];
    if (phase === null || state?.status !== "locked") return false;
    state.status = "active";
    state.objectives.forEach((objective) => {
      objective.state = "active";
    });
    this.currentPhaseId = phaseId;
    return true;
  }

  failCurrentPhase(scenario, { reason, nextPhaseId = null, at = Date.now() }) {
    const state = this.getCurrentPhaseState();
    if (state.status !== "active") return false;
    state.status = "failed";
    state.failureReason = reason;
    state.failedAt = at;
    state.objectives.forEach((objective) => {
      if (objective.state === "active") objective.state = "failed";
    });
    if (nextPhaseId === null) return true;
    const next = this.phaseStates[nextPhaseId];
    if (scenario.getPhase(nextPhaseId) === null || next?.status !== "locked")
      return false;
    next.status = "active";
    next.objectives.forEach((objective) => {
      objective.state = "active";
    });
    this.currentPhaseId = nextPhaseId;
    return true;
  }

  restartPhases(
    scenario,
    { phaseIds, startPhaseId },
    { activate = true } = {},
  ) {
    if (
      !Array.isArray(phaseIds) ||
      !phaseIds.includes(startPhaseId) ||
      scenario.getPhase(startPhaseId) === null
    )
      return false;
    const phases = phaseIds.map((phaseId) => scenario.getPhase(phaseId));
    if (phases.some((phase) => phase === null)) return false;
    phases.forEach((phase) => {
      const state = this.phaseStates[phase.id];
      state.status = "locked";
      delete state.failureReason;
      delete state.failedAt;
      state.objectives = phase.objectives.map((objective) => ({
        ...objective,
        state: "locked",
      }));
    });
    const eventIds = new Set(phases.flatMap((phase) => phase.eventIds));
    this.triggeredEventIds = this.triggeredEventIds.filter(
      (eventId) => !eventIds.has(eventId),
    );
    if (activate) {
      const start = this.phaseStates[startPhaseId];
      start.status = "active";
      start.objectives.forEach((objective) => {
        objective.state = "active";
      });
      this.currentPhaseId = startPhaseId;
    }
    return true;
  }

  triggerEvent(scenario, eventId) {
    const phase = scenario.getPhase(this.currentPhaseId);
    if (
      phase === null ||
      !phase.eventIds.includes(eventId) ||
      this.triggeredEventIds.includes(eventId)
    )
      return null;
    const event = scenario.getEvent(eventId);
    if (event === null)
      throw new RangeError("L'événement de phase n'existe pas.");
    this.triggeredEventIds.push(eventId);
    return event;
  }

  advance(scenario, nextPhaseId) {
    const phase = scenario.getPhase(this.currentPhaseId);
    if (
      phase === null ||
      !this.getCurrentPhaseState().objectives.every(
        (objective) => objective.state === "completed",
      )
    )
      return false;
    if (
      !phase.transitions.some(
        (transition) => transition.nextPhase === nextPhaseId,
      )
    )
      return false;
    const nextState = this.phaseStates[nextPhaseId];
    if (nextState === undefined || nextState.status !== "locked") return false;
    this.getCurrentPhaseState().status = "completed";
    nextState.status = "active";
    nextState.objectives.forEach((objective) => {
      objective.state = "active";
    });
    this.currentPhaseId = nextPhaseId;
    return true;
  }

  redirectToPhase(scenario, nextPhaseId) {
    const current = this.getCurrentPhaseState();
    const next = this.phaseStates[nextPhaseId];
    if (
      current.status !== "active" ||
      scenario.getPhase(nextPhaseId) === null ||
      next?.status !== "locked"
    )
      return false;
    current.status = "completed";
    current.objectives.forEach((objective) => {
      if (objective.state === "active") objective.state = "completed";
    });
    next.status = "active";
    next.objectives.forEach((objective) => {
      objective.state = "active";
    });
    this.currentPhaseId = nextPhaseId;
    return true;
  }

  toJSON() {
    return {
      scenarioId: this.scenarioId,
      currentPhaseId: this.currentPhaseId,
      phaseStates: structuredClone(this.phaseStates),
      triggeredEventIds: [...this.triggeredEventIds],
    };
  }
}
