import assert from "node:assert/strict";
import test from "node:test";
import { FieldTestSession } from "../app/js/core/field-test-session.js";

test("la zone terrain exige au moins trois points", () => {
  const session = new FieldTestSession();
  session.addPlayAreaPoint({ latitude: 48, longitude: 2 });
  session.addPlayAreaPoint({ latitude: 48, longitude: 2.01 });
  assert.throws(() => session.createPlayArea(), /trois points/);
  session.addPlayAreaPoint({ latitude: 48.01, longitude: 2 });
  assert.equal(session.createPlayArea().contains({ latitude: 48.001, longitude: 2.001 }), true);
});

test("une quête de pose exige 300 mètres depuis son départ", () => {
  const session = new FieldTestSession({ minimumQuestDistanceMeters: 300 });
  session.startDistanceQuest({ latitude: 48, longitude: 2 });
  assert.equal(session.updatePosition({ latitude: 48.001, longitude: 2 }).completed, false);
  assert.equal(session.updatePosition({ latitude: 48.003, longitude: 2 }).completed, true);
  assert.equal(session.canPlaceQuestLocation({ latitude: 48.003, longitude: 2 }), true);
});

test("une quête de pose refuse une position hors de la zone de jeu", () => {
  const session = new FieldTestSession({ minimumQuestDistanceMeters: 300 });
  const playArea = { contains: (position) => position.latitude < 48.004 };
  session.startDistanceQuest({ latitude: 48, longitude: 2 });
  assert.equal(session.canPlaceQuestLocation({ latitude: 48.005, longitude: 2 }, playArea), false);
});
