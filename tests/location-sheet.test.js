import test from "node:test";
import assert from "node:assert/strict";
import { renderLocationSheet, renderLocationTab, closeSheet } from "../app/js/ui/bottom-sheet.js";

class Element extends EventTarget {
  dataset = {};
  children = [];
  classes = new Set();
  classList = {
    add: (...names) => names.forEach((name) => this.classes.add(name)),
    remove: (...names) => names.forEach((name) => this.classes.delete(name)),
  };
  set innerHTML(value) { this.children = []; }
  setAttribute() {}
  append(...children) { this.children.push(...children); }
  prepend(child) { this.children.unshift(child); }
  before() {}
  closest() { return null; }
  querySelector() { return new Element(); }
  querySelectorAll() { return []; }
}

const location = { id: "camp", name: "Camp royal", type: "Camp", actions: [], distance: 5 };

function swipe(element, start, end) {
  for (const [type, key, y] of [["touchstart", "touches", start], ["touchend", "changedTouches", end]]) {
    const event = new Event(type);
    event[key] = [{ clientX: 0, clientY: y }];
    element.dispatchEvent(event);
  }
}

test("aperçu, ouverture, fermeture et rafraîchissements ne conservent aucun ancien geste", (t) => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: () => new Element() };
  t.after(() => { globalThis.document = previousDocument; });
  const element = new Element();
  let opened = 0;
  let closed = 0;
  const showSheet = () => renderLocationSheet({ element, location, onAction() {}, onClose: () => { closed++; showTab(); }, onOpenWorld: () => opened++ });
  const showTab = () => renderLocationTab({ element, location, onOpen: showSheet });
  showTab();
  assert.equal(element.hidden, false);
  assert.equal(element.classes.has("location-tab"), true);
  assert.deepEqual(element.children[0].children.slice(0, 2).map((child) => child.textContent), ["Camp", "Camp royal"]);
  element.children[0].dispatchEvent(new Event("click"));
  assert.equal(element.dataset.expandedLocationId, "camp");
  assert.equal(element.classes.has("location-tab"), false);
  showSheet();
  showSheet();
  swipe(element, 100, 0);
  assert.equal(opened, 1, "un seul écran ouvert après plusieurs rendus");
  swipe(element, 0, 100);
  assert.equal(closed, 1);
  assert.equal(element.classes.has("location-tab"), true);
  assert.equal(element.dataset.expandedLocationId, undefined);
  swipe(element, 100, 0);
  assert.equal(opened, 1, "l’aperçu ne réagit plus aux gestes de la fiche");
  closeSheet(element);
  assert.equal(element.hidden, true);
});
