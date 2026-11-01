import test from "node:test";
import assert from "node:assert/strict";
import { createLocationActionController } from "../app/js/controllers/location-action-controller.js";
import { createScenarioActionController } from "../app/js/controllers/scenario-action-controller.js";

function fixture() {
  const calls = [];
  let session = {
    playerId: "player",
    hero: { id: "hero", getResourceAmount: () => 5 },
    locationId: "camp",
    game: { getLocation: () => ({ id: "camp", name: "Camp" }) },
  };
  const record =
    (name) =>
    (...args) =>
      calls.push([name, ...args]);
  const options = {
    getSession: () => session,
    handleScenarioAction: () => ({ handled: false }),
    onChange: record("render"),
    onMessage: record("message"),
    afterAction: record("after"),
    openDialogue: record("dialogue"),
    openMarket: record("market"),
    onBattle: record("battle"),
    onLog: record("log"),
    onCapture: record("capture"),
    onReachChanged: record("reach"),
    renderWorld: record("world"),
    selectLocation: record("select"),
  };
  return {
    calls,
    options,
    session,
    replace(value) {
      session = value;
    },
    create: () => createLocationActionController(options),
  };
}

test("recrutement : session courante, résultat du moteur et retour dans la fiche", async () => {
  const f = fixture();
  const controller = f.create();
  let input;
  f.replace({
    ...f.session,
    hero: { id: "new-hero" },
    game: {
      ...f.session.game,
      recruitUnit(value) {
        input = value;
        return { success: false, reason: "insufficient_gold" };
      },
    },
  });
  await controller.run("recruit:archer", { returnToWorld: true });
  assert.deepEqual(input, {
    playerId: "player",
    heroId: "new-hero",
    locationId: "camp",
    unitTypeId: "archer",
  });
  assert.deepEqual(f.calls, [
    ["message", "Impossible : insufficient_gold."],
    ["render"],
    ["after", { action: "recruit:archer", returnToWorld: true }],
  ]);
});

test("les réserves transfèrent uniquement la différence et n'appellent pas le moteur si elles sont équilibrées", async () => {
  const f = fixture();
  let input;
  f.session.game.transferLocationResource = (value) => {
    input = value;
    return { success: true, transferred: 3, contentmentDelta: -1 };
  };
  const controller = f.create();
  await controller.run("reserve-balance:food:2");
  assert.equal(input.direction, "to_location");
  assert.equal(input.amount, 3);
  assert.match(f.calls[0][1], /contentement -1/);
  input = null;
  await controller.run("reserve-balance:food:5");
  assert.equal(input, null);
  assert.deepEqual(f.calls.at(-1), ["select", "camp"]);
});

test("la capture suit le verdict du moteur sans déclencher un combat protégé par une quête", async () => {
  const f = fixture();
  f.session.game.getLocationCaptureRequirement = () => ({
    state: "quest_required",
    objectiveId: "defend",
  });
  const controller = f.create();
  await controller.run("battle");
  assert.equal(
    f.calls.some(([name]) => name === "battle"),
    false,
  );
  assert.match(f.calls[0][1], /defend/);
  f.calls.length = 0;
  f.session.game.getLocationCaptureRequirement = () => ({
    state: "can_capture",
  });
  f.session.game.attemptLocationCapture = () => ({ success: true });
  await controller.run("battle", { returnToWorld: true });
  assert.equal(
    f.calls.some(([name]) => name === "capture"),
    true,
  );
  assert.deepEqual(f.calls.at(-1), ["world"]);
});

test("ouvrir le marché ou un dialogue ne reconstruit pas la fiche par-dessus", async () => {
  const f = fixture();
  const controller = f.create();
  await controller.run("trade");
  await controller.run("forge");
  assert.deepEqual(f.calls, [
    ["market", "camp"],
    ["dialogue", "camp", "forge"],
  ]);
});

test("la divination invalide la réponse et ses rafraîchissements lors du changement de partie", async () => {
  const f = fixture();
  let complete, isCurrent;
  f.options.executeLocationCommand = (command, input, guard) => {
    assert.equal(command, "divineAtAcademy");
    assert.equal(input.locationId, "camp");
    isCurrent = guard;
    return new Promise((resolve) => {
      complete = resolve;
    });
  };
  const controller = f.create();
  const pending = controller.run("academy-divination");
  await Promise.resolve();
  await controller.reset();
  assert.equal(isCurrent(), false);
  complete(null);
  await pending;
  assert.deepEqual(f.calls, []);
});

test("une action sans lieu valide ou une intention inconnue ne produit aucun effet", async () => {
  const f = fixture();
  const controller = f.create();
  await controller.run("unknown");
  f.session.game.getLocation = () => null;
  await controller.run("trade");
  assert.deepEqual(f.calls, []);
});

test("les intentions de scénario conservent la préparation et le feedback de quête", async () => {
  const calls = [];
  const progress = { completed: true };
  const controller = createScenarioActionController({
    getSession: () => ({
      game: {
        getLocation: () => ({}),
        dispatchQuestEvent: (event) => {
          calls.push(event);
          return progress;
        },
      },
    }),
    prepareInteraction: (id) => calls.push(id),
    onMessage() {},
    onQuestFeedback: (result) => calls.push(result),
  });
  assert.deepEqual(
    await controller.run("quest-interaction:receive-evacuation-order", "camp"),
    { handled: true, terminal: false },
  );
  assert.deepEqual(calls, [
    "receive-evacuation-order",
    {
      type: "InteractionCompleted",
      interactionId: "receive-evacuation-order",
      locationId: "camp",
    },
    progress,
  ]);
  assert.deepEqual(await controller.run("recruit:archer", "camp"), {
    handled: false,
  });
});

test("l'avant-garde détruite ne déclenche pas un nouveau combat", async () => {
  let battles = 0;
  const controller = createScenarioActionController({
    getSession: () => ({
      game: { getAutonomousGroup: () => ({ status: "destroyed" }) },
    }),
    onMessage() {},
    beginAutonomousBattle: () => battles++,
  });
  assert.deepEqual(await controller.run("engage-evacuation-vanguard", "camp"), {
    handled: true,
    terminal: false,
  });
  assert.equal(battles, 0);
});
