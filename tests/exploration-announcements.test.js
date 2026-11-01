import assert from "node:assert/strict";
import test from "node:test";
import { explorationProjectionFixture } from "./fixtures/exploration-projection.js";
import { Game } from "../app/js/core/game.js";
import { createExplorationProjection } from "../server/realtime/exploration-projection.js";
import { createExplorationAnnouncementPresenter } from "../app/js/ui/exploration-announcement-presenter.js";

function fixture() {
  const { game } = explorationProjectionFixture();
  const site = game.explorationState.sites[0];
  site.name = "Le Coffre des Brumes";
  assert.equal(
    game.explorationClueService.close(site.id, { eventId: "gone", at: 1000 }),
    true,
  );
  return { game, site };
}
const project = (game, playerId, now) =>
  createExplorationProjection(game.toJSON(), playerId, { now }).view;

test("annonce mondiale à cinq minutes précises, sans emplacement ni identité d’un joueur", () => {
  const { game } = fixture();
  for (const playerId of ["a", "b"]) {
    assert.deepEqual(project(game, playerId, 300999).announcements, []);
    const messages = project(game, playerId, 301000).announcements;
    assert.equal(messages.length, 1);
    assert.equal(
      messages[0].message,
      "Le trésor « Le Coffre des Brumes » a été découvert par un explorateur.",
    );
    assert.deepEqual(Object.keys(messages[0]).sort(), [
      "at",
      "id",
      "message",
      "name",
    ]);
    assert.equal(messages[0].at, 301000);
  }
  assert.deepEqual(project(game, "unknown", 999999).announcements, []);
});

test("échéance sauvegardée, publication serveur unique et rattrapage après déconnexion", () => {
  const { game, site } = fixture();
  assert.equal(
    game.explorationClueService.close(site.id, { eventId: "repeat", at: 2000 }),
    false,
  );
  let now = 300999;
  const restored = Game.fromJSON(game.toJSON(), { now: () => now });
  restored.update();
  assert.equal(restored.explorationState.announcements[0].publishedAt, null);
  now = 301000;
  restored.update();
  assert.equal(restored.explorationState.announcements[0].publishedAt, now);
  now += 1000;
  restored.update();
  assert.equal(restored.explorationState.announcements.length, 1);
  assert.equal(restored.explorationState.announcements[0].publishedAt, 301000);
  const late = Game.fromJSON(game.toJSON(), { now: () => 800000 });
  assert.equal(project(late, "b", 800000).announcements.length, 1);
});

test("les copies d’annonce future restent privées et une annonce mûre n’expose aucun lien interne", () => {
  const { game } = fixture();
  const raw = game.explorationState.announcements[0];
  const before = createExplorationProjection(game.toJSON(), "a", {
    now: 300999,
  });
  assert.equal(before.sanitize(raw), undefined);
  assert.equal(before.sanitize(raw.message), undefined);
  assert.equal(
    before.sanitize({ message: raw.message, dueAt: raw.dueAt }),
    undefined,
  );
  const after = createExplorationProjection(game.toJSON(), "a", {
    now: 301000,
  });
  assert.ok(!JSON.stringify(after.sanitize(raw)).includes("hidden-treasure"));
});

test("anciens parchemins conservés comme indices normaux, sans authenticité", () => {
  const { game } = explorationProjectionFixture();
  const raw = game.toJSON();
  raw.explorationState.clues[2].authentic = false;
  const restored = Game.fromJSON(raw);
  assert.equal(
    Object.hasOwn(restored.explorationState.clues[2], "authentic"),
    false,
  );
  assert.equal(
    restored.explorationState.clues.length,
    raw.explorationState.clues.length,
  );
});

test("le navigateur affiche chaque annonce officielle une fois, sans horloge locale", () => {
  const logged = [],
    presenter = createExplorationAnnouncementPresenter({
      log: (message) => logged.push(message),
    });
  presenter.show({ announcements: [] });
  assert.deepEqual(logged, []);
  const view = {
    announcements: [{ id: "official", message: "Trésor découvert." }],
  };
  presenter.show(view);
  presenter.show(structuredClone(view));
  assert.deepEqual(logged, ["Trésor découvert."]);
  presenter.reset();
  presenter.show(view);
  assert.equal(logged.length, 2);
});

for (const type of ["treasure", "artifact", "dungeon"])
  test(`victoire ${type} : annonce immédiate pour tous, sauvegardée et unique`, () => {
    const { game } = explorationProjectionFixture();
    const site = game.explorationState.sites[0];
    site.type = type;
    for (const mission of game.explorationState.expeditions)
      if (mission.siteId === site.id) mission.kind = type;
    site.name = "Le site des Brumes";
    assert.equal(
      game.explorationClueService.close(
        site.id,
        { eventId: "victory", at: 1000, playerId: "a" },
        "won",
      ),
      true,
    );
    for (const playerId of ["a", "b"]) {
      assert.equal(project(game, playerId, 999).announcements.length, 0);
      const announcements = project(game, playerId, 1000).announcements;
      assert.equal(announcements.length, 1);
      assert.match(announcements[0].message, /a été remporté/);
      assert.equal(announcements[0].at, 1000);
      assert.deepEqual(Object.keys(announcements[0]).sort(), [
        "at",
        "id",
        "message",
        "name",
      ]);
    }
    assert.equal(project(game, "unknown", 1000).announcements.length, 0);
    assert.equal(
      game.explorationClueService.close(
        site.id,
        { eventId: "again", at: 2000, playerId: "b" },
        "won",
      ),
      false,
    );
    const restored = Game.fromJSON(game.toJSON(), { now: () => 5000 });
    restored.update();
    restored.update();
    assert.equal(restored.explorationState.announcements.length, 1);
    assert.equal(project(restored, "b", 5000).announcements.length, 1);
  });
