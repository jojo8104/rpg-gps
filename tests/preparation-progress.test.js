import test from "node:test";
import assert from "node:assert/strict";
import {
  preparationStepProblems,
  preparationProblems,
  updatePartyPreparation,
} from "../app/js/core/party-preparation.js";
import {
  preparationSteps,
  preparationBlockedStep,
} from "../app/js/ui/preparation-progress.js";
import { selectedPreparationCatalog } from "../app/js/core/preparation-location-selection.js";
import { preparationCatalog } from "../server/lobby/preparation-catalog.js";
import { LobbyService } from "../server/lobby/lobby-service.js";
const area = {
  id: "test",
  name: "Test",
  polygon: [
    { latitude: 48.84, longitude: 2.32 },
    { latitude: 48.84, longitude: 2.4 },
    { latitude: 48.9, longitude: 2.4 },
    { latitude: 48.9, longitude: 2.32 },
  ],
};
test("sans QR : aucune date exigée, impression et installation absentes", () => {
  const preparation = updatePartyPreparation(
    null,
    {},
    preparationCatalog,
    area,
  );
  assert.deepEqual(
    preparationProblems(preparation, preparationCatalog, area),
    [],
  );
  assert.deepEqual(preparationSteps(preparation), [
    "scenario",
    "locations",
    "review",
  ]);
});
test("les étapes QR exigent la date puis les positions et disparaissent après retrait du dernier QR", () => {
  const location = selectedPreparationCatalog(
    null,
    preparationCatalog,
  ).locations.find((l) => l.placementOptions.includes("qr"));
  let preparation = updatePartyPreparation(
    null,
    { location: { id: location.id, placement: "qr" } },
    preparationCatalog,
    area,
    () => "qr-test",
  );
  let errors = preparationStepProblems(preparation, preparationCatalog, area);
  assert.equal(errors.print.length, 1);
  assert.equal(errors.install.length, 1);
  const lobby = {
    configuration: { preparation },
    preparationStepProblems: errors,
  };
  assert.equal(preparationBlockedStep(lobby, "install"), "print");
  preparation = updatePartyPreparation(
    preparation,
    { date: "2026-10-11" },
    preparationCatalog,
    area,
  );
  errors = preparationStepProblems(preparation, preparationCatalog, area);
  assert.equal(errors.print.length, 0);
  assert.equal(
    preparationBlockedStep(
      { configuration: { preparation }, preparationStepProblems: errors },
      "review",
    ),
    "install",
  );
  preparation = updatePartyPreparation(
    preparation,
    { location: { id: location.id, placement: "scenario" } },
    preparationCatalog,
    area,
  );
  assert.deepEqual(preparationSteps(preparation), [
    "scenario",
    "locations",
    "review",
  ]);
});
test("les erreurs de carte et de personnage bloquent leurs étapes respectives", () => {
  const location = selectedPreparationCatalog(
    null,
    preparationCatalog,
  ).locations.find((l) => l.placementOptions.includes("map"));
  const preparation = updatePartyPreparation(
    null,
    {
      organizerRole: "supreme-npc",
      location: { id: location.id, placement: "map" },
    },
    preparationCatalog,
    area,
  );
  const errors = preparationStepProblems(preparation, preparationCatalog, area);
  assert.equal(errors.scenario.length, 1);
  assert.equal(errors.locations.length, 1);
  assert.equal(
    preparationBlockedStep(
      { configuration: { preparation }, preparationStepProblems: errors },
      "review",
    ),
    "scenario",
  );
});
test("le serveur publie les erreurs par étape et lance sans date une préparation sans QR", () => {
  const service = new LobbyService({
    questEngineEnabled: true,
    questSystemEnabled: false,
  });
  const host = service.createLobby({ playerName: "Test", maxPlayers: 1 });
  const token = host.session.token;
  service.setPlayArea({ token, playArea: area });
  const result = service.configurePreparation({ token, change: {} });
  assert.deepEqual(result.preparationProblems, []);
  assert.deepEqual(result.preparationStepProblems.print, []);
  service.selectHeroClass({ token, heroClassId: "warrior" });
  service.setReady({ token, ready: true });
  assert.equal(service.startLobby({ token }).status, "started");
});

test("les repères gardent le rayon officiel et leur nom disparaît après 2 s ou une action", async (t) => {
  const { showPreparationLocations } = await import(
    "../app/js/ui/preparation-map-locations.js"
  );
  const savedDocument = globalThis.document;
  globalThis.document = { createElement: () => ({ textContent: "" }) };
  t.after(() => {
    globalThis.document = savedDocument;
  });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const layers = [];
  const events = {};
  let popup = null;
  const map = {
    closePopup: () => {
      popup = null;
    },
    on: (names, fn) => {
      for (const name of names.split(" ")) events[name] = fn;
    },
    off: () => {},
  };
  const layer = (kind, point, options) => {
    const value = {
      kind,
      point,
      options,
      addTo() {
        layers.push(this);
        return this;
      },
      on(name, fn) {
        this.click = fn;
        return this;
      },
    };
    return value;
  };
  const leaflet = {
    circle: (p, o) => layer("circle", p, o),
    marker: (p, o) => layer("marker", p, o),
    divIcon: (o) => o,
    popup: () => ({
      setLatLng() {
        return this;
      },
      setContent(content) {
        this.content = content;
        return this;
      },
      openOn() {
        popup = this.content.textContent;
      },
    }),
  };
  const cleanup = showPreparationLocations(
    map,
    leaflet,
    {
      locations: [
        { id: "a", name: "Fort", type: "fort", interactionRadius: 37 },
        { id: "b", name: "Courant", interactionRadius: 25 },
      ],
    },
    {
      locations: {
        a: { position: { latitude: 48, longitude: 2 } },
        b: { position: { latitude: 48.1, longitude: 2 } },
      },
    },
    "b",
  );
  assert.equal(layers.length, 2);
  assert.equal(layers[0].options.radius, 37);
  layers[1].click();
  assert.equal(popup, "Fort");
  t.mock.timers.tick(1999);
  assert.equal(popup, "Fort");
  t.mock.timers.tick(1);
  assert.equal(popup, null);
  for (const action of ["click", "movestart", "zoomstart"]) {
    layers[0].click();
    assert.equal(popup, "Fort");
    events[action]();
    assert.equal(popup, null);
  }
  cleanup();
});
