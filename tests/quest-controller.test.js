import assert from "node:assert/strict";
import test from "node:test";
import { createQuestController } from "../app/js/controllers/quest-controller.js";
import { QUEST_SEQUENCE } from "../app/js/core/scenario-quest-catalog.js";

test("débrancher les quêtes conserve le démarrage serveur et supprime les annonces", () => {
  const f = fixture();
  f.session.game.questSystemEnabled = false;
  f.session.multiplayer = { active: true, isHost: true };
  f.controller.startAdventure();
  assert.deepEqual(f.calls, [["bootstrap"]]);
  assert.equal(f.timers.size, 0);
  assert.equal(f.offers.length, 0);
});

function fixture() {
  const calls = [],
    timers = new Map();
  let timerId = 0,
    accepted = true;
  let journal, overlay, notice, group;
  const currentQuest = {
    id: "mission",
    title: "Mission",
    description: "Marcher",
    status: "active",
    objectives: [
      {
        id: "walk",
        text: "Rejoindre le camp",
        state: "active",
        trigger: { locationSlotId: "camp" },
      },
    ],
  };
  const locations = new Map([
    ["royal-capital", { id: "royal-capital", name: "Capitale" }],
    ["camp", { id: "camp", name: "Camp" }],
  ]);
  const groups = new Map();
  const offers = [];
  let session = {
    hero: { id: "hero", sideQuests: [] },
    localPlayerId: "local",
    mode: "simulation",
    positioning: { position: [20, 20], locationPositions: new Map() },
    enabledGpsLocationIds: new Set(),
    activeAdventureId: "chaos",
    multiplayer: { active: false, isHost: false },
    game: {
      scenarioState: { currentPhaseId: "walk", phaseStates: {} },
      scenarioRuntime: { placements: {} },
      scenarioLocationBindings: [
        { locationSlotId: "camp", locationId: "camp" },
      ],
      scenario: {
        getPhase: () => ({
          objectives: [{ id: "walk", text: "Rejoindre le camp" }],
        }),
      },
      evacuationStates: {},
      questDeadlines: {},
      getActiveQuest: () => currentQuest,
      getAvailableQuests: () => offers,
      prepareTestQuest: ({ questId }) => {
        const quest = QUEST_SEQUENCE.find(
          (candidate) => candidate.id === questId,
        );
        offers.push(quest);
        calls.push(["prepare", questId]);
        return { success: true };
      },
      getLastQuestResult: () => null,
      getLocation: (id) => locations.get(id) ?? null,
      getLocationForScenarioSlot: (id) => locations.get(id),
      getAutonomousGroup: (id) => groups.get(id),
      addAutonomousGroup: (group) => groups.set(group.id, group),
      removeAutonomousGroup: (id) => groups.delete(id),
      offerQuest: (offer) => {
        offers.push(offer);
        calls.push(["offer", offer]);
      },
      acceptAvailableQuest: (id) => {
        calls.push(["accept", id]);
        return { success: true };
      },
      abandonCurrentQuest: () => {
        calls.push(["abandon"]);
        return { nextQuestId: "next" };
      },
      selectQuestChoice: (id) => {
        calls.push(["choice", id]);
        return { success: false };
      },
      startCurrentScenarioPlacements: (position) =>
        calls.push(["placements", position]),
      discoverLocation: (input) => calls.push(["discover", input]),
      dispatchQuestEvent: (event) => {
        calls.push(["event", event]);
        return null;
      },
    },
  };
  const world = Object.fromEntries(
    [
      "syncQuestTrace",
      "syncQuestBattlefield",
      "syncEvacuationCampSearch",
      "alignRevealedQuestLocation",
      "ensureRevealedLocationInsidePlayArea",
      "updatePresentation",
      "confirmScenarioPlacement",
    ].map((name) => [name, (...args) => calls.push([name, ...args])]),
  );
  const controller = createQuestController({
    getSession: () => session,
    world,
    elements: {},
    asGps: (position) =>
      Array.isArray(position)
        ? { latitude: position[0], longitude: position[1] }
        : position,
    distance: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]),
    positionFor: (id) => (locations.has(id) ? [0, 0] : null),
    rangesFor: () => ({ interactionRadius: 8 }),
    rebuildLocationEngine: () => calls.push(["rebuild"]),
    onChange: () => calls.push(["render"]),
    onMessage: (text) => calls.push(["message", text]),
    logTest: (text) => calls.push(["log", text]),
    deviceAlerts: {
      notify: (kind) => calls.push(["notify", kind]),
      reward: (payload) => calls.push(["reward", payload]),
    },
    showProgressReward: (reward) => calls.push(["progressReward", reward]),
    openScenario: (effects) => calls.push(["dialogue", effects]),
    selectScenarioChoice: (id) => calls.push(["scenarioChoice", id]),
    focusLocation: (id) => calls.push(["focus", id]),
    selectLocation: (id) => calls.push(["select", id]),
    showLocationOnMap: (id) => calls.push(["map", id]),
    switchView: (name) => calls.push(["view", name]),
    closeGroupSheet: () => calls.push(["close"]),
    closeGameMenu: () => calls.push(["closeMenu"]),
    bootstrap: () => calls.push(["bootstrap"]),
    now: () => 1000,
    schedule: (callback) => {
      timers.set(++timerId, callback);
      return timerId;
    },
    cancel: (id) => timers.delete(id),
    confirm: () => accepted,
    alert: (text) => calls.push(["alert", text]),
    views: {
      journal: (options) => {
        journal = options;
      },
      overlay: (options) => {
        overlay = options;
      },
      notice: (options) => {
        notice = options;
      },
      group: (options) => {
        group = options;
      },
      badge: () => {},
    },
  });
  return {
    controller,
    calls,
    timers,
    groups,
    offers,
    locations,
    currentQuest,
    get session() {
      return session;
    },
    replace: (value) => {
      session = value;
    },
    get journal() {
      return journal;
    },
    get overlay() {
      return overlay;
    },
    get notice() {
      return notice;
    },
    get group() {
      return group;
    },
    confirm: (value) => {
      accepted = value;
    },
  };
}

const progress = (effects) => ({
  phaseId: "walk",
  phaseCompleted: true,
  nextPhaseId: "next",
  completedObjectiveIds: ["walk"],
  appliedEvents: [{ appliedEffects: effects }],
});

test("le premier ordre différé est annulé au changement de partie", async () => {
  const f = fixture();
  await f.controller.startAdventure();
  const callback = [...f.timers.values()][0];
  assert.equal(f.offers.length, 0);
  await f.controller.reset();
  assert.equal(f.timers.size, 0);
  callback();
  assert.equal(f.offers.length, 0);
  assert.equal(f.groups.size, 0);
});

test("relancer une aventure invalide aussi un ancien timer dans la même partie", async () => {
  const f = fixture();
  await f.controller.startAdventure();
  const old = [...f.timers.values()][0];
  await f.controller.startAdventure();
  old();
  assert.equal(f.offers.length, 0);
  [...f.timers.values()][0]();
  assert.equal(f.offers[0].id, "missing-prospectors");
  assert.equal(f.groups.size, 1);
  assert.match(f.notice.message.title, /Convocation/);
});

test("les aventures choisies et le multijoueur conservent leurs modes de lancement", async () => {
  const f = fixture();
  f.session.activeAdventureId = "granaries_of_the_king";
  f.session.multiplayer = { active: true, isHost: true };
  await f.controller.startAdventure();
  assert.equal(f.offers[0].id, "granaries-of-the-king");
  assert.deepEqual(f.offers[0].briefingLines, []);
  assert.equal(f.calls.filter(([kind]) => kind === "bootstrap").length, 1);
  assert.equal(f.timers.size, 0);
  f.session.activeAdventureId = "villages";
  await f.controller.startAdventure();
  assert.equal(f.offers.length, 1);
});

test("un messager ne se duplique pas et la lecture met la quête en évidence", async () => {
  const f = fixture();
  const message = {
    id: "order",
    title: "Ordre",
    text: "Venez",
    questId: "mission",
    focusLocationId: "camp",
  };
  assert.equal(await f.controller.summonRoyalQuestMessenger(message), true);
  assert.equal(await f.controller.summonRoyalQuestMessenger(message), false);
  assert.equal(f.groups.size, 1);
  const read = f.notice.onRead;
  read();
  assert.equal(f.groups.size, 0);
  assert.equal(f.notice.message, null);
  await f.controller.render();
  assert.equal(f.journal.highlightedQuestOfferId, "mission");
  assert.deepEqual(
    f.calls.find(([kind]) => kind === "focus"),
    ["focus", "camp"],
  );
  read();
  assert.equal(f.groups.size, 0);
});

test("une convocation à la capitale actualise sa fiche sans créer de messager", async () => {
  const f = fixture();
  f.session.positioning.position = [0, 0];
  f.session.selectedLocationId = "royal-capital";
  assert.equal(
    await f.controller.announceMarshalConvocation({
      id: "mission",
      title: "Mission",
    }),
    true,
  );
  assert.equal(f.groups.size, 0);
  assert.equal(
    f.calls.some(([kind]) => kind === "select"),
    true,
  );
});

test("un placement prêt avertit une fois et les anciens boutons sont invalidés après reset", async () => {
  const f = fixture();
  const ready = [{ status: "ready", slotId: "camp" }];
  await f.controller.handleScenarioPositionUpdates(ready);
  await f.controller.handleScenarioPositionUpdates(ready);
  assert.equal(f.calls.filter(([kind]) => kind === "notify").length, 1);
  await f.controller.render();
  const place = f.journal.onPlacement,
    abandon = f.journal.onAbandon;
  place();
  assert.deepEqual(
    f.calls.find(([kind]) => kind === "confirmScenarioPlacement"),
    ["confirmScenarioPlacement", "camp"],
  );
  await f.controller.reset();
  f.calls.length = 0;
  place();
  abandon();
  assert.deepEqual(f.calls, []);
});

test("le choix relit le moteur courant et l'abandon respecte la confirmation", async () => {
  const f = fixture();
  await f.controller.render();
  const choice = f.overlay.onChoice;
  f.replace({
    ...f.session,
    game: {
      ...f.session.game,
      selectQuestChoice: (id) => {
        f.calls.push(["newChoice", id]);
        return { success: false };
      },
    },
  });
  choice("choice");
  assert.deepEqual(
    f.calls.find(([kind]) => kind === "newChoice"),
    ["newChoice", "choice"],
  );
  f.confirm(false);
  f.journal.onAbandon();
  assert.equal(
    f.calls.some(([kind]) => kind === "abandon"),
    false,
  );
  f.confirm(true);
  f.journal.onAbandon();
  assert.equal(
    f.calls.some(([kind]) => kind === "abandon"),
    true,
  );
});

test("le retour de progression révèle les lieux et raccorde narration, récompense et carte", async () => {
  const f = fixture();
  await f.controller.applyQuestFeedback(
    progress([
      { type: "narration", text: "La piste est trouvée", scene: "camp" },
      { type: "location_revealed", locationId: "camp" },
      { type: "hero_experience_awarded", amount: 25 },
    ]),
  );
  assert.equal(f.controller.pendingRevealedLocationId, "camp");
  assert.equal(f.session.enabledGpsLocationIds.has("camp"), true);
  assert.deepEqual(f.calls.find(([kind]) => kind === "discover")[1], {
    playerId: "local",
    locationId: "camp",
    level: 2,
  });
  assert.match(f.calls.find(([kind]) => kind === "message")[1], /Camp révélée/);
  assert.equal(
    f.calls.find(([kind]) => kind === "progressReward")[1].title,
    "Objectif accompli",
  );
  assert.equal(
    f.calls.some(([kind]) => kind === "dialogue"),
    true,
  );
  assert.equal(
    f.calls.some(([kind]) => kind === "syncQuestBattlefield"),
    true,
  );
});

test("une fin de quête distingue la réussite de la simple étape", async () => {
  const f = fixture();
  f.session.game.scenarioState.phaseStates.walk = { status: "completed" };
  await f.controller.applyQuestFeedback({ ...progress([]), nextPhaseId: null });
  assert.equal(
    f.calls.find(([kind]) => kind === "progressReward")[1].className,
    "is-quest-complete",
  );
});

test("la résolution d'un combat transmet la victoire et conserve la narration de défaite", async () => {
  const f = fixture();
  let won = true;
  f.session.game.dispatchQuestEvent = (event) => {
    f.calls.push(["event", event]);
    return won
      ? progress([])
      : {
          nextPhaseId: "return",
          appliedEvent: {
            appliedEffects: [
              { type: "narration", text: "Retraite", scene: "defeat" },
            ],
          },
        };
  };
  await f.controller.battleResolved({
    id: "battle",
    sourceLocationId: "camp",
    winnerTeamId: "heroes",
  });
  assert.equal(f.calls.find(([kind]) => kind === "event")[1].type, "BattleWon");
  won = false;
  f.calls.length = 0;
  await f.controller.battleResolved({
    id: "battle",
    sourceLocationId: "camp",
    winnerTeamId: "bandits",
  });
  assert.equal(
    f.calls.find(([kind]) => kind === "event")[1].type,
    "BattleLost",
  );
  assert.deepEqual(
    f.calls.find(([kind]) => kind === "message"),
    ["message", "Retraite"],
  );
  assert.equal(
    f.calls.some(([kind]) => kind === "progressReward"),
    false,
  );
});

test("le sélecteur dev utilise le catalogue et annule le premier ordre", async () => {
  const f = fixture();
  await f.controller.startAdventure();
  const old = [...f.timers.values()][0];
  await f.controller.startDevQuest({
    questId: "repression",
    participantCount: 2,
  });
  assert.equal(f.timers.size, 0);
  old();
  assert.equal(f.offers.length, 1);
  assert.equal(f.offers[0].startPhaseId, "locate-village");
  assert.equal(
    QUEST_SEQUENCE.some((quest) => quest.id === "repression"),
    true,
  );
  assert.equal(
    f.calls.some(([kind]) => kind === "accept"),
    true,
  );
});

test("une cible de quête masquée n'empêche pas le journal de s'afficher", () => {
  const f = fixture();
  f.session.game.scenarioLocationBindings = [];
  f.session.game.getLocationForScenarioSlot = () =>
    assert.fail("association masquée");
  assert.doesNotThrow(() => f.controller.render());
  assert.deepEqual(f.journal.activeQuestLocations, []);
});

test("le test de fort transmet la commande dans une partie solo connectée", async () => {
  const f = fixture();
  f.session.multiplayer.active = true;
  f.session.game.prepareTestQuest = async (input) => {
    f.calls.push(["prepareFort", input]);
    return { success: true };
  };
  await f.controller.startDevQuest({
    questId: "team-fort-test",
    participantCount: 3,
  });
  assert.deepEqual(f.calls.find(([kind]) => kind === "prepareFort")[1], {
    playerId: "local",
    heroId: "hero",
    questId: "team-fort-test",
    participantCount: 3,
  });
});

test("les fiches du scénario reconnaissent le messager et le prévôt", async () => {
  const f = fixture();
  await f.controller.summonRoyalQuestMessenger({
    id: "order",
    title: "Ordre",
    text: "Venez",
  });
  const messenger = [...f.groups.values()][0];
  assert.equal(
    await f.controller.tryOpenGroup(messenger, { distance: 2 }),
    true,
  );
  f.group.onRead();
  assert.equal(f.groups.size, 0);
  f.session.game.scenarioState.currentPhaseId = "village-arrival";
  assert.equal(
    await f.controller.tryOpenGroup(
      { id: "repression-provost" },
      { distance: 7 },
    ),
    true,
  );
  assert.equal(f.group.canTalk, true);
  f.group.onTalk();
  assert.deepEqual(
    f.calls.find(([kind]) => kind === "scenarioChoice"),
    ["scenarioChoice", "TALK_PROVOST"],
  );
  assert.equal(
    await f.controller.tryOpenGroup({ id: "ordinary-group" }, { distance: 1 }),
    false,
  );
});

test("le contrôleur raccorde le résumé du moteur serveur et conserve son ouverture", () => {
  const f = fixture();
  f.session.game.questSystemEnabled = false;
  f.session.game.getQuestEngineView = () => ({
    enabled: true,
    instances: [
      {
        id: "new",
        title: "Mission",
        status: "active",
        actions: [
          { id: "go", label: "Rejoindre la capitale", status: "active" },
        ],
      },
    ],
  });
  f.controller.render();
  assert.equal(f.overlay.questHudModel.objective, "Rejoindre la capitale");
  assert.equal(f.overlay.questHudExpanded, false);
  f.overlay.onToggle();
  assert.equal(f.overlay.questHudExpanded, true);
  f.controller.render();
  assert.equal(f.overlay.questHudExpanded, true);
  f.session.game.getQuestEngineView = () => ({ enabled: true, instances: [] });
  f.controller.render();
  assert.equal(f.overlay.questHudModel, null);
});
