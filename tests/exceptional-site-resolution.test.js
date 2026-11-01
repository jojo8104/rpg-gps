import { retireInteriorExceptionalSites } from "../app/js/core/exploration-exterior-migration.js";
import test from "node:test";
import assert from "node:assert/strict";
import { explorationWorld } from "./fixtures/exploration-world.js";
import { Unit } from "../app/js/core/unit.js";
import { Game } from "../app/js/core/game.js";
import {
  configureExceptionalSite,
  exceptionalSuccessChance,
} from "../app/js/core/exceptional-site-rules.js";
import {
  expeditionParticipants,
  expeditionPower,
} from "../app/js/core/exceptional-expedition-party.js";
import { unitExpeditionMorale } from "../app/js/core/expedition-morale.js";
import { HeroArmyModifier } from "../app/js/core/hero-army-modifier.js";
import { createExplorationProjection } from "../server/realtime/exploration-projection.js";
import { LobbyService } from "../server/lobby/lobby-service.js";

function fixture(type = "treasure", mode = "gps", sent = false) {
  const f = explorationWorld({ mode });
  retireInteriorExceptionalSites(f.game.explorationState);
  const site = f.game.explorationState.sites.find((s) => s.id === "outside");
  site.type = type;
  site.requirements.expedition = 40;
  site.requirements.power = 40;
  site.rewards = null;
  f.game.explorationState.discoveries.push({
    playerId: "a",
    targetKind: "site",
    targetId: site.id,
    source: "search",
    discoveredAt: 1000,
  });
  const stock = {
    specialist_cartographer: 1,
    specialist_adventurer: 1,
    horse: 5,
    exploration_tools: 4,
    food: 20,
    wood: 20,
    beer: 5,
  };
  f.hero.resources = { ...stock };
  f.location.resources.stock = { ...stock };
  const unit = () =>
    new Unit({
      id: "volunteers",
      ownerPlayerId: "a",
      typeId: "militia",
      quantity: 10,
      rank: "corporal",
    });
  f.hero.army.addUnit(unit());
  f.location.garrison.addUnit(unit());
  const prep = {
    npcIds: ["specialist_cartographer", "specialist_adventurer"],
    volunteers: [{ unitId: "volunteers", quantity: 8 }],
    mounts: { horse: 5 },
    equipment: { exploration_tools: 4 },
    resources: { food: 8, wood: 4, beer: 2 },
  };
  if (!sent) {
    f.game.locations = [];
    f.hero.updatePosition(site.position);
  }
  const request = {
    playerId: "a",
    heroId: f.hero.id,
    siteId: site.id,
    preparation: prep,
    ...(sent ? { originLocationId: f.location.id } : {}),
  };
  const prepared = f.game.prepareExceptionalExpedition(request);
  assert.equal(prepared.success, true);
  request.expeditionId = prepared.expeditionId;
  assert.equal(f.game.departExceptionalExpedition(request).success, true);
  const mission = f.game.explorationState.expeditions.find(
    (m) => m.id === request.expeditionId,
  );
  let rolls = 0;
  f.game.exceptionalSiteResolutionService.random = () => {
    rolls++;
    return 0;
  };
  return {
    ...f,
    site,
    mission,
    request,
    service: f.game.exceptionalSiteResolutionService,
    rolls: () => rolls,
  };
}
test("barèmes des trois difficultés et ratio limitant du donjon", () => {
  for (const [i, target] of [40, 70, 100].entries()) {
    for (const type of ["artifact", "treasure", "dungeon"]) {
      const site = configureExceptionalSite({
        id: "s",
        type,
        requirements: { expedition: target },
      });
      assert.equal(
        site.rewards.gold,
        type === "treasure"
          ? [200, 500, 1000][i]
          : type === "dungeon"
            ? [100, 250, 500][i]
            : 0,
      );
      assert.equal(site.rewards.itemCount, type === "treasure" ? 2 : 1);
      assert.equal(
        site.rewards.experience,
        type === "dungeon" ? [50, 100, 200][i] : 0,
      );
    }
  }
  const site = configureExceptionalSite({
    id: "d",
    type: "dungeon",
    requirements: { expedition: 100, power: 100 },
  });
  assert.equal(exceptionalSuccessChance(site, 100, 50), 0.35);
  assert.equal(exceptionalSuccessChance(site, 50, 100), 0.35);
  assert.equal(exceptionalSuccessChance(site, 1000, 1000), 0.95);
});
for (const type of ["artifact", "treasure", "dungeon"])
  test(`réussite ${type} : récompenses propres, provisions, clôture globale, reprise et rejeu`, () => {
    const f = fixture(type);
    const before = f.hero.health;
    const xp = f.hero.experience;
    const result = f.service.resolve(f.request);
    assert.equal(result.success, true);
    assert.equal(result.won, true);
    assert.equal(f.rolls(), 1);
    assert.equal(f.site.status, "won");
    assert.equal(f.mission.status, "completed");
    assert.equal(f.mission.result.items.length, type === "treasure" ? 2 : 1);
    assert.equal(
      f.hero.resources.gold ?? 0,
      type === "treasure" ? 200 : type === "dungeon" ? 100 : 0,
    );
    assert.equal(f.hero.resources.food, 12);
    assert.equal(f.hero.resources.exploration_tools, 4);
    assert.equal(f.hero.experience - xp, type === "dungeon" ? 50 : 0);
    assert.equal(
      f.hero.health,
      before - (type === "dungeon" ? Math.ceil(f.hero.maxHealth * 0.1) : 0),
    );
    assert.equal(
      f.game.explorationState.clues.filter(
        (c) => c.siteId === f.site.id && c.status === "active",
      ).length,
      0,
    );
    const snapshot = f.game.toJSON();
    assert.equal(f.service.resolve(f.request).replayed, true);
    assert.equal(f.rolls(), 1);
    assert.deepEqual(f.game.toJSON(), snapshot);
    const restored = Game.fromJSON(snapshot, { now: f.game.now });
    restored.exceptionalSiteResolutionService.random = () => {
      throw Error("aucun nouveau tirage");
    };
    assert.equal(
      restored.resolveExceptionalExpedition(f.request).replayed,
      true,
    );
    assert.deepEqual(restored.toJSON(), snapshot);
  });
test("donjon échoué : dégâts et moral uniquement aux engagés, expiration et nouvelle tentative possibles", () => {
  const f = fixture("dungeon");
  f.service.random = () => 0.999;
  const health = f.hero.health;
  const unit = f.hero.army.units[0];
  const morale = f.hero.finalStats.morale;
  assert.equal(f.service.resolve(f.request).won, false);
  assert.equal(f.site.status, "active");
  assert.equal(f.hero.health, health - Math.ceil(f.hero.maxHealth * 0.25));
  assert.equal(f.hero.finalStats.morale, morale - 10);
  assert.deepEqual(unit.soldierHealth, [7, 7, 7, 7, 7, 7, 7, 7, 10, 10]);
  assert.equal(unitExpeditionMorale(unit, 1000), -8);
  const modifiers = HeroArmyModifier.calculate({
    hero: f.hero,
    units: [unit],
    unitDefinitions: f.game.unitDefinitions,
  });
  assert.equal(modifiers.moraleBonus, morale);
  assert.equal(f.hero.resources.gold ?? 0, 0);
  assert.equal(f.mission.result.pendingItems.length, 0);
  f.advance(300000);
  f.service.update();
  assert.equal(f.hero.finalStats.morale, morale);
  assert.equal(unitExpeditionMorale(unit, f.game.now()), 0);
  assert.equal(
    f.game.prepareExceptionalExpedition({
      ...f.request,
      expeditionId: undefined,
    }).success,
    true,
  );
});
test("puissance : seuls les soldats engagés et le héros présent comptent", () => {
  const f = fixture("dungeon");
  const party = expeditionParticipants(f.game, f.mission);
  const power = expeditionPower(f.game, party);
  party.troops[0].indices = [];
  assert.ok(expeditionPower(f.game, party) < power);
  const remote = fixture("dungeon", "gps", true);
  const group = remote.game.getAutonomousGroup(remote.mission.groupId);
  assert.equal(expeditionParticipants(remote.game, remote.mission).hero, null);
  remote.hero.baseStats.attack = 999;
  assert.equal(
    expeditionPower(
      remote.game,
      expeditionParticipants(remote.game, remote.mission),
    ),
    8 * 12,
  );
});
for (const mode of ["gps", "simulation"])
  test(`groupe envoyé ${mode} : résolution automatique, héros distant indemne, retour conservé`, () => {
    const f = fixture("dungeon", mode, true);
    const group = f.game.getAutonomousGroup(f.mission.groupId);
    const heroHealth = f.hero.health;
    const move = (at) =>
      f.game.autonomousGroupService.advance({
        groups: [group],
        locations: f.game.locations,
        playArea: f.game.setup.playArea,
        now: at,
      });
    move(1000);
    move(group.movement.arrivesAt);
    f.service.update();
    assert.equal(f.mission.status, "returning");
    assert.equal(f.site.status, "won");
    assert.equal(f.hero.health, heroHealth);
    assert.equal(f.hero.experience, 0);
    assert.equal(f.mission.result.heroDamage, 0);
    assert.equal(group.army.units[0].experience, 50);
    assert.equal(group.army.units[0].soldierHealth[0], 9);
    move(200000);
    move(group.movement.arrivesAt);
    f.service.update();
    assert.equal(f.mission.status, "completed");
    assert.equal(group.status, "completed");
    assert.equal(group.army.units.length, 0);
    assert.equal(
      f.location.garrison.units.reduce((n, u) => n + u.quantity, 0),
      10,
    );
    assert.equal(
      (f.location.resources.stock.gold ?? 0) +
        group.cargo
          .filter((i) => i.itemId === "gold")
          .reduce((n, i) => n + i.quantity, 0),
      100,
    );
    const saved = f.game.toJSON();
    f.service.update();
    assert.deepEqual(f.game.toJSON(), saved);
  });
test("bagages pleins : items conservés, retrait partiel, pas de duplication", () => {
  const f = fixture("treasure");
  f.service.resolve(f.request);
  f.hero.carriedLoot = [];
  f.hero.resources = { gold: 200, food: 10000 };
  assert.equal(f.service.claim(f.request).reason, "hero_bag_full");
  assert.equal(
    f.mission.result.pendingItems.reduce((n, i) => n + i.quantity, 0),
    2,
  );
  f.hero.resources = {};
  const first = f.service.claim(f.request);
  assert.equal(first.success, true);
  assert.equal(first.taken, 2);
  assert.equal(f.hero.carriedLoot.length, 2);
  assert.equal(f.service.claim(f.request).taken, 0);
  assert.equal(f.hero.carriedLoot.length, 2);
});
test("site remporté ou disparu avant tentative : aucun nouveau tirage, coût, dégât ou récompense", () => {
  for (const status of ["won", "disappeared"]) {
    const f = fixture("dungeon");
    f.site.status = status;
    f.site.resolution = { eventId: "other", at: 999, playerId: "b" };
    const health = f.hero.health;
    f.service.update();
    assert.equal(f.rolls(), 0);
    assert.equal(f.mission.status, "completed");
    assert.equal(f.hero.resources.food, 20);
    assert.equal(f.hero.health, health);
    assert.equal(f.mission.result.reason, "site_unavailable");
  }
});
test("configuration invalide, mauvaise case et tirage invalide : aucune dépense", () => {
  const f = fixture();
  f.hero.updatePosition(f.at(0, 0).center);
  assert.equal(f.service.resolve(f.request).success, false);
  assert.equal(f.rolls(), 0);
  f.hero.updatePosition(f.site.position);
  f.site.rewards.gold = -1;
  assert.equal(f.service.resolve(f.request).reason, "site_rewards_unavailable");
  assert.equal(f.hero.resources.food, 20);
  f.site.rewards.gold = 200;
  f.service.random = () => NaN;
  assert.throws(() => f.service.resolve(f.request), /Tirage/);
  assert.equal(f.hero.resources.food, 20);
  assert.equal(f.site.status, "active");
});
test("résultat privé sans RNG, gagnant adverse refusé et clôture pour tous", () => {
  const f = fixture("dungeon");
  f.service.resolve(f.request);
  const own = createExplorationProjection(f.game.toJSON(), "a", {
    now: 1000,
  }).view;
  const other = createExplorationProjection(f.game.toJSON(), "b", {
    now: 1000,
  }).view;
  assert.equal(own.expeditions[0].result.success, true);
  assert.equal(own.expeditions[0].result.heroDamage, 3);
  assert.ok(!JSON.stringify(own.expeditions[0].result).includes('"roll"'));
  assert.ok(!JSON.stringify(own.expeditions[0].result).includes('"chance"'));
  assert.equal(other.expeditions.length, 0);
  assert.equal(
    f.service.resolve({ ...f.request, playerId: "b" }).success,
    false,
  );
});

test("deux expéditions concurrentes : un seul vainqueur, aucun effet sur la seconde", () => {
  const f = fixture("dungeon");
  f.other.updatePosition(f.site.position);
  f.other.resources = { ...f.hero.resources };
  f.game.explorationState.discoveries.push({
    playerId: "b",
    targetKind: "site",
    targetId: f.site.id,
    source: "search",
    discoveredAt: 1000,
  });
  const other = {
    ...f.request,
    playerId: "b",
    heroId: f.other.id,
    expeditionId: undefined,
    preparation: { ...f.request.preparation, volunteers: [] },
  };
  const prepared = f.game.prepareExceptionalExpedition(other);
  assert.equal(prepared.success, true);
  other.expeditionId = prepared.expeditionId;
  assert.equal(f.game.departExceptionalExpedition(other).success, true);
  assert.equal(f.service.resolve(f.request).won, true);
  const hp = f.other.health;
  const second = f.service.resolve(other);
  assert.equal(second.success, true);
  assert.equal(f.rolls(), 1);
  assert.equal(f.other.health, hp);
  assert.equal(f.other.resources.food, 20);
  assert.equal(f.other.resources.gold ?? 0, 0);
  assert.equal(
    f.game.explorationState.expeditions[1].result.reason,
    "site_unavailable",
  );
});
test("réseau : résolution et retrait opaques, reprise idempotente et contrôle d’identité", () => {
  const f = fixture("artifact");
  let id = 0;
  const service = new LobbyService({
    idFactory: () => ["a", "b"][id++] ?? `id-${id}`,
    now: () => 1000,
  });
  const host = service.createLobby({
    playerName: "Alice",
    positionMode: "gps",
    maxPlayers: 4,
  });
  service.joinLobby({ code: host.lobby.code, playerName: "Bob" });
  const state = service.exportState();
  state.lobbies[0].game = f.game.toJSON();
  state.lobbies[0].status = "started";
  const official = new LobbyService({ initialState: state, now: () => 1000 });
  const initial = official.projectForPlayer(host.session.token, {
    game: official.gameSnapshot(host.lobby.code),
  });
  const mission = initial.game.state.explorationView.expeditions[0];
  const request = {
    playerId: "a",
    heroId: f.hero.id,
    expeditionId: mission.id,
  };
  // Un score élevé assure le plafond, sans dépendre d’une victoire pour tester le rejeu réseau.
  const first = official.executeGameCommand({
    token: host.session.token,
    command: "resolveExceptionalExpedition",
    args: [request],
  });
  assert.equal(first.result.success, true);
  const second = official.executeGameCommand({
    token: host.session.token,
    command: "resolveExceptionalExpedition",
    args: [request],
  });
  assert.equal(second.result.replayed, true);
  const view = official.projectForPlayer(host.session.token, first).game.state
    .explorationView;
  assert.equal(typeof view.expeditions[0].result.success, "boolean");
  assert.ok(!JSON.stringify(view.expeditions[0].result).includes('"roll"'));
  const claim = official.executeGameCommand({
    token: host.session.token,
    command: "claimExceptionalExpedition",
    args: [request],
  });
  assert.ok(claim.result.success || claim.result.reason === "hero_bag_full");
  assert.throws(
    () =>
      official.executeGameCommand({
        token: host.session.token,
        command: "resolveExceptionalExpedition",
        args: [{ ...request, playerId: "b" }],
      }),
    /Identité/,
  );
});
test("donjon : décès possible, données de moral persistantes et pas de dégâts après disparition", () => {
  const f = fixture("dungeon");
  f.hero.health = 1;
  f.service.random = () => 0.999;
  assert.equal(f.service.resolve(f.request).won, false);
  assert.equal(f.hero.health, 0);
  assert.equal(f.hero.state, "ghost");
  const saved = f.game.toJSON();
  const restored = Game.fromJSON(saved, { now: f.game.now });
  assert.equal(restored.getHero(f.hero.id).state, "ghost");
  assert.equal(
    restored.getHero(f.hero.id).army.units[0].expeditionMorale[0].delta,
    -10,
  );
  assert.equal(restored.resolveExceptionalExpedition(f.request).replayed, true);
});

test("XP d’un héros ancien sans plan de progression et résultat visible en fantôme", () => {
  const f = fixture("dungeon");
  f.hero.growthPlan = [];
  assert.equal(f.service.resolve(f.request).won, true);
  assert.ok(f.hero.growthPlan.length > 0);
  const dead = fixture("dungeon");
  dead.hero.health = 1;
  dead.service.random = () => 0.999;
  dead.service.resolve(dead.request);
  const view = createExplorationProjection(dead.game.toJSON(), "a", {
    now: 1000,
  }).view;
  assert.equal(view.expeditionControls[0].canPrepare, false);
  assert.equal(view.expeditions[0].result.success, false);
});
