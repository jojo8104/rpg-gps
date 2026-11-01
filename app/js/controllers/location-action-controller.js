import { formatInteger } from "../ui/number-format.js";

// Traduit les intentions des lieux en appels à Game. Les règles et autorisations
// restent dans le moteur ; les raccords aux autres écrans sont injectés.
export function createLocationActionController({
  getSession,
  handleScenarioAction,
  getAstralContext,
  openDialogue,
  onReachChanged,
  onChange,
  onMessage,
  onLog,
  onCapture,
  onBattle,
  openMarket,
  openTradingConvoyManager,
  openProspectingManager,
  openRelayMessage,
  executeLocationCommand,
  renderWorld,
  selectLocation,
  afterAction,
}) {
  let generation = 0;
  // Les vues émettent des intentions ; cette couche appelle l'API publique de Game.
  async function runAction(action, { returnToWorld = false } = {}) {
    const revision = generation;
    const { game, hero, playerId: localPlayerId, locationId } = getSession();
    if (action.startsWith("engine:")) {
      await openDialogue(locationId, "chief", action);
      return;
    }
    const scenario = await handleScenarioAction(action, locationId);
    if (scenario.handled) {
      if (!scenario.terminal) {
        onChange();
        afterAction({ action, returnToWorld });
      }
      return;
    }
    const location = game.getLocation(locationId);
    if (!location || !hero) return;
    let locationMessage = "";
    if (action === "astral-travel") {
      const result = await game.activateHeroAstralTravel({
        playerId: localPlayerId,
        heroId: hero.id,
      });
      if (result == null) return;
      locationMessage = result.success
        ? "Voyage astral actif pendant 10 secondes : glissez le fantôme sur une cible sur la carte."
        : `Voyage astral impossible : ${result.reason}.`;
      if (result.success) onReachChanged();
    } else if (action === "talk-chief") {
      await openDialogue(location.id);
      return;
    } else if (action === "visit-tavern") {
      await openDialogue(location.id, "tavern");
      return;
    } else if (action === "forge") {
      await openDialogue(location.id, "forge");
      return;
    } else if (action === "organize-evacuation") {
      const result = await game.organizeLocationEvacuation({
        playerId: localPlayerId,
        heroId: hero.id,
        locationId: location.id,
      });
      if (result == null) return;
      locationMessage = result.success
        ? `${result.people} habitant(s) embarqué(s) · ${result.dismantlings.length} bâtiment(s) en cours de démontage.`
        : result.reason === "insufficient_slots"
          ? `Évacuation impossible : ${result.requiredSlots} emplacement(s) libre(s) requis, ${result.freeSlots} disponible(s).`
          : `Évacuation impossible : ${result.reason}.`;
    } else if (action.startsWith("dismantle:")) {
      const structureId = action.slice("dismantle:".length);
      const result = await game.startLocationDismantling({
        playerId: localPlayerId,
        heroId: hero.id,
        locationId: location.id,
        structureId,
      });
      if (result == null) return;
      locationMessage = result.success
        ? `Démantèlement de ${structureId} commencé. Fin à ${new Date(result.task.deadline.expiresAt).toLocaleTimeString("fr-FR")}.`
        : `Démantèlement impossible : ${result.reason}.`;
    } else if (action.startsWith("dismantling:")) {
      locationMessage = "Ce bâtiment est déjà en cours de démantèlement.";
    } else if (action.startsWith("recruit:")) {
      const result = await game.recruitUnit({
        playerId: localPlayerId,
        heroId: hero.id,
        locationId: location.id,
        unitTypeId: action.split(":")[1],
      });
      if (result == null) return;
      locationMessage = result.success
        ? `Unité recrutée.${result.locationExperienceGained > 0 ? ` +${formatInteger(result.locationExperienceGained)} XP pour le camp.` : ""}`
        : `Impossible : ${result.reason}.`;
    } else if (action === "complete-units") {
      const result = await game.completeHeroUnits({
        playerId: localPlayerId,
        heroId: hero.id,
        locationId: location.id,
      });
      if (result == null) return;
      const added = result.reinforced.reduce(
        (sum, unit) => sum + unit.added,
        0,
      );
      locationMessage = result.success
        ? `${added} soldat(s) ont complété vos unités.`
        : `Renfort impossible : ${result.reason}.`;
    } else if (action === "heal-units") {
      const result = await game.healHeroUnits({
        playerId: localPlayerId,
        heroId: hero.id,
        locationId: location.id,
        timeUnits: 1,
      });
      if (result == null) return;
      locationMessage = result.success
        ? `${formatInteger(result.restoredHealth)} PV restauré(s) aux soldats.${result.locationExperienceGained > 0 ? ` +${formatInteger(result.locationExperienceGained)} XP pour le camp.` : ""}`
        : `Soin impossible : ${result.reason}.`;
    } else if (action.startsWith("reserve-balance:")) {
      const [, resourceName, targetHeroAmount] = action.split(":");
      const currentHeroAmount = Math.floor(
        hero.getResourceAmount(resourceName),
      );
      const difference = Number(targetHeroAmount) - currentHeroAmount;
      if (difference === 0) {
        locationMessage = "La répartition est déjà appliquée.";
        onMessage(locationMessage);
        onChange();
        return returnToWorld ? renderWorld() : selectLocation(locationId);
      }
      const direction = difference > 0 ? "to_hero" : "to_location";
      const result = await game.transferLocationResource({
        playerId: localPlayerId,
        heroId: hero.id,
        locationId: location.id,
        resourceName,
        amount: Math.abs(difference),
        direction,
      });
      if (result == null) return;
      const mood =
        result.contentmentDelta > 0
          ? ` · contentement +${result.contentmentDelta}`
          : result.contentmentDelta < 0
            ? ` · contentement ${result.contentmentDelta}`
            : "";
      locationMessage = result.success
        ? `${result.transferred} ${resourceName} transféré${mood}.`
        : `Transfert impossible : ${result.reason}.`;
    } else if (action.startsWith("production-transfer:")) {
      const [, resourceName, destination, amount] = action.split(":");
      const result = await game.transferLocationProduction({
        playerId: localPlayerId,
        heroId: hero.id,
        locationId: location.id,
        resourceName,
        amount: Number(amount),
        destination,
      });
      if (result == null) return;
      locationMessage = result.success
        ? `${result.transferred} ${resourceName} déplacé vers ${destination === "hero" ? "les bagages" : "les réserves"}.`
        : `Transfert impossible : ${result.reason}.`;
    } else if (action.startsWith("prepare-population:")) {
      const result = await game.preparePopulationPackages({
        playerId: localPlayerId,
        heroId: hero.id,
        locationId: location.id,
        people: Number(action.split(":")[1]),
      });
      if (result == null) return;
      locationMessage = result.success
        ? `${result.people} habitant(s) placés dans les réserves universelles.`
        : `Préparation impossible : ${result.reason}.`;
    } else if (action.startsWith("take-population:")) {
      const result = await game.takeLocationPopulationPackage({
        playerId: localPlayerId,
        heroId: hero.id,
        locationId: location.id,
        people: Number(action.split(":")[1]),
      });
      if (result == null) return;
      locationMessage = result.success
        ? `${result.people} habitant(s) placés dans les bagages.`
        : `Retrait impossible : ${result.reason}.`;
    } else if (action.startsWith("settle-population:")) {
      const result = await game.settlePopulationPackage({
        playerId: localPlayerId,
        heroId: hero.id,
        locationId: location.id,
        packageId: action.slice("settle-population:".length),
      });
      if (result == null) return;
      locationMessage = result.success
        ? `${result.people} habitant(s) installé(s).`
        : `Installation impossible : ${result.reason}.`;
    } else if (action.startsWith("deposit-resource:")) {
      const [resourceName, requestedAmount] = action
        .slice("deposit-resource:".length)
        .split(":");
      const amount =
        requestedAmount === undefined ? undefined : Number(requestedAmount);
      const result = await game.depositLocationResource({
        playerId: localPlayerId,
        heroId: hero.id,
        locationId: location.id,
        resourceName,
        amount,
      });
      if (result == null) return;
      locationMessage = result.success
        ? `${result.deposited} ${resourceName} déposé.`
        : `Dépôt impossible : ${result.reason}.`;
    } else if (action.startsWith("deposit-item:")) {
      const result = await game.depositLocationItem({
        playerId: localPlayerId,
        heroId: hero.id,
        locationId: location.id,
        lootId: action.slice("deposit-item:".length),
      });
      if (result == null) return;
      locationMessage = result.success
        ? `${result.item.quantity} ${result.item.itemId} déposé.`
        : `Dépôt impossible : ${result.reason}.`;
    } else if (action.startsWith("build-improvement:")) {
      const result = await game.buildCampImprovement({
        playerId: localPlayerId,
        heroId: hero.id,
        locationId: location.id,
        improvementId: action.slice("build-improvement:".length),
      });
      if (result == null) return;
      locationMessage = result.success
        ? `Amélioration construite · niveau ${result.level} · +${formatInteger(result.experienceGained)} XP.`
        : `Construction impossible : ${result.reason}.`;
    } else if (action === "level-up-camp") {
      const result = await game.levelUpCamp({
        playerId: localPlayerId,
        heroId: hero.id,
        locationId: location.id,
      });
      if (result == null) return;
      locationMessage = result.success
        ? `Le camp atteint le niveau ${result.level}.`
        : `Évolution impossible : ${result.status?.blockers?.join(" · ") || result.reason}.`;
    } else if (action.startsWith("evolve-camp:")) {
      const result = await game.evolveCamp({
        playerId: localPlayerId,
        heroId: hero.id,
        locationId: location.id,
        branchId: action.slice("evolve-camp:".length),
      });
      if (result == null) return;
      locationMessage = result.success
        ? `${location.name} est devenu ${{ village: "un village", fort: "un fort", "lumber-camp": "un camp de bûcheron", quarry: "une carrière", mine: "une mine" }[result.evolvedTo] ?? result.evolvedTo}.`
        : `Transformation impossible : ${result.status?.blockers?.join(" · ") || result.reason}.`;
    } else if (action === "trade") {
      openMarket(location.id);
      return;
    } else if (action === "collect-taxes") {
      const result = await game.collectLocationTaxes({
        playerId: localPlayerId,
        heroId: hero.id,
        locationId: location.id,
      });
      if (result == null) return;
      locationMessage = result.success
        ? `Impôts collectés : ${result.collected.gold} gold.${result.contentmentDelta < 0 ? ` Moral de la population : ${result.contentmentDelta} (${result.contentment}/100).` : ""}`
        : "Aucun impôt disponible ou collecte impossible dans ce lieu.";
    } else if (action === "manage-convoys") {
      openTradingConvoyManager(location.id);
      return;
    } else if (action === "academy-divination") {
      const result = await executeLocationCommand(
        "divineAtAcademy",
        {
          playerId: localPlayerId,
          heroId: hero.id,
          locationId: location.id,
        },
        () => revision === generation,
      );
      if (revision !== generation) return;
      locationMessage = result.success
        ? "Divination active pendant une minute."
        : "Divination indisponible : accès ou or insuffisant.";
      onLog(locationMessage);
      onReachChanged();
    } else if (action === "relay-message") {
      openRelayMessage(location.id);
      return;
    } else if (action === "manage-prospecting") {
      openProspectingManager(location.id);
      return;
    } else if (action === "battle") {
      const requirement = game.getLocationCaptureRequirement({
        playerId: localPlayerId,
        locationId: location.id,
      });
      if (requirement.state === "can_capture") {
        const capture = await game.attemptLocationCapture({
          playerId: localPlayerId,
          heroId: hero.id,
          locationId: location.id,
        });
        if (capture == null) return;
        locationMessage = capture.success
          ? "Lieu capturé sans combat."
          : `Capture impossible : ${capture.reason}.`;
        if (capture.success) {
          onMessage(locationMessage);
          onCapture();
          onLog(`${location.name} passe sous votre contrôle.`);
          onChange();
          if (returnToWorld) {
            renderWorld();
          } else selectLocation(location.id);
          return;
        }
      } else if (requirement.state === "quest_required")
        locationMessage = `Capture protégée par la quête ${requirement.objectiveId}.`;
      else await onBattle(location.id);
    } else return;
    if (revision !== generation) return;
    onMessage(locationMessage);
    onChange();
    afterAction({ action, returnToWorld });
  }
  return {
    async run(...args) {
      const revision = generation;
      try {
        return await runAction(...args);
      } catch (error) {
        if (revision === generation)
          onMessage(`Action non confirmée : ${error.message}`);
      }
    },
    reset() {
      generation++;
    },
  };
}
