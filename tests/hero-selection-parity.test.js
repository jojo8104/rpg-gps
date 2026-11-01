import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LobbyView } from "../app/js/ui/lobby-view.js";
import { GameSetupView } from "../app/js/ui/game-setup-view.js";
const classes = JSON.parse(
  readFileSync(new URL("../data/hero-classes.json", import.meta.url)),
);
function lobbyFixture(selected = "") {
  const select = { value: selected, disabled: false, closest: () => label },
    label = { hidden: false },
    options = { innerHTML: "" };
  const view = Object.create(LobbyView.prototype);
  view.lobby = null;
  view.root = {
    querySelector: (selector) =>
      selector === "#lobby-hero-class" ? select : options,
    querySelectorAll: () => [],
  };
  return { view, label, options };
}
test("le catalogue tardif affiche un chargement puis les mêmes fiches que le créateur", () => {
  const { view, label, options } = lobbyFixture("warrior");
  view.setHeroClasses([]);
  assert.equal(label.hidden, true);
  assert.match(options.innerHTML, /Chargement des héros/);
  assert.equal(view.heroClassesReady, false);
  view.setHeroClasses(classes);
  const setupOptions = { innerHTML: "", querySelectorAll: () => [] },
    next = { disabled: true };
  const setup = Object.create(GameSetupView.prototype);
  setup.root = {
    querySelector: (selector) =>
      selector === "#hero-class-options"
        ? setupOptions
        : selector === "#hero-continue"
          ? next
          : null,
  };
  setup.setHeroClasses(classes);
  assert.equal(
    options.innerHTML.replaceAll("lobby-hero-choice", "hero-class"),
    setupOptions.innerHTML,
  );
  assert.equal(next.disabled, false);
  assert.equal(view.heroClassesReady, true);
});
test("le catalogue ne remplace pas la classe déjà confirmée par le serveur", () => {
  const { view, options } = lobbyFixture("ranger");
  view.setHeroClasses(classes);
  assert.match(options.innerHTML, /value="ranger" checked/);
  assert.doesNotMatch(options.innerHTML, /value="warrior" checked/);
});
