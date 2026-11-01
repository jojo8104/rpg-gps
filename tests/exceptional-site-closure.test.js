import test from "node:test";
import assert from "node:assert/strict";
import { explorationWorld } from "./fixtures/exploration-world.js";
import { retireInteriorExceptionalSites } from "../app/js/core/exploration-exterior-migration.js";
import {
  closeExceptionalSite,
  reconcileClosedExceptionalSites,
} from "../app/js/core/exceptional-site-closure.js";
import { Game } from "../app/js/core/game.js";
import { createExplorationProjection } from "../server/realtime/exploration-projection.js";
import {
  clueItem,
  localizationSeries,
} from "../app/js/core/exploration-records.js";

function fixture(mode = "gps") {
  const f = explorationWorld({ mode });
  retireInteriorExceptionalSites(f.game.explorationState);
  const site = f.game.explorationState.sites.find((s) => s.id === "outside");
  site.type = "treasure";
  site.name = "Le coffre des Brumes";
  site.requirements.expedition = 40;
  site.rewards = null;
  const stock = { specialist_cartographer: 1, food: 20 };
  f.hero.resources = { ...stock };
  f.other.resources = { ...stock };
  f.location.resources.stock = { ...stock };
  f.game.explorationState.discoveries.push({
    playerId: "a",
    targetKind: "site",
    targetId: site.id,
    source: "prospecting",
    discoveredAt: 1000,
  });
  f.game.explorationState.discoveries.push({
    playerId: "b",
    targetKind: "site",
    targetId: site.id,
    source: "prospecting",
    discoveredAt: 1000,
  });
  const prep = {
    npcIds: ["specialist_cartographer"],
    volunteers: [],
    resources: { food: 5 },
  };
  function prepare(hero = f.hero, sent = false) {
    const r = {
      playerId: hero.playerId,
      heroId: hero.id,
      siteId: site.id,
      preparation: prep,
      ...(sent ? { originLocationId: f.location.id } : {}),
    };
    const made = f.game.prepareExceptionalExpedition(r);
    assert.equal(made.success, true);
    return { ...r, expeditionId: made.expeditionId };
  }
  return { ...f, site, prepare };
}
function mission(f, request) {
  return f.game.explorationState.expeditions.find(
    (m) => m.id === request.expeditionId,
  );
}
for (const status of ["won", "disappeared"])
  test(`clôture ${status} : préparations et trajets immédiatement terminés, issue immuable`, () => {
    const f = fixture();
    const prepared = f.prepare();
    const travelling = f.prepare(f.other);
    f.game.departExceptionalExpedition(travelling);
    const before = f.other.resources.food;
    const closed = closeExceptionalSite(
      f.game,
      f.site.id,
      {
        eventId: "close",
        at: 1000,
        ...(status === "won" ? { playerId: "a" } : {}),
      },
      status,
    );
    assert.equal(closed, true);
    for (const request of [prepared, travelling]) {
      assert.equal(mission(f, request).status, "completed");
      assert.equal(mission(f, request).result.reason, "site_unavailable");
    }
    assert.equal(f.other.resources.food, before);
    assert.equal(f.hero.resources.food, 20);
    const snapshot = f.game.toJSON();
    assert.equal(
      closeExceptionalSite(
        f.game,
        f.site.id,
        { eventId: "other", at: 9000, playerId: "b" },
        "won",
      ),
      false,
    );
    assert.deepEqual(f.game.toJSON(), snapshot);
    assert.equal(reconcileClosedExceptionalSites(f.game), 0);
    assert.equal(f.game.explorationState.announcements.length, 1);
  });
for (const mode of ["gps", "simulation"])
  test(`rappel ${mode} sans dépense et retour des moyens réels`, () => {
    const f = fixture(mode);
    const r = f.prepare(f.hero, true);
    f.game.departExceptionalExpedition(r);
    const m = mission(f, r),
      group = f.game.getAutonomousGroup(m.groupId);
    const cargo = structuredClone(group.cargo);
    f.game.autonomousGroupService.advance({
      groups: [group],
      locations: f.game.locations,
      playArea: f.game.setup.playArea,
      now: 1000,
    });
    assert.equal(group.status, "traveling");
    closeExceptionalSite(f.game, f.site.id, { eventId: "gone", at: 1000 });
    assert.equal(m.status, "returning");
    assert.deepEqual(group.cargo, cargo);
    assert.equal(group.mission.phase, "returning");
    assert.deepEqual(group.mission.destination, f.location.position);
    assert.equal(m.result.heroDamage, undefined);
    const saved = f.game.toJSON();
    const restored = Game.fromJSON(saved, { now: f.game.now });
    assert.deepEqual(restored.toJSON(), saved);
    restored.exceptionalSiteResolutionService.random = () => {
      throw Error("pas de tirage");
    };
    restored.exceptionalSiteResolutionService.update();
    assert.deepEqual(restored.toJSON(), saved);
  });
test("combat en cours : interruption conservée, rappel différé puis repris sans gain", () => {
  const f = fixture();
  const r = f.prepare(f.hero, true);
  f.game.departExceptionalExpedition(r);
  const group = f.game.getAutonomousGroup(mission(f, r).groupId);
  group.status = "interrupted";
  group.interruption = { reason: "battle", status: "attacking" };
  const before = structuredClone(group.interruption);
  closeExceptionalSite(f.game, f.site.id, { eventId: "gone", at: 1000 });
  assert.equal(group.status, "interrupted");
  assert.deepEqual(group.interruption, before);
  assert.equal(group.mission.returnPending, true);
  f.game.exceptionalSiteResolutionService.update();
  assert.equal(group.status, "interrupted");
  group.status = "idle";
  group.interruption = null;
  f.game.exceptionalSiteResolutionService.update();
  assert.equal(group.mission.returnPending, undefined);
  assert.equal(group.mission.phase, "returning");
  assert.equal(group.status, "idle");
});
test("victoire réelle : vainqueur exclu du rappel, concurrents sans gain, retrait unique conservé", () => {
  const f = fixture();
  f.game.locations = [];
  f.hero.updatePosition(f.site.position);
  f.other.updatePosition(f.site.position);
  const winner = f.prepare(),
    other = f.prepare(f.other);
  f.game.departExceptionalExpedition(winner);
  f.game.departExceptionalExpedition(other);
  let rolls = 0;
  f.game.exceptionalSiteResolutionService.random = () => {
    rolls++;
    return 0;
  };
  assert.equal(f.game.resolveExceptionalExpedition(winner).won, true);
  assert.equal(mission(f, winner).result.success, true);
  assert.equal(mission(f, other).result.reason, "site_unavailable");
  assert.equal(f.other.resources.food, 20);
  assert.equal(f.other.resources.gold ?? 0, 0);
  assert.equal(f.site.resolution.expeditionId, winner.expeditionId);
  assert.equal(f.game.resolveExceptionalExpedition(other).replayed, true);
  assert.equal(f.game.resolveExceptionalExpedition(winner).replayed, true);
  assert.equal(rolls, 1);
  assert.equal(f.hero.resources.gold, 200);
  f.hero.resources = {};
  assert.equal(f.game.claimExceptionalExpedition(winner).taken, 2);
  assert.equal(f.game.claimExceptionalExpedition(winner).taken, 0);
  assert.equal(f.hero.carriedLoot.length, 2);
});
test("indices chez tous les détenteurs : objets conservés, archives 5/7/10, aucun nouveau risque ni double paiement", () => {
  const f = fixture();
  const service = f.game.explorationClueService;
  const clues = [];
  for (let count = 1; count <= 3; count++) {
    const series = localizationSeries({
      id: `series-${count}`,
      siteId: f.site.id,
      style: "directions",
      fragments: Array.from({ length: count }, (_, i) => ({
        id: `fragment-${i}`,
        text: `Indication ${i}`,
      })),
    });
    f.game.explorationState.clueSeries.push(series);
    const clue = clueItem({
      id: `map-${count}`,
      siteId: f.site.id,
      kind: "localization",
      seriesId: series.id,
      fragmentId: "fragment-0",
    });
    f.game.explorationState.clues.push(clue);
    service.receive(f.hero, clue);
    clues.push(clue);
  }
  const heldElsewhere = clueItem({
    id: "in-stock",
    siteId: f.site.id,
    kind: "search",
    text: "Une étoile",
    holder: { kind: "location", id: f.location.id },
  });
  f.game.explorationState.clues.push(heldElsewhere);
  closeExceptionalSite(
    f.game,
    f.site.id,
    { eventId: "won", at: 1000, playerId: "b" },
    "won",
  );
  service.random = () => {
    throw Error("pas de risque pour les archives");
  };
  assert.equal(heldElsewhere.status, "obsolete");
  assert.deepEqual(heldElsewhere.holder, {
    kind: "location",
    id: f.location.id,
  });
  const gold = f.hero.resources.gold ?? 0;
  for (const [i, clue] of clues.entries()) {
    assert.ok(f.hero.carriedLoot.some((e) => e.itemId === clue.id));
    assert.equal(
      service.sell(f.hero, clue, "cartographer").gold,
      [5, 7, 10][i],
    );
    assert.equal(clue.status, "archived");
    assert.equal(service.sell(f.hero, clue, "cartographer").success, false);
    assert.equal(service.receive(f.other, clue), false);
  }
  assert.equal(f.hero.resources.gold, gold + 22);
  assert.equal(f.game.explorationState.clueEvents.length, 0);
  assert.equal(f.game.explorationState.announcements.length, 1);
});
test("indice périmé ancien : tarif d’archive immédiat, récupération perdue obsolète et pas de résurrection", () => {
  const f = fixture();
  const s = f.game.explorationClueService;
  const clue = f.game.explorationState.clues.find(
    (c) => c.siteId === f.site.id,
  );
  s.receive(f.hero, clue);
  f.site.status = "disappeared";
  f.site.resolution = { eventId: "old", at: 1000 };
  clue.status = "active";
  s.random = () => {
    throw Error("archive sans tirage");
  };
  const price = s.archivePrice(clue);
  assert.equal(s.sell(f.hero, clue, "geographer").gold, price);
  assert.equal(clue.status, "archived");
  const lost = clueItem({
    id: "lost",
    siteId: f.site.id,
    kind: "search",
    text: "Ancien signe",
    status: "lost",
  });
  f.game.explorationState.clues.push(lost);
  assert.equal(s.receive(f.other, lost), true);
  assert.equal(lost.status, "obsolete");
  const sold = clueItem({
    id: "sold",
    siteId: f.site.id,
    kind: "search",
    text: "Vendu",
    status: "sold",
  });
  f.game.explorationState.clues.push(sold);
  assert.equal(s.receive(f.other, sold), false);
});
test("reprise d’une clôture ancienne : réparations idempotentes sans tirage, récompense ou annonce inventée", () => {
  const f = fixture();
  const r = f.prepare();
  const saved = f.game.toJSON();
  const site = saved.explorationState.sites.find((s) => s.id === f.site.id);
  site.status = "won";
  site.resolution = { eventId: "old", at: 1000, playerId: "b" };
  const restored = Game.fromJSON(saved, { now: () => 2000 });
  const m = restored.explorationState.expeditions.find(
    (m) => m.id === r.expeditionId,
  );
  assert.equal(m.status, "completed");
  assert.equal(m.result.reason, "site_unavailable");
  assert.ok(
    restored.explorationState.clues
      .filter((c) => c.siteId === site.id)
      .every((c) => c.status !== "active"),
  );
  assert.equal(restored.explorationState.announcements.length, 0);
  const normalized = restored.toJSON();
  assert.deepEqual(
    Game.fromJSON(normalized, { now: () => 99999 }).toJSON(),
    normalized,
  );
});
test("clôture invalide et tirages de perte invalides : aucune mutation partielle", () => {
  const f = fixture();
  const before = f.game.toJSON();
  for (const resolution of [
    { eventId: "bad", at: -1 },
    { eventId: "", at: 1000 },
  ])
    assert.throws(() => closeExceptionalSite(f.game, f.site.id, resolution));
  assert.throws(() =>
    closeExceptionalSite(
      f.game,
      f.site.id,
      { eventId: "bad", at: 1000 },
      "won",
    ),
  );
  assert.deepEqual(f.game.toJSON(), before);
  const s = f.game.explorationClueService;
  const first = f.game.explorationState.clues.find(
    (c) => c.siteId === f.site.id,
  );
  const secondSite = f.game.explorationState.sites[0];
  secondSite.status = "active";
  secondSite.resolution = null;
  const second = f.game.explorationState.clues.find(
    (c) => c.siteId === secondSite.id,
  );
  first.status = "active";
  second.status = "active";
  const state = f.game.explorationState.toJSON();
  let calls = 0;
  assert.throws(() =>
    s.lossRisk([first, second], "batch", () => (++calls === 1 ? 0 : NaN)),
  );
  assert.equal(calls, 2);
  assert.deepEqual(f.game.explorationState.toJSON(), state);
});
test("annonce unique après cinq minutes et refus des actions sur un site fermé", () => {
  const f = fixture();
  const r = f.prepare();
  closeExceptionalSite(f.game, f.site.id, { eventId: "gone", at: 1000 });
  const snapshot = f.game.toJSON();
  const view = (at, playerId) =>
    createExplorationProjection(snapshot, playerId, { now: at }).view;
  for (const id of ["a", "b"]) {
    assert.equal(view(300999, id).announcements.length, 0);
    assert.equal(view(301000, id).announcements.length, 1);
    assert.equal(
      view(301000, id).expeditionControls.find(
        (c) => c.heroId === (id === "a" ? f.hero.id : f.other.id),
      ).sites.length,
      0,
    );
  }
  assert.equal(
    f.game.prepareExceptionalExpedition({ ...r, expeditionId: undefined })
      .success,
    false,
  );
  assert.equal(f.game.departExceptionalExpedition(r).success, false);
  assert.equal(f.game.resolveExceptionalExpedition(r).replayed, true);
});

test("vente active : disparition à 25 %, rappel immédiat et annonces sans répétition", () => {
  const f = fixture();
  const direct = f.prepare();
  f.game.explorationState.discoveries =
    f.game.explorationState.discoveries.filter((d) => d.playerId !== "b");
  const service = f.game.explorationClueService;
  const clue = f.game.explorationState.clues.find(
    (c) => c.siteId === f.site.id,
  );
  assert.equal(service.receive(f.other, clue), true);
  assert.equal(clue.status, "active");
  let rolls = 0;
  service.random = () => {
    rolls++;
    return 0.24999;
  };
  const before = f.other.resources.gold ?? 0;
  assert.equal(service.sell(f.other, clue, "cartographer").gold, 5);
  assert.equal(rolls, 1);
  assert.equal(f.site.status, "disappeared");
  assert.equal(mission(f, direct).result.reason, "site_unavailable");
  assert.equal(clue.status, "sold");
  assert.equal(f.game.explorationState.announcements.length, 1);
  assert.equal(service.sell(f.other, clue, "cartographer").success, false);
  assert.equal(rolls, 1);
  assert.equal(f.other.resources.gold, before + 5);
});
test("référence de vainqueur invalide rejetée avant toute modification", () => {
  const f = fixture();
  const r = f.prepare();
  const before = f.game.toJSON();
  assert.throws(
    () =>
      closeExceptionalSite(
        f.game,
        f.site.id,
        {
          eventId: "invalid",
          at: 1000,
          playerId: "b",
          expeditionId: r.expeditionId,
        },
        "won",
      ),
    /incohérente/,
  );
  assert.deepEqual(f.game.toJSON(), before);
});
