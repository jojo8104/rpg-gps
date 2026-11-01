import test from "node:test";
import assert from "node:assert/strict";
import {
  commandFeedbackKind,
  createCommandFeedbackView,
} from "../app/js/ui/command-feedback-view.js";

function fixture() {
  const nodes = [];
  const sounds = [];
  const callbacks = new Map();
  const documentRef = {
    createElement() {
      return {
        children: [],
        setAttribute() {},
        addEventListener() {},
        append(...children) {
          this.children.push(...children);
        },
        remove() {
          const index = nodes.indexOf(this);
          if (index >= 0) nodes.splice(index, 1);
        },
      };
    },
  };
  const view = createCommandFeedbackView({
    documentRef,
    element: {
      append(node) {
        nodes.push(node);
      },
    },
    alerts: {
      notify(kind) {
        sounds.push(kind);
      },
      reward() {
        sounds.push("reward");
      },
    },
    schedule(callback) {
      const id = callbacks.size + 1;
      callbacks.set(id, callback);
      return id;
    },
    cancel(id) {
      callbacks.delete(id);
    },
  });
  return { view, nodes, sounds, callbacks };
}

test("les retours couvrent les transferts et distinguent acceptation et choix", () => {
  assert.equal(commandFeedbackKind("transferLocationResource"), "transfer");
  assert.equal(commandFeedbackKind("equipHeroItem"), "equipment");
  assert.equal(commandFeedbackKind("attemptLocationCapture"), "capture");
  assert.equal(
    commandFeedbackKind("questEngineCommand", { type: "accept" }),
    "quest",
  );
  assert.equal(
    commandFeedbackKind("questEngineCommand", { type: "act" }),
    "dialogue",
  );
  assert.equal(commandFeedbackKind("updateScenarioPosition"), null);
});

test("une quête n'affiche aucune attente technique et son refus joue un son une seule fois", () => {
  const { view, nodes, sounds, callbacks } = fixture();
  const pending = view.begin("acceptAvailableQuest", ["quest-id"]);
  assert.equal(nodes.length, 0);
  assert.deepEqual(sounds, []);
  assert.equal(callbacks.size, 0);
  pending.finish({ success: false });
  assert.equal(nodes.length, 0);
  assert.deepEqual(sounds, ["danger"]);
  pending.finish({ success: true });
  assert.equal(nodes.length, 0);
});

test("une réponse tardive après changement de partie ne produit aucun son ni annonce", () => {
  const { view, nodes, sounds, callbacks } = fixture();
  const pending = view.begin("acceptAvailableQuest", ["quest-id"]);
  view.reset();
  pending.finish({ success: true });
  assert.equal(nodes.length, 0);
  assert.equal(callbacks.size, 0);
  assert.deepEqual(sounds, []);
});

test("une acceptation confirmée joue la mélodie sans annonce technique", () => {
  const { view, nodes, sounds } = fixture();
  view
    .begin("questEngineCommand", [{ type: "accept" }])
    .finish({ success: true });
  assert.equal(nodes.length, 0);
  assert.deepEqual(sounds, ["reward"]);
});

test("l'équipement ne déclenche aucune annonce centrale", () => {
  const { view, nodes, sounds } = fixture();
  assert.equal(view.begin("equipHeroItem", [{}]), null);
  assert.equal(view.begin("unequipHeroItem", [{}]), null);
  assert.equal(nodes.length, 0);
  assert.deepEqual(sounds, []);
});
