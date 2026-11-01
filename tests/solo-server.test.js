import test from "node:test";
import assert from "node:assert/strict";
import { LobbyService } from "../server/lobby/lobby-service.js";
import { Game } from "../app/js/core/game.js";
import { createMultiplayerLaunch } from "../app/js/core/multiplayer-launch.js";
import { createSoloLaunch } from "../app/js/core/solo-launch.js";
import { triggerAutonomousHeroAttacks } from "../app/js/core/autonomous-hero-attacks.js";

function fixture({ bootstrap = true } = {}) {
  let time = 1000;
  const service = new LobbyService({ now: () => time });
  const solo = service.startSolo({
    playerName: "Alice",
    connectionId: "solo",
    heroClassId: "warrior",
    configuration: { positionMode: "simulation" },
  });
  const launch = createMultiplayerLaunch(solo.lobby);
  const game = new Game({
    setup: launch.setup,
    coordinateMode: "simulation",
    heroClasses: [{ id: "warrior", name: "Guerrier", abilityIds: [] }],
    locations: [
      {
        id: "mine",
        name: "Mine",
        type: "mine",
        source: "test",
        population: 1,
        position: { latitude: 40, longitude: 40 },
        features: { resourceProduction: true },
        resources: {
          production: { gold: 2 },
          stock: { gold: 0 },
          storageCapacity: 100,
        },
      },
    ],
    now: () => time,
  });
  const hero = game.chooseHero(solo.session.playerId, {
    name: "Alice",
    classId: "warrior",
  });
  game.chooseHero("bandits", { name: "Brigand", classId: "warrior" });
  game.start();
  if (bootstrap)
    service.bootstrapGame({
      token: solo.session.token,
      snapshot: game.toJSON(),
    });
  return {
    service,
    solo,
    launch,
    game,
    hero,
    advance: (value) => {
      time = value;
      return service.advanceGames();
    },
  };
}
test("la partie solo est limitée à un joueur humain et tourne sur le serveur", () => {
  const f = fixture();
  assert.equal(f.solo.lobby.maxPlayers, 1);
  assert.equal(f.solo.lobby.players.length, 1);
  assert.equal(f.launch.solo, true);
  assert.throws(
    () =>
      f.service.joinLobby({
        code: f.solo.lobby.code,
        playerName: "Bob",
        connectionId: "other",
      }),
    (error) => error.code === "already_started",
  );
  f.advance(11000);
  const stock = f.service.gameSnapshot(f.solo.lobby.code).state.locations[0]
    .resources.productionStock.gold;
  assert.equal(stock, 2);
  assert.equal(f.game.locations[0].resources.productionStock.gold ?? 0, 0);
  f.advance(11000);
  assert.equal(
    f.service.gameSnapshot(f.solo.lobby.code).state.locations[0].resources
      .productionStock.gold,
    2,
  );
});
test("le solo conserve les préférences du joueur avec son identité serveur", () => {
  const f = fixture();
  const choice = { name: "Mon héros", classId: "warrior" };
  const launch = createSoloLaunch({
    lobby: f.solo.lobby,
    playerId: f.solo.session.playerId,
    setup: f.launch.setup,
    heroChoice: choice,
    positionMode: "simulation",
  });
  assert.equal(launch.solo, true);
  assert.equal(launch.isHost, true);
  assert.equal(launch.localPlayerId, f.solo.session.playerId);
  assert.deepEqual(launch.heroChoices, [
    { playerId: f.solo.session.playerId, choice: { ...choice, name: "Alice" } },
  ]);
});
test("un lancement solo invalide ne laisse aucune partie orpheline", () => {
  const service = new LobbyService();
  assert.throws(() =>
    service.startSolo({
      playerName: "Alice",
      connectionId: "solo",
      heroClassId: "invalid",
      configuration: { positionMode: "simulation" },
    }),
  );
  assert.equal(service.exportState().lobbies.length, 0);
  assert.equal(service.exportState().sessions.length, 0);
});
test("le serveur déclenche une attaque proche une seule fois en simulation", () => {
  const f = fixture();
  f.hero.updatePosition({ latitude: 0, longitude: 0 });
  f.game.unitDefinitions.set("militia", {
    id: "militia",
    name: "Milice",
    stats: { attack: 1, defense: 1, range: 1, speed: 1 },
    maxQuantity: 10,
  });
  f.game.addAutonomousGroup({
    id: "enemy",
    type: "army",
    factionId: "chaos",
    owner: { kind: "faction", id: "chaos" },
    position: { latitude: 1, longitude: 1 },
    behavior: "aggressive",
    army: {
      units: [
        { id: "troop", ownerPlayerId: "chaos", typeId: "militia", quantity: 5 },
      ],
    },
  });
  const ids = new Set([f.hero.playerId]);
  assert.equal(triggerAutonomousHeroAttacks(f.game, ids).length, 1);
  assert.equal(triggerAutonomousHeroAttacks(f.game, ids).length, 0);
});

test("le serveur valide et verrouille le choix final en une commande, avec contrôle de manche", () => {
  const f = fixture({ bootstrap: false });
  const enemy = f.game.heroes.find((entry) => entry.playerId === "bandits");
  const battle = f.game.createBattle({
    teamParticipants: [
      { id: "heroes", heroIds: [f.hero.id] },
      { id: "bandits", heroIds: [enemy.id] },
    ],
    position: f.hero.position,
  });
  f.service.bootstrapGame({
    token: f.solo.session.token,
    snapshot: f.game.toJSON(),
  });
  const command = (choice, round) =>
    f.service.executeBattleCommand({
      token: f.solo.session.token,
      battleId: battle.id,
      command: "lockDuelChoice",
      args: [choice, round],
    });
  assert.throws(
    () => command({ cards: ["HERO"], order: "ATTACK" }, 999),
    /manche/,
  );
  assert.throws(
    () => command({ cards: ["missing"], order: "ATTACK" }, 1),
    /indisponible/,
  );
  const response = command({ cards: ["HERO"], order: "ATTACK" }, 1);
  const duel = response.game.state.battles.find(
    (entry) => entry.id === battle.id,
  ).duel;
  assert.equal(
    duel.players.find((entry) => entry.id === "heroes").locked,
    true,
  );
  assert.deepEqual(duel.pendingChoices.heroes.cards, ["HERO"]);
});

test("les nouveaux combats du serveur utilisent le plateau et les ordres passent par les commandes officielles", () => {
  const f = fixture();
  const enemy = f.game.heroes.find((entry) => entry.playerId === "bandits");
  const created = f.service.executeGameCommand({
    token: f.solo.session.token,
    command: "createBattle",
    args: [
      {
        teamParticipants: [
          { id: "heroes", heroIds: [f.hero.id] },
          { id: "bandits", heroIds: [enemy.id] },
        ],
        position: f.hero.position,
      },
    ],
  });
  const battle = created.game.state.battles.at(-1);
  assert.equal(battle.duel.tactics.columns, 3);
  assert.equal(battle.duel.tactics.rows, 5);
  const choices = [
    { actorId: "HERO:heroes", type: "DEPLOY", to: { x: 1, y: 4 } },
  ];
  const response = f.service.executeBattleCommand({
    token: f.solo.session.token,
    battleId: battle.id,
    command: "lockDuelChoice",
    args: [{ orders: choices }, 1],
  });
  assert.equal(response.game.state.battles.at(-1).duel.players[0].locked, true);
  f.advance(1500);
  const next = f.service.gameSnapshot(f.solo.lobby.code).state.battles.at(-1);
  assert.equal(next.duel.round, 2);
  assert.deepEqual(next.duel.tactics.positions["HERO:heroes"], { x: 1, y: 4 });
  assert.throws(
    () =>
      f.service.executeBattleCommand({
        token: f.solo.session.token,
        battleId: battle.id,
        command: "lockDuelChoice",
        args: [{ orders: choices }, 1],
      }),
    /manche/,
  );
});
