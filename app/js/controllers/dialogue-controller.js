import {
  buildScenarioDialogue,
  scenarioDialogueSpeaker,
} from "../core/scenario-dialogue.js";
import {
  questEngineOptions,
  questEngineOptionId,
} from "./quest-engine-presentation.js";
import { closeDialogueView, renderDialogueView } from "../ui/dialogue-view.js";

/** Possède la conversation ouverte et relie les intentions de la vue aux services du jeu.
 * La session est lue à chaque action pour suivre les remplacements d’état du serveur.
 */
export function createDialogueController({
  element,
  getSession,
  beforeOpen,
  prepareInteraction,
  onQuestProgress,
  onQuestChoice,
  onQuestAccepted,
  onMessage,
  onChange,
  onClose,
  renderView = renderDialogueView,
  closeView = closeDialogueView,
}) {
  let activeDialogue = null;
  function openScenario(entries = []) {
    if (getSession().game?.questSystemEnabled === false) return;
    const { game, locationId } = getSession();
    const phase = game.scenarioState?.currentPhaseId;
    const definition = game.scenario.dialogues.repression;
    const dialogue = buildScenarioDialogue({
      definition,
      phaseId: phase,
      entries,
      choices: game.getQuestChoices(),
      description: game.getActiveQuest()?.description ?? "",
    });
    activeDialogue = {
      repression: true,
      repressionEntries: entries,
      definition,
      locationId,
      conversation: dialogue.conversation,
      lines: dialogue.lines,
      lineIndex: 0,
      showChoices: false,
    };
    beforeOpen();
    renderActiveDialogue();
  }
  async function selectScenarioChoice(choiceId) {
    const { game, heroId } = getSession();
    const result = await game.selectQuestChoice(choiceId, { heroId });
    if (result == null) return;
    if (!result.success) {
      onMessage(
        "Rapprochez-vous du personnage pour poursuivre cette conversation.",
      );
      onChange();
      return;
    }
    await onQuestChoice(result);
    if (!result.appliedEvent?.appliedEffects?.some((e) => e.scene))
      openScenario([]);
  }
  async function openChiefDialogue(
    locationId,
    source = "chief",
    initialOptionId = null,
  ) {
    const conversation = conversationFor(locationId, source);
    if (!conversation) return;
    beforeOpen();
    activeDialogue = {
      locationId,
      source,
      conversation,
      lines: [...conversation.openingLines],
      lineIndex: 0,
      showChoices: false,
    };
    renderActiveDialogue();
    if (initialOptionId) {
      const displayed = activeDialogue;
      displayed.pending = true;
      renderActiveDialogue();
      try {
        await chooseDialogueOption(initialOptionId);
      } catch (error) {
        if (activeDialogue === displayed)
          displayed.feedback = `Action non confirmée : ${error.message}`;
      } finally {
        if (activeDialogue === displayed) {
          displayed.pending = false;
          renderActiveDialogue();
        }
      }
    }
  }

  function conversationFor(locationId, source = "chief") {
    const { game, playerId, heroId } = getSession();
    const engineOptions = questEngineOptions(game, locationId);
    const conversation =
      game.getLocationChiefConversation({
        playerId,
        locationId,
        heroId,
        source,
      }) ??
      (source === "chief" && engineOptions.length
        ? {
            name: game.getLocation(locationId)?.name ?? "Mission",
            title: "Quête",
            openingLines: [],
            options: [],
          }
        : null);
    if (!conversation) return null;
    if (["tavern", "equipment", "forge"].includes(source)) return conversation;
    conversation.options.unshift(...engineOptions);
    const questInteractions = game.getQuestInteractionsForLocation(locationId);
    conversation.options.unshift(
      ...questInteractions.map((interaction) => ({
        id: `quest-interaction:${interaction.interactionId}`,
        kind: "quest_interaction",
        label: interaction.label,
        responseLines: interaction.responseLines,
      })),
    );
    if (locationId === "royal-capital")
      conversation.options.unshift(
        ...game.getAvailableQuests().map((quest) => ({
          id: `accept-marshal-quest:${quest.id}`,
          kind: "quest_offer",
          label: `Recevoir les ordres : ${quest.title}`,
        })),
      );
    return conversation;
  }

  function renderActiveDialogue() {
    const { game } = getSession();
    if (!activeDialogue) return closeView(element);
    const displayedDialogue = activeDialogue;
    const narrativeEntry =
      activeDialogue.repressionEntries?.[activeDialogue.lineIndex];
    if (narrativeEntry) {
      Object.assign(
        activeDialogue.conversation,
        scenarioDialogueSpeaker(
          activeDialogue.definition,
          {
            ...narrativeEntry,
            speaker: narrativeEntry.speaker ?? activeDialogue.definition.title,
          },
          game.scenarioState?.currentPhaseId,
        ),
      );
    }
    renderView({
      element: element,
      conversation: activeDialogue.conversation,
      lines: activeDialogue.lines,
      lineIndex: activeDialogue.lineIndex,
      showChoices: activeDialogue.showChoices,
      pending: Boolean(activeDialogue.pending),
      feedback: activeDialogue.feedback ?? "",
      onClose: () => {
        if (activeDialogue === displayedDialogue) closeActiveDialogue();
      },
      onAdvance: () => {
        if (activeDialogue !== displayedDialogue) return;
        if (activeDialogue.lineIndex + 1 < activeDialogue.lines.length)
          activeDialogue.lineIndex += 1;
        else if (!displayedDialogue.pending) activeDialogue.showChoices = true;
        renderActiveDialogue();
      },
      onChoose: async (optionId) => {
        if (activeDialogue !== displayedDialogue || displayedDialogue.pending)
          return;
        displayedDialogue.pending = true;
        displayedDialogue.feedback = "";
        renderActiveDialogue();
        try {
          await chooseDialogueOption(optionId);
        } catch (error) {
          if (activeDialogue === displayedDialogue) {
            displayedDialogue.feedback = `Action non confirmée : ${error.message}`;
            onMessage?.(displayedDialogue.feedback);
          }
        } finally {
          displayedDialogue.pending = false;
          if (activeDialogue === displayedDialogue) {
            renderActiveDialogue();
          }
        }
      },
    });
  }

  async function chooseDialogueOption(optionId) {
    const { game, heroId, playerId, position } = getSession();
    if (optionId.startsWith("repression:"))
      return await selectScenarioChoice(optionId.slice(11));
    if (optionId === "repression-close") return closeActiveDialogue();
    if (!activeDialogue) return;
    const selectedDialogue = activeDialogue;
    let lines,
      narrativeSpeaker = null,
      narrativePortrait = null,
      narrativeCharacter = null,
      nextOptions = null;
    if (optionId.startsWith("engine:")) {
      const request = JSON.parse(decodeURIComponent(optionId.slice(7)));
      const result = await game.questEngineCommand(request);
      if (activeDialogue !== selectedDialogue || result == null) return;
      if (result.dialogue) {
        narrativePortrait = result.dialogue.portrait ?? null;
        narrativeCharacter = result.dialogue.portraitEditor ?? null;
        const speaker = result.dialogue.lines?.find(
          (line) => line?.speaker,
        )?.speaker;
        narrativeSpeaker = speaker ?? null;
        lines = (result.dialogue.lines ?? []).map((line) =>
          typeof line === "string" ? line : line.text,
        );
        const instanceId = request.instanceId ?? result.instance?.id;
        const actionId = request.actionId ?? result.actionId;
        nextOptions = (result.dialogue.choices ?? []).map((choice) => ({
          id: questEngineOptionId({
            type: "act",
            instanceId,
            actionId,
            choiceId: choice.id,
          }),
          label: choice.label,
        }));
      } else {
        lines = [
          result.success
            ? result.instance?.status === "completed"
              ? (game
                  .getQuestEngineView?.()
                  ?.instances.find(
                    (instance) => instance.id === request.instanceId,
                  )?.completionText ??
                "Mission accomplie. Votre journal est à jour.")
              : "Action confirmée. Votre journal est à jour."
            : ({
                not_at_location: "Rapprochez-vous du lieu.",
                quest_stock_insufficient:
                  "Les objets demandés ne sont plus disponibles.",
                resources_insufficient:
                  "Vous ne transportez pas assez de ressources.",
                action_not_active: "Cette action n’est plus disponible.",
              }[result.reason] ?? `Action refusée : ${result.reason}.`),
        ];
      }
    } else if (optionId.startsWith("accept-marshal-quest:")) {
      const questId = optionId.slice("accept-marshal-quest:".length);
      const offer = game
        .getAvailableQuests()
        .find((quest) => quest.id === questId);
      const accepted = offer
        ? await game.acceptAvailableQuest(questId)
        : { success: false };
      if (activeDialogue !== selectedDialogue) return;
      if (accepted == null)
        throw new Error("La quête n’a pas pu être acceptée. Réessayez.");
      if (accepted.success) {
        lines = offer.briefingLines?.length
          ? [
              ...offer.briefingLines,
              `Nouvelle quête — ${offer.title} : ${offer.description}`,
            ]
          : [offer.description, `Nouvelle quête — ${offer.title}.`];
        onQuestAccepted(offer);
        // Le briefing reçu reste lisible même si la préparation suivante échoue.
        activeDialogue.lines = lines;
        activeDialogue.lineIndex = 0;
        activeDialogue.showChoices = false;
        activeDialogue.conversation =
          conversationFor(activeDialogue.locationId, activeDialogue.source) ??
          activeDialogue.conversation;
        renderActiveDialogue();
        await game.startCurrentScenarioPlacements(position);
        if (activeDialogue !== selectedDialogue) return;
        if (questId === "royal-camp-evacuation") {
          prepareInteraction("receive-evacuation-order");
          const progress = await game.dispatchQuestEvent({
            type: "InteractionCompleted",
            interactionId: "receive-evacuation-order",
            locationId: activeDialogue.locationId,
          });
          if (progress == null) return;
          if (progress) {
            lines.push(await onQuestProgress(progress, { expandHud: true }));
          }
        }
      } else lines = ["Le maréchal n’a aucun nouvel ordre à vous confier."];
    } else if (optionId.startsWith("quest-interaction:")) {
      const selectedOption = activeDialogue.conversation.options.find(
        (option) => option.id === optionId,
      );
      const interactionId = optionId.slice("quest-interaction:".length);
      prepareInteraction(interactionId);
      const progress = await game.dispatchQuestEvent({
        type: "InteractionCompleted",
        interactionId,
        locationId: activeDialogue.locationId,
      });
      if (progress == null) return;
      const narration = progress?.appliedEvents
        .flatMap((entry) => entry.appliedEffects)
        .find((effect) => effect.type === "narration");
      lines = selectedOption?.responseLines?.length
        ? [...selectedOption.responseLines]
        : [
            narration?.text ??
              (progress
                ? "Votre mission est mise à jour."
                : "Nous avons déjà parlé de cela."),
          ];
      if (progress) {
        const message = await onQuestProgress(progress);
        lines = selectedOption?.responseLines?.length
          ? [...selectedOption.responseLines, message]
          : [message];
      }
    } else {
      const result = await game.selectLocationChiefOption({
        playerId,
        heroId,
        locationId: activeDialogue.locationId,
        optionId,
        source: activeDialogue.source,
      });
      if (result == null) return;
      lines = result.success
        ? (result.lines ?? [result.message])
        : [
            result.reason === "side_quest_unavailable"
              ? "Cette mission n’est plus disponible. Consultez les nouvelles propositions."
              : ({
                  hero_bag_full:
                    "Vos bagages sont pleins. Libérez un emplacement : l’objet restera disponible.",
                  insufficient_resources:
                    "Vous n’avez pas les ressources nécessaires.",
                  quest_item_required:
                    "Retrouvez l’objet demandé et placez-le dans vos bagages pour le remettre.",
                  item_offer_unavailable:
                    "Cet objet n’est plus disponible ici.",
                  clue_offer_unavailable:
                    "Ce parchemin n’est plus disponible ici. Consultez les nouvelles propositions.",
                  clue_not_carried: "Ce parchemin n’est plus dans vos bagages.",
                  rumor_unavailable:
                    "Vous connaissez déjà cette explication, ou la carte n’est plus disponible.",
                }[result.reason] ??
                `Conversation impossible : ${result.reason}.`),
          ];
      if (result.options) nextOptions = result.options;
    }
    if (activeDialogue !== selectedDialogue) return;
    activeDialogue.conversation =
      conversationFor(activeDialogue.locationId, activeDialogue.source) ??
      activeDialogue.conversation;
    if (narrativeSpeaker) activeDialogue.conversation.name = narrativeSpeaker;
    if (narrativeCharacter) {
      activeDialogue.conversation.appearance = narrativeCharacter.appearance;
      activeDialogue.conversation.portraitEditor = narrativeCharacter;
      activeDialogue.conversation.portrait = null;
    }
    if (narrativePortrait)
      activeDialogue.conversation.portrait = narrativePortrait;
    if (nextOptions) activeDialogue.conversation.options = nextOptions;
    if (activeDialogue.lines !== lines) activeDialogue.lineIndex = 0;
    activeDialogue.lines = lines;
    activeDialogue.showChoices = false;
    onChange();
    renderActiveDialogue();
  }

  function closeActiveDialogue() {
    if (!activeDialogue) return;
    const { game } = getSession();
    const battleLocationId = activeDialogue.repression
      ? (activeDialogue.definition.phases?.[game.scenarioState?.currentPhaseId]
          ?.battleLocationId ?? null)
      : null;
    activeDialogue = null;
    closeView(element);
    onClose({ battleLocationId });
  }

  return {
    openLocation: openChiefDialogue,
    openScenario,
    selectScenarioChoice,
    close: closeActiveDialogue,
    reset() {
      activeDialogue = null;
      closeView(element);
    },
  };
}
