import assert from "node:assert/strict";
import test from "node:test";
import { createPlayerInteractionController } from "../app/js/controllers/player-interaction-controller.js";
import { PlayerSocialView } from "../app/js/ui/player-social-view.js";
import { distanceMeters } from "../app/js/core/geo.js";

function fixture() {
  const calls = [];
  let view, socialOptions;
  let session = {
    playerId: "local",
    hero: { id: "hero" },
    position: { latitude: 0, longitude: 0 },
    active: true,
    authoritative: false,
    positions: ["near", "far", "enemy", "offline"].map((playerId, i) => ({
      playerId,
      name: playerId,
      connected: playerId !== "offline",
      position: { latitude: 0, longitude: 0.00001 * (i + 1) },
    })),
    game: {
      setup: {
        participants: ["local", "near", "far", "enemy", "offline"].map(
          (playerId) => ({
            playerId,
            teamId: playerId === "enemy" ? "red" : "green",
          }),
        ),
        rules: { engagementRadiusMeters: 25, allowPvP: true },
      },
      heroes: ["near", "far", "enemy"].map((playerId) => ({
        playerId,
        id: `hero-${playerId}`,
        state: "active",
      })),
      heroClassFeatureService: { visionRadius: () => 150 },
      getLocationWatchZones: () => [],
    },
  };
  const element = { dataset: {}, classList: { remove() {} }, hidden: false };
  const controller = createPlayerInteractionController({
    element,
    getSession: () => session,
    asGps: (value) => value,
    worldDistance: distanceMeters,
    applyServerState: (state) => calls.push(["state", state]),
    activateBattle: (battle) => calls.push(["battle", battle]),
    onLog: (text) => calls.push(["log", text]),
    renderView: (props) => {
      view = props;
      return {
        isOpen: () => !element.hidden,
        feedback: (message) => calls.push(["feedback", message]),
      };
    },
    createSocialView: (options) => {
      socialOptions = options;
      return {
        request: (id, kind) => calls.push(["social", id, kind]),
        sync() {},
      };
    },
  });
  return {
    controller,
    calls,
    get view() {
      return view;
    },
    get socialOptions() {
      return socialOptions;
    },
    get session() {
      return session;
    },
    replace(value) {
      session = value;
    },
  };
}

test("la carte ignore les joueurs déconnectés et les renforts incluent seulement deux alliés proches", () => {
  const f = fixture();
  assert.equal(f.controller.mapIntel().length, 3);
  assert.deepEqual(f.controller.nearbyHeroIds(), [
    "hero",
    "hero-near",
    "hero-far",
  ]);
  f.replace({ ...f.session, active: false });
  assert.deepEqual(f.controller.nearbyHeroIds(), ["hero"]);
});

test("parler et échanger passent par la vue sociale", async () => {
  const f = fixture();
  f.controller.select("near");
  await f.view.onAction("talk");
  await f.view.onAction("trade");
  assert.deepEqual(f.calls, [
    ["social", "near", "talk"],
    ["social", "near", "trade"],
  ]);
});

test("une attaque locale utilise le héros courant et active la bataille produite par Game", async () => {
  const f = fixture();
  f.controller.select("enemy");
  let input;
  f.replace({
    ...f.session,
    hero: { id: "replacement" },
    game: {
      ...f.session.game,
      createPlayerEncounterBattle: (value) => {
        input = value;
        return { success: true, battle: { id: "battle" } };
      },
    },
  });
  await f.view.onAction("attack");
  assert.deepEqual(input, {
    attackerHeroId: "replacement",
    targetHeroId: "hero-enemy",
  });
  assert.deepEqual(f.calls, [["battle", { id: "battle" }]]);
});

test("une attaque serveur en attente ne contamine pas une nouvelle partie", async () => {
  const f = fixture();
  let complete;
  f.replace({
    ...f.session,
    authoritative: true,
    client: {
      sendGameCommand: () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    },
  });
  f.controller.select("enemy");
  const pending = f.view.onAction("attack");
  f.controller.reset();
  complete({ result: { success: true }, game: { state: { old: true } } });
  await pending;
  assert.deepEqual(f.calls, []);
});

test("les commandes sociales abandonnées ne restaurent pas un ancien snapshot", async () => {
  const f = fixture();
  let complete;
  f.replace({
    ...f.session,
    authoritative: true,
    client: {
      sendGameCommand: () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    },
  });
  f.controller.social();
  const old = f.socialOptions;
  const pending = old.send({ action: "request" });
  f.controller.reset();
  complete({ game: { state: { old: true } } });
  assert.equal(await pending, null);
  assert.equal(old.isCurrent(), false);
  assert.deepEqual(f.calls, []);
});

test("une ancienne vue sociale ne reconstruit pas le panneau après la réponse", async () => {
  let current = true,
    complete;
  const sheet = {
    hidden: false,
    innerHTML: "new-panel",
    querySelectorAll: () => [],
  };
  const view = new PlayerSocialView({
    sheet,
    getGame: () => ({}),
    getPlayerId: () => "player",
    isCurrent: () => current,
    send: () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  });
  const pending = view.command({ action: "request" });
  current = false;
  complete({});
  await pending;
  assert.equal(sheet.innerHTML, "new-panel");
  assert.equal(view.pending, false);
});
