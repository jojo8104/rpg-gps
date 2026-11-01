import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { Scenario } from "../app/js/core/scenario.js";
import { validateScenarioMapLocations } from "../app/js/core/scenario-map-definition.js";
import { createWorldSetupController } from "../app/js/controllers/world-setup-controller.js";

const data = JSON.parse(
  readFileSync(new URL("../data/scenarios/chaos.json", import.meta.url)),
);
const locations = JSON.parse(
  readFileSync(new URL("../data/locations.json", import.meta.url)),
);
const bindings = [
  { locationSlotId: "capital", locationId: "royal-capital" },
  {
    locationSlotId: "capital-resource-gold-village",
    locationId: "capital-resource-gold-village",
  },
  { locationSlotId: "capital-resource-gold", locationId: "capital-resource-gold" },
];

test("la carte conserve ses couronnes et son minimum après sérialisation", () => {
  const scenario = new Scenario(data);
  assert.deepEqual(
    new Scenario(scenario.toJSON()).mapDefinition,
    data.mapDefinition,
  );
  validateScenarioMapLocations(scenario, bindings, locations);
  assert.ok(
    scenario.mapDefinition.zones[2].enemyGroupDensityMultiplier >
      scenario.mapDefinition.zones[0].enemyGroupDensityMultiplier,
  );
});

test("le scénario refuse un minimum incomplet et des couronnes superposées", () => {
  const missing = structuredClone(data);
  missing.mapDefinition.requiredLocationSlotIds = ["capital"];
  assert.throws(() => new Scenario(missing), /village/);
  const overlapping = structuredClone(data);
  overlapping.mapDefinition.zones[1].innerRadiusRatio = 0.1;
  assert.throws(() => new Scenario(overlapping), /couronnes/);
});

test("le moteur refuse une mine obligatoire absente ou sans production d’or", () => {
  const scenario = new Scenario(data);
  assert.throws(
    () =>
      validateScenarioMapLocations(
        scenario,
        bindings,
        locations.filter((location) => location.id !== "capital-resource-gold"),
      ),
    /obligatoire/,
  );
  const invalid = structuredClone(locations);
  invalid.find(
    (location) => location.id === "capital-resource-gold",
  ).resources.production = { iron: 2 };
  assert.throws(
    () => validateScenarioMapLocations(scenario, bindings, invalid),
    /produire/,
  );
});

test("le setup dense ne crée aucun lieu ou GA supplémentaire et ignore les bindings étrangers", () => {
  const controller = createWorldSetupController({
    game: {
      scenario: { locationSlots: data.locationSlots },
      scenarioLocationBindings: [
        ...bindings,
        { locationSlotId: "unrelated", locationId: "unrelated" },
      ],
      locations: [...locations, { id: "unrelated", type: "village" }],
    },
    setupView: {
      readWorldPreferences: () => ({ density: "high", placement: "auto" }),
    },
  });
  const config = controller.automaticPlacementConfiguration();
  assert.equal(
    config.locations.find((entry) => entry.type === "village").count,
    1,
  );
  assert.equal(
    config.locations.find((entry) => entry.type === "mine").count,
    1,
  );
  assert.deepEqual(config.autonomous, []);
});
