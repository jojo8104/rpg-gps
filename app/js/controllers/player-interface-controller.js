import { renderHeroView, bindHeroView } from "../ui/hero-view.js";
import { renderArmyView, bindArmyView } from "../ui/army-view.js";
import {
  renderPlayerNotices,
  renderGhostNotice,
} from "../ui/player-interface-view.js";
import { renderInventoryView } from "../ui/inventory-view.js";
import { openHeroProgressView } from "../ui/hero-progress-view.js";
import { createProgressRewardView } from "../ui/progress-reward-view.js";
import { UNIT_RANKS } from "../core/rank-system.js";
import { formatInteger } from "../ui/number-format.js";
import { equipmentDisplay } from "../ui/equipment-display.js";
import { createExplorationAnnouncementPresenter } from "../ui/exploration-announcement-presenter.js";

// Les panneaux possèdent leurs sélections ; Game reste responsable des mutations.
export function createPlayerInterfaceController({
  elements,
  getSession,
  isInventoryActive = () => false,
  formatCooldown,
  onChange = () => {},
  log = () => {},
  alerts,
  classActions = {},
  confirm = (message) => window.confirm(message),
  views = {},
}) {
  const heroView = views.hero ?? renderHeroView;
  const explorationAnnouncements = createExplorationAnnouncementPresenter({
    log,
  });
  const armyView = views.army ?? renderArmyView;
  const bindHero = views.bindHero ?? bindHeroView;
  const bindArmy = views.bindArmy ?? bindArmyView;
  const inventoryView = views.inventory ?? renderInventoryView;
  const progressView = views.progress ?? openHeroProgressView;
  const noticesView = views.notices ?? renderPlayerNotices;
  const ghostView = views.ghost ?? renderGhostNotice;
  const rewards =
    views.rewards ??
    createProgressRewardView({ element: elements.rewardLayer });
  function showTravelReward(travel) {
    const kilometer = travel.completedKilometers > 0;
    alerts.reward({ kilometer });
    rewards.show({
      caption: `${(travel.completed500MeterSteps ?? 0) * 500} m`,
      title: "Distance parcourue",
      className: kilometer ? "is-kilometer" : "",
    });
  }
  const selection = {
    stat: null,
    trait: null,
    equipmentSlot: null,
    unit: null,
  };
  let wasReady = false,
    epoch = 0,
    dialog = null,
    identity = null,
    dialogRevision = 0;
  let powerState = {};
  let equipmentIntent = null;
  let lastProgress = null;

  function reset() {
    explorationAnnouncements.reset();
    epoch++;
    dialogRevision++;
    dialog?.close();
    dialog = null;
    rewards.reset();
    Object.assign(selection, {
      stat: null,
      trait: null,
      equipmentSlot: null,
      unit: null,
    });
    wasReady = false;
    identity = null;
    powerState = {};
    equipmentIntent = null;
    lastProgress = null;
    noticesView(elements.notices, { hero: 0, army: 0 });
    if (elements.ghostNotice) elements.ghostNotice.hidden = true;
  }
  function live() {
    const session = getSession();
    return session.game && session.hero ? session : null;
  }
  function guarded(action) {
    const revision = epoch;
    const heroId = getSession().hero?.id;
    return (...args) => {
      const session = live();
      if (!session || revision !== epoch || session.hero.id !== heroId) return;
      try {
        const result = action(session, ...args);
        return result?.catch
          ? result.catch((error) => {
              if (revision === epoch)
                log(`Action non confirmée : ${error.message}`);
              return false;
            })
          : result;
      } catch (error) {
        log(`Action non confirmée : ${error.message}`);
        return false;
      }
    };
  }
  function announce(progress) {
    if (!progress.canLevelUp) {
      wasReady = false;
      return;
    }
    if (wasReady) return;
    wasReady = true;
    alerts?.notify("notice");
    rewards.show({
      caption: "Progression prête",
      title: "Niveau disponible",
      className: "is-hero-level",
    });
  }
  function renderInventory() {
    const session = live();
    if (!session) return;
    inventoryView({
      element: elements.inventory,
      hero: equipmentIntent
        ? {
            ...session.hero,
            wagonSlotCount: session.hero.wagonSlotCount,
            ...equipmentDisplay(session.hero, equipmentIntent),
          }
        : session.hero,
      slotCount: session.hero.bagSlotCount,
      explorationView: session.game.explorationView,
    });
  }
  async function openProgress() {
    const session = live();
    if (!session) return;
    let { game, hero } = session;
    let progress = game.getHeroProgress(hero.id);
    let pending = hero.pendingLevelUps[0];
    if (!pending && progress.canLevelUp) {
      const result = await game.levelUpHero({ heroId: hero.id });
      if (result == null) return;
      if (!result.success) {
        log(`Evolution impossible : ${result.reason}.`);
        return;
      }
      pending = result.pending;
      ({ game, hero } = getSession());
      progress = game.getHeroProgress(hero.id);
      onChange();
    }
    dialog?.close();
    const revision = ++dialogRevision;
    dialog = progressView({
      hero,
      progress,
      pending,
      onChoose: guarded(
        async ({ game, hero }, { pendingId, upgradeId, label }) => {
          if (revision !== dialogRevision) return false;
          if (!hero.pendingLevelUps.some((item) => item.id === pendingId))
            return false;
          if (!confirm(`Choisir définitivement ${label} ?`)) return false;
          const result = await game.selectHeroLevelUp({
            heroId: hero.id,
            pendingId,
            upgradeId,
          });
          if (result == null) return;
          if (!result.success) {
            log(`Amélioration impossible : ${result.reason}.`);
            return false;
          }
          dialogRevision++;
          onChange();
          return true;
        },
      ),
    });
  }
  function heroActions() {
    return {
      openProgress: guarded(async () => await openProgress()),
      selectStat: guarded((_, stat) => {
        selection.stat = selection.stat === stat ? null : stat;
        selection.trait = null;
        render();
      }),
      selectTrait: guarded((_, trait) => {
        selection.trait =
          selection.trait?.id === trait.id &&
          selection.trait.type === trait.type
            ? null
            : trait;
        selection.stat = null;
        render();
      }),
      dismissDetails: guarded((_, { stat, trait }) => {
        const changed = (stat && selection.stat) || (trait && selection.trait);
        if (stat) selection.stat = null;
        if (trait) selection.trait = null;
        if (changed) render();
      }),
      classAction: guarded((_, action) => classActions[action]?.()),
      selectEquipmentSlot: guarded((_, slot) => {
        selection.equipmentSlot = slot;
      }),
      equip: guarded((session, packageId, slot) =>
        changeEquipment(session, {
          type: "equip",
          packageId,
          slot,
          itemId: session.hero.carriedLoot?.find(
            (entry) => entry.id === packageId,
          )?.itemId,
        }),
      ),
      unequip: guarded((session, slot) =>
        changeEquipment(session, { type: "unequip", slot }),
      ),
    };
  }
  async function changeEquipment({ game, hero }, request) {
    if (equipmentIntent) return;
    const revision = epoch;
    const intent = { ...request, heroId: hero.id };
    equipmentIntent = intent;
    selection.equipmentSlot = null;
    render();
    renderInventory();
    try {
      const { type, itemId, ...input } = request;
      const result = await game[
        type === "equip" ? "equipHeroItem" : "unequipHeroItem"
      ]({ playerId: hero.playerId, heroId: hero.id, ...input });
      if (
        revision === epoch &&
        live()?.hero.id === hero.id &&
        result?.success === false
      )
        log(`Équipement impossible : ${result.reason}.`);
      return result;
    } finally {
      if (revision === epoch && equipmentIntent === intent) {
        equipmentIntent = null;
        if (live()?.hero.id === hero.id) {
          render();
          renderInventory();
          onChange();
        }
      }
    }
  }
  function armyActions() {
    return {
      setFormation: guarded(async ({ game, hero }, unitId, slot) => {
        const result = await game.setArmyFormation({
          heroId: hero.id,
          unitId,
          slot,
        });
        if (result?.success) {
          log(
            slot === null
              ? "Troupe placée en réserve."
              : "Position de départ enregistrée.",
          );
          onChange();
        }
      }),
      selectUnit: guarded((_, unitId) => {
        selection.unit = unitId;
        render();
      }),
      disband: guarded(async ({ game, hero }, unitId) => {
        const unit = hero.army.getUnit(unitId);
        if (
          !unit ||
          !confirm(
            `Dissoudre définitivement ${unit.name ?? unit.typeId} ? Aucun remboursement ne sera accordé.`,
          )
        )
          return;
        const result = await game.disbandUnit({
          playerId: hero.playerId,
          heroId: hero.id,
          unitId,
        });
        if (result == null) return;
        if (result.success) {
          if (selection.unit === unitId) selection.unit = null;
          log(`${result.unit.name ?? result.unit.typeId} a été dissoute.`);
          onChange();
        }
      }),
      applyOfficer: guarded(async ({ game, hero }, unitId, officerItemId) => {
        const result = await game.applyOfficerToUnit({
          playerId: hero.playerId,
          heroId: hero.id,
          unitId,
          officerItemId,
        });
        if (result == null) return;
        log(
          result.success
            ? `Officier appliqué : +${formatInteger(result.experienceGained)} XP à l’unité.`
            : `Affectation impossible : ${result.reason}.`,
        );
        if (result.success) onChange();
      }),
      promote: guarded(async ({ game, hero }, unitId) => {
        const unit = hero.army.getUnit(unitId);
        const result = await game.promoteUnit({ heroId: hero.id, unitId });
        if (result == null) return;
        if (!result.success) log(`Promotion impossible : ${result.reason}.`);
        else {
          const name =
            unit?.name ??
            game.unitDefinitions.get(unit?.typeId)?.name ??
            "Unité";
          const rank =
            UNIT_RANKS.find((item) => item.id === result.rank)?.label ??
            result.rank;
          alerts?.reward({ kind: "unit" });
          rewards.show({
            caption: `${name} · ${rank}`,
            title: `Niveau ${result.level}`,
            className: "is-unit-level",
          });
        }
        onChange();
      }),
    };
  }
  function render(powers) {
    const session = live();
    if (!session) return;
    if (identity !== session.hero.id) {
      if (identity !== null) reset();
      identity = session.hero.id;
    }
    if (powers) powerState = powers;
    const { game, hero, data } = session;
    explorationAnnouncements.show(game.explorationView);
    const progress = game.getHeroProgress(hero.id);
    const current = { experience: hero.experience, level: hero.level };
    if (lastProgress) {
      const gain = current.experience - lastProgress.experience;
      if (gain > 0) {
        rewards.show({
          caption: "Expérience gagnée",
          title: `+${formatInteger(gain)} XP`,
        });
      }
      if (current.level > lastProgress.level) {
        alerts?.reward({ kind: "hero" });
        rewards.show({
          caption: "Niveau supérieur",
          title: `Niveau ${current.level}`,
          className: "is-hero-level",
        });
      }
    }
    lastProgress = current;
    announce(progress);
    ghostView({
      element: elements.ghostNotice,
      hero,
      base: game.getHeroBaseLocation(hero.id),
    });
    heroView({
      element: elements.hero,
      game,
      hero,
      data,
      equipmentHero: { ...hero, ...equipmentDisplay(hero, equipmentIntent) },
      pendingEquipmentSlot: equipmentIntent?.slot ?? null,
      formatCooldown,
      ...powerState,
      selectedHeroStat: selection.stat,
      selectedHeroTrait: selection.trait,
      selectedEquipmentSlotId: selection.equipmentSlot,
    });
    armyView({
      element: elements.army,
      game,
      hero,
      expandedArmyUnitId: selection.unit,
    });
    bindHero(elements.hero, heroActions());
    bindArmy(elements.army, armyActions());
    if (!isInventoryActive() || !elements.inventory.hasChildNodes())
      renderInventory();
    noticesView(elements.notices, {
      hero: progress.availableLevelUps + hero.pendingLevelUps.length,
      army: hero.army.units.filter((unit) => unit.canPromote).length,
    });
  }
  return {
    render,
    renderInventory,
    openProgress,
    reset,
    showReward: (reward) => rewards.show(reward),
    showTravelReward,
  };
}
