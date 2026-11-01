import test from "node:test";
import assert from "node:assert/strict";
import {
  createPortraitEditorState,
  selectPortraitEditorPart,
  parsePortraitEditorState,
} from "../app/js/core/portrait-editor-state.js";
import {
  createPortraitAppearance,
  isPortraitAppearance,
} from "../app/js/core/portrait-catalog.js";
import { readPngRgba } from "./helpers/png-rgba.js";
test("casques descendus de vingt pixels sans changer leur dessin", () => {
  for (const gender of ["male", "female"]) {
    const before = readPngRgba(
      new URL(
        `../app/assets/portraits/modular/v11/${gender}/headwear-1.png`,
        import.meta.url,
      ),
    ).pixels;
    const after = readPngRgba(
      new URL(
        `../app/assets/portraits/modular/v12/${gender}/headwear-1.png`,
        import.meta.url,
      ),
    ).pixels;
    const shift = 20 * 512 * 4;
    assert.ok(
      after.subarray(0, shift).every((value) => value === 0),
      `${gender}: marge haute transparente`,
    );
    let alphaDifferences = 0;
    let maximumColorDifference = 0;
    for (let index = 0; index < before.length - shift; index += 4) {
      if (before[index + 3] !== after[index + shift + 3]) alphaDifferences++;
      for (let channel = 0; channel < 3; channel++)
        maximumColorDifference = Math.max(
          maximumColorDifference,
          Math.abs(before[index + channel] - after[index + shift + channel]),
        );
    }
    assert.equal(
      alphaDifferences,
      0,
      `${gender}: transparence du casque déplacé`,
    );
    // System.Drawing arrondit certains canaux RGB lors du réenregistrement.
    assert.ok(
      maximumColorDifference <= 1,
      `${gender}: écart RGB maximal ${maximumColorDifference}`,
    );
  }
});
test("soldat et casque de mineur compatibles avec les deux bibliothèques et les anciens brouillons", () => {
  for (const gender of ["male", "female"]) {
    let state = createPortraitEditorState(gender);
    state = selectPortraitEditorPart(state, "clothing", 9);
    state = selectPortraitEditorPart(state, "headwear", 4);
    for (const widthPercent of [70, 100, 130])
      assert.ok(isPortraitAppearance({ ...state.appearance, widthPercent }));
    assert.equal(state.appearance.body, `${gender}-body-9`);
    assert.equal(state.appearance.clothingBack, `${gender}-clothingBack-9`);
    assert.equal(
      createPortraitAppearance({ identity: "soldier", gender, role: "soldier" })
        .clothing,
      `${gender}-clothing-9`,
    );
    const old = createPortraitEditorState(gender);
    old.appearance.version = 11;
    old.adjustments.headwear.y = 7;
    const restored = parsePortraitEditorState(old);
    assert.equal(restored.adjustments.headwear.y, 7);
    assert.equal(restored.appearance.hairColor, old.appearance.hairColor);
  }
});

test("barbare et longue barbe conservent couleurs, opacité et séparation des genres", () => {
  for (const gender of ["male", "female"]) {
    let s = selectPortraitEditorPart(
      createPortraitEditorState(gender),
      "clothing",
      10,
    );
    assert.equal(
      createPortraitAppearance({
        identity: "barbarian",
        gender,
        role: "barbarian",
      }).clothing,
      `${gender}-clothing-10`,
    );
    if (gender === "male") s = selectPortraitEditorPart(s, "accessory", 7);
    s.appearance.hairColor = "red";
    s.appearance.beardColor = "white";
    s.appearance.beardOpacity = 55;
    assert.deepEqual(parsePortraitEditorState(JSON.parse(JSON.stringify(s))), {
      ...s,
      appearance: { ...s.appearance, beardOpacity: 100 },
    });
    assert.equal(
      isPortraitAppearance({
        ...s.appearance,
        accessory: "female-accessory-7",
      }),
      false,
    );
  }
});
