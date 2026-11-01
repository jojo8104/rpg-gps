import {
  mountHeroGenderControl,
  selectedHeroGender,
} from "./hero-gender-control.js";
import { heroClassSelection } from "./hero-class-cards.js";
import { GameSetup } from "../core/game-setup.js";
import { heroClassName } from "./hero-appearance.js";

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

export function createAutomaticHeroChoice(classId = "warrior", gender) {
  const names = { warrior: "Aldric", ranger: "Sylve", mage: "Mériane" };
  const variants = {
    "warrior-female": "Aldria",
    "mage-male": "Mérian",
    "ranger-male": "Sylvain",
  };
  const appearances = { warrior: "knight", ranger: "ranger", mage: "mage" };
  const firstAptitudes = { mage: "offensive_magic" };
  return {
    name: variants[`${classId}-${gender}`] ?? names[classId] ?? "Aldric",
    classId,
    ...(gender ? { gender } : {}),
    appearanceId: appearances[classId] ?? "knight",
    ...(firstAptitudes[classId]
      ? { firstAptitudeId: firstAptitudes[classId] }
      : {}),
  };
}

export function nextSetupAction(pageIndex, positionMode) {
  if (positionMode !== "simulation") return { pageIndex: pageIndex + 1 };
  if (pageIndex === 3) return { start: true };
  return { pageIndex: pageIndex + 1 };
}

export function previousSetupPage(pageIndex, positionMode) {
  return pageIndex - 1;
}

export class GameSetupView {
  constructor(root, { onSimulationStart } = {}) {
    this.root = root;
    this.pageIndex = 0;
    this.onSimulationStart = onSimulationStart;
  }

  initialize() {
    const stepNames = [
      "Accueil",
      "Terrain",
      "Rythme",
      "Héros",
      "Monde",
      "Placement",
      "Récapitulatif",
    ];
    this.root
      .querySelector(".setup-progress")
      .classList.add("setup-progress--interactive");
    this.root
      .querySelectorAll(".setup-progress span")
      .forEach((step, index) => {
        step.setAttribute("role", "button");
        step.tabIndex = 0;
        step.title = stepNames[index];
        step.dataset.stepName = stepNames[index];
        step.setAttribute("aria-label", stepNames[index]);
        step.addEventListener("click", () => this.showPage(index));
        step.addEventListener("keydown", (event) => {
          if (["Enter", " "].includes(event.key)) {
            event.preventDefault();
            this.showPage(index);
          }
        });
      });
    this.root.querySelectorAll("[data-setup-next]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = nextSetupAction(this.pageIndex, this.readPositionMode());
        if (action.start) this.onSimulationStart?.();
        else this.showPage(action.pageIndex);
      });
    });
    this.root.querySelectorAll("[data-setup-back]").forEach((button) => {
      button.addEventListener("click", () =>
        this.showPage(
          previousSetupPage(this.pageIndex, this.readPositionMode()),
        ),
      );
    });
    this.root.querySelectorAll("input[type='radio']").forEach((input) => {
      input.addEventListener("change", () => this.updateSummary());
    });
    this.showPage(0);
  }

  setHeroClasses(heroClasses) {
    const root = this.root.querySelector("#hero-class-options");
    if (!root) return;
    root.innerHTML = heroClassSelection(heroClasses);
    mountHeroGenderControl(root, () => this.updateSummary());
    root
      .querySelectorAll("input")
      .forEach((input) =>
        input.addEventListener("change", () => this.updateSummary()),
      );
    this.updateSummary();
    const heroContinue = this.root.querySelector("#hero-continue");
    if (heroContinue) heroContinue.disabled = heroClasses.length === 0;
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
        step.hidden = stepIndex < 1 || stepIndex > 3;
        if (!step.hidden) step.textContent = String(stepIndex);
        step.classList.toggle("is-active", stepIndex === this.pageIndex);
        step.classList.toggle("is-complete", stepIndex < this.pageIndex);
        if (stepIndex === this.pageIndex)
          step.setAttribute("aria-current", "step");
        else step.removeAttribute("aria-current");
      });
    this.updateSummary();
    const heroContinue = this.root.querySelector("#hero-continue");
    if (heroContinue)
      heroContinue.textContent =
        this.pageIndex === 3 && this.readPositionMode() === "simulation"
          ? "Commencer la partie"
          : "Continuer";
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
      selectedHeroGender(this.root.querySelector("#hero-class-options")),
    );
  }

  updateSummary() {
    const summary = this.root.querySelector("#setup-summary");
    if (!summary) return;
    const mode = this.selectedValue("test-mode", "simulation");
    const pace = this.selectedValue("travel-pace", "calm");
    const { density, placement } = this.readWorldPreferences();
    const heroClass = this.selectedValue("hero-class", "warrior");
    const gender = selectedHeroGender(
      this.root.querySelector("#hero-class-options"),
    );
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
      warrior: ["Héros", heroClassName("warrior", gender)],
      ranger: ["Héros", heroClassName("ranger", gender)],
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
    return createQuickGameSetup({
      name: "Test local — À la maison",
      scenarioId: "chaos",
      solo: false,
      travelPaceMode:
        this.root.querySelector('input[name="travel-pace"]:checked')?.value ??
        "calm",
      siteDensity: this.readWorldPreferences().density,
    });
  }

  readPositionMode() {
    return "simulation";
  }
  showError(error) {
    this.root.querySelector("#setup-status").textContent = error.message;
  }
}
