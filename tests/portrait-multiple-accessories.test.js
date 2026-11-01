import test from "node:test";
import assert from "node:assert/strict";
import {
  createPortraitEditorState,
  selectPortraitEditorAccessories,
  parsePortraitEditorState,
} from "../app/js/core/portrait-editor-state.js";
import { isPortraitAppearance } from "../app/js/core/portrait-catalog.js";
import { portraitLayersMarkup } from "../app/js/ui/portrait-view.js";
import { applyPortraitAdjustments } from "../app/js/ui/portrait-adjustments.js";
test("les accessoires cumulés restent séparés, ancrés et exportables sans références libres", () => {
  let state = selectPortraitEditorAccessories(
    createPortraitEditorState("male"),
    [1, 2, 3, 4],
  );
  const html = portraitLayersMarkup(state.appearance);
  assert.equal(
    (html.match(/data-portrait-layer="accessory"/g) ?? []).length,
    4,
  );
  assert.match(
    html,
    /data-portrait-block="body"><img data-portrait-layer="accessory" data-portrait-accessory="male-accessory-4"/,
  );
  assert.equal(
    (html.match(/data-portrait-beard-piece="true"/g) ?? []).length,
    1,
  );
  assert.deepEqual(
    parsePortraitEditorState(JSON.parse(JSON.stringify(state))),
    state,
  );
  for (const refs of [
    ["female-accessory-1"],
    ["male-accessory-1"],
    ["../evil"],
    null,
  ])
    assert.equal(
      isPortraitAppearance({
        ...state.appearance,
        additionalAccessories: refs,
      }),
      false,
    );
  assert.throws(() => selectPortraitEditorAccessories(state, [1, 1]));
  assert.equal(
    selectPortraitEditorAccessories(state, []).appearance.accessory,
    null,
  );
});
test("les barbes ignorent les anciennes opacités et les déplacements élargis sont bornés", () => {
  const state = selectPortraitEditorAccessories(
    createPortraitEditorState("male"),
    [1, 2],
  );
  state.appearance.beardOpacity = 12;
  state.adjustments.accessory.opacity = 20;
  state.scene = { x: 150, y: -150, scale: 100 };
  const images = [true, false].map((beard) => ({
    dataset: { portraitLayer: "accessory", portraitBeardPiece: String(beard) },
    style: {},
  }));
  const person = { style: {}, querySelectorAll: () => images };
  applyPortraitAdjustments({ querySelector: () => person }, state);
  assert.equal(images[0].style.opacity, "1");
  assert.equal(images[1].style.opacity, "0.2");
  assert.equal(person.style.left, "200%");
  assert.equal(person.style.bottom, "134%");
  assert.equal(parsePortraitEditorState(state).appearance.beardOpacity, 100);
  for (const scene of [
    { x: 151, y: 0, scale: 100 },
    { x: 0, y: -151, scale: 100 },
  ])
    assert.throws(() => parsePortraitEditorState({ ...state, scene }));
});
