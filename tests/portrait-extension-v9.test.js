import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  createPortraitAppearance,
  isPortraitAppearance,
  isPortraitBeard,
  PORTRAIT_VARIANTS,
  MODULAR_PORTRAIT_ASSETS,
  portraitLayerBlock,
} from "../app/js/core/portrait-catalog.js";
import {
  createPortraitEditorState,
  selectPortraitEditorPart,
  parsePortraitEditorState,
} from "../app/js/core/portrait-editor-state.js";
import { portraitLayersMarkup } from "../app/js/ui/portrait-view.js";
import { readPngRgba } from "./helpers/png-rgba.js";

test("chaque nouvelle pièce se combine avec les anciennes dans sa bibliothèque", () => {
  for (const gender of ["male", "female"]) {
    let state = createPortraitEditorState(gender);
    state = selectPortraitEditorPart(state, "clothing", 8);
    assert.equal(state.appearance.body, `${gender}-body-8`);
    for (const [part, indices] of Object.entries({
      face: [0, 1],
      hair: [0, 4, 5, 6],
      eyes: [0, 2, 3],
      nose: [0, 2, 3],
      mouth: [0, 2, 3],
      headwear: [0, 1, 2],
      glasses: [0, 1],
      prop: [0, 1, 2, 3],
      accessory: gender === "male" ? [0, 1, 5, 6] : [0, 1, 2, 3],
    }))
      for (const index of indices) {
        state = selectPortraitEditorPart(state, part, index);
        assert.ok(
          isPortraitAppearance(state.appearance),
          `${gender}/${part}/${index}`,
        );
        assert.deepEqual(
          parsePortraitEditorState(JSON.parse(JSON.stringify(state))),
          state,
        );
      }
    state = selectPortraitEditorPart(state, "headwear", 1);
    state = selectPortraitEditorPart(state, "glasses", 1);
    state = selectPortraitEditorPart(state, "prop", 1);
    if (gender === "male")
      state = selectPortraitEditorPart(state, "accessory", 6);
    const html = portraitLayersMarkup(state.appearance);
    for (const part of ["headwear", "glasses", "prop", "accessory"])
      assert.match(html, new RegExp(`data-portrait-layer="${part}"`));
    assert.ok(
      html.indexOf('data-portrait-layer="prop"') <
        html.indexOf('data-portrait-layer="body"'),
    );
    assert.ok(
      html.indexOf('data-portrait-layer="headwear"') >
        html.indexOf('data-portrait-layer="hair"'),
    );
    assert.equal(portraitLayerBlock(state.appearance, "prop"), "body");
    for (const part of ["headwear", "glasses", "prop"]) {
      const crossed = {
        ...state.appearance,
        [part]: `${gender === "male" ? "female" : "male"}-${part}-1`,
      };
      assert.equal(isPortraitAppearance(crossed), false);
      assert.equal(portraitLayersMarkup(crossed), "");
    }
    assert.equal(
      createPortraitAppearance({ identity: "bandit", gender, role: "brigand" })
        .clothing,
      `${gender}-clothing-8`,
    );
    assert.equal(PORTRAIT_VARIANTS[gender].face, 4);
    assert.equal(PORTRAIT_VARIANTS[gender].hair, gender === "male" ? 9 : 8);
  }
});

test("les exports v8 sans nouveaux emplacements conservent toutes leurs retouches", () => {
  const old = createPortraitEditorState("male");
  old.appearance.version = 8;
  old.appearance.face = "male-face-0";
  old.appearance.hair = "male-hair-0";
  old.appearance.accessory = "male-accessory-1";
  for (const part of ["headwear", "glasses", "prop"]) {
    delete old.appearance[part];
    delete old.adjustments[part];
  }
  old.adjustments.hair.y = -7;
  old.appearance.widthPercent = 95;
  old.appearance.beardOpacity = 47;
  const restored = parsePortraitEditorState(JSON.parse(JSON.stringify(old)));
  assert.equal(restored.appearance.version, 12);
  assert.equal(restored.appearance.widthPercent, 95);
  assert.equal(restored.appearance.beardOpacity, 100);
  assert.equal(restored.adjustments.hair.y, -7);
  for (const part of ["headwear", "glasses", "prop"]) {
    assert.equal(restored.appearance[part], null);
    assert.equal(restored.adjustments[part].scaleX, 100);
  }
});

test("les barbes ajoutées utilisent l’opacité de barbe et laissent la bouche visible", () => {
  const base = createPortraitAppearance({
    identity: "new-beards",
    gender: "male",
  });
  for (const index of [1, 5, 6]) {
    const appearance = {
      ...base,
      accessory: `male-accessory-${index}`,
      beardOpacity: 45,
    };
    assert.ok(isPortraitBeard(appearance));
    assert.match(
      portraitLayersMarkup(appearance),
      /data-portrait-beard="true"/,
    );
    assert.match(
      portraitLayersMarkup(appearance),
      /--portrait-beard-opacity:1/,
    );
    if (index > 1) {
      const { pixels } = readPngRgba(
        new URL(
          `../app/assets/portraits/modular/v12/male/accessory-${index}.png`,
          import.meta.url,
        ),
      );
      assert.equal(pixels[(295 * 512 + 256) * 4 + 3], 0);
    }
  }
  assert.equal(
    isPortraitBeard({ ...base, accessory: "male-accessory-3" }),
    false,
  );
});

test("les nouveaux PNG sont transparents et les anciens pixels restent identiques", () => {
  const root = new URL("../app/assets/", import.meta.url);
  for (const path of MODULAR_PORTRAIT_ASSETS.filter((p) =>
    p.includes("/v12/"),
  )) {
    const old = new URL(path.replace("/v12/", "/v10/"), root);
    if (
      existsSync(old) &&
      !/\/(hair(?:Back)?-\d+|headwear-[12])\.png$/.test(path) &&
      !/\/male\/accessory-[1567]\.png$/.test(path)
    ) {
      assert.deepEqual(
        readFileSync(new URL(path, root)),
        readFileSync(old),
        path,
      );
      continue;
    }
    const { pixels, width, height } = readPngRgba(new URL(path, root));
    assert.equal(width, 512);
    assert.equal(height, 832);
    for (const [x, y] of [
      [0, 0],
      [511, 0],
      [0, 831],
      [511, 831],
    ])
      assert.equal(pixels[(y * width + x) * 4 + 3], 0, path);
    let visible = 0;
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 180) visible++;
    if (path === "portraits/modular/v12/female/clothingBack-10.png") {
      assert.ok(
        pixels.every((value, index) => index % 4 !== 3 || value === 0),
        `${path}: la tenue sans col arrière garde un calque transparent`,
      );
      continue;
    }
    assert.ok(
      path.includes("hairBack-") || visible > 10,
      `${path}: pièce vide`,
    );
    if (path.includes("headwear-"))
      assert.equal(
        pixels[(230 * 512 + 256) * 4 + 3],
        0,
        `${path}: couvre les yeux`,
      );
    if (path.includes("glasses-"))
      assert.equal(
        pixels[(236 * 512 + 226) * 4 + 3],
        0,
        `${path}: verre opaque`,
      );
  }
});
