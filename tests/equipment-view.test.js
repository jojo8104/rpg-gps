import test from "node:test";
import assert from "node:assert/strict";
import { equipmentSlotState, renderEquipmentView } from "../app/js/ui/equipment-view.js";

test("un slot vide compatible signale un équipement disponible", () => {
  const hero = { equipment: {}, carriedLoot: [{ id: "sword", itemId: "iron_sword", quantity: 1 }] };
  const state = equipmentSlotState(hero, { id: "mainHand", name: "Main droite" });
  assert.equal(state.className, "has-available");
  assert.match(renderEquipmentView({ hero }), /data-equipment-slot="mainHand"/);
});

test("un équipement sans meilleur choix est signalé en or", () => {
  const hero = { equipment: { mainHand: "iron_sword" }, carriedLoot: [] };
  const state = equipmentSlotState(hero, { id: "mainHand", name: "Main droite" });
  assert.equal(state.className, "is-equipped is-best");
});

test("le menu du slot ouvert survit à une reconstruction de la vue", () => {
  const hero = { equipment: {}, carriedLoot: [{ id: "sword", itemId: "iron_sword", quantity: 1 }] };
  const html = renderEquipmentView({ hero, openSlotId: "mainHand" });
  assert.match(html, /data-equipment-menu-slot="mainHand"/);
  assert.match(html, /data-equip-package="sword"/);
  assert.doesNotMatch(html, /data-equipment-menu-slot="mainHand" hidden/);
});
