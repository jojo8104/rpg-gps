import test from "node:test";
import assert from "node:assert/strict";
import { battleEntityPosition, battleEntityVisualPosition } from "../app/js/ui/battle-view.js";

const playerTeam = { id: "heroes" };
const enemyTeam = { id: "enemies" };

test("les unites en contact ne traversent jamais le camp adverse a l'affichage", () => {
  const player = { id: "player-unit", kind: "unit", lane: 0, state: "active", progress: 0.8, targetId: "enemy-unit" };
  const enemy = { id: "enemy-unit", kind: "unit", lane: 0, state: "active", progress: 0.8, targetId: "player-unit" };
  const playerPosition = battleEntityPosition(player, playerTeam, "heroes", [enemy]);
  const enemyPosition = battleEntityPosition(enemy, enemyTeam, "heroes", [player]);
  assert.ok(playerPosition.x < enemyPosition.x, "l'unité alliée reste à gauche de l'ennemi");
});

test("les unites conservent leur progression normale avant le contact", () => {
  const player = { id: "player-unit", kind: "unit", lane: 0, state: "active", progress: 0.2 };
  const enemy = { id: "enemy-unit", kind: "unit", lane: 0, state: "active", progress: 0.2 };
  assert.equal(battleEntityPosition(player, playerTeam, "heroes", [enemy]).x, 24.8);
  assert.equal(battleEntityPosition(enemy, enemyTeam, "heroes", [player]).x, 75.2);
});

test("la perspective comprime seulement le rendu des lignes du fond", () => {
  const background = { id: "background", kind: "unit", lane: 0, state: "active", progress: 0.2 };
  const foreground = { id: "foreground", kind: "unit", lane: 2, state: "active", progress: 0.2 };
  assert.equal(battleEntityPosition(background, playerTeam, "heroes").x, battleEntityPosition(foreground, playerTeam, "heroes").x);
  const backgroundVisual = battleEntityVisualPosition(background, playerTeam, "heroes");
  const foregroundVisual = battleEntityVisualPosition(foreground, playerTeam, "heroes");
  assert.equal(backgroundVisual.scale, .68);
  assert.equal(foregroundVisual.scale, 1);
  assert.ok(Math.abs(backgroundVisual.x - 50) < Math.abs(foregroundVisual.x - 50));
});
