import test from "node:test";
import assert from "node:assert/strict";
import { createLocationLogisticsController } from "../app/js/controllers/location-logistics-controller.js";

function fixture() {
  const panels = [],
    calls = [];
  const element = { hidden: false, dataset: {}, classList: { remove() {} } };
  let session = {
    playerId: "player",
    hero: { id: "hero" },
    game: {
      getLocation: (id) => ({ id, name: id }),
      getProspectingOptions: () => ({
        minimumFood: 5,
        specialists: [{ id: "geologist", quantity: 1 }],
        expeditions: [],
      }),
      getTradingConvoyOptions: () => ({
        destinations: [
          { id: "village", resources: ["food"] },
          { id: "fort", resources: ["horse"] },
        ],
        convoys: [],
      }),
    },
  };
  const view = (props) => {
    const panel = { props, open: true };
    panels.forEach((old) => {
      old.open = false;
    });
    panels.push(panel);
    return { isOpen: () => panel.open && !element.hidden };
  };
  const controller = createLocationLogisticsController({
    element,
    getSession: () => session,
    applyServerState: (state) => calls.push(["state", state]),
    onChange: () => calls.push(["render"]),
    views: { prospecting: view, convoys: view },
  });
  return {
    controller,
    panels,
    calls,
    session,
    replace(value) {
      session = value;
    },
    last: () => panels.at(-1),
  };
}

test("la prospection transmet les provisions et relit la session au départ", async () => {
  const f = fixture();
  f.controller.openProspecting("post");
  let input;
  f.replace({
    ...f.session,
    hero: { id: "new-hero" },
    game: {
      ...f.session.game,
      createProspectingExpedition: (value) => {
        input = value;
        return { success: true };
      },
    },
  });
  await f.last().props.onCreate({ food: 5, beer: 2, horses: 3 });
  assert.deepEqual(input, {
    playerId: "player",
    heroId: "new-hero",
    originLocationId: "post",
    specialistId: "geologist",
    food: 5,
    beer: 2,
    horses: 3,
  });
  assert.equal(f.last().props.message, "L’expédition est partie.");
});

test("changer de destination sélectionne une ressource admissible, puis la création et l'arrêt passent par Game", async () => {
  const f = fixture();
  let creation, stopped;
  f.session.game.createTradingConvoy = (input) => {
    creation = input;
    return { success: true };
  };
  f.session.game.stopTradingConvoy = (input) => {
    stopped = input;
    return { success: true };
  };
  f.controller.openConvoys("post");
  f.last().props.onDestination("fort");
  assert.equal(f.last().props.resourceId, "horse");
  await f.last().props.onCreate();
  assert.equal(creation.destinationLocationId, "fort");
  assert.equal(creation.resourceId, "horse");
  await f.last().props.onStop("convoy");
  assert.deepEqual(stopped, { playerId: "player", groupId: "convoy" });
});

test("une réponse serveur actualise le jeu sans rouvrir un écran remplacé, et les doubles clics sont ignorés", async () => {
  const f = fixture();
  let complete,
    commands = 0;
  f.replace({
    ...f.session,
    authoritative: true,
    client: {
      sendGameCommand: () => {
        commands++;
        return new Promise((resolve) => {
          complete = resolve;
        });
      },
    },
  });
  f.controller.openConvoys("post");
  const original = f.last();
  const pending = original.props.onCreate();
  await original.props.onCreate();
  assert.equal(commands, 1);
  f.controller.openProspecting("post");
  complete({ result: { success: true }, game: { state: { updated: true } } });
  await pending;
  assert.equal(f.panels.length, 2);
  assert.deepEqual(f.calls, [["state", { updated: true }], ["render"]]);
});

test("la fermeture empêche une réponse tardive de rouvrir le panneau", async () => {
  const f = fixture();
  let complete;
  f.session.game.createTradingConvoy = () =>
    new Promise((resolve) => {
      complete = resolve;
    });
  f.controller.openConvoys("post");
  const pending = f.last().props.onCreate();
  f.last().props.onClose();
  complete({ success: true });
  await pending;
  assert.equal(f.panels.length, 1);
});

test("reset invalide l'état serveur d'une partie précédente", async () => {
  const f = fixture();
  let complete;
  f.replace({
    ...f.session,
    authoritative: true,
    client: {
      sendGameCommand: () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    },
  });
  f.controller.openConvoys("post");
  const pending = f.last().props.onCreate();
  f.controller.reset();
  complete({ result: { success: true }, game: { state: {} } });
  await pending;
  assert.deepEqual(f.calls, []);
  assert.equal(f.panels.length, 1);
});

test("une erreur réseau donne un retour dans le panneau courant", async () => {
  const f = fixture();
  f.session.game.createProspectingExpedition = () => {
    throw new Error("offline");
  };
  f.controller.openProspecting("post");
  await f.last().props.onCreate({ food: 5, beer: 0, horses: 0 });
  assert.match(f.last().props.message, /non confirmé/);
});
