import assert from "node:assert/strict";
import test from "node:test";
import { BattleEngine } from "../app/js/core/battle-engine.js";
import { createBattleController } from "../app/js/controllers/battle-controller.js";

function fixture({
  authoritative = false,
  multiplayer = false,
  isHost = true,
  send,
} = {}) {
  let time = 0;
  let view;
  let resultView;
  let paused = false;
  const timers = new Map();
  const events = [];
  let timerId = 0;
  const battle = new BattleEngine({
    id: "battle",
    now: () => time,
    teams: [
      {
        id: "heroes",
        heroes: [{ id: "h1", sourceId: "hero1", playerId: "p1", command: 3 }],
        units: [
          {
            id: "u1",
            playerId: "p1",
            typeId: "militia",
            quantity: 4,
            maxQuantity: 4,
            attack: 7,
            defense: 2,
            speed: 2,
          },
        ],
      },
      {
        id: "enemy",
        heroes: [{ id: "h2", sourceId: "hero2", playerId: "p2", health: 1 }],
        units: [],
      },
    ],
  });
  battle.start();
  battle.duel.encounter = {
    terrain: { id: "PLAIN" },
    weather: { id: "DRY" },
    twist: { id: "NO_TECHNIQUE" },
    reward: { id: "NONE" },
  };
  const report = {
    battleId: battle.id,
    battleLoot: { entries: [{ id: "gold", allocations: { p1: 2 } }] },
  };
  const game = {
    battles: [battle],
    battleReports: [],
    setup: { participants: [{ playerId: "p1" }] },
    resolveBattle(id) {
      events.push(["resolve", id]);
      this.battleReports.push(report);
      return report;
    },
    collectBattleLoot(input) {
      events.push(["loot", input]);
      return { success: true, battleLoot: { entries: [] } };
    },
  };
  let session = {
    game,
    heroId: "hero1",
    playerId: "p1",
    authoritative,
    multiplayer,
    isHost,
    client: { sendBattleCommand: send ?? (async () => ({})) },
  };
  const controller = createBattleController({
    element: {},
    getSession: () => session,
    async applyServerState(state) {
      events.push(["state", state]);
      if (state.battle) {
        session.game = { ...session.game, battles: [state.battle] };
        await controller.sync();
      }
    },
    onEnter: () => events.push("enter"),
    onReturnToMap: () => events.push("map"),
    onNavigationLocked: (value) => events.push(["navigation", value]),
    onResolved: (event) => events.push(["resolved", event]),
    onChange: () => events.push("change"),
    onPublish: () => {},
    onAttackDenied: (id) => events.push(["denied", id]),
    onLog: () => {},
    isPaused: () => paused,
    now: () => time,
    schedule(fn) {
      timers.set(++timerId, fn);
      return timerId;
    },
    cancel: (id) => timers.delete(id),
    renderDuelView: (model) => {
      view = model;
    },
    renderResultView: (model) => {
      resultView = model;
    },
    updateCountdown: () => {},
  });
  return {
    controller,
    battle,
    timers,
    events,
    report,
    get session() {
      return session;
    },
    get view() {
      return view;
    },
    get resultView() {
      return resultView;
    },
    setPaused(value) {
      paused = value;
    },
    setTime(value) {
      time = value;
    },
    tick() {
      for (const fn of [...timers.values()]) fn();
    },
    replaceSession(next) {
      session = next;
    },
  };
}

test("le choix local termine le duel, produit un seul rapport et arrête le timer", async () => {
  const f = fixture();
  await f.controller.activate(f.battle);
  f.view.onToggleCard("u1");
  assert.deepEqual(f.view.selectedCards, ["u1"]);
  await f.view.onLock();
  assert.equal(f.battle.status, "finished");
  assert.equal(f.timers.size, 0);
  assert.equal(f.events.filter((event) => event[0] === "resolve").length, 1);
  await f.controller.render();
  assert.equal(f.resultView.result, f.report);
  f.resultView.onReturnToMap();
  assert.ok(f.events.includes("map"));
  await f.controller.collectLoot();
  assert.deepEqual(f.events.find((event) => event[0] === "loot")[1].selection, {
    gold: 2,
  });
  assert.match(f.resultView.lootMessage, /transféré/);
});

test("la fuite reste un choix de duel et produit son résultat", async () => {
  const f = fixture();
  await f.controller.activate(f.battle);
  await f.view.onFlee();
  assert.equal(f.battle.status, "finished");
  assert.equal(f.battle.winnerTeamId, "enemy");
  assert.equal(f.timers.size, 0);
});

test("l'échéance utilise le brouillon courant et le client serveur ne résout pas localement", async () => {
  const f = fixture();
  await f.controller.activate(f.battle);
  f.view.onToggleCard("u1");
  f.setTime(16_000);
  f.tick();
  assert.equal(f.battle.status, "finished");
  const remote = fixture({ authoritative: true, multiplayer: true });
  await remote.controller.activate(remote.battle);
  remote.setTime(60_000);
  remote.tick();
  assert.equal(remote.battle.duel.round, 1);
  assert.equal(
    remote.events.some((event) => event[0] === "resolve"),
    false,
  );
});

test("la reprise serveur remplace la bataille, conserve le brouillon et affiche le rapport reçu", async () => {
  const f = fixture({ authoritative: true, multiplayer: true });
  await f.controller.activate(f.battle);
  f.view.onToggleCard("u1");
  const restored = new BattleEngine(f.battle.toJSON());
  f.replaceSession({
    ...f.session,
    game: { ...f.session.game, battles: [restored] },
  });
  await f.controller.sync();
  await f.controller.render();
  assert.equal(f.controller.active, restored);
  assert.deepEqual(f.view.selectedCards, ["u1"]);
  restored.status = "finished";
  f.session.game.battleReports = [f.report];
  await f.controller.sync();
  await f.controller.render();
  assert.equal(f.resultView.result, f.report);
  assert.equal(f.timers.size, 0);
  assert.equal(
    f.events.some((event) => event[0] === "resolve"),
    false,
  );
});

test("la pause diffère l'affichage et reset neutralise les anciennes commandes", async () => {
  const f = fixture();
  f.setPaused(true);
  await f.controller.activate(f.battle);
  assert.equal(f.view, undefined);
  f.setPaused(false);
  await f.controller.resume();
  const old = f.view;
  await f.controller.reset();
  old.onToggleCard("u1");
  await old.onLock();
  assert.equal(f.controller.active, null);
  assert.equal(f.timers.size, 0);
  assert.equal(
    f.events.some((event) => event[0] === "resolve"),
    false,
  );
});

test("un envoi en cours ne verrouille pas une autre bataille après reset", async () => {
  let release;
  const calls = [];
  const f = fixture({
    authoritative: true,
    multiplayer: true,
    send: (id, command) => {
      calls.push([id, command]);
      return new Promise((resolve) => {
        release = resolve;
      });
    },
  });
  await f.controller.activate(f.battle);
  const old = f.view;
  old.onToggleCard("u1");
  await Promise.resolve();
  await Promise.resolve();
  const locking = f.view.onLock();
  await f.controller.reset();
  const next = new BattleEngine({
    ...f.battle.toJSON(),
    id: "other",
    status: "ready",
    duel: undefined,
  });
  next.start();
  await f.controller.activate(next);
  release({ game: { state: { stale: true } } });
  await locking;
  assert.deepEqual(calls, [["battle", "submitDuelChoice"]]);
  assert.equal(f.controller.active.id, "other");
  assert.equal(
    f.events.some((event) => event[0] === "state"),
    false,
  );
});

test("la validation abandonne les brouillons en attente et envoie le choix final une fois", async () => {
  const commands = [];
  const f = fixture({
    authoritative: true,
    multiplayer: true,
    send: async (id, command, args) => {
      commands.push({ id, command, args: structuredClone(args) });
      return {};
    },
  });
  await f.controller.activate(f.battle);
  f.view.onToggleCard("u1");
  f.view.onOrder("DEFEND");
  const locking = f.view.onLock();
  assert.equal(f.view.submitting, true);
  await f.view.onLock();
  await locking;
  assert.deepEqual(commands, [
    {
      id: "battle",
      command: "lockDuelChoice",
      args: [{ cards: ["u1"], order: "DEFEND" }, 1],
    },
  ]);
  assert.equal(f.view.submitting, false);
  assert.equal(
    f.events.some((event) => event[0] === "resolve"),
    false,
  );
});

test("une erreur réseau libère la validation et conserve le choix pour réessayer", async () => {
  const f = fixture({
    authoritative: true,
    send: async () => {
      throw new Error("Connexion perdue");
    },
  });
  f.controller.activate(f.battle);
  f.view.onToggleCard("u1");
  await f.view.onLock();
  assert.equal(f.view.submitting, false);
  assert.deepEqual(f.view.selectedCards, ["u1"]);
  assert.equal(f.view.message, "Connexion perdue");
});

test("le solo autoritaire ne calcule pas de résultat à l'échéance", () => {
  const f = fixture({ authoritative: true });
  f.controller.activate(f.battle);
  f.setTime(60_000);
  f.tick();
  assert.equal(f.battle.duel.round, 1);
  assert.equal(f.battle.duel.players[0].locked, false);
});

test("un combat tactique déconnecté ne bascule jamais sur une résolution locale", () => {
  const f = fixture();
  f.controller.activate(f.battle);
  f.battle.duel.tactics = { columns: 3, rows: 5 };
  f.setTime(60_000);
  f.tick();
  assert.equal(f.battle.duel.round, 1);
  assert.deepEqual(f.battle.duel.pendingChoices, {});
  assert.equal(f.events.some((event) => event[0] === "resolve"), false);
});

test("une bataille découverte par synchronisation ne crée qu'un timer et un invité ne la résout pas", async () => {
  const f = fixture({ multiplayer: true, isHost: false });
  await f.controller.sync();
  await f.controller.sync();
  assert.equal(f.controller.active, f.battle);
  assert.equal(f.timers.size, 1);
  assert.equal(f.events.filter((event) => event === "enter").length, 1);
  f.setTime(60_000);
  f.tick();
  assert.equal(f.battle.duel.round, 1);
  f.session.game.battles = [];
  await f.controller.sync();
  assert.equal(f.controller.active, null);
  assert.equal(f.timers.size, 0);
});


test("une nouvelle manche réserve quatre secondes de lecture puis quinze de décision", () => {
  const battle = new BattleEngine({
    id: "cadence",
    teams: ["a", "b"].map((id) => ({
      id,
      heroes: [{ id: `hero-${id}`, health: 100, maxHealth: 100, attack: 1, defense: 100 }],
      units: [],
    })),
  });
  battle.start(1000);
  assert.equal(battle.decisionDeadlineAt, 16000);
  for (const id of ["a", "b"]) {
    battle.submitDuelChoice(id, { cards: [], order: "ATTACK" });
    battle.lockDuelChoice(id, 2000);
  }
  assert.equal(battle.status, "active");
  assert.equal(battle.duel.round, 2);
  assert.equal(battle.decisionDeadlineAt, 21000);
});
