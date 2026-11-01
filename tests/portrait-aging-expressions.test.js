import test from "node:test";
import assert from "node:assert/strict";
import {
  createPortraitAppearance,
  withPortraitExpression,
  portraitExpressionKey,
  PORTRAIT_EXPRESSION_PRESETS,
  portraitLayerBlock,
} from "../app/js/core/portrait-catalog.js";
import {
  createPortraitEditorState,
  selectPortraitEditorPart,
  selectPortraitEditorExpression,
  parsePortraitEditorState,
} from "../app/js/core/portrait-editor-state.js";
import { portraitLayersMarkup } from "../app/js/ui/portrait-view.js";
import { readPngRgba } from "./helpers/png-rgba.js";

test("les expressions associent les yeux et la bouche sans effacer les autres calques", () => {
  for (const gender of ["male", "female"]) {
    let state = createPortraitEditorState(gender);
    for (const [part, index] of [
      ["face", 3],
      ["hair", 7],
      ["mask", 1],
      ["forehead", 1],
      ["mouthLines", 1],
      ["eyeWrinkles", 1],
      ["headwear", 3],
    ])
      state = selectPortraitEditorPart(state, part, index);
    for (const [key, preset] of Object.entries(PORTRAIT_EXPRESSION_PRESETS)) {
      const changed = selectPortraitEditorExpression(state, key);
      assert.equal(portraitExpressionKey(changed.appearance), key);
      assert.equal(changed.appearance.eyes, `${gender}-eyes-${preset.eyes}`);
      assert.equal(changed.appearance.mouth, `${gender}-mouth-${preset.mouth}`);
      for (const part of [
        "face",
        "hair",
        "mask",
        "forehead",
        "mouthLines",
        "eyeWrinkles",
        "headwear",
      ])
        assert.equal(changed.appearance[part], state.appearance[part]);
      assert.deepEqual(
        parsePortraitEditorState(JSON.parse(JSON.stringify(changed))),
        changed,
      );
    }
    for (const key of ["__proto__", "foreign", "<script>"])
      assert.throws(() => withPortraitExpression(state.appearance, key));
  }
});

test("le générateur conserve une vieillesse cohérente et des expressions appariées", () => {
  for (const gender of ["male", "female"]) {
    const seen = new Set();
    let older = 0,
      white = 0;
    for (let i = 0; i < 500; i++) {
      const input = { identity: `aged:${i}`, gender };
      const appearance = createPortraitAppearance(input);
      assert.deepEqual(createPortraitAppearance(input), appearance);
      if (appearance.forehead) {
        older++;
        assert.equal(appearance.mouthLines, `${gender}-mouthLines-1`);
        assert.equal(appearance.eyeWrinkles, `${gender}-eyeWrinkles-1`);
      } else {
        assert.equal(appearance.mouthLines, null);
        assert.equal(appearance.eyeWrinkles, null);
      }
      if (["gray", "white"].includes(appearance.hairColor)) {
        white++;
        assert.ok(appearance.forehead);
      }
      const key = portraitExpressionKey(appearance);
      seen.add(key);
      const mouth = Number(appearance.mouth.split("-").at(-1));
      if (mouth >= 4)
        assert.ok(["laugh", "angry", "threatening"].includes(key));
      else assert.ok(Number(appearance.eyes.split("-").at(-1)) < 5);
    }
    assert.ok(older > 30 && white > 15);
    for (const key of ["laugh", "angry", "threatening"])
      assert.ok(seen.has(key));
  }
});

test("le foulard couvre la barbe et le rire reste visible devant elle", () => {
  const base = {
    ...createPortraitAppearance({ identity: "mask-order", gender: "male" }),
    accessory: "male-accessory-5",
    mask: "male-mask-1",
  };
  const html = portraitLayersMarkup(withPortraitExpression(base, "laugh"));
  const index = (part) => html.indexOf(`data-portrait-layer="${part}"`);
  assert.ok(index("accessory") < index("mouth"));
  assert.ok(index("mouth") < index("mask"));
  for (const part of [
    "mask",
    "forehead",
    "mouthLines",
    "eyeWrinkles",
    "headwear",
  ])
    assert.equal(portraitLayerBlock(base, part), "head");
});

test("les brouillons v9 gardent leur équipement avec les nouveaux signes d’âge initialisés à vide", () => {
  let old = createPortraitEditorState("female");
  for (const [part, index] of [
    ["face", 1],
    ["hair", 5],
    ["eyes", 3],
    ["mouth", 3],
    ["headwear", 2],
    ["glasses", 1],
    ["prop", 2],
  ])
    old = selectPortraitEditorPart(old, part, index);
  old.appearance.version = 9;
  old.appearance.widthPercent = 95;
  for (const part of ["mask", "forehead", "mouthLines", "eyeWrinkles"]) {
    delete old.appearance[part];
    delete old.adjustments[part];
  }
  const restored = parsePortraitEditorState(JSON.parse(JSON.stringify(old)));
  assert.equal(restored.appearance.version, 12);
  for (const part of [
    "face",
    "hair",
    "eyes",
    "mouth",
    "headwear",
    "glasses",
    "prop",
    "widthPercent",
  ])
    assert.equal(restored.appearance[part], old.appearance[part]);
  for (const part of ["mask", "forehead", "mouthLines", "eyeWrinkles"]) {
    assert.equal(restored.appearance[part], null);
    assert.equal(restored.adjustments[part].opacity, 100);
  }
});

test("les signes d’âge restent des calques indépendants et les foulards laissent les yeux libres", () => {
  for (const gender of ["male", "female"]) {
    const load = (part) =>
      readPngRgba(
        new URL(
          `../app/assets/portraits/modular/v12/${gender}/${part}.png`,
          import.meta.url,
        ),
      );
    for (const part of [
      "forehead-1",
      "mouthLines-1",
      "eyeWrinkles-1",
      "mask-1",
      "headwear-3",
    ]) {
      const { pixels } = load(part);
      assert.equal(pixels[3], 0);
      if (part === "mask-1") {
        assert.equal(pixels[(235 * 512 + 256) * 4 + 3], 0);
        assert.ok(pixels[(295 * 512 + 256) * 4 + 3] > 180);
      }
      if (part === "headwear-3")
        assert.equal(pixels[(235 * 512 + 256) * 4 + 3], 0);
      if (part === "mouthLines-1")
        assert.equal(pixels[(295 * 512 + 256) * 4 + 3], 0);
      if (part === "eyeWrinkles-1")
        assert.equal(pixels[(235 * 512 + 256) * 4 + 3], 0);
    }
    const span = (image, y) => {
      let left = 512,
        right = -1;
      for (let x = 0; x < 512; x++)
        if (image.pixels[(y * 512 + x) * 4 + 3] > 180) {
          left = Math.min(left, x);
          right = Math.max(right, x);
        }
      return right - left + 1;
    };
    const row = gender === "male" ? 310 : 302;
    assert.ok(
      span(load("face-2"), row) > span(load("face-0"), row) + 8,
      `${gender}: menton carré trop pointu`,
    );
    assert.ok(
      span(load("face-3"), 280) > span(load("face-0"), 280) + 5,
      `${gender}: joues peu visibles`,
    );
  }
});
