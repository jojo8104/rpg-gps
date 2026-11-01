import test from "node:test";
import assert from "node:assert/strict";
import { armyBanner, armyBannerSize } from "../app/js/map/army-banner.js";
test("les formes représentent seulement les effectifs connus", () => {
  for (const [count, size] of [
    [0, null],
    [1, "small"],
    [9, "small"],
    [10, "medium"],
    [29, "medium"],
    [30, "large"],
  ])
    assert.equal(armyBannerSize([{ combatantCount: count }]), size);
  assert.equal(armyBanner([{ combatantCount: 40 }], "red", 2), "");
  assert.equal(armyBanner(undefined), "");
  assert.equal(armyBanner([]), "");
  assert.match(
    armyBanner([{ combatantCount: 40 }], "green", 3),
    /is-large is-green/,
  );
  assert.match(
    armyBanner([{ combatantCount: 2 }], "invalid"),
    /is-small is-gold/,
  );
});
