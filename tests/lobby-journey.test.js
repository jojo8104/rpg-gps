import test from "node:test";
import assert from "node:assert/strict";
import { lobbyJourney } from "../app/js/ui/lobby-journey.js";

test("les parcours rapides et détaillés commencent par le terrain, puis les réglages", () => {
  const lobby = { configuration: { positionMode: "gps" } };
  assert.deepEqual(lobbyJourney(lobby), [
    "terrain",
    "configuration",
    "players",
  ]);
  lobby.configuration.preparation = { enabled: true };
  assert.deepEqual(lobbyJourney(lobby), [
    "terrain",
    "configuration",
    "preparation",
    "players",
  ]);
});
test("un invité rejoint directement les joueurs et une reprise ne recrée pas le terrain", () => {
  const lobby = {
    resume: { name: "Sauvegarde" },
    configuration: { positionMode: "gps" },
  };
  assert.deepEqual(lobbyJourney(lobby), ["saves", "players"]);
  assert.deepEqual(lobbyJourney(lobby, { host: false }), ["players"]);
  assert.deepEqual(
    lobbyJourney({ configuration: { positionMode: "simulation" } }),
    ["configuration", "players"],
  );
});
