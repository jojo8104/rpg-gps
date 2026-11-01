import assert from "node:assert/strict";
import test from "node:test";
import {
  createHeroAbilityView,
  openWatchMessagesView,
} from "../app/js/ui/hero-ability-view.js";
import { formatCooldown } from "../app/js/ui/cooldown-format.js";

class Node extends EventTarget {
  children = [];
  nodes = new Map();
  classes = new Map();
  innerHTML = "";
  classList = { toggle: (name, value) => this.classes.set(name, value) };
  append(...children) {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
    }
  }
  querySelector(selector) {
    if (!this.nodes.has(selector)) this.nodes.set(selector, new Node());
    return this.nodes.get(selector);
  }
  setAttribute(name, value) {
    this[name] = value;
  }
  close() {
    this.dispatchEvent(new Event("close"));
  }
  remove() {
    if (this.parent)
      this.parent.children = this.parent.children.filter(
        (child) => child !== this,
      );
  }
  showModal() {
    this.open = true;
  }
}
function documentFixture(t) {
  const previous = globalThis.document;
  const document = { createElement: () => new Node(), body: new Node() };
  globalThis.document = document;
  t.after(() => {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  });
  return document;
}

test("les boutons affichent recharge, ciblage, classe et préparation", (t) => {
  documentFixture(t);
  const powerNav = new Node(),
    mapElement = new Node();
  let divination = 0;
  const actions = {
    launchPreparedAmbush: () => {},
    useDivination: () => {
      divination++;
    },
    useAstralTravel: () => {},
    placeWatchBeacon: () => {},
    openWatchMessages: () => {},
  };
  const view = createHeroAbilityView({ powerNav, mapElement, actions });
  const buttons = Object.fromEntries(
    powerNav.children.map((button) => [button.id, button]),
  );
  view.render({
    hero: { classId: "mage", state: "active" },
    battle: null,
    prepared: null,
    ambushTarget: null,
    ambushAvailable: false,
    activeWatchBeacons: 0,
    divinationCooldown: 61000,
    astralCooldown: 0,
    classPowerUnavailable: false,
    targetingMode: "target-divination",
  });
  assert.equal(buttons["divination-map-action"].hidden, false);
  assert.equal(buttons["divination-map-action"].disabled, true);
  assert.match(buttons["divination-map-action"].innerHTML, /1:01/);
  assert.equal(buttons["divination-map-action"].classes.get("is-active"), true);
  assert.equal(buttons["watch-beacon-action"].hidden, true);
  buttons["divination-map-action"].onclick();
  assert.equal(divination, 1);
  view.render({
    hero: { classId: "ranger", state: "active" },
    battle: null,
    prepared: {},
    ambushTarget: {},
    ambushAvailable: true,
    activeWatchBeacons: 3,
    divinationCooldown: 0,
    astralCooldown: 0,
    classPowerUnavailable: false,
  });
  assert.match(buttons["watch-beacon-action"].title, /plus ancienne/);
  assert.equal(buttons["ambush-action"].textContent, "Attaquer en embuscade");
  view.renderMessages(12);
  assert.equal(mapElement.children[0].querySelector("span").textContent, "9+");
  view.render(null);
  view.renderMessages(0);
  assert.equal(
    powerNav.children.every((button) => button.hidden),
    true,
  );
  assert.equal(mapElement.children[0].hidden, true);
});

test("la lecture de vigie recentre l'alerte et libère la fenêtre", (t) => {
  const document = documentFixture(t),
    focused = [];
  const position = { latitude: 48, longitude: 2 };
  openWatchMessagesView({
    messages: [{ text: "Ada entre dans la zone", position }],
    onFocus: (value) => focused.push(value),
  });
  const dialog = document.body.children[0],
    panel = dialog.children[0];
  assert.equal(panel.children[1].textContent, "Message de vigie");
  panel.children[2].children[1].dispatchEvent(new Event("click"));
  assert.deepEqual(focused, [position]);
  assert.equal(document.body.children.length, 0);
  assert.equal(formatCooldown(60000), "1:00");
});
