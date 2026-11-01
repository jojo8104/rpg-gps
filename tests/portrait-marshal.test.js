import test from "node:test";
import assert from "node:assert/strict";
import {
  createMarshalAppearance,
  namedPortraitAppearance,
} from "../app/js/core/portrait-characters.js";
import { isPortraitAppearance } from "../app/js/core/portrait-catalog.js";
import {
  createPortraitEditorState,
  parsePortraitEditorState,
} from "../app/js/core/portrait-editor-state.js";
import {
  dialoguePortraitMarkup,
  usesComposedPortrait,
} from "../app/js/ui/portrait-view.js";
import { LocationChiefService } from "../app/js/core/location-chief-service.js";
test("Aldren garde une identité fixe éditable avec sa tenue et sa coiffure uniques", () => {
  const a = createMarshalAppearance();
  assert.ok(isPortraitAppearance(a));
  assert.deepEqual(a, createMarshalAppearance());
  assert.equal(a.clothing, "male-clothing-11");
  assert.equal(a.hair, "male-hair-8");
  assert.equal(a.beardColor, "gray");
  const state = { ...createPortraitEditorState("male"), appearance: a };
  assert.deepEqual(parsePortraitEditorState(state), state);
  a.widthPercent = 70;
  assert.equal(createMarshalAppearance().widthPercent, 115);
});
test("les dialogues et références historiques d’Aldren utilisent les calques sans remplacer les autres illustrations", () => {
  const conversation = {
    portrait: "assets/characters/marshal-aldren.png",
    name: "Maréchal Aldren",
  };
  assert.ok(usesComposedPortrait(conversation));
  assert.match(
    dialoguePortraitMarkup(conversation, (x) => x),
    /male\/clothing-11.png/,
  );
  assert.equal(namedPortraitAppearance("assets/characters/other.png"), null);
  assert.match(
    dialoguePortraitMarkup(
      { portrait: "assets/characters/other.png", name: "Autre" },
      (x) => x,
    ),
    /background-image/,
  );
  const chief = {
    name: conversation.name,
    title: "Commandant",
    portrait: conversation.portrait,
    trade: false,
    secondaryQuestIds: [],
    dialogues: [],
    contexts: [],
    openingLines: ["Rapport."],
  };
  const result = new LocationChiefService().getConversation({
    location: { id: "capital", type: "capital", chief },
  });
  assert.equal(result.portrait, null);
  assert.deepEqual(result.appearance, createMarshalAppearance());
  assert.deepEqual(result.openingLines, ["Rapport."]);
});
