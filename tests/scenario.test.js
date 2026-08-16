import assert from "node:assert/strict";
import test from "node:test";
import { Scenario, ScenarioState } from "../app/js/core/scenario.js";

const scenario = new Scenario({
  id: "chaos", name: "Chaos", intro: "Fuyez.", initialPhaseId: "escape",
  phases: [
    { id: "escape", title: "Fuite", description: "Atteignez le fort.", objectives: [{ id: "reach-fort", text: "Atteindre le fort." }], eventIds: ["fort-reached"], transitions: [{ nextPhase: "base" }] },
    { id: "base", title: "Base", description: "Installez-vous.", objectives: [], eventIds: [], transitions: [] },
  ],
  events: [{ id: "fort-reached", effects: [{ type: "showNarration", text: "Le fort est atteint." }] }],
});

test("l'état de scénario suit les objectifs et phases sans modifier sa définition", () => {
  const state = new ScenarioState(scenario);
  assert.equal(state.getObjective("reach-fort").state, "active");
  assert.equal(state.completeObjective("reach-fort"), true);
  assert.equal(state.triggerEvent(scenario, "fort-reached").effects[0].type, "showNarration");
  assert.equal(state.advance(scenario, "base"), true);
  assert.equal(state.currentPhaseId, "base");
  assert.equal(state.phaseStates.escape.status, "completed");
});
