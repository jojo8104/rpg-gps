import assert from "node:assert/strict";
import test from "node:test";
import { Hero } from "../app/js/core/hero.js";
import { renderInventoryItemDetail, renderInventoryView } from "../app/js/ui/inventory-view.js";

test("les chariots sont présentés dans les bagages comme capacité logistique", () => {
  const hero = new Hero({ id: "hero", playerId: "local", name: "Officier", wagons: [{ id: "royal-wagon-1", name: "Chariot royal I", slotBonus: 4 }] });
  const element = { innerHTML: "" }; renderInventoryView({ element, hero, slotCount: hero.bagSlotCount });
  assert.match(element.innerHTML, /Train logistique/); assert.match(element.innerHTML, /Chariot royal I/); assert.match(element.innerHTML, /4 slots supplémentaires/);
});

test("un objet de bagage expose une fiche détaillant sa nature et son utilité", () => {
  const detail = renderInventoryItemDetail("iron_sword", 1);
  assert.match(detail, /Épée de fer/);
  assert.match(detail, /Description/);
  assert.match(detail, /Utilité/);
  assert.match(detail, /\+2 attaque/);
});
