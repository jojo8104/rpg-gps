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

export function createQuickGameSetup({
  name = "Essai terrain",
  scenarioId = "chaos",
  expertRules = false,
  travelPaceMode = "calm",
  solo = false,
} = {}) {
  return new GameSetup({
    id: "chaos-field-test",
    name,
    mode: "quick",
    scenarioId,
    playerCount: solo ? 1 : 2,
    rules: {
      enableContentment: expertRules,
      locationMode: expertRules ? "expert" : "casual",
      travelPaceMode,
    },
    playArea: PROVISIONAL_PLAY_AREA,
    participants: solo
      ? [{ playerId: "local", name: "Joueur" }]
      : [
          { playerId: "local", name: "Joueur" },
          { playerId: "bandits", name: "Chef brigand" },
        ],
  });
}

export function createAutomaticHeroChoice() {
  return { name: "Aldric", classId: "warrior", appearanceId: "knight" };
}

export class GameSetupView {
  constructor(root) {
    this.root = root;
  }

  readSetup() {
    const playtest = this.root.dataset.edition === "playtest";
    return createQuickGameSetup({
      name: playtest ? "RPG GPS — Survie" : "Essai terrain",
      scenarioId: playtest ? "verdant-frontier" : "chaos",
      solo: playtest,
      travelPaceMode:
        this.root.querySelector('input[name="travel-pace"]:checked')?.value ??
        "calm",
    });
  }

  readPositionMode() {
    return this.root.querySelector('input[name="test-mode"]:checked').value;
  }
  showError(error) {
    this.root.querySelector("#setup-status").textContent = error.message;
  }
}
