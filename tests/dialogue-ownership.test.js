import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { Scenario } from "../app/js/core/scenario.js";
import { composeScenario } from "../app/js/core/scenario-composer.js";
import {
  buildScenarioDialogue,
  scenarioDialogueSpeaker,
} from "../app/js/core/scenario-dialogue.js";
import { buildingConversation } from "../app/js/core/building-dialogue-catalog.js";

const repression = JSON.parse(
  readFileSync(
    new URL("../data/scenarios/repression.json", import.meta.url),
    "utf8",
  ),
);

test("les dialogues du scénario survivent à la composition et à la sauvegarde", () => {
  const composed = composeScenario(
    {
      ...repression,
      dialogues: {},
      phases: [],
      events: [],
      locationSlots: [],
      trails: [],
      worldState: {},
    },
    repression,
  );
  const restored = new Scenario(new Scenario(composed).toJSON());
  assert.deepEqual(restored.dialogues, repression.dialogues);
  restored.dialogues.repression.title = "Autre";
  assert.equal(repression.dialogues.repression.title, "La Répression");
  assert.throws(() => composeScenario(repression, repression), /dialogues/);
});

test("les phases du scénario définissent les portraits, choix et suites de dialogue", () => {
  const definition = repression.dialogues.repression;
  const choices = [{ id: "negotiate", label: "Négocier" }];
  const arrival = buildScenarioDialogue({
    definition,
    phaseId: "arrival",
    choices,
    description: "Arrivée",
  });
  assert.deepEqual(arrival.lines, ["Arrivée"]);
  assert.deepEqual(arrival.conversation.options, [
    { id: "repression-close", label: "Continuer" },
  ]);
  const prison = buildScenarioDialogue({
    definition,
    phaseId: "repression-prison",
    choices,
  });
  assert.equal(
    prison.conversation.portrait,
    "assets/scenes/repression-prison.svg",
  );
  assert.equal(prison.conversation.options[0].id, "repression:negotiate");
  const battle = buildScenarioDialogue({
    definition,
    phaseId: "brigand-battle",
    entries: [{ speaker: "Prévôt", scene: "provost", text: "Halte" }],
  });
  assert.equal(battle.battleLocationId, "brigand-camp-convoy");
  assert.equal(battle.conversation.options[0].label, "Entrer dans la bataille");
  assert.equal(battle.conversation.name, "Prévôt");
  assert.deepEqual(battle.lines, ["Halte"]);
  assert.equal(
    scenarioDialogueSpeaker(definition, { scene: "knight" }).portrait,
    "assets/characters/armand-valgrise.png",
  );
});

test("les conversations des bâtiments sont liées à leur infrastructure et au lieu", () => {
  const location = {
    id: "village",
    name: "Montfaucon",
    infrastructure: { forge: 1, tavern: 2 },
  };
  const options = [{ id: "item:sword", label: "Épée" }];
  const forge = buildingConversation({
    buildingId: "forge",
    location,
    remaining: 2,
    options,
  });
  assert.equal(forge.name, "Forgeron · Montfaucon");
  assert.match(forge.openingLines[0], /2 commande/);
  assert.equal(forge.options, options);
  assert.equal(
    buildingConversation({ buildingId: "tavern", location }).title,
    "Tavernier",
  );
  assert.equal(
    buildingConversation({
      buildingId: "forge",
      location: { ...location, infrastructure: {} },
    }),
    null,
  );
});
