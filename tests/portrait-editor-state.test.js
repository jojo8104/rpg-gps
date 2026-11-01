import test from "node:test";
import assert from "node:assert/strict";
import {
  createPortraitEditorState,
  parsePortraitEditorState,
  selectPortraitEditorPart,
} from "../app/js/core/portrait-editor-state.js";

test("les variations du PNJ se conservent dans les exports et les anciennes valeurs restent neutres", () => {
  let state = createPortraitEditorState("male");
  state.appearance.widthPercent = 130;
  state.appearance.beardOpacity = 43;
  state = selectPortraitEditorPart(state, "accessory", 1);
  state = selectPortraitEditorPart(state, "clothing", 0);
  assert.deepEqual(
    parsePortraitEditorState(JSON.parse(JSON.stringify(state))),
    state,
  );
  state.appearance.widthPercent = 70;
  assert.deepEqual(
    parsePortraitEditorState(JSON.parse(JSON.stringify(state))),
    state,
  );
  delete state.appearance.widthPercent;
  delete state.appearance.beardOpacity;
  const legacy = parsePortraitEditorState(JSON.parse(JSON.stringify(state)));
  assert.equal(legacy.appearance.widthPercent, 100);
  assert.equal(legacy.appearance.beardOpacity, 100);
  for (const values of [{ widthPercent: 200 }, { beardOpacity: "50" }])
    assert.throws(() =>
      parsePortraitEditorState({
        ...legacy,
        appearance: { ...legacy.appearance, ...values },
      }),
    );
});

test("les anciens brouillons jusqu’à 180 % sont ramenés à 130 % sans perdre les retouches", () => {
  const state = createPortraitEditorState("male");
  state.appearance.widthPercent = 180;
  state.adjustments.head.x = -6;
  const restored = parsePortraitEditorState(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.appearance.widthPercent, 130);
  assert.deepEqual(restored.adjustments, state.adjustments);
  assert.equal(state.appearance.widthPercent, 180);
  state.appearance.widthPercent = 50;
  assert.equal(parsePortraitEditorState(state).appearance.widthPercent, 70);
  assert.deepEqual(
    parsePortraitEditorState(state).adjustments,
    state.adjustments,
  );
});

test("les brouillons v5 gardent leurs réglages dans la nouvelle bibliothèque", () => {
  const state = createPortraitEditorState("female");
  state.appearance.version = 5;
  state.adjustments.head.x = 7;
  const restored = parsePortraitEditorState(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.appearance.version, 12);
  assert.equal(restored.adjustments.head.x, 7);
});

test("la fusion cou-torse conserve les anciens réglages du cou en archive", () => {
  const state = createPortraitEditorState("male");
  state.appearance.version = 6;
  state.appearance.neck = "male-neck-0";
  delete state.appearance.clothingBack;
  state.adjustments.neck = {
    x: 3,
    y: 2,
    scaleX: 95,
    scaleY: 100,
    opacity: 100,
    visible: true,
  };
  const restored = parsePortraitEditorState(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.appearance.neck, null);
  assert.equal(restored.appearance.clothingBack, "male-clothingBack-3");
  assert.equal(restored.adjustments.neck, undefined);
  assert.equal(restored.legacyNeck.x, 3);
  assert.deepEqual(
    parsePortraitEditorState(JSON.parse(JSON.stringify(restored))),
    restored,
  );
});

test("les réglages se sérialisent et chaque tenue conserve son dessous de corps", () => {
  for (const gender of ["male", "female"]) {
    let state = createPortraitEditorState(gender);
    for (let index = 0; index < 8; index++) {
      state = selectPortraitEditorPart(state, "clothing", index);
      assert.equal(state.appearance.body, `${gender}-body-${index}`);
      assert.equal(
        state.appearance.clothingBack,
        `${gender}-clothingBack-${index}`,
      );
      assert.deepEqual(
        parsePortraitEditorState(JSON.parse(JSON.stringify(state))),
        state,
      );
    }
    state = selectPortraitEditorPart(state, "hair", 3);
    assert.equal(
      state.appearance.hairBack,
      gender === "female" ? "female-hairBack-3" : null,
    );
    const restored = parsePortraitEditorState({
      ...state,
      css: "url(https://example.com)",
      adjustments: { ...state.adjustments, foreign: { html: "<script>" } },
    });
    assert.equal(restored.css, undefined);
    assert.equal(restored.adjustments.foreign, undefined);
  }
});
test("un import ne peut pas injecter des pièces, des styles ou des nombres hors limites", () => {
  const state = createPortraitEditorState();
  for (const bad of [
    null,
    {},
    { ...state, appearance: { ...state.appearance, hair: "male-hair-0" } },
    { ...state, appearance: { ...state.appearance, body: "female-body-0" } },
    { ...state, scene: { ...state.scene, x: NaN } },
    {
      ...state,
      adjustments: {
        ...state.adjustments,
        head: { ...state.adjustments.head, scaleX: 999 },
      },
    },
  ])
    assert.throws(() => parsePortraitEditorState(bad));
  assert.throws(() => selectPortraitEditorPart(state, "hair", 99));
});

test("un brouillon v7 conserve les retouches de vêtement dans la bibliothèque actuelle", () => {
  const state = createPortraitEditorState("male");
  state.appearance.version = 7;
  state.adjustments.clothing.x = 9;
  state.adjustments.clothing.scaleX = 107;
  const restored = parsePortraitEditorState(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.appearance.version, 12);
  assert.deepEqual(restored.adjustments.clothing, state.adjustments.clothing);
});
