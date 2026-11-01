import test from "node:test";
import assert from "node:assert/strict";
import { createApplicationRenderController } from "../app/js/controllers/application-render-controller.js";
import { renderQuestEngineJournal } from "../app/js/ui/quest-engine-journal-view.js";

test("un état officiel reçu pendant la gestion actualise aussi le journal", () => {
  const calls = [];
  const controller = createApplicationRenderController({
    session: { game: {} },
    appShell: { updateRelayMessages() {} },
    relayMessages: () => [],
    isManagementOpen: () => true,
    refreshOpenResourceViews: () => calls.push("resources"),
    quests: { render: () => calls.push("quests") },
  });
  controller.render({ background: true });
  assert.deepEqual(calls, ["resources", "quests"]);
});

test("le journal du moteur affiche uniquement les missions acceptées et leur progression", () => {
  const element = {};
  renderQuestEngineJournal(element, {
    offers: [{ title: "Offre non acceptée" }],
    instances: [{ title: "Mission acceptée", status: "active", actions: [
      { label: "Première étape", status: "completed" },
      { label: "Seconde étape", status: "active" },
      { label: "Autre chemin", status: "skipped" },
    ] }],
  });
  assert.doesNotMatch(element.innerHTML, /Offre non acceptée/);
  assert.match(element.innerHTML, /Mission acceptée/);
  assert.match(element.innerHTML, /1\/2 actions accomplies/);
  assert.match(element.innerHTML, /max="2" value="1"/);
  renderQuestEngineJournal(element, { offers: [], instances: [] });
  assert.match(element.innerHTML, /Aucune quête en cours/);
});
