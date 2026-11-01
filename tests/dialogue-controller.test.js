import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createDialogueController } from "../app/js/controllers/dialogue-controller.js";

const definition = JSON.parse(
  readFileSync(
    new URL("../data/scenarios/repression.json", import.meta.url),
    "utf8",
  ),
).dialogues.repression;

function fixture(overrides = {}) {
  const calls = [];
  let view;
  let session = {
    playerId: "player",
    heroId: "hero",
    locationId: "village",
    position: { latitude: 1, longitude: 2 },
    game: {
      getLocationChiefConversation: () => ({
        name: "Chef",
        title: "Village",
        openingLines: ["Bonjour", "Bienvenue"],
        options: [{ id: "local", label: "Parler" }],
      }),
      getQuestInteractionsForLocation: () => [],
      getAvailableQuests: () => [],
      selectLocationChiefOption: (input) => {
        calls.push(input);
        return {
          success: true,
          lines: ["Réponse"],
          options: [{ id: "trade", label: "Offres" }],
        };
      },
      scenario: { dialogues: { repression: definition } },
      scenarioState: { currentPhaseId: "negotiation" },
      getQuestChoices: () => [{ id: "negotiate", label: "Négocier" }],
      getActiveQuest: () => ({ description: "Mission" }),
      selectQuestChoice: () => ({ success: true }),
    },
  };
  const controller = createDialogueController({
    element: {},
    getSession: () => session,
    beforeOpen: () => calls.push("open"),
    prepareInteraction: (id) => calls.push(id),
    onQuestProgress: () => "Progression",
    onQuestChoice: () => {},
    onQuestAccepted: (offer) => calls.push(offer),
    onMessage: (message) => calls.push(message),
    onChange: () => calls.push("change"),
    onClose: (event) => calls.push(event),
    renderView: (model) => {
      view = model;
    },
    closeView: () => {
      view = null;
      calls.push("hidden");
    },
    ...overrides,
  });
  return {
    controller,
    calls,
    get view() {
      return view;
    },
    get session() {
      return session;
    },
    replaceSession(next) {
      session = next;
    },
  };
}

test("accueil, choix et réponse locale sont pilotés sans navigateur", async () => {
  const f = fixture();
  await f.controller.openLocation("village");
  assert.equal(f.view.lines[f.view.lineIndex], "Bonjour");
  f.view.onAdvance();
  assert.equal(f.view.lines[f.view.lineIndex], "Bienvenue");
  f.view.onAdvance();
  assert.equal(f.view.showChoices, true);
  await f.view.onChoose("local");
  assert.deepEqual(
    f.calls.find((call) => call?.optionId),
    {
      playerId: "player",
      heroId: "hero",
      locationId: "village",
      source: "chief",
      optionId: "local",
    },
  );
  assert.deepEqual(f.view.lines, ["Réponse"]);
  assert.deepEqual(f.view.conversation.options, [
    { id: "trade", label: "Offres" },
  ]);
  assert.equal(f.view.showChoices, false);
});

test("un choix utilise la session remplacée par le serveur", async () => {
  const f = fixture();
  await f.controller.openLocation("village", "forge");
  f.replaceSession({
    ...f.session,
    playerId: "new-player",
    heroId: "new-hero",
    game: {
      ...f.session.game,
      selectLocationChiefOption: (input) => {
        f.calls.push(input);
        return { success: false, reason: "hero_bag_full" };
      },
    },
  });
  await f.view.onChoose("local");
  assert.equal(f.calls.find((call) => call?.optionId).heroId, "new-hero");
  assert.equal(f.calls.find((call) => call?.optionId).source, "forge");
  assert.match(f.view.lines[0], /bagages sont pleins/);
});

test("les narrations changent de personnage et la fermeture transmet la suite du scénario", async () => {
  const f = fixture();
  await f.controller.openScenario([
    { speaker: "Prévôt", scene: "provost", text: "Halte" },
    { speaker: "Chevalier", scene: "knight", text: "Écoutez" },
  ]);
  assert.equal(f.view.conversation.name, "Prévôt");
  f.view.onAdvance();
  assert.equal(f.view.conversation.name, "Chevalier");
  assert.equal(f.view.conversation.portrait, definition.portraits.knight);
  f.session.game.scenarioState.currentPhaseId = "brigand-battle";
  await f.controller.close();
  assert.equal(f.view, null);
  assert.deepEqual(f.calls.at(-1), { battleLocationId: "brigand-camp-convoy" });
});

test("fermer ou réinitialiser neutralise les callbacks d'un ancien dialogue", async () => {
  const f = fixture();
  await f.controller.openLocation("village");
  const old = f.view;
  await f.controller.reset();
  await f.controller.openLocation("town");
  old.onAdvance();
  await old.onChoose("local");
  await old.onClose();
  assert.equal(f.view.lineIndex, 0);
  assert.equal(
    f.calls.some((call) => call?.optionId),
    false,
  );
  assert.equal(
    f.calls.some((call) => call?.battleLocationId !== undefined),
    false,
  );
});

test("un dialogue ouvert par un retour de quête conserve sa narration", async () => {
  let f;
  f = fixture({
    onQuestProgress: async () => {
      await f.controller.openScenario([
        { speaker: "Prévôt", scene: "provost", text: "Nouvelle scène" },
      ]);
      return "Mission avancée";
    },
  });
  f.session.game.getQuestInteractionsForLocation = () => [
    { interactionId: "talk", label: "Mission" },
  ];
  f.session.game.dispatchQuestEvent = () => ({ appliedEvents: [] });
  await f.controller.openLocation("village");
  await f.view.onChoose("quest-interaction:talk");
  assert.deepEqual(f.view.lines, ["Nouvelle scène"]);
  assert.equal(f.view.conversation.name, "Prévôt");
});

test("un choix de scénario refusé laisse le dialogue ouvert", async () => {
  const f = fixture();
  f.session.game.selectQuestChoice = () => ({ success: false });
  await f.controller.openScenario();
  await f.view.onChoose("repression:negotiate");
  assert.ok(f.view);
  assert.ok(
    f.calls.some(
      (call) => typeof call === "string" && call.includes("Rapprochez-vous"),
    ),
  );
});

test("les ordres du maréchal attendent discrètement et ignorent un second clic", async () => {
  const f = fixture();
  let finish,
    commands = 0;
  const offer = {
    id: "first",
    title: "Mission",
    description: "Retrouvez l’équipe",
    briefingLines: ["Ordres reçus"],
  };
  f.session.game.getAvailableQuests = () => [offer];
  f.session.game.acceptAvailableQuest = () => {
    commands++;
    return new Promise((resolve) => {
      finish = resolve;
    });
  };
  f.session.game.startCurrentScenarioPlacements = async () => [];
  f.controller.openLocation("royal-capital");
  const request = f.view.onChoose("accept-marshal-quest:first");
  assert.equal(f.view.pending, true);
  assert.equal(f.view.feedback, "");
  await f.view.onChoose("accept-marshal-quest:first");
  assert.equal(commands, 1);
  finish({ success: true });
  await request;
  assert.equal(f.view.pending, false);
  assert.equal(f.view.feedback, "");
  assert.equal(f.view.lines[0], "Ordres reçus");
});

test("une erreur serveur du maréchal reste visible dans le dialogue et permet de réessayer", async () => {
  const f = fixture();
  const offer = {
    id: "first",
    title: "Mission",
    description: "Retrouvez l’équipe",
    briefingLines: [],
  };
  f.session.game.getAvailableQuests = () => [offer];
  f.session.game.acceptAvailableQuest = async () => {
    throw new Error("Le serveur ne répond pas.");
  };
  f.controller.openLocation("royal-capital");
  await f.view.onChoose("accept-marshal-quest:first");
  assert.equal(f.view.pending, false);
  assert.match(f.view.feedback, /Le serveur ne répond pas/);
  f.session.game.acceptAvailableQuest = async () => ({ success: true });
  f.session.game.startCurrentScenarioPlacements = async () => [];
  await f.view.onChoose("accept-marshal-quest:first");
  assert.equal(f.view.feedback, "");
  assert.match(f.view.lines[0], /Retrouvez/);
});

test("le briefing du maréchal reste lisible si la préparation des lieux échoue", async () => {
  const f = fixture();
  f.session.game.getAvailableQuests = () => [
    {
      id: "first",
      title: "Mission",
      description: "Retrouvez l’équipe",
      briefingLines: ["Premier ordre", "Second ordre"],
    },
  ];
  f.session.game.acceptAvailableQuest = async () => ({ success: true });
  f.session.game.startCurrentScenarioPlacements = async () => {
    throw new Error("Préparation indisponible");
  };
  f.controller.openLocation("royal-capital");
  await f.view.onChoose("accept-marshal-quest:first");
  assert.equal(f.view.lines[0], "Premier ordre");
  assert.match(f.view.feedback, /Préparation indisponible/);
  f.view.onAdvance();
  assert.equal(f.view.lines[f.view.lineIndex], "Second ordre");
});

test("le briefing confirmé se lit pendant la préparation sans autoriser de nouveau choix", async () => {
  const f = fixture();
  let finish;
  f.session.game.getAvailableQuests = () => [
    {
      id: "first",
      title: "Mission",
      description: "Mission",
      briefingLines: ["Premier ordre", "Second ordre"],
    },
  ];
  f.session.game.acceptAvailableQuest = async () => ({ success: true });
  f.session.game.startCurrentScenarioPlacements = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  f.controller.openLocation("royal-capital");
  const request = f.view.onChoose("accept-marshal-quest:first");
  while (!finish) await Promise.resolve();
  assert.equal(f.view.pending, true);
  f.view.onAdvance();
  assert.equal(f.view.lines[f.view.lineIndex], "Second ordre");
  f.view.onAdvance();
  f.view.onAdvance();
  assert.equal(f.view.showChoices, false);
  finish([]);
  await request;
  assert.equal(f.view.pending, false);
  assert.equal(f.view.lineIndex, 2);
});

test("une acceptation terminée après fermeture ne rouvre pas le dialogue", async () => {
  const f = fixture();
  let finish;
  f.session.game.getAvailableQuests = () => [
    {
      id: "first",
      title: "Mission",
      description: "Mission",
      briefingLines: [],
    },
  ];
  f.session.game.acceptAvailableQuest = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  f.session.game.startCurrentScenarioPlacements = () =>
    assert.fail("ancien dialogue fermé");
  f.controller.openLocation("royal-capital");
  const request = f.view.onChoose("accept-marshal-quest:first");
  f.controller.close();
  finish({ success: true });
  await request;
  assert.equal(f.view, null);
});

test("une action du nouveau moteur ouvre sa scène sur un marqueur sans chef", async () => {
  const f = fixture();
  const request = {
    type: "act",
    instanceId: "missing-prospectors:solo:player",
    actionId: "inspect-first-trace",
  };
  const optionId = "engine:" + encodeURIComponent(JSON.stringify(request));
  f.session.game.getLocationChiefConversation = () => null;
  f.session.game.getLocation = () => ({ name: "Empreintes" });
  f.session.game.getQuestEngineView = () => ({
    enabled: true,
    offers: [],
    instances: [
      {
        id: request.instanceId,
        status: "active",
        actions: [
          {
            id: request.actionId,
            locationId: "trace",
            button: "Examiner les empreintes",
          },
        ],
      },
    ],
  });
  f.session.game.questEngineCommand = async (received) => {
    assert.deepEqual(received, request);
    return {
      success: false,
      reason: "dialogue_pending",
      dialogue: {
        lines: [{ speaker: "Votre héros", text: "La piste continue." }],
        choices: [{ id: "continue", label: "Continuer" }],
      },
    };
  };
  await f.controller.openLocation("trace", "chief", optionId);
  assert.equal(f.view.lines[0], "La piste continue.");
  assert.equal(f.view.conversation.name, "Votre héros");
  assert.equal(f.view.conversation.options.length, 1);
});
