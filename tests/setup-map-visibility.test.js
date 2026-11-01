import assert from "node:assert/strict";
import test from "node:test";

import { setupMapVisibility } from "../app/js/map/SetupMapVisibility.js";

test("la configuration de carte montre tous les lieux sans brouillard", () => {
  assert.deepEqual(
    setupMapVisibility({ setupActive: true, fogEnabled: true }),
    {
      fogEnabled: false,
      knownOnly: false,
      includeHiddenLocations: true,
    },
  );
});

test("la partie conserve le brouillard mais affiche tous les lieux existants", () => {
  assert.deepEqual(
    setupMapVisibility({ setupActive: false, fogEnabled: true }),
    {
      fogEnabled: true,
      knownOnly: false,
      includeHiddenLocations: false,
    },
  );
});
