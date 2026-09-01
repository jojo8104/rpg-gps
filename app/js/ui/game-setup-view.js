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
  siteDensity = "balanced",
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
    locationSetup: { density: siteDensity },
    playArea: PROVISIONAL_PLAY_AREA,
    participants: solo
      ? [{ playerId: "local", name: "Joueur" }]
      : [
          { playerId: "local", name: "Joueur" },
          { playerId: "bandits", name: "Chef brigand" },
        ],
  });
}

export function createAutomaticHeroChoice(classId = "warrior") {
  const names = { warrior: "Aldric", ranger: "Sylve", mage: "Mériane" };
  const appearances = { warrior: "knight", ranger: "ranger", mage: "mage" };
  return {
    name: names[classId] ?? "Aldric",
    classId,
    appearanceId: appearances[classId] ?? "knight",
  };
}

export class GameSetupView {
  constructor(root) {
    this.root = root;
    this.pageIndex = 0;
  }

  initialize() {
    this.root.querySelectorAll("[data-setup-next]").forEach((button) => {
      button.addEventListener("click", () => this.showPage(this.pageIndex + 1));
    });
    this.root.querySelectorAll("[data-setup-back]").forEach((button) => {
      button.addEventListener("click", () => this.showPage(this.pageIndex - 1));
    });
    this.root.querySelectorAll("input[type='radio']").forEach((input) => {
      input.addEventListener("change", () => this.updateSummary());
    });
    this.showPage(0);
  }

  setHeroClasses(heroClasses) {
    const root = this.root.querySelector("#hero-class-options");
    if (!root) return;
    const icons = { warrior: "⚔", ranger: "➶", mage: "✦" };
    const statLabels = {
      attack: "Attaque",
      defense: "Défense",
      morale: "Moral",
      mobility: "Mobilité",
      command: "Commandement",
      health: "Santé",
    };
    const maximums = {
      attack: 5,
      defense: 5,
      morale: 5,
      mobility: 5,
      command: 5,
      health: 25,
    };
    root.innerHTML = heroClasses
      .map(
        (heroClass, index) => `
          <label class="hero-class-card">
            <input type="radio" name="hero-class" value="${heroClass.id}" ${index === 0 ? "checked" : ""}>
            <span class="hero-class-card__portrait" aria-hidden="true">${icons[heroClass.id] ?? "◆"}</span>
            <span class="hero-class-card__body">
              <strong>${heroClass.name}</strong>
              <span class="hero-class-card__advantage">${heroClass.advantage}</span>
              <span class="hero-class-card__stats">${Object.entries(
                heroClass.baseStats,
              )
                .map(
                  ([id, value]) =>
                    `<span><small>${statLabels[id] ?? id}</small><i><b style="width:${Math.round((value / maximums[id]) * 100)}%"></b></i><em>${value}</em></span>`,
                )
                .join("")}</span>
            </span>
          </label>`,
      )
      .join("");
    root
      .querySelectorAll("input")
      .forEach((input) =>
        input.addEventListener("change", () => this.updateSummary()),
      );
    this.updateSummary();
  }

  showPage(index) {
    const pages = [...this.root.querySelectorAll("[data-setup-page]")];
    this.pageIndex = Math.max(0, Math.min(pages.length - 1, index));
    pages.forEach((page, pageIndex) => {
      const active = pageIndex === this.pageIndex;
      page.hidden = !active;
      page.classList.toggle("is-active", active);
    });
    this.root
      .querySelectorAll(".setup-progress span")
      .forEach((step, stepIndex) => {
        step.classList.toggle("is-active", stepIndex === this.pageIndex);
        step.classList.toggle("is-complete", stepIndex < this.pageIndex);
      });
    this.updateSummary();
    this.root.scrollTo({ top: 0, behavior: "smooth" });
  }

  selectedValue(name, fallback) {
    return (
      this.root.querySelector(`input[name="${name}"]:checked`)?.value ??
      fallback
    );
  }

  readWorldPreferences() {
    return {
      density: this.selectedValue("site-density", "balanced"),
      placement: this.selectedValue("site-placement", "auto"),
    };
  }

  readHeroChoice() {
    return createAutomaticHeroChoice(
      this.selectedValue("hero-class", "warrior"),
    );
  }

  updateSummary() {
    const summary = this.root.querySelector("#setup-summary");
    if (!summary) return;
    const mode = this.selectedValue("test-mode", "simulation");
    const pace = this.selectedValue("travel-pace", "calm");
    const { density, placement } = this.readWorldPreferences();
    const heroClass = this.selectedValue("hero-class", "warrior");
    const labels = {
      gps: ["Terrain", "Dehors avec le GPS"],
      simulation: ["Terrain", "Simulation à la maison"],
      calm: ["Rythme", "Exploration"],
      sport: ["Rythme", "Expédition sportive"],
      low: ["Sites", "Monde clairsemé"],
      balanced: ["Sites", "Monde équilibré"],
      high: ["Sites", "Monde foisonnant"],
      auto: ["Placement", "Automatique"],
      mixed: ["Placement", "Guidé"],
      manual: ["Placement", "Libre"],
      warrior: ["Héros", "Guerrier"],
      ranger: ["Héros", "Éclaireur"],
      mage: ["Héros", "Mage"],
    };
    summary.innerHTML = [mode, pace, heroClass, density, placement]
      .map(
        (value) =>
          `<div><span>${labels[value][0]}</span><strong>${labels[value][1]}</strong></div>`,
      )
      .join("");
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
      siteDensity: this.readWorldPreferences().density,
    });
  }

  readPositionMode() {
    return this.selectedValue("test-mode", "simulation");
  }
  showError(error) {
    this.root.querySelector("#setup-status").textContent = error.message;
  }
}
