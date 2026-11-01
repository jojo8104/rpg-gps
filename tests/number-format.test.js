import test from "node:test";
import assert from "node:assert/strict";
import { formatInteger } from "../app/js/ui/number-format.js";
import { renderUnitHealthBar } from "../app/js/ui/unit-health-bar.js";
import { unitExperienceProgress } from "../app/js/ui/unit-experience-bar.js";
import { renderStockSlots } from "../app/js/ui/stock-slots-view.js";

test("les nombres affichés sont arrondis sans altérer les libellés inconnus", () => {
  assert.equal(formatInteger(10.49), "10");
  assert.equal(formatInteger(10.5), "11");
  assert.equal(formatInteger(-2.8), "-3");
  assert.equal(formatInteger(-0.2), "0");
  assert.equal(formatInteger("?"), "?");
});

test("les PV et XP sont entiers à l'écran sans modifier les données", () => {
  const unit = { quantity: 1, maxQuantity: 1, healthPerSoldier: 10, soldierHealth: [7.6], experience: 10.7, rank: "soldier" };
  const original = structuredClone(unit);
  const markup = renderUnitHealthBar(unit);
  assert.match(markup, /PV 8\/10/);
  assert.match(markup, /flex:7.6/);
  assert.match(unitExperienceProgress(unit).label, /^11(?:\/| XP)/);
  assert.deepEqual(unit, original);
});

test("les stocks arrondissent le texte mais conservent la quantité transférée", () => {
  const actions = [{ id: "production-stock:wood", details: { resourceName: "wood", productionAmount: 2.6, productionSlotCapacity: 4 } }];
  const markup = renderStockSlots(actions);
  assert.match(markup, /<strong>3\//);
  assert.match(markup, /data-inventory-action="production-transfer:wood:hero:2.6"/);
  assert.equal(actions[0].details.productionAmount, 2.6);
});
