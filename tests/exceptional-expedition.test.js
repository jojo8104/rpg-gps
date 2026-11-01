import { LobbyService } from "../server/lobby/lobby-service.js";
import test from "node:test";
import assert from "node:assert/strict";
import {
  expeditionScore,
  expeditionSuccessChance,
} from "../app/js/core/exceptional-expedition-service.js";
import { explorationWorld } from "./fixtures/exploration-world.js";
import { Unit } from "../app/js/core/unit.js";
import { Game } from "../app/js/core/game.js";
import { createExplorationProjection } from "../server/realtime/exploration-projection.js";
import { exceptionalExpeditionDialog } from "../app/js/ui/exceptional-expedition-view.js";

const preparation = () => ({
  npcIds: ["specialist_cartographer", "specialist_adventurer"],
  volunteers: [{ unitId: "volunteers", quantity: 8 }],
  mounts: { horse: 3 },
  equipment: { exploration_tools: 2 },
  resources: { food: 8, wood: 4, beer: 2 },
});
function fixture(mode = "gps") {
  const f = explorationWorld({ mode });
  const site = f.game.explorationState.sites.find((s) => s.id === "outside");
  site.type = "treasure";
  site.requirements.expedition = 100;
  f.game.explorationState.discoveries.push({
    playerId: "a",
    targetKind: "site",
    targetId: site.id,
    source: "search",
    discoveredAt: 1000,
  });
  const resources = {
    specialist_cartographer: 2,
    specialist_adventurer: 1,
    horse: 5,
    exploration_tools: 6,
    food: 20,
    wood: 20,
    beer: 5,
  };
  f.hero.resources = { ...resources };
  f.location.resources.stock = { ...resources };
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
  return {
    ...f,
    site,
    service: f.game.exceptionalExpeditionService,
    request: {
      playerId: "a",
      heroId: f.hero.id,
      siteId: site.id,
      preparation: preparation(),
    },
  };
}
test("barème validé, exemple 68 + 12, plafonds et absence de double compte", () => {
  const p = preparation();
  assert.equal(expeditionScore(p).total, 68);
  assert.equal(expeditionScore(p, { narrative: 12 }).total, 80);
  p.npcIds = ["a", "b", "c", "c"];
  p.volunteers[0].quantity = 100;
  p.mounts.horse = 100;
  p.equipment.exploration_tools = 100;
  p.resources.food = 100;
  assert.equal(
    expeditionScore(p, { relevantNpcIds: ["a", "b", "c"] }).total,
    100,
  );
  assert.equal(expeditionSuccessChance(80, 100), 0.56);
  assert.equal(expeditionSuccessChance(1000, 100), 0.95);
  assert.equal(expeditionSuccessChance(0, 40), 0);
  assert.equal(expeditionSuccessChance(50, null), null);
});
for (const mode of ["gps", "simulation"])
  test(`préparation identique héros/poste en ${mode}, départ réel et unique`, () => {
    const f = fixture(mode);
    const direct = f.service.prepare(f.request);
    assert.equal(direct.success, true);
    const m = f.game.explorationState.expeditions[0];
    assert.equal(m.scores.expedition, 68);
    assert.equal(f.hero.resources.food, 20);
    assert.equal(
      f.service.cancel({ ...f.request, expeditionId: m.id }).success,
      true,
    );
    const sent = f.service.prepare({
      ...f.request,
      originLocationId: f.location.id,
    });
    assert.equal(sent.success, true);
    const mission = f.game.explorationState.expeditions[1];
    assert.equal(mission.scores.expedition, 68);
    assert.equal(f.game.autonomousGroups.length, 0);
    const command = { ...f.request, expeditionId: mission.id };
    assert.equal(f.service.depart(command).success, true);
    assert.equal(f.location.resources.stock.food, 12);
    assert.equal(f.location.resources.stock.specialist_cartographer, 1);
    assert.equal(f.location.garrison.units[0].quantity, 2);
    const group = f.game.autonomousGroups[0];
    assert.equal(group.army.units[0].quantity, 8);
    assert.equal(group.cargo.find((x) => x.itemId === "food").quantity, 8);
    assert.equal(f.service.depart(command).replayed, true);
    assert.equal(f.location.resources.stock.food, 12);
    assert.equal(f.game.autonomousGroups.length, 1);
    const restored = Game.fromJSON(f.game.toJSON(), { now: f.game.now });
    assert.equal(
      restored.explorationState.expeditions[1].scores.expedition,
      68,
    );
    assert.equal(restored.autonomousGroups[0].army.units[0].quantity, 8);
    const frozen = restored.explorationState.expeditions[1];
    assert.equal(
      restored.exceptionalExpeditionService.depart({ ...command }).replayed,
      true,
    );
    assert.equal(frozen.status, "travelling");
  });
test("refus : site inconnu, usurpation, moyens absents, doublons, quantités invalides, double préparation", () => {
  const f = fixture();
  const invalid = [
    { ...f.request, playerId: "b" },
    { ...f.request, siteId: "hosted" },
    ...[-1, 0.5, 100, NaN].map((food) => ({
      ...f.request,
      preparation: { ...preparation(), resources: { food } },
    })),
    {
      ...f.request,
      preparation: {
        ...preparation(),
        npcIds: ["specialist_cartographer", "specialist_cartographer"],
      },
    },
    { ...f.request, preparation: { ...preparation(), volunteers: [null] } },
    { ...f.request, preparation: { ...preparation(), mounts: { food: 1 } } },
    { ...f.request, preparation: { ...preparation(), narrative: 999 } },
  ];
  for (const request of invalid)
    assert.equal(f.service.prepare(request).success, false);
  assert.equal(f.game.explorationState.expeditions.length, 0);
  assert.equal(f.hero.resources.food, 20);
  assert.equal(f.service.prepare(f.request).success, true);
  assert.equal(
    f.service.prepare(f.request).reason,
    "expedition_already_active",
  );
  const m = f.game.explorationState.expeditions[0];
  f.hero.resources.food = 0;
  assert.equal(
    f.service.depart({ ...f.request, expeditionId: m.id }).success,
    false,
  );
  assert.equal(m.status, "preparing");
});
test("héros : seuls bagages et troupes réels comptent, perte répercutée, arrivée sans gain", () => {
  const f = fixture();
  f.game.locations = [];
  const result = f.service.prepare(f.request);
  assert.equal(result.success, true);
  assert.equal(
    f.service.depart({ ...f.request, expeditionId: result.expeditionId })
      .success,
    true,
  );
  f.hero.resources.food = 0;
  f.service.refresh();
  const m = f.game.explorationState.expeditions[0];
  assert.equal(m.scores.expedition, 60);
  f.hero.updatePosition(f.site.position);
  f.service.refresh();
  assert.equal(m.status, "resolving");
  assert.equal(f.site.status, "active");
  assert.equal(m.result, null);
});
test("poste : déplacement officiel vers le site, attente de résolution, pas de récompense", () => {
  const f = fixture();
  const result = f.service.prepare({
    ...f.request,
    originLocationId: f.location.id,
  });
  f.service.depart({ ...f.request, expeditionId: result.expeditionId });
  const group = f.game.autonomousGroups[0];
  const service = f.game.autonomousGroupService;
  assert.ok(service);
  service.advance({
    groups: [group],
    locations: f.game.locations,
    playArea: f.game.setup.playArea,
    now: 1000,
  });
  assert.equal(group.status, "traveling");
  const arrival = group.movement.arrivesAt;
  service.advance({
    groups: [group],
    locations: f.game.locations,
    playArea: f.game.setup.playArea,
    now: arrival,
  });
  f.service.refresh();
  assert.equal(group.status, "arrived");
  assert.equal(f.game.explorationState.expeditions[0].status, "resolving");
  assert.equal(f.site.status, "active");
});
test("projection privée et préparation envoyée visible avant création du groupe, HTML échappé", () => {
  const f = fixture();
  f.service.prepare({ ...f.request, originLocationId: f.location.id });
  const view = createExplorationProjection(f.game.toJSON(), "a", {
    now: 1000,
    visibleLocationIds: new Set([f.location.id]),
  }).view;
  assert.equal(view.expeditions.length, 1);
  assert.equal(view.expeditions[0].scores.expedition, 68);
  assert.match(view.expeditions[0].id, /^exploration-expedition-/);
  assert.equal(
    createExplorationProjection(f.game.toJSON(), "b", { now: 1000 }).view
      .expeditions.length,
    0,
  );
  assert.equal(view.expeditionControls[0].sites.length, 1);
  assert.match(view.expeditionControls[0].sites[0].id, /^exploration-site-/);
  view.expeditionControls[0].sites[0].name = "<script>alert(1)</script>";
  const html = exceptionalExpeditionDialog({
    controls: view.expeditionControls[0],
    mission: view.expeditions[0],
    originLocationId: f.location.id,
  });
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
});

test("commandes réseau opaques : préparation, départ unique et identité vérifiée", () => {
  const f = fixture();
  let index = 0;
  const service = new LobbyService({
    idFactory: () => ["a", "b"][index++] ?? `id-${index}`,
    now: () => 1000,
  });
  const host = service.createLobby({
    playerName: "Alice",
    positionMode: "gps",
    maxPlayers: 4,
  });
  service.joinLobby({ code: host.lobby.code, playerName: "Bob" });
  const saved = service.exportState();
  saved.lobbies[0].game = f.game.toJSON();
  saved.lobbies[0].status = "started";
  const official = new LobbyService({ initialState: saved, now: () => 1000 });
  const packet = official.projectForPlayer(host.session.token, {
    game: official.gameSnapshot(host.lobby.code),
  });
  const controls = packet.game.state.explorationView.expeditionControls[0];
  const request = { ...f.request, siteId: controls.sites[0].id };
  const reply = official.executeGameCommand({
    token: host.session.token,
    command: "prepareExceptionalExpedition",
    args: [request],
  });
  assert.equal(reply.result.success, true);
  const projected = official.projectForPlayer(host.session.token, reply);
  const mission = projected.game.state.explorationView.expeditions[0];
  assert.match(mission.id, /^exploration-expedition-/);
  const departure = {
    playerId: "a",
    heroId: f.hero.id,
    expeditionId: mission.id,
  };
  const first = official.executeGameCommand({
    token: host.session.token,
    command: "departExceptionalExpedition",
    args: [departure],
  });
  assert.equal(first.result.success, true);
  const second = official.executeGameCommand({
    token: host.session.token,
    command: "departExceptionalExpedition",
    args: [departure],
  });
  assert.equal(second.result.replayed, true);
  assert.throws(
    () =>
      official.executeGameCommand({
        token: host.session.token,
        command: "departExceptionalExpedition",
        args: [{ ...departure, playerId: "b" }],
      }),
    /Identité/,
  );
});

test("les blessés, pertes et équipements ne sont pas dupliqués dans le groupe envoyé", () => {
  const f = fixture();
  const unit = f.location.garrison.units[0];
  unit.soldierHealth[0] = 2;
  unit.equipmentIds = ["training-sword"];
  f.request.preparation.volunteers[0].quantity = 8;
  const prepared = f.service.prepare({
    ...f.request,
    originLocationId: f.location.id,
  });
  assert.equal(prepared.success, true);
  f.service.depart({ ...f.request, expeditionId: prepared.expeditionId });
  const group = f.game.autonomousGroups[0];
  assert.deepEqual(group.army.units[0].equipmentIds, []);
  assert.deepEqual(f.location.garrison.units[0].equipmentIds, [
    "training-sword",
  ]);
  assert.equal(f.location.garrison.units[0].soldierHealth.includes(2), true);
  group.army.units[0].soldierHealth = [];
  group.army.units[0].quantity = 0;
  group.cargo = group.cargo.filter((x) => x.itemId !== "food");
  f.service.refresh();
  assert.equal(f.game.explorationState.expeditions[0].scores.expedition, 44);
});
