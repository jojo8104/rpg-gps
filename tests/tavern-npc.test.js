import assert from "node:assert/strict";
import test from "node:test";
import { TavernNpcService } from "../app/js/core/tavern-npc-service.js";
import { Location } from "../app/js/core/location.js";
import { Hero } from "../app/js/core/hero.js";

const place = (id, type, tavern = 1, production = {}) => new Location({
  id, name: id, type, source: "test", position: { latitude: 0, longitude: 0 },
  ownerId: "p1", population: 20, infrastructure: tavern ? { tavern } : {},
  resources: { stock: {}, production },
});

test("le pool répartit davantage de PNJ dans les tavernes des lieux évolués", () => {
  const service = new TavernNpcService();
  const camp = place("camp", "camp");
  const capital = place("capital", "capital", 2);
  service.rotate([camp, capital]);
  assert.equal(service.getOffers(camp).length, 2);
  assert.ok(service.getOffers(capital).length > service.getOffers(camp).length);
  assert.ok(service.getOffers(capital).some((npc) => npc.minimumLocationRank >= 3));
});

test("les PNJ changent de taverne après le délai et le surplus reste en réserve", () => {
  const service = new TavernNpcService();
  const first = place("first", "village"); const second = place("second", "village");
  service.rotate([first, second]);
  const before = service.getOffers(first).map((npc) => npc.id);
  assert.equal(service.advance([first, second], 5).rotated, false);
  assert.equal(service.advance([first, second], 1).rotated, true);
  assert.notDeepEqual(service.getOffers(first).map((npc) => npc.id), before);
});

test("un spécialiste et un travailleur rejoignent d'abord les bagages", () => {
  const hero = new Hero({ id: "h", playerId: "p1", name: "H", resources: { gold: 200 } });
  const tavern = place("tavern", "capital", 2); const mine = place("mine", "mine", 0, { iron: 2 });
  const specialist = new TavernNpcService({ rotation: 0, cyclesUntilRotation: 3, assignments: { tavern: ["geologist"] }, acquiredNpcIds: [] });
  assert.equal(specialist.acquire({ location: tavern, locations: [tavern, mine], hero, npcId: "geologist" }).success, true);
  assert.equal(hero.resources.specialist_geologist, 1);
  const worker = new TavernNpcService({ rotation: 0, cyclesUntilRotation: 3, assignments: { tavern: ["veteran_miner"] }, acquiredNpcIds: [] });
  const result = worker.acquire({ location: tavern, locations: [tavern, mine], hero, npcId: "veteran_miner" });
  assert.equal(result.success, true);
  assert.equal(hero.resources.specialist_miner, 1);
  mine.resources.stock.specialist_miner = 1;
  worker.applyLocationWorkers(mine);
  assert.equal(mine.resources.production.iron, 3);
});

test("les officiers entraînent les unités et certains PNJ exigent leur quête", () => {
  const hero = new Hero({ id: "h", playerId: "p1", name: "H", resources: { gold: 200 } });
  const tavern = place("tavern", "capital", 2);
  const officer = new TavernNpcService({ rotation: 0, cyclesUntilRotation: 3, assignments: { tavern: ["drill_officer"] }, acquiredNpcIds: [] });
  assert.equal(officer.acquire({ location: tavern, hero, npcId: "drill_officer" }).success, true);
  assert.equal(hero.resources.officer_drill, 1);
  const questNpc = new TavernNpcService({ rotation: 0, cyclesUntilRotation: 3, assignments: { tavern: ["wandering_sage"] }, acquiredNpcIds: [] });
  assert.equal(questNpc.acquire({ location: tavern, hero, npcId: "wandering_sage" }).reason, "npc_quest_required");
});

test("un mentor applique immédiatement sa statistique et son expérience", () => {
  const hero = new Hero({ id: "h", playerId: "p1", name: "H", resources: { gold: 200 } });
  const tavern = place("tavern", "capital", 2);
  const service = new TavernNpcService({ rotation: 0, cyclesUntilRotation: 3, assignments: { tavern: ["arms_master"] }, acquiredNpcIds: [] });
  const result = service.acquire({ location: tavern, hero, npcId: "arms_master" });
  assert.equal(result.success, true);
  assert.equal(hero.statGrowth.attack, 1);
  assert.equal(result.effect.heroExperience, 50);
  assert.equal(hero.resources.arms_master, undefined);
});
