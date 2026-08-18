import test from "node:test";
import assert from "node:assert/strict";
import { PlayArea } from "../app/js/core/play-area.js";
import { PlayAreaPresence } from "../app/js/core/play-area-presence.js";

const area = new PlayArea({ id: "area", name: "Test", polygon: [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }, { latitude: 1, longitude: 0 }] });

test("la présence n'émet que les transitions de la playarea", () => {
  const presence = new PlayAreaPresence();
  presence.setPlayArea(area, { latitude: .1, longitude: .1 });
  assert.equal(presence.update({ latitude: .2, longitude: .2 }), null);
  assert.equal(presence.update({ latitude: 2, longitude: 2 }).type, "PlayAreaExited");
  assert.equal(presence.update({ latitude: 2, longitude: 2 }), null);
  assert.equal(presence.update({ latitude: .1, longitude: .1 }).type, "PlayAreaEntered");
});

test("une sortie peut exiger plusieurs relevés GPS consécutifs", () => {
  const presence = new PlayAreaPresence(area, { confirmations: 2 });
  presence.setPlayArea(area, { latitude: .1, longitude: .1 });
  assert.equal(presence.update({ latitude: 2, longitude: 2 }), null);
  assert.equal(presence.update({ latitude: .1, longitude: .1 }), null);
  assert.equal(presence.update({ latitude: 2, longitude: 2 }), null);
  assert.equal(presence.update({ latitude: 2, longitude: 2 }).type, "PlayAreaExited");
});
