import test from "node:test";
import assert from "node:assert/strict";
import { LobbyView } from "../app/js/ui/lobby-view.js";

for (const adventure of [null, "quick", "plan"]) {
  test(`la reprise affiche les joueurs sans repasser par la création (${adventure})`, () => {
    const view = Object.create(LobbyView.prototype);
    const elements = new Map();
    const pages = [
      "terrain",
      "configuration",
      "preparation",
      "players",
      "saves",
    ].map((name) => ({ dataset: { roomPage: name }, hidden: true }));
    view.root = {
      classList: { toggle() {} },
      querySelector: (id) => {
        if (!elements.has(id)) elements.set(id, {});
        return elements.get(id);
      },
      querySelectorAll: (selector) =>
        selector === "[data-room-page]" ? pages : [],
    };
    view.adventure = adventure;
    view.playerId = "host";
    view.quickSettingsValidated = false;
    view.lobby = {
      hostPlayerId: "host",
      status: "waiting",
      resume: { name: "Partie sauvegardée" },
      configuration: { positionMode: "gps", preparation: { enabled: true } },
      preparationStepProblems: { scenario: ["À valider"] },
    };
    view.terrainView = { closeMap() {} };
    view.preparationView = {
      validatedSteps: new Set(),
      render() {
        assert.fail("La reprise ne doit pas rouvrir la préparation");
      },
    };
    view.showRoomPage("players");
    assert.equal(view.roomPage, "players");
    assert.deepEqual(
      pages.filter((page) => !page.hidden).map((page) => page.dataset.roomPage),
      ["players"],
    );
    assert.equal(elements.get("#lobby-room-next").hidden, true);
  });
}

function fixture() {
  const elements = new Map();
  const rootClasses = new Set();
  const view = Object.create(LobbyView.prototype);
  view.root = {
    classList: {
      add: (name) => rootClasses.add(name),
      remove: (name) => rootClasses.delete(name),
      contains: (name) => rootClasses.has(name),
    },
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, { hidden: false });
      return elements.get(selector);
    },
  };
  const calls = [];
  view.renderAccounts = () => calls.push("accounts");
  view.setStatus = () => {};
  view.showPanel = () => calls.push("panel");
  view.showConnectStep = (step) => calls.push(step);
  view.client = {
    create: (name) => {
      calls.push(["create", name]);
      return { lobby: {} };
    },
    configurePreparation: () => {
      calls.push("detailed");
      return { lobby: { configuration: { preparation: { enabled: true } } } };
    },
  };
  view.run = (operation) => operation();
  view.onSolo = () => calls.push("test");
  return { view, calls, elements };
}

test("le mode précède le joueur et aucune création ne part sans joueur", () => {
  const { view, calls, elements } = fixture();
  view.chooseAdventure("join");
  assert.equal(elements.get("#lobby-mode").hidden, true);
  assert.equal(elements.get("#lobby-choice").hidden, false);
  view.continueAdventure();
  assert.deepEqual(calls, ["accounts"]);
});

for (const mode of ["quick", "plan", "join", "test"]) {
  test(`le parcours ${mode} suit le choix du joueur`, async () => {
    const { view, calls } = fixture();
    view.chooseAdventure(mode);
    view.selectedAccount = { name: "Alice" };
    await view.continueAdventure();
    if (mode === "test") assert.deepEqual(calls, ["accounts", "test"]);
    else if (mode === "join")
      assert.deepEqual(calls, ["accounts", "panel", "join"]);
    else {
      assert.deepEqual(calls, [
        "accounts",
        "panel",
        ["create", "Alice"],
        ...(mode === "plan" ? ["detailed"] : []),
      ]);
      assert.equal(view.roomPage, "terrain");
    }
    view.root.classList.add("is-terrain-editor");
    view.showChoice();
    assert.equal(view.root.querySelector("#lobby-mode").hidden, false);
    assert.equal(view.root.querySelector("#lobby-choice").hidden, true);
    assert.equal(view.adventure, null);
    assert.equal(view.root.querySelector("#lobby-room-footer").hidden, true);
    assert.equal(view.root.classList.contains("is-terrain-editor"), false);
  });
}

test("la partie rapide guide le terrain et les réglages tout en permettant les sauvegardes", () => {
  const view = Object.create(LobbyView.prototype);
  const elements = new Map();
  view.root = {
    classList: { toggle() {} },
    querySelector: (id) => {
      if (!elements.has(id)) elements.set(id, {});
      return elements.get(id);
    },
    querySelectorAll: () => [],
  };
  view.adventure = "quick";
  view.playerId = "host";
  view.lobby = {
    hostPlayerId: "host",
    status: "waiting",
    configuration: { positionMode: "gps" },
  };
  view.terrainView = { openMap() {} };
  view.showRoomPage("players");
  assert.equal(view.roomPage, "terrain");
  view.lobby.playArea = { polygon: [] };
  view.showRoomPage("players");
  assert.equal(view.roomPage, "configuration");
  view.quickSettingsValidated = true;
  view.showRoomPage("players");
  assert.equal(view.roomPage, "players");
  view.showRoomPage("preparation");
  assert.equal(view.roomPage, "preparation");
  view.showRoomPage("saves");
  assert.equal(view.roomPage, "saves");
  view.adventure = "plan";
  view.lobby.configuration.preparation = { enabled: true };
  view.quickSettingsValidated = false;
  view.showRoomPage("preparation");
  assert.equal(
    view.roomPage,
    "configuration",
    "le parcours détaillé exige aussi la validation des réglages",
  );
  view.quickSettingsValidated = true;
  view.showRoomPage("preparation");
  assert.equal(view.roomPage, "preparation");
});
