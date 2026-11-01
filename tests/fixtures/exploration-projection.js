import { ExplorationState } from "../../app/js/core/exploration-state.js";
import { Location } from "../../app/js/core/location.js";
import { AutonomousGroup } from "../../app/js/core/autonomous-group.js";
import { socialGame } from "./player-social-game.js";
import { explorationSnapshot } from "./exploration-state.js";
import { projectPlayerPayload } from "../../server/realtime/player-projection.js";

export function explorationProjectionFixture({ allied = false } = {}) {
  const {
    game,
    heroes: [alice, bob],
  } = socialGame({ enemy: !allied });
  const position = { latitude: 0.00001, longitude: 0.00001 };
  game.locations = ["a", "b"].map(
    (playerId) =>
      new Location({
        id: `mine-${playerId}`,
        name: `Mine ${playerId}`,
        type: "mine",
        source: "test",
        position,
        ownerId: playerId,
        controllerId: playerId,
      }),
  );
  game.autonomousGroups = ["a", "b"].map(
    (playerId) =>
      new AutonomousGroup({
        id: `group-${playerId}`,
        type: "prospecting",
        owner: { kind: "player", id: playerId },
        position,
        mission: {
          kind: "treasure",
          siteId: "hidden-treasure",
          roll: 0.123456789,
        },
        cargo: [{ itemId: "future-secret-loot", quantity: 999 }],
        history: [{ type: "hidden_future_result", seed: "private-seed-8d3" }],
        movement: { destination: { latitude: 0.007, longitude: 0.007 } },
      }),
  );
  const snapshot = explorationSnapshot();
  snapshot.sites[0].hostLocationId = "mine-a";
  snapshot.clues[0].holder.id = alice.id;
  snapshot.clues[1].holder = { kind: "hero", id: bob.id };
  snapshot.clues[1].status = "active";
  snapshot.clues[2].holder = { kind: "player", id: "a" };
  for (const playerId of ["a", "b"])
    for (const kind of ["location", "group"]) {
      snapshot.clues.push({
        id: `item-${kind}-${playerId}`,
        kind: "search",
        siteId: "hidden-treasure",
        text: `Information détenue par ${kind} ${playerId}`,
        holder: {
          kind,
          id: `${kind === "location" ? "mine" : "group"}-${playerId}`,
        },
      });
    }
  snapshot.discoveries = [
    {
      playerId: "a",
      targetKind: "cell",
      targetId: "cell-0-0",
      discoveredAt: 100,
      source: "search",
    },
    {
      playerId: "a",
      targetKind: "site",
      targetId: "hidden-treasure",
      discoveredAt: 100,
      source: "search",
    },
    {
      playerId: "b",
      targetKind: "cell",
      targetId: "cell-1-1",
      discoveredAt: 100,
      source: "search",
    },
  ];
  for (const search of snapshot.searches) search.heroId = alice.id;
  snapshot.expeditions[0].groupId = "group-a";
  snapshot.expeditions[0].result.roll = 0.123456789;
  snapshot.expeditions[1].heroId = alice.id;
  snapshot.expeditions[2].heroId = bob.id;
  snapshot.expeditions.push({
    ...structuredClone(snapshot.expeditions[0]),
    id: "mission-b",
    playerId: "b",
    groupId: "group-b",
  });
  game.explorationState = new ExplorationState(snapshot);
  const state = game.toJSON();
  const context = (playerId, source = state, now = 4000) => ({
    playerId,
    now,
    gameSnapshot: { state: source },
    lobby: {
      hostPlayerId: "a",
      configuration: { gameType: allied ? "cooperation" : "duel" },
      players: game.players,
    },
    positions: {
      positions: game.heroes.map((hero) => ({
        playerId: hero.playerId,
        position: hero.position,
        connected: true,
      })),
    },
  });
  return {
    game,
    state,
    alice,
    bob,
    context,
    project: (playerId, payload, source = state, now = 4000) =>
      projectPlayerPayload(payload, context(playerId, source, now)),
  };
}
