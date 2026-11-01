import test from "node:test";
import assert from "node:assert/strict";
import {
  PORTRAIT_HAIR_COLORS,
  portraitColorKeys,
} from "../app/js/core/portrait-hair-colors.js";
import {
  createPortraitAppearance,
  isPortraitAppearance,
} from "../app/js/core/portrait-catalog.js";
import {
  createPortraitEditorState,
  parsePortraitEditorState,
} from "../app/js/core/portrait-editor-state.js";
import { portraitLayersMarkup } from "../app/js/ui/portrait-view.js";
import { readPngRgba } from "./helpers/png-rgba.js";
test("chaque forme neutre conserve exactement sa silhouette et ses détails", () => {
  for (const gender of ["male", "female"])
    for (const part of [
      ...Array.from({ length: 8 }, (_, i) => `hair-${i}`),
      ...(gender === "female"
        ? Array.from({ length: 8 }, (_, i) => `hairBack-${i}`)
        : ["accessory-1", "accessory-5", "accessory-6"]),
    ]) {
      const old = readPngRgba(
        new URL(
          `../app/assets/portraits/modular/v10/${gender}/${part}.png`,
          import.meta.url,
        ),
      ).pixels;
      const now = readPngRgba(
        new URL(
          `../app/assets/portraits/modular/v12/${gender}/${part}.png`,
          import.meta.url,
        ),
      ).pixels;
      const shades = new Set();
      for (let i = 0; i < old.length; i += 4) {
        assert.equal(now[i + 3], old[i + 3]);
        if (now[i + 3]) {
          assert.equal(now[i], now[i + 1]);
          assert.equal(now[i], now[i + 2]);
          shades.add(now[i]);
        }
      }
      assert.ok(shades.size === 0 || shades.size > 20, part);
    }
});
test("couleurs indépendantes, validation et filtres propres à chaque portrait", () => {
  const a = {
    ...createPortraitAppearance({ identity: "colors", gender: "male" }),
    accessory: "male-accessory-5",
    beardColor: null,
  };
  const paths = new Set();
  for (const hairColor of Object.keys(PORTRAIT_HAIR_COLORS)) {
    const appearance = { ...a, hairColor };
    assert.ok(isPortraitAppearance(appearance));
    assert.equal(portraitColorKeys(appearance).beard, hairColor);
    const html = portraitLayersMarkup(appearance);
    paths.add(html.match(/src="([^"]+hair-\d+\.png)"/)[1]);
    assert.match(html, new RegExp(`data-portrait-color="${hairColor}"`));
    assert.notEqual(
      html.match(/id="portrait-tone-[^"]+/)[0],
      portraitLayersMarkup(appearance).match(/id="portrait-tone-[^"]+/)[0],
    );
  }
  assert.equal(paths.size, 1);
  assert.equal(isPortraitAppearance({ ...a, hairColor: "url(evil)" }), false);
  assert.equal(
    portraitColorKeys({ ...a, hairColor: "black", beardColor: "gray" }).beard,
    "gray",
  );
});
test("import v10 préserve les attributs et traduit les anciennes couleurs", () => {
  const s = createPortraitEditorState("male");
  s.appearance.version = 10;
  s.appearance.hair = "male-hair-4";
  s.appearance.accessory = "male-accessory-6";
  s.appearance.mask = "male-mask-1";
  s.appearance.forehead = "male-forehead-1";
  delete s.appearance.hairColor;
  delete s.appearance.beardColor;
  const migrated = parsePortraitEditorState(s);
  assert.equal(migrated.appearance.hairColor, "blond");
  assert.equal(migrated.appearance.beardColor, "gray");
  assert.equal(migrated.appearance.mask, "male-mask-1");
  assert.equal(migrated.appearance.forehead, "male-forehead-1");
  assert.deepEqual(
    parsePortraitEditorState(JSON.parse(JSON.stringify(migrated))),
    migrated,
  );
});
