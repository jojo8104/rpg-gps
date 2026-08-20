import { GameSetup } from "../core/game-setup.js";

const PROVISIONAL_PLAY_AREA = {
  id: "initial-area",
  name: "Zone provisoire",
  polygon: [
    { latitude: -89, longitude: -179 },
    { latitude: -89, longitude: 179 },
    { latitude: 89, longitude: 0 },
  ],
};

export function createQuickGameSetup({ name, scenarioId, expertRules = false }) {
  return new GameSetup({
    id: "chaos-field-test",
    name,
    mode: "quick",
    scenarioId,
    playerCount: 2,
    rules: { enableContentment: expertRules, locationMode: expertRules ? "expert" : "casual" },
    playArea: PROVISIONAL_PLAY_AREA,
    participants: [
      { playerId: "local", name: "Joueur" },
      { playerId: "bandits", name: "Chef brigand" },
    ],
  });
}

export class GameSetupView {
  constructor(root) { this.root = root; }

  setScenarios(scenarios) {
    this.root.querySelector("#game-scenario").innerHTML = scenarios
      .map((scenario) => `<option value="${scenario.id}">${scenario.name}</option>`).join("");
  }

  readSetup() {
    return createQuickGameSetup({
      name: this.root.querySelector("#game-name").value,
      scenarioId: this.root.querySelector("#game-scenario").value,
      expertRules: this.root.querySelector("#expert-contentment").checked,
    });
  }

  readPositionMode() { return this.root.querySelector('input[name="test-mode"]:checked').value; }
  showError(error) { this.root.querySelector("#setup-status").textContent = error.message; }
}
