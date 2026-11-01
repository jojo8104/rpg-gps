import assert from "node:assert/strict";
import test from "node:test";
import {
  renderQuestJournal,
  renderQuestOverlay,
} from "../app/js/ui/quest-journal-view.js";
import {
  renderRoyalMessengerNotice,
  renderQuestBadge,
} from "../app/js/ui/quest-notice-view.js";

class Node extends EventTarget {
  innerHTML = "";
  children = [];
  nodes = new Map();
  dataset = {};
  classList = {
    toggle: (name, value) => {
      this.classes.set(name, value);
    },
  };
  classes = new Map();
  querySelector(selector) {
    if (!this.nodes.has(selector)) this.nodes.set(selector, new Node());
    return this.nodes.get(selector);
  }
  querySelectorAll() {
    return [];
  }
  append(...children) {
    this.children.push(...children);
  }
  replaceChildren(...children) {
    this.children = children;
    this.innerHTML = "";
  }
  remove() {
    this.removed = true;
  }
  setAttribute(name, value) {
    this[name] = value;
  }
}

test("le journal réunit objectifs, offre et résultat sans muter le moteur", () => {
  let abandoned = 0;
  const element = new Node();
  renderQuestJournal({
    element,
    game: {
      evacuationStates: { "royal-camp-evacuation": { expiresAt: 121000 } },
      questDeadlines: {},
      teamFortQuestService: { forPlayer: () => null },
    },
    hero: { sideQuests: [] },
    localPlayerId: "local",
    activeQuest: {
      title: "Camp",
      description: "Retrouver le camp",
      status: "active",
      objectives: [
        { state: "completed", text: "Lire l'ordre" },
        { state: "active", text: "Marcher" },
      ],
    },
    availableQuests: [
      { id: "next", title: "La suite", description: "Voir le maréchal" },
    ],
    questResult: {
      outcome: "completed",
      title: "Prologue",
      nextQuestId: "next",
    },
    activeQuestLocations: [{ id: "camp", name: "Camp royal" }],
    placement: null,
    questHudModel: { ready: true, actionLabel: "Placer le camp" },
    highlightedQuestOfferId: "next",
    now: 1000,
    onPlacement: () => {},
    onAbandon: () => {
      abandoned++;
    },
    showLocationOnMap: () => {},
  });
  assert.match(element.innerHTML, /Quête réussie — Prologue/);
  assert.match(element.innerHTML, /✓ Lire l'ordre/);
  assert.match(element.innerHTML, /is-highlighted/);
  assert.match(element.innerHTML, /dans 2 min \(aucun échec automatique\)/);
  assert.match(element.innerHTML, /data-show-quest-location="camp"/);
  assert.match(element.innerHTML, /Placer le camp/);
  element
    .querySelector("#abandon-current-quest")
    .dispatchEvent(new Event("click"));
  assert.equal(abandoned, 1);
});

test("les missions annexes gardent l'horloge du moteur et leur destination", (t) => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: () => new Node() };
  t.after(() => {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  });
  const element = new Node(),
    selected = [];
  renderQuestJournal({
    element,
    game: {
      evacuationStates: {},
      questDeadlines: {},
      now: () => 60000,
      teamFortQuestService: { forPlayer: () => null },
    },
    hero: {
      sideQuests: [
        {
          id: "side",
          title: "Mission annexe",
          source: "tavern",
          status: "completed",
          availableAt: 180000,
          locationId: "tavern",
        },
      ],
    },
    activeQuest: null,
    availableQuests: [],
    questResult: null,
    activeQuestLocations: [],
    placement: null,
    questHudModel: null,
    now: 0,
    onPlacement: () => {},
    onAbandon: () => {},
    showLocationOnMap: (id) => selected.push(id),
  });
  const card = element.children[0];
  assert.match(card.children[2].textContent, /Nouvelle offre dans 2 min/);
  card.children[3].dispatchEvent(new Event("click"));
  assert.deepEqual(selected, ["tavern"]);
});

test("les annonces et le HUD se vident lors d'une réinitialisation", () => {
  const element = new Node();
  let read = 0;
  renderRoyalMessengerNotice({
    element,
    message: { title: "Ordre" },
    onRead: () => {
      read++;
    },
  });
  element.querySelector("button").onclick();
  assert.equal(read, 1);
  assert.equal(element.hidden, false);
  renderRoyalMessengerNotice({ element, message: null });
  assert.equal(element.hidden, true);
  assert.equal(element.innerHTML, "");
  renderQuestOverlay({
    questHud: element,
    questHudModel: null,
    questHudExpanded: false,
  });
  assert.equal(element.hidden, true);
  assert.equal(element.innerHTML, "");
  renderQuestBadge({ element, availableQuests: [{ id: "offer" }] });
  assert.equal(element.classes.get("has-notice"), true);
  assert.match(element["aria-label"], /nouvelle quête/);
  renderQuestBadge({ element, availableQuests: [] });
  assert.equal(element.classes.get("has-notice"), false);
});
