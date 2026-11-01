import test from "node:test";
import assert from "node:assert/strict";
import {
  renderDialogueView,
  closeDialogueView,
  dialogueHeading,
} from "../app/js/ui/dialogue-view.js";
import { createPortraitAppearance } from "../app/js/core/portrait-catalog.js";

test("le cadrage de scène suit le type de portrait à chaque changement de conversation", () => {
  const classes = new Set();
  const element = {
    hidden: true,
    innerHTML: "",
    classList: {
      toggle(name, enabled) {
        enabled ? classes.add(name) : classes.delete(name);
      },
      remove(name) {
        classes.delete(name);
      },
    },
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const conversation = {
    name: "Forgeron",
    title: "Forge",
    options: [],
    appearance: createPortraitAppearance({ identity: "forge", role: "forge" }),
  };
  const render = (value) =>
    renderDialogueView({
      element,
      conversation: value,
      lines: ["Bonjour"],
      lineIndex: 0,
      showChoices: false,
    });
  render(conversation);
  assert.ok(classes.has("dialogue-view--composed"));
  assert.match(element.innerHTML, /background-forge.png/);
  render({ ...conversation, portrait: "assets/story.png" });
  assert.ok(!classes.has("dialogue-view--composed"));
  render(conversation);
  closeDialogueView(element);
  assert.equal(element.hidden, true);
  assert.ok(!classes.has("dialogue-view--composed"));
});

test("le bandeau distingue lieu et rôle sans répéter le nom au-dessus du texte", () => {
  assert.deepEqual(
    dialogueHeading({
      title: "Chef des mineurs",
      name: "Chef des mineurs · Mine de fer de la Couronne",
    }),
    { context: "Mine de fer de la Couronne", name: "Chef des mineurs" },
  );
  assert.deepEqual(dialogueHeading({ title: "Chef", name: "Chef" }), {
    context: "",
    name: "Chef",
  });
  assert.deepEqual(dialogueHeading({ title: "Gardien", name: "Émile" }), {
    context: "Gardien",
    name: "Émile",
  });
  const element = {
    innerHTML: "",
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  renderDialogueView({
    element,
    conversation: {
      title: "Chef des mineurs",
      name: "Chef des mineurs · Mine de fer de la Couronne",
      options: [],
    },
    lines: ["Bonjour"],
    lineIndex: 0,
    showChoices: false,
  });
  assert.equal(element.innerHTML.match(/Chef des mineurs/g).length, 2); // nom accessible de l'image et titre visible
  assert.doesNotMatch(element.innerHTML, /dialogue-speaker/);
  assert.match(
    element.innerHTML,
    /<small>Mine de fer de la Couronne<\/small><strong>Chef des mineurs<\/strong>/,
  );
});
