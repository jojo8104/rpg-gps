import { AutonomousGroup } from "../core/autonomous-group.js";
import { renderQuestEngineJournal } from "../ui/quest-engine-journal-view.js";
import {
  QUEST_SEQUENCE,
  missingProspectorsOffer,
} from "../core/scenario-quest-catalog.js";
import {
  buildQuestHudModel,
  buildQuestEngineHudModel,
} from "../ui/quest-hud.js";
import {
  renderQuestJournal,
  renderQuestOverlay,
} from "../ui/quest-journal-view.js";
import {
  renderQuestBadge,
  renderRoyalMessengerNotice,
  renderQuestGroupSheet,
} from "../ui/quest-notice-view.js";
// Possède le journal, les annonces et les intentions liées à la progression.
export function createQuestController({
  getSession,
  world,
  elements,
  asGps,
  distance,
  positionFor,
  rangesFor,
  rebuildLocationEngine,
  onChange,
  onMessage,
  logTest,
  deviceAlerts,
  showProgressReward,
  openScenario,
  selectScenarioChoice,
  focusLocation,
  selectLocation,
  showLocationOnMap,
  switchView,
  closeGroupSheet,
  closeGameMenu,
  bootstrap,
  now = () => Date.now(),
  schedule = setTimeout,
  cancel = clearTimeout,
  confirm = (text) => window.confirm(text),
  alert = (text) => window.alert(text),
  views = {},
}) {
  let pendingScenarioPlacementSlotId = null,
    lastReadyQuestActionId = null,
    questHudExpanded = false,
    pendingRoyalMessage = null,
    highlightedQuestOfferId = null,
    firstRoyalMessengerTimer = null,
    pendingRevealedLocationId = null,
    epoch = 0,
    firstMessageRevision = 0,
    locationMessage = "";
  const journalView = views.journal ?? renderQuestJournal;
  const overlayView = views.overlay ?? renderQuestOverlay;
  const badgeView = views.badge ?? renderQuestBadge;
  const noticeView = views.notice ?? renderRoyalMessengerNotice;
  const groupView = views.group ?? renderQuestGroupSheet;
  const setMessage = (text) => {
    locationMessage = text;
    onMessage(text);
  };
  function guarded(action) {
    const revision = epoch;
    const heroId = getSession().hero?.id;
    return (...args) => {
      if (
        revision !== epoch ||
        !getSession().game ||
        !getSession().hero ||
        getSession().hero.id !== heroId
      )
        return;
      return action(...args);
    };
  }
  function renderMessageNotice() {
    const id = pendingRoyalMessage?.id;
    noticeView({
      element: elements.notice,
      message: pendingRoyalMessage,
      onRead: guarded(() => {
        if (pendingRoyalMessage?.id === id) receiveRoyalQuestMessage();
      }),
    });
  }
  async function handleScenarioPositionUpdates(scenarioPlacements) {
    if (getSession().game?.questSystemEnabled === false) return;
    const { game } = getSession();

    for (const placement of scenarioPlacements)
      if (placement.quest) {
        world.updatePresentation("attacked-convoy");
        await applyQuestFeedback(placement.quest);
      }
    const readyPlacement = scenarioPlacements.find(
      (placement) =>
        placement.status === "ready" && placement.slotId !== "attacked-convoy",
    );
    if (readyPlacement) {
      pendingScenarioPlacementSlotId = readyPlacement.slotId;
      const alertId = `${game.scenarioState.currentPhaseId}:${readyPlacement.slotId}`;
      if (lastReadyQuestActionId !== alertId) {
        lastReadyQuestActionId = alertId;
        deviceAlerts.notify("notice");
        logTest("Objectif atteint : une nouvelle action est disponible.");
      }
    }
  }

  function summonRoyalQuestMessenger({
    id,
    title,
    text,
    focusLocationId = null,
    questId = null,
  }) {
    const { game, mode, positioning } = getSession();

    if (
      pendingRoyalMessage?.id === id ||
      game.getAutonomousGroup(`royal-messenger-${id}`)
    )
      return false;
    const origin = asGps(positioning.position);
    const position =
      mode === "simulation"
        ? { latitude: origin.latitude + 3, longitude: origin.longitude + 2 }
        : {
            latitude: origin.latitude,
            longitude:
              origin.longitude +
              12 /
                (111_320 *
                  Math.max(0.01, Math.cos((origin.latitude * Math.PI) / 180))),
          };
    const groupId = `royal-messenger-${id}`;
    game.addAutonomousGroup(
      new AutonomousGroup({
        id: groupId,
        type: "messenger",
        owner: { kind: "faction", id: "kingdom" },
        factionId: "kingdom",
        position,
        behavior: "passive",
        message: { id, title, text, focusLocationId, questId },
        history: [{ type: "royal_quest_notification", at: now() }],
      }),
    );
    pendingRoyalMessage = {
      id,
      groupId,
      title,
      text,
      focusLocationId,
      questId,
    };
    renderMessageNotice();
    deviceAlerts.notify("notice");
    logTest(`Messager royal : ${title}.`);
    onChange();
    return true;
  }

  function receiveRoyalQuestMessage() {
    const { game } = getSession();

    if (!pendingRoyalMessage) return false;
    const message = pendingRoyalMessage;
    pendingRoyalMessage = null;
    renderMessageNotice();
    game.removeAutonomousGroup(message.groupId);
    setMessage(`${message.title}\n\n${message.text}`);
    logTest(locationMessage);
    highlightedQuestOfferId = message.questId;
    if (message.focusLocationId) {
      focusLocation(message.focusLocationId);
    }
    onChange();
    switchView("quests");
    return true;
  }

  function isHeroAtCapital() {
    const { game, positioning } = getSession();

    const capital = game.getLocation("royal-capital");
    const position = positionFor("royal-capital");
    return Boolean(
      capital &&
        position &&
        distance(positioning.position, position) <=
          rangesFor(capital).interactionRadius,
    );
  }

  function announceMarshalConvocation(offer) {
    if (!offer) return false;
    if (isHeroAtCapital()) {
      setMessage(
        `Le maréchal est prêt à vous recevoir pour la mission « ${offer.title} ».`,
      );
      deviceAlerts.notify("notice");
      logTest(locationMessage);
      onChange();
      if (getSession().selectedLocationId === "royal-capital")
        selectLocation("royal-capital");
      return true;
    }
    return summonRoyalQuestMessenger({
      id: `marshal-convocation-${offer.id}`,
      title: "Convocation du maréchal",
      text: `Le maréchal vous convoque à la capitale pour vous confier une nouvelle mission : « ${offer.title} ».`,
      focusLocationId: "royal-capital",
      questId: offer.id,
    });
  }

  async function applyQuestFeedback(progress) {
    if (getSession().game?.questSystemEnabled === false) return;
    const { game, localPlayerId, positioning, enabledGpsLocationIds } =
      getSession();

    progress.appliedEvents ??= progress.appliedEvent
      ? [progress.appliedEvent]
      : [];
    const repressionNarrations = progress.appliedEvents
      .flatMap((e) => e.appliedEffects ?? [])
      .filter((e) => e.type === "narration" && e.scene);
    const narration = progress.appliedEvents
      .flatMap((entry) => entry.appliedEffects ?? [])
      .find((effect) => effect.type === "narration");
    const scenarioReport = progress.appliedEvents
      .flatMap((entry) => entry.appliedEffects ?? [])
      .find((effect) => effect.type === "scenario_report");
    const evacuationResult = progress.appliedEvents
      .flatMap((entry) => entry.appliedEffects ?? [])
      .find((effect) => effect.type === "evacuation_completed");
    const offeredQuest = progress.appliedEvents
      .flatMap((entry) => entry.appliedEffects ?? [])
      .find((effect) => effect.type === "quest_offered" && effect.offered);
    const revealedLocations = progress.appliedEvents
      .flatMap((entry) => entry.appliedEffects ?? [])
      .filter((effect) => effect.type === "location_revealed");
    await Promise.all(
      revealedLocations.map(async (effect) => {
        world.alignRevealedQuestLocation(effect.locationId);
        world.ensureRevealedLocationInsidePlayArea(effect.locationId);
        await game.discoverLocation({
          playerId: localPlayerId,
          locationId: effect.locationId,
          level: 2,
        });
        if (enabledGpsLocationIds !== null)
          enabledGpsLocationIds.add(effect.locationId);
      }),
    );
    if (revealedLocations.length > 0) rebuildLocationEngine();
    const revealed = revealedLocations[0]
      ? game.getLocation(revealedLocations[0].locationId)
      : null;
    const nextQuest = progress.nextPhaseId ? game.getActiveQuest() : null;
    const nextObjective =
      nextQuest?.objectives.find((objective) => objective.state === "active") ??
      null;
    const nextObjectiveMessage = nextObjective
      ? `\n\nNouvel objectif — ${nextQuest.title} : ${nextObjective.text}.`
      : "";
    setMessage(
      `${narration?.text ?? scenarioReport?.text ?? "Objectif accompli."}${revealed ? `\n\n${revealed.name} révélée sur la carte.` : ""}${nextObjectiveMessage}${evacuationResult ? `\n\nBilan : ${evacuationResult.result.score}/100 · ${evacuationResult.result.grade} · ${evacuationResult.people} habitant(s) sauvés.` : ""}`,
    );
    showQuestProgressFeedback(progress);
    if (repressionNarrations.length) openScenario(repressionNarrations);
    logTest(locationMessage);
    if (progress.nextPhaseId)
      await game.startCurrentScenarioPlacements(asGps(positioning.position));
    world.syncQuestTrace();
    world.syncQuestBattlefield();
    world.syncEvacuationCampSearch();
    if (offeredQuest)
      announceMarshalConvocation(
        game
          .getAvailableQuests()
          .find((quest) => quest.id === offeredQuest.questId),
      );
    if (revealed) {
      pendingRevealedLocationId = revealed.id;
      focusLocation(revealed.id);
    }
  }

  async function applyQuestChoiceFeedback(result) {
    if (getSession().game?.questSystemEnabled === false) return;
    const { game, localPlayerId, positioning, enabledGpsLocationIds } =
      getSession();

    await game.startCurrentScenarioPlacements(asGps(positioning.position));
    const effects = result.appliedEvent?.appliedEffects ?? [];
    const narration = effects.find((effect) => effect.type === "narration");
    const revealed = effects.filter(
      (effect) => effect.type === "location_revealed",
    );
    await Promise.all(
      revealed.map(async (effect) => {
        world.ensureRevealedLocationInsidePlayArea(effect.locationId);
        await game.discoverLocation({
          playerId: localPlayerId,
          locationId: effect.locationId,
          level: 2,
        });
        enabledGpsLocationIds?.add(effect.locationId);
      }),
    );
    if (revealed.length) rebuildLocationEngine();
    setMessage(narration?.text ?? "Votre décision est prise.");
    if (narration?.scene)
      openScenario(effects.filter((e) => e.type === "narration"));
    world.syncQuestTrace();
    onChange();
  }

  function showQuestProgressFeedback(progress) {
    const { game } = getSession();

    const phase = game.scenario?.getPhase(progress.phaseId);
    const completedState =
      game.scenarioState?.phaseStates?.[progress.phaseId]?.status;
    const questCompleted =
      progress.phaseCompleted &&
      progress.nextPhaseId === null &&
      completedState === "completed";
    if (questCompleted) {
      deviceAlerts.reward({ kind: "quest" });
      showProgressReward({
        caption: "Félicitations · Quête terminée !",
        title: "Quête terminée !",
        className: "is-quest-complete",
      });
      return;
    }
    const completedLabels = (progress.completedObjectiveIds ?? [])
      .map(
        (id) =>
          phase?.objectives.find((objective) => objective.id === id)?.text,
      )
      .filter(Boolean);
    deviceAlerts.reward({ kind: "questStep" });
    const objectiveCaption =
      completedLabels.join(" · ") || "Progression de la quête";
    showProgressReward({
      caption: `Objectif accompli · ${objectiveCaption}`,
      title: "Objectif accompli",
      className: "is-quest-step",
    });
  }

  async function startOfferedQuest(questId) {
    const { game, positioning } = getSession();

    const offer = game
      .getAvailableQuests()
      .find((quest) => quest.id === questId);
    if (!offer) return false;
    const accepted = await game.acceptAvailableQuest(questId);
    if (accepted == null) return;
    if (!accepted.success) {
      setMessage(`Impossible de démarrer la quête : ${accepted.reason}.`);
      onChange();
      return false;
    }
    await game.startCurrentScenarioPlacements(asGps(positioning.position));
    highlightedQuestOfferId = null;
    questHudExpanded = true;
    setMessage(`Quête démarrée avec votre accord — ${offer.title}.`);
    logTest(locationMessage);
    onChange();
    return true;
  }

  function questLocationTargets(quest) {
    const { game } = getSession();

    if (!quest) return [];
    const targets = new Map();
    quest.objectives.forEach((objective) => {
      const slotId = objective.trigger?.locationSlotId;
      if (!slotId) return;
      // Le serveur omet les associations des lieux encore inconnus du joueur.
      const binding = game.scenarioLocationBindings.find(
        (candidate) => candidate.locationSlotId === slotId,
      );
      const location = binding ? game.getLocation(binding.locationId) : null;
      const position = location ? positionFor(location.id) : null;
      if (location && position)
        targets.set(location.id, { id: location.id, name: location.name });
    });
    return [...targets.values()];
  }

  function render() {
    if (getSession().game?.questSystemEnabled === false) {
      const view = getSession().game.getQuestEngineView?.();
      overlayView({
        questHud: elements.hud,
        questHudModel: buildQuestEngineHudModel(view),
        questHudExpanded,
        onToggle: guarded(() => {
          questHudExpanded = !questHudExpanded;
          render();
        }),
      });
      if (elements.button) elements.button.hidden = !view?.enabled;
      if (view?.enabled && elements.journal)
        renderQuestEngineJournal(elements.journal, view);
      return;
    }
    const { game, hero, localPlayerId } = getSession();
    if (!game || !hero) return;
    const activeQuest = game.getActiveQuest();
    const availableQuests = game.getAvailableQuests();
    const questResult = game.getLastQuestResult();
    const activeQuestLocations = questLocationTargets(activeQuest);
    const placement =
      activeQuest && activeQuest.id !== "return-journey"
        ? Object.values(game.scenarioRuntime?.placements ?? {}).find(
            (candidate) =>
              candidate.status === "walking" || candidate.status === "ready",
          )
        : null;
    const activeDeadlines = [
      ...Object.values(game.evacuationStates),
      ...Object.values(game.questDeadlines),
    ].map((deadline) => ({
      ...deadline,
      label:
        deadline.label ??
        (deadline.id === "royal-camp-evacuation"
          ? "Arrivée de l’avant-garde"
          : "Temps restant"),
      endedAt:
        deadline.completedAt ??
        deadline.failedAt ??
        deadline.attackedAt ??
        null,
    }));
    const questHudModel = buildQuestHudModel({
      quest: activeQuest,
      placement,
      actionSlotId: pendingScenarioPlacementSlotId,
      locations: activeQuestLocations,
      deadlines: activeDeadlines,
      now: now(),
    });
    journalView({
      element: elements.journal,
      game,
      hero,
      localPlayerId,
      activeQuest,
      availableQuests,
      questResult,
      activeQuestLocations,
      placement,
      questHudModel,
      highlightedQuestOfferId,
      now: now(),
      onPlacement: guarded(confirmPlacement),
      onAbandon: guarded(abandon),
      showLocationOnMap: guarded(showLocationOnMap),
    });
    overlayView({
      questHud: elements.hud,
      questHudModel,
      questHudExpanded,
      onToggle: guarded(() => {
        questHudExpanded = !questHudExpanded;
        render();
      }),
      onPlacement: guarded(confirmPlacement),
      showLocationOnMap: guarded(showLocationOnMap),
      onChoice: guarded(async (choiceId) => {
        const result = await getSession().game.selectQuestChoice(choiceId);
        if (result == null) return;
        if (result.success) await applyQuestChoiceFeedback(result);
      }),
    });
    badgeView({ element: elements.button, availableQuests });
  }

  async function confirmPlacement() {
    return await world.confirmScenarioPlacement(pendingScenarioPlacementSlotId);
  }
  function cancelFirstMessage() {
    firstMessageRevision++;
    if (firstRoyalMessengerTimer !== null) cancel(firstRoyalMessengerTimer);
    firstRoyalMessengerTimer = null;
  }
  function reset() {
    epoch++;
    cancelFirstMessage();
    pendingRoyalMessage = null;
    highlightedQuestOfferId = null;
    pendingScenarioPlacementSlotId = null;
    lastReadyQuestActionId = null;
    pendingRevealedLocationId = null;
    questHudExpanded = false;
    locationMessage = "";
    renderMessageNotice();
    overlayView({
      questHud: elements.hud,
      questHudModel: null,
      questHudExpanded: false,
    });
    badgeView({ element: elements.button, availableQuests: [] });
  }
  async function dispatchLocationEvent(event) {
    if (getSession().game?.questSystemEnabled === false) return;
    const progress = await getSession().game.dispatchQuestEvent(event);
    if (progress == null) return;
    if (progress) await applyQuestFeedback(progress);
    return progress;
  }
  function onQuestAccepted(offer) {
    if (getSession().game?.questSystemEnabled === false) return;
    setMessage(`Nouvelle quête reçue du maréchal : ${offer.title}.`);
    logTest(locationMessage);
    render();
  }
  async function abandon() {
    const { game } = getSession();
    if (
      !confirm(
        "Abandonner cette quête ? Ses objectifs seront marqués comme échoués.",
      )
    )
      return;
    const result = await game.abandonCurrentQuest();
    if (result == null) return;
    if (!result) return;
    const narration = result.appliedEvent?.appliedEffects?.find(
      (effect) => effect.type === "narration",
    );
    setMessage(
      narration?.text ??
        (result.nextQuestId
          ? "Quête annulée. La suivante attend votre accord."
          : "Quête annulée. Aucune nouvelle quête n’est disponible."),
    );
    deviceAlerts.notify("notice");
    switchView("quests");
    onChange();
  }
  function startAdventure() {
    if (getSession().game?.questSystemEnabled === false) {
      cancelFirstMessage();
      const { multiplayer } = getSession();
      if (multiplayer.active && multiplayer.isHost) bootstrap();
      return;
    }
    const { game, activeAdventureId, multiplayer, mode } = getSession();
    cancelFirstMessage();
    if (activeAdventureId === "villages") {
      if (multiplayer.active && multiplayer.isHost) bootstrap();
      logTest(
        "Duel : rencontrez les chefs des villages pour obtenir leurs missions locales.",
      );
      return;
    }
    if (activeAdventureId !== "chaos") {
      const questId =
        activeAdventureId === "granaries_of_the_king"
          ? "granaries-of-the-king"
          : activeAdventureId;
      const quest = QUEST_SEQUENCE.find((entry) => entry.id === questId);
      if (quest) {
        game.offerQuest({ ...quest, briefingLines: [] });
        logTest(`Aventure sélectionnée : ${quest.title}.`);
      }
      if (multiplayer.active && multiplayer.isHost) bootstrap();
      return;
    }
    if (multiplayer.active) {
      const quest = missingProspectorsOffer();
      game.offerQuest(quest);
      if (multiplayer.isHost) bootstrap();
      announceMarshalConvocation(
        game.getAvailableQuests().find((entry) => entry.id === quest.id),
      );
      return;
    }
    const revision = epoch;
    const messageRevision = firstMessageRevision;
    firstRoyalMessengerTimer = schedule(() => {
      if (revision !== epoch || messageRevision !== firstMessageRevision)
        return;
      firstRoyalMessengerTimer = null;
      const { game } = getSession();
      if (!game) return;
      game.offerQuest(missingProspectorsOffer());
      announceMarshalConvocation(
        game
          .getAvailableQuests()
          .find((quest) => quest.id === "missing-prospectors"),
      );
    }, 10_000);
    logTest(
      `Mode ${mode === "gps" ? "GPS réel" : "simulation"} démarré. Le maréchal préparera ses ordres dans 10 secondes.`,
    );
  }
  async function battleResolved(battle) {
    if (getSession().game?.questSystemEnabled === false) return;
    const { game, hero, positioning } = getSession();
    if (!battle.sourceLocationId) return;
    const progress = await game.dispatchQuestEvent({
      type: battle.winnerTeamId === "heroes" ? "BattleWon" : "BattleLost",
      actorId: hero.id,
      locationId: battle.sourceLocationId,
      battleId: battle.id,
    });
    if (progress == null) return;
    if (battle.winnerTeamId === "heroes") {
      if (progress) await applyQuestFeedback(progress);
      return;
    }
    const effects = progress?.appliedEvent?.appliedEffects ?? [];
    if (effects.some((effect) => effect.scene))
      openScenario(effects.filter((effect) => effect.type === "narration"));
    const narration = effects.find((effect) => effect.type === "narration");
    if (narration) {
      setMessage(narration.text);
      logTest(locationMessage);
    }
    if (progress?.nextPhaseId)
      await game.startCurrentScenarioPlacements(asGps(positioning.position));
  }
  function tryOpenGroup(group, snapshot) {
    if (getSession().game?.questSystemEnabled === false) return;
    const { game, mode } = getSession();
    const royal =
      group.type === "messenger" &&
      group.message?.id === pendingRoyalMessage?.id;
    if (!royal && group.id !== "repression-provost") return false;
    groupView({
      element: elements.sheet,
      message: royal ? group.message : null,
      canTalk:
        snapshot.distance <= (mode === "gps" ? 18 : 8) &&
        game.scenarioState.currentPhaseId === "village-arrival",
      onClose: guarded(closeGroupSheet),
      onRead: guarded(() => {
        closeGroupSheet();
        receiveRoyalQuestMessage();
      }),
      onTalk: guarded(async () => await selectScenarioChoice("TALK_PROVOST")),
    });
    return true;
  }
  async function startDevQuest({ questId, participantCount }) {
    if (getSession().game?.questSystemEnabled === false) return;
    const { game, hero, localPlayerId, mode } = getSession();
    if (questId === "team-fort-test") {
      if (!game || mode !== "simulation") {
        alert(
          "Cette option nécessite une partie de test locale sur la carte fictive.",
        );
        return;
      }
      const result = await game.prepareTestQuest({
        playerId: localPlayerId,
        heroId: hero.id,
        questId,
        participantCount,
      });
      if (result == null) return;
      if (!result.success) {
        alert(
          result.reason === "hero_bag_full"
            ? "Libérez une place dans les bagages pour le mandat."
            : result.reason === "team_fort_already_started"
              ? "Cette mission est déjà lancée. Pour tester un autre effectif, commencez une nouvelle partie locale."
              : `Impossible de lancer la quête : ${result.reason}`,
        );
        return;
      }
      closeGameMenu();
      onChange();
      switchView("quests");
      return;
    }
    const quest = QUEST_SEQUENCE.find((candidate) => candidate.id === questId);
    if (!game || !quest) return;
    const activeQuest = game.getActiveQuest();
    if (
      activeQuest &&
      !confirm(
        `Interrompre « ${activeQuest.title} » et lancer « ${quest.title} » ?`,
      )
    )
      return;
    cancelFirstMessage();
    const prepared = await game.prepareTestQuest({
      playerId: localPlayerId,
      heroId: hero.id,
      questId,
    });
    if (!prepared?.success) {
      if (prepared)
        alert(`Impossible de préparer la quête : ${prepared.reason}`);
      return;
    }
    closeGameMenu();
    if (await startOfferedQuest(quest.id)) {
      switchView("quests");
      logTest(`Sélecteur dev : quête « ${quest.title} » lancée.`);
    }
  }
  return {
    render,
    reset,
    startAdventure,
    startDevQuest,
    battleResolved,
    tryOpenGroup,
    dispatchLocationEvent,
    onQuestAccepted,
    handleScenarioPositionUpdates,
    summonRoyalQuestMessenger,
    receiveRoyalQuestMessage,
    announceMarshalConvocation,
    applyQuestFeedback,
    applyQuestChoiceFeedback,
    startOfferedQuest,
    expandHud() {
      questHudExpanded = true;
    },
    clearPlacement() {
      pendingScenarioPlacementSlotId = null;
    },
    get pendingMessage() {
      return pendingRoyalMessage;
    },
    get pendingRevealedLocationId() {
      return pendingRevealedLocationId;
    },
    set pendingRevealedLocationId(value) {
      pendingRevealedLocationId = value;
    },
  };
}
