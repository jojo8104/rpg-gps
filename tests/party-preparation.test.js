import test from "node:test";
import assert from "node:assert/strict";
import { updatePartyPreparation } from "../app/js/core/party-preparation.js";
import { preparationCatalog } from "../server/lobby/preparation-catalog.js";
import { LobbyService } from "../server/lobby/lobby-service.js";
import { qrSvg, qrPayload } from "../server/lobby/qr-print-document.js";
import { parsePartyQr } from "../app/js/ui/qr-scanner.js";
import QRCode from "qrcode";
import jsQR from "jsqr";

const area = {
  id: "test",
  name: "Terrain",
  polygon: [
    { latitude: 48.84, longitude: 2.32 },
    { latitude: 48.84, longitude: 2.4 },
    { latitude: 48.9, longitude: 2.4 },
    { latitude: 48.9, longitude: 2.32 },
  ],
};
function party() {
  const service = new LobbyService({
    questEngineEnabled: true,
    questSystemEnabled: false,
  });
  const host = service.createLobby({
    playerName: "Organisateur",
    maxPlayers: 2,
  });
  service.setPlayArea({ token: host.session.token, playArea: area });
  service.configurePreparation({
    token: host.session.token,
    change: { date: "2026-10-09" },
  });
  return { service, host, token: host.session.token };
}

test("les fiches imposent les quêtes linéaires et leurs dépendances", () => {
  const catalog = {
    ...preparationCatalog,
    quests: [
      { id: "main", linear: true, requires: [] },
      { id: "optional", linear: false, requires: ["main"] },
    ],
  };
  assert.throws(
    () =>
      updatePartyPreparation(
        null,
        { excludedQuestIds: ["main"] },
        catalog,
        area,
      ),
    /linéaire/,
  );
  assert.deepEqual(
    updatePartyPreparation(
      null,
      { excludedQuestIds: ["optional"] },
      catalog,
      area,
    ).excludedQuestIds,
    ["optional"],
  );
  catalog.quests[0].linear = false;
  assert.throws(
    () =>
      updatePartyPreparation(
        null,
        { excludedQuestIds: ["main"] },
        catalog,
        area,
      ),
    /dépend/,
  );
});
test("le serveur contrôle les options, les exclusions et l’identité du QR", () => {
  const { service, token, host } = party();
  const guest = service.joinLobby({
    code: host.lobby.code,
    playerName: "Joueur",
  });
  assert.throws(
    () =>
      service.configurePreparation({ token: guest.session.token, change: {} }),
    { code: "host_only" },
  );
  assert.throws(
    () =>
      service.configurePreparation({
        token,
        change: { location: { id: "capital", visibility: "discoverable" } },
      }),
    /Visibilité/,
  );
  let lobby = service.configurePreparation({
    token,
    change: { location: { id: "supply-fort", placement: "qr" } },
  });
  const qrId = lobby.configuration.preparation.locations["supply-fort"].qrId;
  assert.ok(qrId);
  assert.throws(
    () =>
      service.installQrLocation({
        token,
        qrId,
        position: { latitude: 1, longitude: 1, accuracy: 5 },
      }),
    /playarea/,
  );
  assert.throws(
    () =>
      service.installQrLocation({
        token,
        qrId,
        position: { latitude: 48.87, longitude: 2.36, accuracy: 100 },
      }),
    { code: "gps_accuracy" },
  );
  lobby = service.installQrLocation({
    token,
    qrId,
    position: { latitude: 48.87, longitude: 2.36, accuracy: 5 },
  });
  assert.equal(
    lobby.configuration.preparation.locations["supply-fort"].qrId,
    qrId,
  );
  assert.equal(
    lobby.configuration.preparation.locations["supply-fort"].position.latitude,
    48.87,
  );
  const restored = new LobbyService({ initialState: service.exportState() });
  assert.equal(
    restored.snapshot(host.lobby.code).configuration.preparation.locations[
      "supply-fort"
    ].qrId,
    qrId,
  );
});
test("le document est autonome et échappe le contenu des fiches", () => {
  const { service, token } = party();
  service.configurePreparation({
    token,
    change: { location: { id: "supply-fort", placement: "qr" } },
  });
  const { html } = service.printPreparation({ token });
  assert.match(html, /<svg/);
  assert.match(html, /RPGGPS\|/);
  assert.match(html, /intempéries/);
  assert.match(html, /2026/);
  assert.doesNotMatch(html, /<script src/);
  assert.match(qrSvg(qrPayload("ABCDEF", "test")), /viewBox/);
  assert.equal(parsePartyQr("RPGGPS|ABCDEF|test", "ABCDEF"), "test");
  assert.throws(() => parsePartyQr("RPGGPS|OTHER|test", "ABCDEF"), /partie/);
  const payload = qrPayload("ABCDEF", "0550c242-7432-4898-b9e3-b8a4b3787ce8");
  const matrix = QRCode.create(payload, { errorCorrectionLevel: "M" }).modules;
  const scale = 5,
    size = (matrix.size + 8) * scale;
  const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let y = 0; y < matrix.size; y++)
    for (let x = 0; x < matrix.size; x++)
      if (matrix.get(y, x)) {
        for (let dy = 0; dy < scale; dy++)
          for (let dx = 0; dx < scale; dx++) {
            const index =
              (((y + 4) * scale + dy) * size + (x + 4) * scale + dx) * 4;
            pixels[index] = pixels[index + 1] = pixels[index + 2] = 0;
          }
      }
  assert.equal(jsQR(pixels, size, size).data, payload);
});
test("une partie détaillée démarre avec son moteur officiel et ses quêtes sélectionnées", () => {
  const { service, token, host } = party();
  service.configurePreparation({
    token,
    change: { excludedQuestIds: ["missing-prospectors"] },
  });
  service.selectHeroClass({ token, heroClassId: "warrior" });
  service.setReady({ token, ready: true });
  const lobby = service.startLobby({ token });
  assert.equal(lobby.status, "started");
  const game = service.gameSnapshot(host.lobby.code).state;
  assert.equal(game.status, "started");
  assert.ok(game.explorationState.generation);
  assert.ok(game.explorationState.cells.length > 0);
  assert.ok(game.explorationState.cells.some((cell) => cell.suppressedByLocationIds.length > 0));
  assert.ok(game.explorationState.sites.every((site) => !site.hostLocationId || game.locations.some((location) => location.id === site.hostLocationId)));
  assert.ok(
    game.questEngineState.engine.published.includes("royal-fort-supply"),
  );
  assert.ok(
    !game.questEngineState.engine.published.includes("missing-prospectors"),
  );
  for (const id of [
    "village-vert",
    "prospectors-trace-1",
    "prospectors-trace-2",
    "prospector-battlefield",
    "gold-mine",
  ])
    assert.ok(
      !game.locations.some((l) => l.id === id),
      `${id} ne doit pas être généré`,
    );
  assert.ok(game.locations.some((l) => l.id === "royal-capital"));
  assert.ok(game.locations.some((l) => l.id === "supply-fort"));
});

test("retirer le ravitaillement conserve Rochegarde et son QR dans le monde initial", () => {
  const { service, token, host } = party();
  service.configurePreparation({
    token,
    change: { location: { id: "supply-fort", placement: "qr", position: { latitude: 48.87, longitude: 2.37 } } },
  });
  const lobby = service.configurePreparation({
    token,
    change: { excludedQuestIds: ["royal-fort-supply"] },
  });
  assert.ok(lobby.configuration.preparation.locations["supply-fort"]);
  assert.ok(
    lobby.preparationCatalog.locations.some((l) => l.id === "supply-fort"),
  );
  assert.equal(lobby.preparationProblems.length, 0);
  assert.doesNotThrow(() => service.printPreparation({ token }));
  assert.doesNotThrow(
    () =>
      service.configurePreparation({
        token,
        change: { location: { id: "supply-fort", placement: "qr" } },
      }),
  );
  service.selectHeroClass({ token, heroClassId: "warrior" });
  service.setReady({ token, ready: true });
  service.startLobby({ token });
  const game = service.gameSnapshot(host.lobby.code).state;
  for (const id of preparationCatalog.quests
    .find((q) => q.id === "royal-fort-supply")
    .locationIds.filter((id) => !preparationCatalog.locations.find((l) => l.id === id)?.permanent))
    assert.ok(!game.locations.some((l) => l.id === id), id);
  assert.ok(game.locations.some((l) => l.id === "royal-capital"));
  for (const resource of ["gold", "iron", "wood", "stone"]) {
    const id = `capital-resource-${resource}-village`;
    assert.ok(lobby.preparationCatalog.locations.some((l) => l.id === id), id);
    assert.ok(game.locations.some((l) => l.id === id), id);
  }
});
test("les rôles sans héros ouvrent la partie pour les autres joueurs", () => {
  for (const organizerRole of ["absent", "game-master", "supreme-npc"]) {
    const { service, token, host } = party();
    service.configurePreparation({
      token,
      change: { organizerRole, character: "Le Gardien" },
    });
    const guest = service.joinLobby({
      code: host.lobby.code,
      playerName: "Aventurier",
    });
    service.selectHeroClass({
      token: guest.session.token,
      heroClassId: "warrior",
    });
    service.setReady({ token: guest.session.token, ready: true });
    service.setReady({ token, ready: true });
    service.startLobby({ token });
    const state = service.gameSnapshot(host.lobby.code).state;
    assert.ok(!state.heroes.some((h) => h.playerId === host.session.playerId));
    assert.ok(state.heroes.some((h) => h.playerId === guest.session.playerId));
  }
});

test("un scan utilise la portée officielle et refuse les QR étrangers", () => {
  const baseline = party();
  baseline.service.selectHeroClass({
    token: baseline.token,
    heroClassId: "warrior",
  });
  baseline.service.setReady({ token: baseline.token, ready: true });
  baseline.service.startLobby({ token: baseline.token });
  const capital = baseline.service
    .gameSnapshot(baseline.host.lobby.code)
    .state.locations.find((l) => l.id === "royal-capital");
  const { service, host, token } = party();
  const configured = service.configurePreparation({
    token,
    change: { location: { id: "capital", placement: "qr" } },
  });
  const qrId = configured.configuration.preparation.locations.capital.qrId;
  assert.throws(() => service.startLobby({ token }), {
    code: "players_not_ready",
  });
  service.installQrLocation({
    token,
    qrId,
    position: { ...capital.position, accuracy: 5 },
  });
  service.selectHeroClass({ token, heroClassId: "warrior" });
  service.setReady({ token, ready: true });
  service.startLobby({ token });
  assert.throws(() => service.scanQrLocation({ token, qrId: "unknown" }), {
    code: "qr_unavailable",
  });
  assert.throws(() => service.scanQrLocation({ token, qrId }), {
    code: "gps_required",
  });
  service.updatePlayerPosition({
    token,
    position: { ...capital.position, accuracy: 5 },
  });
  assert.equal(
    service.scanQrLocation({ token, qrId }).locationId,
    "royal-capital",
  );
  const result = service.gameSnapshot(host.lobby.code).state;
  assert.equal(
    result.locations.find((l) => l.id === "royal-capital").qr.id,
    qrId,
  );
  assert.equal(
    result.players.find((p) => p.id === host.session.playerId)
      .locationKnowledge["royal-capital"],
    3,
  );
});

test("les positions de préparation restent privées pour les joueurs", () => {
  const { service, token, host } = party();
  const guest = service.joinLobby({
    code: host.lobby.code,
    playerName: "Joueur",
  });
  service.configurePreparation({
    token,
    change: { location: { id: "supply-fort", placement: "qr" } },
  });
  const projected = service.projectForPlayer(guest.session.token, {
    lobby: service.snapshot(host.lobby.code),
  });
  assert.deepEqual(projected.lobby.configuration.preparation.locations, {});
  assert.equal(projected.lobby.preparationCatalog, undefined);
});
