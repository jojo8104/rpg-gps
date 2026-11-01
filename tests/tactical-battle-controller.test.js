import test from "node:test";
import assert from "node:assert/strict";
import { createTacticalBattleController } from "../app/js/controllers/tactical-battle-controller.js";

function fixture(send = async () => ({}), options = {}) {
  let view;
  const calls = [],
    applied = [];
  const battle = {
    id: "b",
    duel: {
      round: 1,
      phase: "CHOICE",
      pendingChoices: {},
      players: [{ id: "a", locked: false, orderBudget: 2 }],
      troops: [{ id: "u", ownerId: "a", count: 1 }],
      tactics: {
        positions: { u: { x: 0, y: 4 } },
        options: {
          u: {
            move: [{ x: 0, y: 3 }],
            attack: [],
            charge: [],
            deploy: [],
            specials: ["DEFEND", "RALLY"],
          },
        },
      },
    },
  };
  const session = {
    authoritative: true,
    client: {
      sendBattleCommand: async (...args) => {
        calls.push(args);
        return send(...args);
      },
    },
  };
  const controller = createTacticalBattleController({
    ...options,
    render: (model) => {
      view = model;
    },
  });
  const show = () =>
    controller.show({
      element: {},
      battle,
      teamId: "a",
      getSession: () => session,
      applyServerState: (state) => applied.push(state),
      refresh: show,
      onChange: () => {},
    });
  show();
  return {
    controller,
    battle,
    calls,
    applied,
    show,
    get view() {
      return view;
    },
  };
}

test("la lecture suit les instantanés serveur par ordre, bloque les intentions et ne se rejoue pas", () => {
  const timers = [];
  const f = fixture(undefined, {
    schedule: (callback) => {
      timers.push(callback);
      return callback;
    },
    cancel: () => {},
  });
  const initial = {
    troops: structuredClone(f.battle.duel.troops),
    players: structuredClone(f.battle.duel.players),
    positions: { u: { x: 0, y: 4 } },
  };
  const movement = {
    ...structuredClone(initial),
    positions: { u: { x: 0, y: 3 } },
  };
  const after = structuredClone(movement);
  f.battle.duel.round = 2;
  f.battle.duel.tactics.positions = after.positions;
  f.battle.duel.lastResult = {
    round: 1,
    initial,
    steps: [{ priority: 1, movement, after, events: [] }],
  };
  const official = structuredClone(f.battle);
  f.show();
  assert.equal(f.view.playback.stage, "start");
  assert.equal(f.view.battle.duel.tactics.positions.u.y, 4);
  f.view.onCell({ x: 0, y: 3 });
  assert.equal(f.view.orders.length, 0);
  timers.shift()();
  assert.equal(f.view.playback.priority, 1);
  assert.equal(f.view.playback.stage, "move");
  assert.equal(f.view.battle.duel.tactics.positions.u.y, 3);
  timers.shift()();
  assert.equal(f.view.playback.stage, "impact");
  timers.shift()();
  assert.equal(f.view.playback, null);
  f.show();
  assert.equal(f.view.playback, null);
  assert.deepEqual(f.battle, official);
});

test("passer la lecture annule le prochain mouvement et rend les commandes disponibles", () => {
  let callback,
    cancelled = false;
  const f = fixture(undefined, {
    schedule: (run) => {
      callback = run;
      return 7;
    },
    cancel: () => {
      cancelled = true;
    },
  });
  const snapshot = {
    troops: f.battle.duel.troops,
    players: f.battle.duel.players,
    positions: f.battle.duel.tactics.positions,
  };
  f.battle.duel.lastResult = {
    round: 0,
    initial: snapshot,
    steps: [{ priority: 1, movement: snapshot, after: snapshot, events: [] }],
  };
  f.show();
  f.view.onSkipPlayback();
  assert.equal(cancelled, true);
  assert.equal(f.view.playback, null);
  callback();
  assert.equal(f.view.playback, null);
});

test("le mode harcèlement envoie une cible serveur sans déplacer localement la troupe", async () => {
  const f = fixture();
  f.battle.duel.tactics.options.u.harass = ["enemy"];
  f.battle.duel.tactics.options.u.specials.push("HARASS");
  const official = structuredClone(f.battle.duel.tactics.positions);
  f.view.onSelect("u");
  f.view.onSpecial("HARASS");
  assert.equal(f.view.harassing, true);
  f.view.onCell({ x: 0, y: 1 }, { id: "enemy", ownerId: "b" });
  assert.deepEqual(f.view.orders, [
    { actorId: "u", type: "HARASS", targetId: "enemy" },
  ]);
  assert.deepEqual(f.battle.duel.tactics.positions, official);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.calls[0][1], "submitDuelChoice");
});

test("sélection, destination, double clic et ordre spécial ne mutent pas l'état officiel", async () => {
  const f = fixture();
  const actor = f.battle.duel.troops[0];
  f.view.onCell({ x: 0, y: 4 }, actor);
  assert.equal(f.view.selected, "u");
  f.view.onCell({ x: 0, y: 3 });
  assert.deepEqual(f.view.orders, [
    { actorId: "u", type: "MOVE", to: { x: 0, y: 3 } },
  ]);
  assert.deepEqual(f.battle.duel.tactics.positions.u, { x: 0, y: 4 });
  f.view.onCell({ x: 0, y: 4 }, actor);
  assert.equal(f.view.specialOpen, true);
  f.view.onSpecial("DEFEND");
  assert.deepEqual(f.view.orders, [{ actorId: "u", type: "DEFEND" }]);
  await f.view.onLock();
  assert.deepEqual(f.calls, [
    [
      "b",
      "lockDuelChoice",
      [{ orders: [{ actorId: "u", type: "DEFEND" }], flee: false }, 1],
    ],
  ]);
});

test("un reset neutralise une réponse tardive et empêche son verrouillage", async () => {
  let release;
  const f = fixture(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  f.view.onSelect("u");
  f.view.onSpecial("DEFEND");
  await Promise.resolve();
  await Promise.resolve();
  const locking = f.view.onLock();
  assert.equal(f.view.submitting, true);
  f.controller.reset();
  release({ game: { state: { stale: true } } });
  await locking;
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0][1], "submitDuelChoice");
  assert.deepEqual(f.applied, []);
});

test("une erreur réseau conserve les ordres et libère le bouton de validation", async () => {
  const f = fixture(async () => {
    throw new Error("Hors ligne");
  });
  f.view.onSelect("u");
  f.view.onSpecial("DEFEND");
  const locking = f.view.onLock();
  await f.view.onLock();
  await locking;
  assert.equal(f.calls.length, 1);
  assert.equal(f.view.submitting, false);
  assert.equal(f.view.orders[0].type, "DEFEND");
  assert.equal(f.view.message, "Hors ligne");
});

test("l'ouverture des réserves ignore une troupe déroutée encore en vie", () => {
  const f = fixture();
  f.battle.duel.troops.unshift({
    id: "routed",
    ownerId: "a",
    count: 2,
    tacticalState: "ROUTED",
  });
  f.battle.duel.troops.push({ id: "reserve", ownerId: "a", count: 1 });
  f.battle.duel.tactics.options.reserve = { deploy: [{ x: 2, y: 4 }] };
  f.show();
  f.view.onFan();
  assert.equal(f.view.fanOpen, true);
  assert.equal(f.view.selected, "reserve");
});
