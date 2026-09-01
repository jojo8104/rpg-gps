import assert from "node:assert/strict";
import test from "node:test";
import { FieldTestSession } from "../app/js/core/field-test-session.js";

test("la zone terrain exige au moins trois points", () => {
  const session = new FieldTestSession();
  session.addPlayAreaPoint({ latitude: 48, longitude: 2 });
  session.addPlayAreaPoint({ latitude: 48, longitude: 2.01 });
  assert.throws(() => session.createPlayArea(), /trois points/);
  session.addPlayAreaPoint({ latitude: 48.01, longitude: 2 });
  assert.equal(
    session.createPlayArea().contains({ latitude: 48.001, longitude: 2.001 }),
    true,
  );
});

test("une zone terrain conserve ses exclusions GPS", () => {
  const session = new FieldTestSession();
  [
    { latitude: 48, longitude: 2 },
    { latitude: 48, longitude: 2.01 },
    { latitude: 48.01, longitude: 2.01 },
    { latitude: 48.01, longitude: 2 },
  ].forEach((point) => session.addPlayAreaPoint(point));
  [
    { latitude: 48.003, longitude: 2.003 },
    { latitude: 48.003, longitude: 2.006 },
    { latitude: 48.006, longitude: 2.006 },
  ].forEach((point) => session.addExclusionPoint(point));
  session.completeExclusion();
  const area = session.createPlayArea();
  assert.equal(area.excludedPolygons.length, 1);
  assert.equal(
    area.allowsPlacement({ latitude: 48.004, longitude: 2.004 }),
    false,
  );
  assert.equal(session.toJSON().excludedPolygons[0].length, 3);
});

test("une quête de pose exige 300 mètres depuis son départ", () => {
  const session = new FieldTestSession({ minimumQuestDistanceMeters: 300 });
  session.startDistanceQuest({ latitude: 48, longitude: 2 });
  assert.equal(
    session.updatePosition({ latitude: 48.001, longitude: 2 }).completed,
    false,
  );
  assert.equal(
    session.updatePosition({ latitude: 48.003, longitude: 2 }).completed,
    true,
  );
  assert.equal(
    session.canPlaceQuestLocation({ latitude: 48.003, longitude: 2 }),
    true,
  );
});

test("une quête de pose refuse une position hors de la zone de jeu", () => {
  const session = new FieldTestSession({ minimumQuestDistanceMeters: 300 });
  const playArea = { contains: (position) => position.latitude < 48.004 };
  session.startDistanceQuest({ latitude: 48, longitude: 2 });
  assert.equal(
    session.canPlaceQuestLocation({ latitude: 48.005, longitude: 2 }, playArea),
    false,
  );
});
