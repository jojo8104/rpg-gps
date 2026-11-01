import test from "node:test";
import assert from "node:assert/strict";
import { createAppShellView } from "../app/js/ui/app-shell-view.js";
import { createAppNavigationController } from "../app/js/controllers/app-navigation-controller.js";

function node() {
  const classes = new Set();
  const children = [],
    listeners = {},
    attributes = {},
    queries = new Map();
  return {
    children,
    listeners,
    attributes,
    dataset: {},
    hidden: false,
    classList: {
      add: (name) => classes.add(name),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name),
      toggle: (name, value) => {
        if (value) classes.add(name);
        else classes.delete(name);
        return value;
      },
    },
    append: (item) => children.push(item),
    insertBefore: (item) => children.push(item),
    prepend: (item) => children.unshift(item),
    after: () => {},
    insertAdjacentHTML: () => {},
    remove: () => {},
    setAttribute: (name, value) => {
      attributes[name] = value;
    },
    addEventListener: (name, callback) => {
      listeners[name] = callback;
    },
    querySelector: (selector) => {
      if (!queries.has(selector)) queries.set(selector, node());
      return queries.get(selector);
    },
  };
}
function fixture() {
  const elements = new Map(),
    created = [];
  const document = {
    querySelector: (selector) => {
      if (!elements.has(selector)) elements.set(selector, node());
      return elements.get(selector);
    },
    querySelectorAll: () => [],
    createElement: () => {
      const item = node();
      created.push(item);
      return item;
    },
    addEventListener: () => {},
  };
  let layers = {
    traceVisibility: new Set(["blue"]),
    fogVisible: true,
    heatmapVisible: true,
  };
  let changes = 0;
  const shell = createAppShellView({
    document,
    pauseElement: node(),
    getMapLayers: () => layers,
    onChange: () => changes++,
    onRelay: () => {},
    now: () => ({ toLocaleTimeString: () => "12:00:00" }),
  });
  return {
    document,
    shell,
    created,
    get layers() {
      return layers;
    },
    replaceLayers: (value) => {
      layers = value;
    },
    get changes() {
      return changes;
    },
  };
}
test("les filtres utilisent les couches de la carte courante", () => {
  const f = fixture();
  const filter = f.created.find(
    (item) => item.className === "dev-trace-filter",
  );
  const input = { value: "blue", checked: false };
  filter.listeners.change({ target: { closest: () => input } });
  assert.equal(f.layers.traceVisibility.has("blue"), false);
  const next = {
    traceVisibility: new Set(),
    fogVisible: true,
    heatmapVisible: true,
  };
  f.replaceLayers(next);
  input.checked = true;
  filter.listeners.change({ target: { closest: () => input } });
  assert.equal(next.traceVisibility.has("blue"), true);
  assert.equal(f.changes, 2);
});
test("le brouillard et la heatmap actualisent la carte et le libellé de l'outil", () => {
  const f = fixture();
  const controls = f.created.filter(
    (item) => item.className === "dev-fog-control",
  );
  controls[0]
    .querySelector("input")
    .listeners.change({ currentTarget: { checked: false } });
  controls[1]
    .querySelector("input")
    .listeners.change({ currentTarget: { checked: false } });
  assert.equal(f.layers.fogVisible, false);
  assert.equal(f.layers.heatmapVisible, false);
  assert.equal(
    f.document.querySelector("#toggle-heatmap").textContent,
    "Afficher la heatmap",
  );
});
test("les notifications, le courrier et le journal gardent leur présentation accessible", () => {
  const f = fixture();
  assert.equal(f.shell.ghostReturnNotice.hidden, true);
  assert.equal(f.shell.ghostReturnNotice.attributes.role, "alert");
  assert.equal(f.shell.travelRewardLayer.attributes["aria-live"], "polite");
  f.shell.log("Prêt");
  assert.equal(f.shell.ui.log.children[0].textContent, "12:00:00 — Prêt");
  f.shell.updateRelayMessages([{ text: "Dernier message" }]);
  const button = f.created.find((item) => item.textContent === "Courrier (1)");
  assert.equal(button.title, "Dernier message");
});
function navigationFixture(overrides = {}) {
  const f = fixture(),
    calls = [],
    timers = [];
  const views = ["map", "battle", "inventory", "world"].map((name) =>
    Object.assign(node(), { id: `${name}-view` }),
  );
  const buttons = views.map((view) =>
    Object.assign(node(), { dataset: { view: view.id.replace("-view", "") } }),
  );
  f.document.querySelectorAll = (selector) =>
    selector === ".view" ? views : buttons;
  let battle = false;
  const nav = createAppNavigationController({
    document: f.document,
    ui: f.shell.ui,
    isBattleActive: () => battle,
    onMap: () => calls.push("map"),
    onInventory: () => calls.push("inventory"),
    onWorld: () => calls.push("world"),
    schedule: (callback) => timers.push(callback),
    ...overrides,
  });
  return {
    ...f,
    nav,
    views,
    buttons,
    calls,
    timers,
    setBattle: (value) => {
      battle = value;
    },
  };
}
test("un combat actif empêche de quitter son écran", () => {
  const f = navigationFixture();
  f.setBattle(true);
  assert.equal(f.nav.switchView("map"), false);
  assert.deepEqual(f.calls, []);
  assert.equal(f.nav.switchView("battle"), true);
  f.nav.setBattleLocked(true);
  assert.ok(f.buttons.every((button) => button.disabled));
  f.nav.setBattleLocked(false);
  assert.ok(f.buttons.every((button) => !button.disabled));
});
test("la navigation rafraîchit la vue cible et ferme les fiches hors de la carte", () => {
  const f = navigationFixture();
  f.nav.switchView("map");
  assert.equal(f.calls[0], "map");
  f.nav.switchView("inventory");
  assert.equal(f.shell.ui.sheet.hidden, true);
  assert.equal(f.calls[1], "inventory");
  assert.equal(f.views[2].classList.contains("is-active"), true);
  f.nav.switchView("world");
  assert.equal(f.calls[2], "world");
});
test("l'accueil et les retours de préparation sont branchés par la navigation", () => {
  const f = navigationFixture();
  f.nav.initialize();
  f.shell.ui.enterApp.listeners.click();
  assert.equal(f.shell.ui.lobby.hidden, false);
  f.timers[0]();
  assert.equal(f.shell.ui.presentation.hidden, true);
  f.document.querySelector("#mode-back").listeners.click();
  assert.equal(f.shell.ui.presentation.hidden, false);
  f.document.querySelector("#setup-exit").listeners.click();
  assert.equal(f.shell.ui.setup.hidden, true);
  assert.equal(f.document.querySelector("#lobby-mode").hidden, false);
  assert.equal(f.document.querySelector("#lobby-choice").hidden, true);
  f.buttons[0].onclick();
  assert.equal(f.calls[0], "map");
});

test("l'accueil propose la reprise uniquement sur demande avec une session enregistrée", async () => {
  let resumed = 0;
  const f = navigationFixture({
    hasSavedSession: () => true,
    onResume: async () => resumed++,
  });
  f.nav.initialize();
  assert.equal(f.shell.ui.resumeApp.hidden, false);
  assert.equal(resumed, 0);
  await f.shell.ui.resumeApp.listeners.click();
  assert.equal(resumed, 1);
  assert.equal(f.shell.ui.lobby.hidden, false);
  f.timers[0]();
  assert.equal(f.shell.ui.presentation.hidden, true);
});

test("l'accueil masque la reprise en l'absence de session enregistrée", () => {
  const f = navigationFixture();
  f.nav.initialize();
  assert.equal(f.shell.ui.resumeApp.hidden, true);
});

test("nouvelle partie ouvre le choix de joueur sans reprendre la session enregistrée", () => {
  let created = 0;
  const f = navigationFixture({
    hasSavedSession: () => true,
    onNewGame: () => created++,
    onResume: () => assert.fail("reprise involontaire"),
  });
  f.nav.initialize();
  f.shell.ui.newGameApp.listeners.click();
  assert.equal(created, 1);
  assert.equal(f.shell.ui.lobby.hidden, false);
  assert.equal(f.shell.ui.resumeApp.hidden, false);
});

test("la reprise devient disponible après l'initialisation du client réseau", () => {
  let available = false;
  const f = navigationFixture({ hasSavedSession: () => available });
  f.nav.initialize();
  assert.equal(f.shell.ui.resumeApp.hidden, true);
  available = true;
  f.nav.refreshSavedSession();
  assert.equal(f.shell.ui.resumeApp.hidden, false);
});
