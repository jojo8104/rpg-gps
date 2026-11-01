import assert from "node:assert/strict";
import test from "node:test";
import { createPlayerInterfaceController } from "../app/js/controllers/player-interface-controller.js";
import { Hero } from "../app/js/core/hero.js";
import { HeroProgressionService } from "../app/js/core/hero-progression-service.js";
import { DEFAULT_HERO_CLASSES } from "../app/js/core/hero-progression-config.js";

function fixture() {
  const calls = [];
  let heroOptions, armyOptions, heroActions, armyActions, progressOptions;
  let accepted = true,
    inventoryActive = false,
    inventoryFilled = true;
  const unit = {
    id: "unit",
    name: "Gardes",
    typeId: "guard",
    canPromote: true,
  };
  let session = {
    hero: {
      id: "hero",
      playerId: "player",
      pendingLevelUps: [],
      bagSlotCount: 12,
      army: { units: [unit], getUnit: (id) => (id === unit.id ? unit : null) },
    },
    data: {},
    game: {
      getHeroProgress: () => ({ canLevelUp: false, availableLevelUps: 0 }),
      getHeroBaseLocation: () => null,
      unitDefinitions: new Map(),
    },
  };
  const methods = [
    "equipHeroItem",
    "unequipHeroItem",
    "disbandUnit",
    "applyOfficerToUnit",
    "promoteUnit",
    "levelUpHero",
    "selectHeroLevelUp",
  ];
  for (const method of methods)
    session.game[method] = (input) => {
      calls.push([method, input]);
      return {
        success: true,
        unit,
        itemId: "sword",
        slot: "mainHand",
        experienceGained: 40,
        rank: "corporal",
        level: 2,
      };
    };
  const controller = createPlayerInterfaceController({
    elements: {
      hero: {},
      army: {},
      inventory: { hasChildNodes: () => inventoryFilled },
      notices: {},
    },
    getSession: () => session,
    onChange: () => calls.push(["change"]),
    log: (text) => calls.push(["log", text]),
    isInventoryActive: () => inventoryActive,
    confirm: () => accepted,
    alerts: {
      notify: (kind) => calls.push(["notify", kind]),
      reward: (reward) => calls.push(["reward", reward]),
    },
    classActions: { divination: () => calls.push(["divination"]) },
    views: {
      hero: (options) => {
        heroOptions = options;
      },
      army: (options) => {
        armyOptions = options;
      },
      bindHero: (_, actions) => {
        heroActions = actions;
      },
      bindArmy: (_, actions) => {
        armyActions = actions;
      },
      inventory: (options) => calls.push(["inventory", options]),
      progress: (options) => {
        progressOptions = options;
        return { close: () => calls.push(["close"]) };
      },
      notices: (_, counts) => calls.push(["notices", counts]),
      ghost: () => {},
      rewards: {
        show: (reward) => calls.push(["show", reward]),
        reset: () => calls.push(["resetRewards"]),
      },
    },
  });
  return {
    controller,
    calls,
    get session() {
      return session;
    },
    replace: (next) => {
      session = next;
    },
    get hero() {
      return heroOptions;
    },
    get army() {
      return armyOptions;
    },
    get heroActions() {
      return heroActions;
    },
    get armyActions() {
      return armyActions;
    },
    get progress() {
      return progressOptions;
    },
    accept: (value) => {
      accepted = value;
    },
    inventory: (active, filled) => {
      inventoryActive = active;
      inventoryFilled = filled;
    },
  };
}

test("l'équipement est anticipé visuellement sans muter le héros et revient à l'état officiel après refus", async () => {
  const f = fixture();
  f.session.hero.equipment = { mainHand: "iron_sword" };
  f.session.hero.carriedLoot = [
    { id: "new-sword", itemId: "steel_sword", quantity: 1 },
  ];
  const before = structuredClone({
    equipment: f.session.hero.equipment,
    loot: f.session.hero.carriedLoot,
  });
  let finish;
  let calls = 0;
  f.session.game.equipHeroItem = () => {
    calls++;
    return new Promise((resolve) => {
      finish = resolve;
    });
  };
  f.controller.render();
  const pending = f.heroActions.equip("new-sword", "mainHand");
  assert.equal(f.hero.hero.equipment.mainHand, "iron_sword");
  assert.equal(f.hero.equipmentHero.equipment.mainHand, "steel_sword");
  assert.equal(
    f.hero.equipmentHero.carriedLoot.some((entry) => entry.id === "new-sword"),
    false,
  );
  f.controller.render();
  assert.equal(f.hero.equipmentHero.equipment.mainHand, "steel_sword");
  await f.heroActions.equip("new-sword", "mainHand");
  assert.equal(calls, 1);
  assert.deepEqual(
    { equipment: f.session.hero.equipment, loot: f.session.hero.carriedLoot },
    before,
  );
  finish({ success: false, reason: "refused" });
  await pending;
  assert.equal(f.hero.equipmentHero.equipment.mainHand, "iron_sword");
  assert.equal(f.hero.pendingEquipmentSlot, null);
});

test("une réponse d'équipement d'une ancienne partie ne modifie pas la nouvelle interface", async () => {
  const f = fixture();
  let finish;
  f.session.game.unequipHeroItem = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  f.controller.render();
  const pending = f.heroActions.unequip("mainHand");
  f.controller.reset();
  const before = f.calls.length;
  finish({ success: true });
  await pending;
  assert.equal(f.calls.length, before);
});

test("les sélections locales ne relancent pas le rendu global et les détails sont exclusifs", async () => {
  const f = fixture();
  await f.controller.render({
    divinationCooldown: 123,
    classPowerUnavailable: false,
  });
  f.heroActions.selectStat("attack");
  assert.equal(f.hero.selectedHeroStat, "attack");
  f.heroActions.selectTrait({ id: "skill", type: "skill" });
  assert.equal(f.hero.selectedHeroStat, null);
  assert.deepEqual(f.hero.selectedHeroTrait, { id: "skill", type: "skill" });
  assert.equal(f.hero.divinationCooldown, 123);
  f.heroActions.dismissDetails({ stat: false, trait: true });
  assert.equal(f.hero.selectedHeroTrait, null);
  f.armyActions.selectUnit("unit");
  assert.equal(f.army.expandedArmyUnitId, "unit");
  f.armyActions.selectUnit(null);
  assert.equal(f.army.expandedArmyUnitId, null);
  assert.equal(
    f.calls.some(([kind]) => kind === "change"),
    false,
  );
});

test("l'équipement relit le héros et Game après le remplacement d'un état serveur", async () => {
  const f = fixture();
  await f.controller.render();
  const actions = f.heroActions;
  const replacement = {
    ...f.session,
    hero: { ...f.session.hero, playerId: "new-player" },
    game: {
      ...f.session.game,
      equipHeroItem: (input) => {
        f.calls.push(["newEquip", input]);
        return { success: true, slot: "mainHand", itemId: "sword" };
      },
    },
  };
  f.replace(replacement);
  await actions.equip("package", "mainHand");
  assert.deepEqual(f.calls.find(([kind]) => kind === "newEquip")[1], {
    playerId: "new-player",
    heroId: "hero",
    packageId: "package",
    slot: "mainHand",
  });
  assert.equal(
    f.calls.some(([kind]) => kind === "equipHeroItem"),
    false,
  );
  await actions.unequip("mainHand");
  assert.equal(
    f.calls.find(([kind]) => kind === "unequipHeroItem")[1].playerId,
    "new-player",
  );
});

test("la réinitialisation ferme la progression et rend les anciens boutons inactifs", async () => {
  const f = fixture();
  await f.controller.render();
  await f.controller.openProgress();
  const heroActions = f.heroActions,
    armyActions = f.armyActions,
    choose = f.progress.onChoose;
  await f.controller.reset();
  f.calls.length = 0;
  await heroActions.equip("package", "mainHand");
  heroActions.classAction("divination");
  await armyActions.promote("unit");
  armyActions.selectUnit("unit");
  assert.equal(
    choose({ pendingId: "old", upgradeId: "skill", label: "Skill" }),
    undefined,
  );
  assert.deepEqual(f.calls, []);
  await f.controller.render();
  assert.equal(f.hero.selectedEquipmentSlotId, null);
  assert.equal(f.army.expandedArmyUnitId, null);
});

test("les boutons d'un héros précédent ne peuvent pas agir sur son remplaçant", async () => {
  const f = fixture();
  await f.controller.render();
  const old = f.heroActions;
  f.replace({ ...f.session, hero: { ...f.session.hero, id: "other-hero" } });
  f.calls.length = 0;
  await old.equip("package", "mainHand");
  assert.deepEqual(f.calls, []);
});

test("la notification de niveau disponible est émise une fois puis réarmée", async () => {
  const f = fixture();
  let ready = true;
  f.session.game.getHeroProgress = () => ({
    canLevelUp: ready,
    availableLevelUps: ready ? 2 : 0,
  });
  await f.controller.render();
  await f.controller.render();
  assert.equal(f.calls.filter(([kind]) => kind === "notify").length, 1);
  assert.deepEqual(f.calls.filter(([kind]) => kind === "notices").at(-1)[1], {
    hero: 2,
    army: 1,
  });
  ready = false;
  await f.controller.render();
  ready = true;
  await f.controller.render();
  assert.equal(f.calls.filter(([kind]) => kind === "notify").length, 2);
});

test("la progression utilise le moteur, conserve le choix en attente et respecte la confirmation", async () => {
  const f = fixture();
  const definition = DEFAULT_HERO_CLASSES.find((item) => item.id === "warrior");
  const hero = new Hero({
    id: "hero",
    playerId: "player",
    name: "Ada",
    classId: "warrior",
    baseStats: definition.baseStats,
    experience: 100,
  });
  const progression = new HeroProgressionService({
    aptitudeDefinitions: [
      {
        id: "leadership",
        name: "Commandement",
        type: "passive",
        scope: "stats",
      },
      { id: "endurance", name: "Endurance", type: "passive", scope: "global" },
      { id: "tactics", name: "Tactique", type: "passive", scope: "stats" },
    ],
    now: () => 123,
  });
  let levels = 0;
  f.replace({
    ...f.session,
    hero,
    game: {
      ...f.session.game,
      getHeroProgress: () => progression.getProgress(hero),
      levelUpHero: () => {
        levels++;
        return progression.levelUp(hero, definition);
      },
      selectHeroLevelUp: ({ pendingId, upgradeId }) =>
        progression.selectUpgrade(hero, pendingId, upgradeId),
    },
  });
  await f.controller.render();
  await f.controller.openProgress();
  assert.equal(hero.level, 2);
  assert.equal(levels, 1);
  const oldChoose = f.progress.onChoose;
  await f.controller.openProgress();
  assert.equal(levels, 1);
  const pending = hero.pendingLevelUps[0];
  const choice = {
    pendingId: pending.id,
    upgradeId: pending.proposals[0].id,
    label: pending.proposals[0].name,
  };
  assert.equal(await oldChoose(choice), false);
  f.accept(false);
  assert.equal(await f.progress.onChoose(choice), false);
  assert.equal(hero.pendingLevelUps.length, 1);
  f.accept(true);
  assert.equal(await f.progress.onChoose(choice), true);
  assert.equal(hero.pendingLevelUps.length, 0);
  assert.equal(await f.progress.onChoose(choice), false);
});

test("un refus du moteur garde le choix de progression ouvert", async () => {
  const f = fixture();
  f.session.hero.pendingLevelUps = [{ id: "pending" }];
  f.session.game.selectHeroLevelUp = () => ({
    success: false,
    reason: "invalid_upgrade",
  });
  await f.controller.openProgress();
  assert.equal(
    await f.progress.onChoose({
      pendingId: "pending",
      upgradeId: "missing",
      label: "Missing",
    }),
    false,
  );
  assert.equal(
    f.calls.some(([kind]) => kind === "change"),
    false,
  );
  assert.match(f.calls.find(([kind]) => kind === "log")[1], /invalid_upgrade/);
});

test("les actions d'armée conservent leurs confirmations et leurs retours du moteur", async () => {
  const f = fixture();
  await f.controller.render();
  f.accept(false);
  await f.armyActions.disband("unit");
  assert.equal(
    f.calls.some(([kind]) => kind === "disbandUnit"),
    false,
  );
  f.accept(true);
  f.armyActions.selectUnit("unit");
  await f.armyActions.disband("unit");
  await f.controller.render();
  assert.equal(f.army.expandedArmyUnitId, null);
  await f.armyActions.applyOfficer("unit", "officer_drill");
  await f.armyActions.promote("unit");
  assert.deepEqual(f.calls.find(([kind]) => kind === "applyOfficerToUnit")[1], {
    playerId: "player",
    heroId: "hero",
    unitId: "unit",
    officerItemId: "officer_drill",
  });
  assert.deepEqual(f.calls.find(([kind]) => kind === "promoteUnit")[1], {
    heroId: "hero",
    unitId: "unit",
  });
  assert.equal(
    f.calls.some(
      ([kind, payload]) => kind === "show" && payload.title === "Niveau 2",
    ),
    true,
  );
});

test("l'inventaire ouvert préserve son contenu jusqu'au rafraîchissement explicite", async () => {
  const f = fixture();
  f.inventory(true, true);
  await f.controller.render();
  assert.equal(
    f.calls.some(([kind]) => kind === "inventory"),
    false,
  );
  await f.controller.renderInventory();
  assert.equal(f.calls.filter(([kind]) => kind === "inventory").length, 1);
  f.inventory(true, false);
  await f.controller.render();
  assert.equal(f.calls.filter(([kind]) => kind === "inventory").length, 2);
});


test("les états officiels annoncent les gains une seule fois sans rejouer la connexion", () => {
  const f = fixture();
  Object.assign(f.session.hero, { experience: 100, level: 2 });
  f.controller.render();
  assert.equal(f.calls.filter(([kind]) => kind === "show").length, 0);
  Object.assign(f.session.hero, { experience: 145, level: 3 });
  f.controller.render();
  f.controller.render();
  assert.deepEqual(f.calls.filter(([kind]) => kind === "show").map(([, reward]) => reward.title), ["+45 XP", "Niveau 3"]);
  f.session.hero.experience = 120;
  f.controller.render();
  f.session.hero.experience = 130;
  f.controller.render();
  assert.equal(f.calls.filter(([kind]) => kind === "show").at(-1)[1].title, "+10 XP");
  f.controller.reset();
  f.controller.render();
  f.replace({ ...f.session, hero: { ...f.session.hero, id: "another", experience: 500, level: 5 } });
  f.controller.render();
  assert.equal(f.calls.filter(([kind]) => kind === "show").length, 3);
});
