import test from "node:test";
import assert from "node:assert/strict";
import {
  createLocationInteractionPolicy,
  autonomousAttackPolicy,
} from "../app/js/core/location-interaction-policy.js";
import { createLocationFlowController } from "../app/js/controllers/location-flow-controller.js";
import { createEncounterController } from "../app/js/controllers/encounter-controller.js";
import { createApplicationRenderController } from "../app/js/controllers/application-render-controller.js";
import {
  isManagementOpen,
  renderGpsAccuracySummary,
} from "../app/js/ui/world-status-view.js";

function sheet() {
  const buttons = ["fight", "avoid"].map((choice) => ({
    dataset: { encounter: choice },
  }));
  const close = {};
  const attack = {};
  return {
    hidden: true,
    dataset: {},
    classList: { remove() {}, contains: () => false },
    querySelector: (selector) => (selector === ".sheet-close" ? close : attack),
    querySelectorAll: () => buttons,
    buttons,
    attack,
  };
}

test("les portées utilisent les bonus et le moteur restauré de la session", () => {
  const session = {
    mode: "simulation",
    hero: {},
    game: {
      heroClassFeatureService: {
        interactionRadius: (_, radius) => radius + 2,
        detectionRadius: (_, radius) => radius * 2,
      },
    },
  };
  const policy = createLocationInteractionPolicy(session);
  assert.deepEqual(policy.rangesFor({ id: "unknown" }), {
    interactionRadius: 10,
    detectionRadius: 32,
  });
  session.mode = "gps";
  session.rangePolicy = {
    resolve: (_, area) => ({
      interactionRadius: area.radius,
      detectionRadius: 30,
    }),
  };
  session.game = {
    setup: { playArea: { radius: 12 } },
    heroClassFeatureService: {
      interactionRadius: (_, radius) => radius,
      detectionRadius: (_, radius) => radius,
    },
    getLocationRelation: () => "enemy",
  };
  assert.equal(policy.rangesFor({ id: "unknown" }).interactionRadius, 12);
  assert.equal(
    policy.resolveLocationEnemy({
      location: { id: "enemy", features: { battle: true }, ownerId: "chaos" },
    }).name,
    "Créatures du Chaos",
  );
  session.game.getLocationRelation = () => "own";
  assert.equal(
    policy.resolveLocationEnemy({
      location: { id: "ally", features: { battle: true } },
    }),
    null,
  );
});

test("un groupe propre ou hors de portée ne propose pas d'attaque", () => {
  assert.equal(
    autonomousAttackPolicy({ relation: "own", distance: 0 }).canAttack,
    false,
  );
  assert.equal(
    autonomousAttackPolicy({ relation: "enemy", distance: 8 }).canAttack,
    true,
  );
  assert.equal(
    autonomousAttackPolicy({ relation: "enemy", distance: 8.01 }).canAttack,
    false,
  );
});

function flowFixture(id) {
  const calls = [];
  const session = { locationMessage: "Terminé", currentEncounter: {} };
  const quests = { pendingRevealedLocationId: id };
  const locations = { selectedId: "old" };
  const controller = createLocationFlowController({
    session,
    quests,
    locations,
    ui: { sheet: sheet() },
    positionFor: () => [1, 2],
    worldMap: {
      view: { focus: (position) => calls.push(["focus", position]) },
    },
    switchView: (view) => calls.push(["view", view]),
    selectLocation: (target) => {
      locations.selectedId = target;
      calls.push(["select", target]);
    },
    renderWorld: () => calls.push(["world"]),
    render: () => calls.push(["render"]),
    openBattle: async () => calls.push(["battle", locations.selectedId]),
  });
  return { controller, session, quests, locations, calls };
}

test("action et dialogue consomment une révélation une seule fois", async () => {
  for (const method of ["action", "dialogue"]) {
    const fixture = flowFixture("new-site");
    if (method === "action")
      fixture.controller.finishLocationAction({ action: "talk" });
    else await fixture.controller.handleDialogueClosed({});
    assert.equal(fixture.quests.pendingRevealedLocationId, null);
    assert.equal(fixture.locations.selectedId, "new-site");
    assert.deepEqual(fixture.calls.slice(0, 2), [
      ["focus", [1, 2]],
      ["select", "new-site"],
    ]);
  }
});

test("le camp d'évacuation renvoie à la carte après une action ou un dialogue", async () => {
  for (const method of ["action", "dialogue"]) {
    const fixture = flowFixture("evacuation-camp");
    if (method === "action")
      fixture.controller.finishLocationAction({ action: "talk" });
    else await fixture.controller.handleDialogueClosed({});
    assert.equal(fixture.locations.selectedId, null);
    assert.deepEqual(fixture.calls[1], ["view", "map"]);
  }
});

test("un dialogue de combat efface la rencontre avant d'attendre le combat", async () => {
  const fixture = flowFixture(null);
  await fixture.controller.handleDialogueClosed({
    battleLocationId: "battle-site",
  });
  assert.equal(fixture.session.currentEncounter, null);
  assert.deepEqual(fixture.calls, [["render"], ["battle", "battle-site"]]);
});

test("le retour aux ressources et l'action combat respectent leur destination", () => {
  const fixture = flowFixture("pending");
  fixture.controller.finishLocationAction({ action: "battle" });
  assert.equal(fixture.quests.pendingRevealedLocationId, "pending");
  assert.deepEqual(fixture.calls, []);
  fixture.quests.pendingRevealedLocationId = null;
  fixture.controller.finishLocationAction({
    action: "sell",
    returnToWorld: true,
  });
  assert.equal(fixture.locations.message, "Terminé");
  assert.deepEqual(fixture.calls, [["world"]]);
});

test("les rencontres attendent les quêtes et transmettent le choix de combat", async () => {
  const element = sheet();
  const order = [];
  const session = {
    currentEncounter: null,
    interactionEngine: {
      handle: () => {
        order.push("interaction");
        return {
          type: "encounter",
          encounter: {
            locationId: "enemy",
            enemy: { name: "Brigands" },
            choose: (choice) => order.push(choice),
          },
        };
      },
    },
  };
  const locations = {};
  const controller = createEncounterController({
    session,
    ui: { sheet: element },
    quests: { dispatchLocationEvent: async () => order.push("quest") },
    locations,
    isManagementOpen: () => false,
    openBattle: async () => order.push("battle"),
  });
  await controller.handleLocationEvent({
    type: "LocationEntered",
    locationId: "enemy",
  });
  assert.deepEqual(order, ["quest", "interaction"]);
  await element.buttons[0].onclick();
  assert.deepEqual(order.slice(2), ["fight", "battle"]);
  assert.equal(locations.selectedId, "enemy");
  await controller.handleLocationEvent({
    type: "LocationExited",
    locationId: "enemy",
  });
  assert.equal(session.currentEncounter, null);
  assert.equal(element.hidden, true);
});

test("les quêtes progressent sans ouvrir de fiche pendant la gestion", async () => {
  const element = sheet();
  let dispatched = 0;
  const controller = createEncounterController({
    session: { interactionEngine: { handle: () => ({ type: "location" }) } },
    ui: { sheet: element },
    quests: { dispatchLocationEvent: async () => dispatched++ },
    locations: {},
    isManagementOpen: () => true,
    selectLocation: () => assert.fail("ne pas remplacer le panneau"),
  });
  await controller.handleLocationEvent({
    type: "LocationEntered",
    locationId: "new",
  });
  assert.equal(dispatched, 1);
  assert.equal(element.hidden, true);
});

test("une entrée devenue obsolète pendant la progression de quête ne rouvre pas la fiche", async () => {
  let release,
    current = true;
  const locations = { selectedId: null };
  const element = sheet();
  const controller = createEncounterController({
    session: {
      interactionEngine: {
        handle: () => assert.fail("événement de proximité obsolète"),
      },
    },
    ui: { sheet: element },
    quests: {
      dispatchLocationEvent: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    },
    locations,
    isManagementOpen: () => false,
    selectLocation: () => assert.fail("fiche obsolète"),
  });
  const pending = controller.handleLocationEvent(
    { type: "LocationEntered", locationId: "camp" },
    { isCurrent: () => current },
  );
  current = false;
  release();
  await pending;
  assert.equal(locations.selectedId, null);
  assert.equal(element.hidden, true);
});

test("le rendu serveur en arrière-plan préserve les panneaux de gestion", () => {
  let refreshed = 0;
  let notices = 0;
  let questsRendered = 0;
  const controller = createApplicationRenderController({
    session: { game: {} },
    appShell: { updateRelayMessages: () => notices++ },
    relayMessages: () => [],
    isManagementOpen: () => true,
    refreshOpenResourceViews: () => refreshed++,
    quests: { render: () => questsRendered++ },
    worldMap: { render: () => assert.fail("le panneau ouvert doit être préservé") },
    playerInterface: { render: () => assert.fail("ne pas reconstruire les panneaux de gestion") },
  });
  controller.render({ background: true });
  assert.equal(notices, 1);
  assert.equal(refreshed, 1);
  assert.equal(questsRendered, 1);
});

test("la pause visuelle diffère le rendu sans faire avancer le monde", () => {
  let deferred = 0;
  const controller = createApplicationRenderController({
    session: { game: null },
    debugPauseControl: { isPaused: true },
    deferRender: () => deferred++,
  });
  controller.render();
  assert.equal(deferred, 1);
});

test("le rendu complet projette carte, héros, quêtes et indicateurs sans calculer un cycle", () => {
  const order = [];
  const gridStatus = {};
  const session = {
    game: {
      status: "started",
      battleSites: [1, 2],
      advanceCycle: () => assert.fail("production réservée au serveur"),
    },
    playAreaGrid: { cells: [{ visits: 2 }, { visits: 0 }] },
  };
  const ui = { sitesStatus: {} };
  const controller = createApplicationRenderController({
    session,
    appShell: { updateRelayMessages() {} },
    relayMessages: () => [],
    debugPauseControl: {},
    worldMap: {
      view: {},
      layers: {},
      render: (frame) => {
        assert.equal(frame.dynamicSites.length, 1);
        order.push("map");
      },
    },
    scenarioWorld: { syncTeamLocations() {}, syncQuestBattlefield() {} },
    multiplayer: {
      active: true,
      authoritative: true,
      client: {
        sendHeroState: () =>
          assert.fail("pas de publication du héros restauré"),
      },
    },
    queueMultiplayerWorldPublish() {},
    mapLayers: { frame: () => ({ dynamicSites: [1] }) },
    gps: {},
    positioning: {},
    playerMapIntel: () => ({}),
    playerInterface: {
      render: (abilities) => {
        assert.equal(abilities, "abilities");
        order.push("hero");
      },
    },
    heroAbilities: { render: () => "abilities" },
    quests: { render: () => order.push("quests") },
    ui,
    $: (selector) =>
      selector === "#grid-status"
        ? gridStatus
        : { classList: { contains: () => false } },
  });
  controller.render();
  assert.deepEqual(order, ["map", "hero", "quests"]);
  assert.match(ui.sitesStatus.textContent, /2 trace.*1 visible/);
  assert.match(gridStatus.textContent, /2 cellule.*1 visitée.*2 passage/);
});

test("les fiches, dialogues et vues de gestion bloquent le remplacement global", () => {
  for (const state of ["sheet", "dialog", "view", "map"]) {
    const context = {
      ui: {
        sheet: {
          hidden: state !== "sheet",
          classList: { contains: () => false },
        },
      },
      document: {
        querySelector: (selector) =>
          selector === "dialog[open]" ? state === "dialog" : state === "view",
      },
    };
    assert.equal(isManagementOpen(context), state !== "map");
  }
  assert.equal(
    isManagementOpen({
      ui: { sheet: { hidden: false, classList: { contains: () => true } } },
      document: { querySelector: () => null },
    }),
    false,
  );
});

test("le journal GPS indique l'absence de mesure puis les statistiques arrondies", () => {
  const gpsAccuracyStatus = {};
  renderGpsAccuracySummary({
    gpsAccuracyStatus,
    gpsAccuracyLog: { getSummary: () => ({ count: 0 }) },
  });
  assert.match(gpsAccuracyStatus.textContent, /aucun relevé/);
  renderGpsAccuracySummary({
    gpsAccuracyStatus,
    gpsAccuracyLog: {
      getSummary: () => ({
        count: 2,
        average: 4.4,
        minimum: 2.2,
        maximum: 6.6,
      }),
    },
  });
  assert.match(
    gpsAccuracyStatus.textContent,
    /2 relevé.*±4 m.*min 2 m.*max 7 m/,
  );
});
