import test from "node:test";
import assert from "node:assert/strict";
import { battleEntityPosition } from "../app/js/ui/battle-view.js";

const playerTeam = { id: "heroes" };
const enemyTeam = { id: "enemies" };

test("les unites en contact ne traversent jamais le camp adverse a l'affichage", () => {
  const player = { id: "player-unit", kind: "unit", lane: 0, state: "active", progress: 0.8, targetId: "enemy-unit" };
  const enemy = { id: "enemy-unit", kind: "unit", lane: 0, state: "active", progress: 0.8, targetId: "player-unit" };
  const playerPosition = battleEntityPosition(player, playerTeam, "heroes", [enemy]);
  const enemyPosition = battleEntityPosition(enemy, enemyTeam, "heroes", [player]);
  assert.ok(enemyPosition.y < playerPosition.y, "l'ennemi reste au-dessus de l'unite du joueur");
});

test("les unites conservent leur progression normale avant le contact", () => {
  const player = { id: "player-unit", kind: "unit", lane: 0, state: "active", progress: 0.2 };
  const enemy = { id: "enemy-unit", kind: "unit", lane: 0, state: "active", progress: 0.2 };
  assert.equal(battleEntityPosition(player, playerTeam, "heroes", [enemy]).y, 72.2);
  assert.equal(battleEntityPosition(enemy, enemyTeam, "heroes", [player]).y, 27.8);
});
