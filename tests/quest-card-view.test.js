import test from "node:test";
import assert from "node:assert/strict";
import { makeQuestCardsCollapsible } from "../app/js/ui/quest-card-view.js";

class Node extends EventTarget {
  constructor(tagName) {
    super();
    this.tagName = tagName.toUpperCase();
    this.childNodes = [];
    this.dataset = {};
    this.attributes = {};
  }
  get children() { return this.childNodes; }
  append(...nodes) {
    for (const node of nodes) {
      if (node.parent) {
        node.parent.childNodes = node.parent.childNodes.filter((item) => item !== node);
      }
      node.parent = this;
      this.childNodes.push(node);
    }
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  replaceWith(node) {
    this.parent.childNodes = this.parent.childNodes.map((item) => item === this ? node : item);
    node.parent = this.parent;
  }
}

test("les fiches se replient, gardent leurs actions et restent ouvertes après rafraîchissement", (t) => {
  const previous = globalThis.document;
  globalThis.document = { createElement: (tag) => new Node(tag) };
  t.after(() => {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  });
  const journal = new Node("div");
  journal.querySelectorAll = () => journal.children.filter((node) => node.tagName === "ARTICLE");
  const renderCard = () => {
    journal.childNodes = [];
    const card = new Node("article");
    card.className = "quest-card";
    const title = new Node("strong");
    title.textContent = "Mission";
    const action = new Node("button");
    let clicks = 0;
    action.addEventListener("click", () => clicks++);
    card.append(title, action);
    journal.append(card);
    makeQuestCardsCollapsible(journal);
    const [toggle, body] = journal.children[0].children;
    return { toggle, body, action, clicks: () => clicks };
  };
  const first = renderCard();
  assert.equal(journal.children[0].tagName, "DIV");
  assert.equal(first.body.hidden, true);
  first.toggle.dispatchEvent(new Event("click"));
  assert.equal(first.body.hidden, false);
  assert.equal(first.toggle.attributes["aria-expanded"], "true");
  assert.equal(first.body.children[0], first.action);
  first.action.dispatchEvent(new Event("click"));
  assert.equal(first.clicks(), 1);
  const refreshed = renderCard();
  assert.equal(refreshed.body.hidden, false);
  refreshed.toggle.dispatchEvent(new Event("click"));
  assert.equal(refreshed.body.hidden, true);
});
