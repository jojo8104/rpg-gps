import test from "node:test";
import assert from "node:assert/strict";
import { renderUnitHealthBar } from "../app/js/ui/unit-health-bar.js";

test("la barre de vie représente les PV réels même quand le soldat reste apte", () => {
  const html = renderUnitHealthBar({ quantity: 1, maxQuantity: 1, healthPerSoldier: 10, combatHealthThreshold: 4, soldierHealth: [8], combatantCount: 1, woundedCount: 0 });
  assert.match(html, /aria-label="8 PV sur 10/);
  assert.match(html, /class="is-combatant" style="flex:8"/);
  assert.match(html, /class="is-dead" style="flex:2"/);
});
