import assert from "node:assert/strict";
import test from "node:test";

import {
  distanceGeneratedLocationIds,
  initiallyPlacedScenarioLocationIds,
} from "../app/js/map/SetupLocationPolicy.js";

test("les lieux générés par la distance sont exclus du placement initial", () => {
  const result = distanceGeneratedLocationIds({
    bindings: [
      { locationSlotId: "capital", locationId: "royal-capital" },
      { locationSlotId: "mine", locationId: "hidden-mine" },
      { locationSlotId: "trail-end", locationId: "distant-camp" },
    ],
    placements: {
      capital: { strategy: "fixed" },
      mine: { strategy: "area-relative" },
      "trail-end": { strategy: "distance" },
    },
  });

  assert.deepEqual([...result], ["distant-camp"]);
});

test("la vue organisateur inclut les lieux de scénario déjà positionnés", () => {
  const bindings = [
    { locationSlotId: "hidden-fort", locationId: "hidden-fort" },
    { locationSlotId: "relative-mine", locationId: "relative-mine" },
    { locationSlotId: "trail-end", locationId: "distant-camp" },
  ];
  const placements = {
    "hidden-fort": { strategy: "fixed", status: "placed" },
    "relative-mine": { strategy: "area-relative", status: "placed" },
    "trail-end": { strategy: "distance", status: "waiting" },
  };

  assert.deepEqual(
    initiallyPlacedScenarioLocationIds({ bindings, placements }),
    ["hidden-fort", "relative-mine"],
  );
});
