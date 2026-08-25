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

export function createQuickGameSetup({ name = "Essai terrain", scenarioId = "chaos", expertRules = false, travelPaceMode = "calm" } = {}) {
  return new GameSetup({
    id: "chaos-field-test",
    name,
    mode: "quick",
    scenarioId,
    playerCount: 2,
    rules: { enableContentment: expertRules, locationMode: expertRules ? "expert" : "casual", travelPaceMode },
    playArea: PROVISIONAL_PLAY_AREA,
    participants: [
      { playerId: "local", name: "Joueur" },
      { playerId: "bandits", name: "Chef brigand" },
    ],
  });
}

export function createAutomaticHeroChoice() {
  return { name: "Aldric", classId: "warrior", appearanceId: "knight" };
}

export class GameSetupView {
  constructor(root) { this.root = root; }

  readSetup() { return createQuickGameSetup({ travelPaceMode: this.root.querySelector('input[name="travel-pace"]:checked')?.value ?? "calm" }); }

  readPositionMode() { return this.root.querySelector('input[name="test-mode"]:checked').value; }
  showError(error) { this.root.querySelector("#setup-status").textContent = error.message; }
}
