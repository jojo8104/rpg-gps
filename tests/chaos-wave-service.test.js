import test from "node:test";
import assert from "node:assert/strict";
import { ChaosWaveService } from "../app/js/core/chaos-wave-service.js";
import { PlayArea } from "../app/js/core/play-area.js";

test("une vague apparaît sur la bordure et attaque un lieu", () => {
  const values = [0, 0, .5, .75]; let index = 0;
  const service = new ChaosWaveService({ random: () => values[index++], idGenerator: () => "wave-1" });
  const playArea = new PlayArea({ id: "area", name: "Vallée", polygon: [{ latitude: 48, longitude: 2 }, { latitude: 48, longitude: 2.01 }, { latitude: 48.01, longitude: 2.01 }] });
  const wave = service.create({ playArea, locations: [{ id: "camp", state: "active" }], now: 100 });
  assert.equal(wave.mission.kind, "attack_location");
  assert.equal(wave.mission.targetId, "camp");
  assert.equal(wave.position.latitude, 48);
  assert.equal(wave.army.units[0].quantity, 15);
  assert.equal(wave.mission.threatTier, 4);
});
