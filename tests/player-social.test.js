import { socialGame } from "./fixtures/player-social-game.js";
import assert from "node:assert/strict";
import test from "node:test";
import { Game } from "../app/js/core/game.js";
import { Unit } from "../app/js/core/unit.js";
import { alliedPlayers } from "../app/js/core/player-social-service.js";

function begin(game, kind = "trade") {
  game.playerSocialCommand({
    playerId: "a",
    action: "request",
    targetPlayerId: "b",
    kind,
  });
  const session = game.playerSessions.at(-1);
  game.playerSocialCommand({
    playerId: "b",
    action: "accept",
    sessionId: session.id,
    revision: session.revision,
  });
  return session;
}
function command(game, session, playerId, action, extra = {}) {
  return game.playerSocialCommand({
    playerId,
    sessionId: session.id,
    revision: session.revision,
    action,
    ...extra,
  });
}

test("demande : accord du destinataire requis, refus et expiration", () => {
  const { game, advance } = socialGame();
  game.playerSocialCommand({
    playerId: "a",
    action: "request",
    targetPlayerId: "b",
    kind: "talk",
  });
  const s = game.playerSessions[0];
  assert.throws(() => command(game, s, "a", "accept"), /destinataire/);
  assert.throws(() => command(game, s, "b", "share-map"), /acceptation/);
  assert.throws(() => command(game, s, "intruder", "accept"), /terminée/);
  command(game, s, "b", "decline");
  assert.equal(s.status, "cancelled");
  game.playerSocialCommand({
    playerId: "a",
    action: "request",
    targetPlayerId: "b",
    kind: "talk",
  });
  advance(120001);
  game.playerSocialService.refresh(game);
  assert.equal(game.playerSessions[1].status, "cancelled");
});

test("échange atomique des quatre catégories et conservation des unités", () => {
  const {
    game,
    heroes: [a, b],
  } = socialGame();
  a.resources.gold = 7;
  b.resources.wood = 3;
  a.carriedLoot = [
    { id: "cargo", itemId: "food", quantity: 2, valuePerUnit: 1 },
  ];
  a.equipment.mainHand = "iron_sword";
  a.army.addUnit(
    new Unit({
      id: "unit",
      ownerPlayerId: "a",
      typeId: "militia",
      quantity: 2,
      soldierHealth: [10, 6],
      experience: 8,
    }),
  );
  const s = begin(game);
  command(game, s, "a", "offer", {
    offer: [
      { kind: "resource", id: "gold", quantity: 4 },
      { kind: "cargo", id: "cargo", quantity: 1 },
      { kind: "equipment", id: "mainHand", quantity: 1 },
      { kind: "unit", id: "unit", quantity: 1 },
    ],
  });
  command(game, s, "b", "offer", {
    offer: [{ kind: "resource", id: "wood", quantity: 2 }],
  });
  command(game, s, "a", "confirm");
  assert.equal(a.resources.gold, 7);
  command(game, s, "b", "confirm");
  assert.equal(s.status, "completed");
  assert.equal(a.resources.gold, 3);
  assert.equal(b.resources.gold, 4);
  assert.equal(a.resources.wood, 2);
  assert.equal(b.resources.wood, 1);
  assert.equal(a.carriedLoot.length, 0);
  assert.equal(a.equipment.mainHand, undefined);
  assert.equal(b.carriedLoot.length, 2);
  assert.equal(b.army.getUnit("unit").ownerPlayerId, "b");
  assert.deepEqual(b.army.getUnit("unit").soldierHealth, [10, 6]);
  assert.equal(b.army.getUnit("unit").experience, 8);
  assert.throws(() => command(game, s, "b", "confirm"), /terminée/);
});

test("modifier une offre ou les possessions annule les validations", () => {
  const {
    game,
    heroes: [a],
  } = socialGame();
  a.resources.gold = 10;
  const s = begin(game);
  const offer = [{ kind: "resource", id: "gold", quantity: 2 }];
  command(game, s, "a", "offer", { offer });
  command(game, s, "a", "confirm");
  const old = s.revision;
  command(game, s, "b", "offer", { offer: [] });
  assert.deepEqual(s.confirmed, []);
  assert.throws(
    () =>
      game.playerSocialCommand({
        playerId: "b",
        sessionId: s.id,
        action: "confirm",
        revision: old,
      }),
    /changé/,
  );
  command(game, s, "a", "confirm");
  a.resources.gold = 1;
  game.playerSocialService.refresh(game);
  assert.deepEqual(s.confirmed, []);
  command(game, s, "a", "confirm");
  assert.throws(() => command(game, s, "b", "confirm"), /disponible/);
  assert.equal(a.resources.gold, 1);
  assert.deepEqual(s.confirmed, []);
});

test("refus des quantités invalides, doublons et possession étrangère", () => {
  const {
    game,
    heroes: [a],
  } = socialGame();
  a.resources.gold = 10;
  const s = begin(game);
  for (const quantity of [-1, 0, 1.5, 11, Infinity])
    assert.throws(
      () =>
        command(game, s, "a", "offer", {
          offer: [{ kind: "resource", id: "gold", quantity }],
        }),
      /invalide/,
    );
  assert.throws(
    () =>
      command(game, s, "b", "offer", {
        offer: [{ kind: "resource", id: "gold", quantity: 1 }],
      }),
    /invalide/,
  );
  assert.throws(
    () =>
      command(game, s, "a", "offer", {
        offer: Array(2).fill({ kind: "resource", id: "gold", quantity: 1 }),
      }),
    /invalide/,
  );
  assert.deepEqual(s.offers.a, []);
});

test("capacité insuffisante : aucun transfert partiel", () => {
  const {
    game,
    heroes: [a, b],
  } = socialGame();
  a.carriedLoot = [
    { id: "gift", itemId: "iron_sword", quantity: 1, valuePerUnit: 1 },
  ];
  b.carriedLoot = Array.from({ length: 8 }, (_, i) => ({
    id: `full-${i}`,
    itemId: "iron_sword",
    quantity: 1,
    valuePerUnit: 1,
  }));
  const s = begin(game);
  command(game, s, "a", "offer", {
    offer: [{ kind: "cargo", id: "gift", quantity: 1 }],
  });
  command(game, s, "a", "confirm");
  assert.throws(() => command(game, s, "b", "confirm"), /pleins/);
  assert.equal(a.carriedLoot.length, 1);
  assert.equal(b.carriedLoot.length, 8);
});

test("commandement insuffisant : les troupes restent chez leur propriétaire", () => {
  const {
    game,
    heroes: [a, b],
  } = socialGame();
  for (let i = 0; i < 3; i++)
    b.army.addUnit(
      new Unit({
        id: `b-${i}`,
        ownerPlayerId: "b",
        typeId: "militia",
        quantity: 1,
      }),
    );
  a.army.addUnit(
    new Unit({
      id: "gift",
      ownerPlayerId: "a",
      typeId: "militia",
      quantity: 1,
    }),
  );
  const s = begin(game);
  command(game, s, "a", "offer", {
    offer: [{ kind: "unit", id: "gift", quantity: 1 }],
  });
  command(game, s, "a", "confirm");
  assert.throws(() => command(game, s, "b", "confirm"), /commandement/);
  assert.equal(a.army.getUnit("gift").ownerPlayerId, "a");
  assert.equal(b.army.units.length, 3);
});

test("distance, déconnexion et combat interrompent les sessions", () => {
  for (const reason of ["distance", "disconnect", "battle"]) {
    const {
      game,
      heroes: [a, b],
    } = socialGame();
    const s = begin(game);
    if (reason === "distance") b.updatePosition({ latitude: 1, longitude: 0 });
    if (reason === "battle")
      game.battles.push({
        status: "active",
        teams: [{ heroes: [{ sourceId: a.id }] }],
      });
    game.playerSocialService.refresh(
      game,
      reason === "disconnect" ? new Set(["a"]) : null,
    );
    assert.equal(s.status, "cancelled");
  }
});

test("conversation : carte réciproque et session conservée après restauration", () => {
  const { game } = socialGame();
  game.getPlayer("a").discoverLocation("forest", 3);
  game.getPlayer("b").discoverLocation("village", 2);
  const s = begin(game, "talk");
  command(game, s, "a", "share-map");
  assert.equal(game.getPlayer("b").getLocationKnowledge("forest"), 3);
  assert.equal(game.getPlayer("a").getLocationKnowledge("village"), 2);
  const restored = Game.fromJSON(game.toJSON(), { now: game.now });
  assert.deepEqual(restored.playerSessions, game.playerSessions);
});

test("partage de la quête courante sans modifier sa progression", () => {
  const { game } = socialGame();
  const s = begin(game, "talk");
  game.scenario = {
    id: "quest",
    name: "Quête",
    getPhase: () => ({
      id: "phase",
      title: "Au village",
      description: "Rejoindre le village.",
      objectives: [{ id: "arrive", description: "Atteindre le village" }],
    }),
  };
  game.scenarioState = { currentPhaseId: "phase" };
  command(game, s, "a", "share-quest");
  assert.equal(game.getPlayer("b").informationRecords[0].title, "Au village");
  assert.equal(game.scenarioState.currentPhaseId, "phase");
});

test("PvP et alliances : contrôle dans le moteur", () => {
  const {
    game,
    heroes: [a, b],
  } = socialGame({ enemy: true });
  assert.equal(alliedPlayers(game, "a", "b"), false);
  assert.equal(
    game.createPlayerEncounterBattle({
      attackerHeroId: a.id,
      targetHeroId: b.id,
    }).reason,
    "pvp_disabled",
  );
  assert.throws(() => begin(game), /allié/);
  game.setup.rules.allowPvP = true;
  assert.equal(
    game.createPlayerEncounterBattle({
      attackerHeroId: a.id,
      targetHeroId: b.id,
    }).success,
    true,
  );
  assert.equal(
    game.createPlayerEncounterBattle({
      attackerHeroId: a.id,
      targetHeroId: b.id,
    }).reason,
    "already_in_battle",
  );
  assert.equal(game.battles.at(-1).duel.phase, "CHOICE");
  assert.equal(game.battles.at(-1).decisionDeadlineAt - game.battles.at(-1).startedAt, 15_000);
});
