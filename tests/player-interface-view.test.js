import assert from "node:assert/strict";
import test from "node:test";
import { createProgressRewardView } from "../app/js/ui/progress-reward-view.js";
import { renderHeroView } from "../app/js/ui/hero-view.js";
import { renderArmyView, bindArmyView } from "../app/js/ui/army-view.js";
import {
  renderPlayerNotices,
  renderGhostNotice,
} from "../app/js/ui/player-interface-view.js";
import { Hero } from "../app/js/core/hero.js";
import { Unit } from "../app/js/core/unit.js";
import { HeroProgressionService } from "../app/js/core/hero-progression-service.js";
import { HeroClassFeatureService } from "../app/js/core/hero-class-feature-service.js";
import { UNIT_RANKS } from "../app/js/core/rank-system.js";

class Node extends EventTarget {
  innerHTML = "";
  dataset = {};
  children = [];
  nodes = new Map();
  append(...children) {
    this.children.push(...children);
    for (const child of children) child.parent = this;
  }
  remove() {
    if (this.parent)
      this.parent.children = this.parent.children.filter(
        (child) => child !== this,
      );
  }
  insertAdjacentHTML(_, html) {
    this.innerHTML += html;
  }
  querySelector(selector) {
    if (!this.nodes.has(selector)) this.nodes.set(selector, new Node());
    return this.nodes.get(selector);
  }
  querySelectorAll() {
    return [];
  }
}

test("les récompenses s'enchaînent et une ancienne animation ne touche pas la nouvelle file", () => {
  const element = new Node();
  const rewards = createProgressRewardView({
    element,
    documentRef: { createElement: () => new Node() },
  });
  rewards.show({ caption: "100 m", title: "+1 XP" });
  rewards.show({ caption: "Niveau", title: "2" });
  assert.equal(element.children.length, 1);
  const first = element.children[0];
  assert.equal(first.children[0].textContent, "100 m");
  first.dispatchEvent(new Event("animationend"));
  assert.equal(element.children.length, 1);
  const old = element.children[0];
  assert.equal(old.children[1].textContent, "2");
  rewards.show({ caption: "En attente", title: "3" });
  rewards.reset();
  assert.equal(element.children.length, 0);
  rewards.show({ caption: "Nouvelle partie", title: "1" });
  old.dispatchEvent(new Event("animationend"));
  assert.equal(element.children[0].children[0].textContent, "Nouvelle partie");
  assert.equal(element.children.length, 1);
});

test("la fiche présente le héros, ses bonus et le menu d'équipement sans mutation", () => {
  const hero = new Hero({
    id: "hero",
    playerId: "player",
    name: "Ada",
    classId: "mage",
    health: 15,
    carriedLoot: [
      { id: "staff-package", itemId: "apprentice_staff", quantity: 1 },
    ],
  });
  const before = JSON.stringify(hero);
  const element = new Node();
  const progression = new HeroProgressionService();
  const game = {
    unitDefinitions: new Map(),
    setup: { rules: { moraleMode: "casual" } },
    getHeroProgress: () => progression.getProgress(hero),
    getHeroAuthority: () => ({ used: 0, maximum: 3 }),
    heroClassFeatureService: new HeroClassFeatureService(),
    getWatchBeaconsForPlayer: () => [],
  };
  renderHeroView({
    element,
    game,
    hero,
    data: { heroClasses: [{ id: "mage", name: "Mage" }], heroAptitudes: [] },
    selectedHeroStat: "attack",
    selectedHeroTrait: { id: "mage_divination", type: "innate" },
    selectedEquipmentSlotId: "mainHand",
    divinationCooldown: 1000,
    astralCooldown: 0,
    classPowerUnavailable: false,
    formatCooldown: () => "1 s",
  });
  assert.match(element.innerHTML, /Ada/);
  assert.match(element.innerHTML, /Recharge 1 s/);
  assert.match(element.innerHTML, /data-class-action="divination" disabled/);
  assert.match(element.innerHTML, /Valeur finale/);
  assert.equal(
    element.querySelector(".hero-portrait").src,
    "assets/portraits/hero-mage-female-anime-v2.png",
  );
  assert.match(
    element.querySelector(".hero-equipment").innerHTML,
    /data-equip-package="staff-package"/,
  );
  assert.equal(JSON.stringify(hero), before);
});

test("l'armée affiche blessures, expérience et promotion suivant l'autorité disponible", () => {
  const unit = new Unit({
    id: "unit",
    ownerPlayerId: "player",
    typeId: "militia",
    quantity: 3,
    soldierHealth: [10, 3, 10],
    experience: 100,
    name: "Gardes",
  });
  const hero = new Hero({
    id: "hero",
    playerId: "player",
    name: "Ada",
    army: { units: [unit] },
    resources: { officer_drill: 1 },
  });
  const element = new Node(),
    card = new Node();
  element.querySelectorAll = (selector) =>
    selector === ".army-card" ? [card] : [];
  let maximum = 1;
  const game = {
    unitDefinitions: new Map([
      [
        "militia",
        {
          name: "Milice",
          stats: { attack: 1, defense: 1, morale: 1, speed: 1 },
        },
      ],
    ]),
    getHeroAuthority: () => ({ used: 1, maximum }),
    getUnitAuthorityCost: (unit, rank = unit.rank) =>
      UNIT_RANKS.find((item) => item.id === rank).authorityCost,
  };
  renderArmyView({ element, hero, game, expandedArmyUnitId: "unit" });
  assert.match(element.innerHTML, /is-expanded/);
  assert.match(element.innerHTML, /2 combattants, 1 blessés/);
  assert.match(element.innerHTML, /data-apply-officer="officer_drill"/);
  assert.match(
    card.querySelector(".army-card__summary").innerHTML,
    /100\/100 XP/,
  );
  assert.match(card.querySelector(".army-card__actions").innerHTML, /disabled/);
  maximum = 2;
  card.querySelector(".army-card__actions").innerHTML = "";
  renderArmyView({ element, hero, game, expandedArmyUnitId: null });
  assert.doesNotMatch(
    card.querySelector(".army-card__actions").innerHTML,
    /disabled/,
  );
});

test("les cartes d'armée se sélectionnent au clavier sans déclencher leurs boutons internes", () => {
  const element = new Node(),
    card = new Node();
  card.dataset.armyUnit = "unit";
  card.getAttribute = () => "false";
  element.querySelector = () => null;
  element.querySelectorAll = (selector) =>
    selector === "[data-army-unit]" ? [card] : [];
  const selected = [];
  bindArmyView(element, { selectUnit: (id) => selected.push(id) });
  const key = new Event("keydown", { cancelable: true });
  key.key = "Enter";
  card.dispatchEvent(key);
  assert.deepEqual(selected, ["unit"]);
  assert.equal(key.defaultPrevented, true);
  const click = new Event("click");
  Object.defineProperty(click, "target", { value: { closest: () => ({}) } });
  card.dispatchEvent(click);
  assert.deepEqual(selected, ["unit"]);
});

test("les badges plafonnent à 9+ et le fantôme indique sa base de retour", () => {
  const button = () => ({
    dataset: {},
    classList: { toggle: (_, enabled) => {} },
  });
  const buttons = { hero: button(), army: button() };
  renderPlayerNotices(buttons, { hero: 12, army: 0 });
  assert.equal(buttons.hero.dataset.notice, "9+");
  assert.equal(buttons.army.dataset.notice, "0");
  const element = new Node();
  renderGhostNotice({
    element,
    hero: { state: "ghost" },
    base: { name: "Capitale" },
  });
  assert.equal(element.hidden, false);
  assert.match(element.innerHTML, /Capitale/);
  renderGhostNotice({ element, hero: { state: "active" } });
  assert.equal(element.hidden, true);
});
