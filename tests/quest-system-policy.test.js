import test from "node:test";
import assert from "node:assert/strict";
import { Game } from "../app/js/core/game.js";
import { LobbyService } from "../server/lobby/lobby-service.js";
import { createMultiplayerLaunch } from "../app/js/core/multiplayer-launch.js";
import {
  QUEST_SYSTEM_ENABLED,
  isSuspendedQuestGroup,
} from "../app/js/core/quest-system-policy.js";

test("les anciennes poursuites de quête sont suspendues sans arrêter les groupes ordinaires", () => {
  const game = {
    questSystemEnabled: false,
    scenario: { events: [{ effects: [{ groupId: "pursuer" }] }] },
  };
  assert.equal(isSuspendedQuestGroup(game, { id: "pursuer" }), true);
  assert.equal(
    isSuspendedQuestGroup(game, {
      id: "quest-group",
      mission: { questId: "repression" },
    }),
    true,
  );
  assert.equal(
    isSuspendedQuestGroup(game, {
      id: "convoy",
      mission: { managedBy: "trading_post" },
    }),
    false,
  );
  game.questSystemEnabled = true;
  assert.equal(isSuspendedQuestGroup(game, { id: "pursuer" }), false);
});

function fixture() {
  const service = new LobbyService({
    questSystemEnabled: QUEST_SYSTEM_ENABLED,
  });
  const solo = service.startSolo({
    playerName: "Alice",
    connectionId: "solo",
    heroClassId: "warrior",
    configuration: { positionMode: "simulation" },
  });
  const launch = createMultiplayerLaunch(solo.lobby);
  const game = new Game({
    setup: launch.setup,
    coordinateMode: "simulation",
    heroClasses: [{ id: "warrior", name: "Guerrier", abilityIds: [] }],
    locations: [
      {
        id: "camp",
        name: "Camp",
        type: "camp",
        source: "test",
        position: { latitude: 40, longitude: 40 },
        population: 4,
      },
    ],
    scenario: {
      id: launch.setup.scenarioId,
      name: "Test",
      intro: "Test",
      initialPhaseId: "visit",
      locationSlots: [],
      phases: [
        {
          id: "visit",
          title: "Visite",
          description: "Visiter",
          objectives: [
            {
              id: "visit-camp",
              text: "Visiter",
              trigger: { type: "enterLocation", locationId: "camp" },
            },
          ],
          transitions: [],
        },
      ],
    },
  });
  game.chooseHero(solo.session.playerId, { name: "Alice", classId: "warrior" });
  game.chooseHero("bandits", { name: "Brigand", classId: "warrior" });
  game.start();
  return { service, solo, game };
}

test("le serveur impose le débranchement même à un instantané qui active les quêtes", () => {
  const { service, solo, game } = fixture();
  assert.equal(game.questSystemEnabled, true);
  const result = service.bootstrapGame({
    token: solo.session.token,
    snapshot: game.toJSON(),
  });
  assert.equal(result.state.questSystemEnabled, false);
  assert.throws(
    () =>
      service.executeGameCommand({
        token: solo.session.token,
        command: "prepareTestQuest",
        args: [{}],
      }),
    (error) => error.code === "quest_system_disabled",
  );
});

test("la progression, les effets et les délais restent intacts après débranchement et sauvegarde", () => {
  const { game } = fixture();
  game.questDeadlines.test = { expiresAt: 0 };
  const before = game.toJSON();
  const disabled = Game.fromJSON(before, { questSystemEnabled: false });
  disabled.dispatchQuestEvent({ type: "LocationEntered", locationId: "camp" });
  disabled.update();
  assert.deepEqual(disabled.scenarioState.toJSON(), before.scenarioState);
  assert.deepEqual(disabled.questDeadlines, before.questDeadlines);
  assert.equal(disabled.getActiveQuest(), null);
  assert.deepEqual(disabled.getAvailableQuests(), []);
  assert.equal(
    disabled.acceptAvailableQuest("anything").reason,
    "quest_system_disabled",
  );
  assert.equal(disabled.triggerScenarioEvent("anything"), null);
  assert.deepEqual(
    disabled.updateScenarioPosition({
      position: { latitude: 40, longitude: 40 },
    }),
    [],
  );
  assert.equal(Game.fromJSON(disabled.toJSON()).questSystemEnabled, false);
});

test("les missions locales et d'équipe sont indisponibles mais la conversation ordinaire subsiste", () => {
  const { game } = fixture();
  const disabled = Game.fromJSON(game.toJSON(), { questSystemEnabled: false });
  const hero = disabled.heroes[0];
  const camp = disabled.getLocation("camp");
  camp.heroIds.push(hero.id);
  camp.ownerId = camp.controllerId = hero.playerId;
  const conversation = disabled.getLocationChiefConversation({
    playerId: hero.playerId,
    heroId: hero.id,
    locationId: camp.id,
  });
  assert.ok(conversation);
  assert.ok(conversation.options.some((option) => option.kind === "dialogue"));
  assert.equal(
    conversation.options.some((option) =>
      /^(side:|team-fort:|quest:)/.test(option.id),
    ),
    false,
  );
  assert.equal(
    disabled.selectLocationChiefOption({
      playerId: hero.playerId,
      heroId: hero.id,
      locationId: camp.id,
      optionId: "side:anything",
    }).reason,
    "quest_system_disabled",
  );
  assert.deepEqual(disabled.teamFortQuestService.check(disabled), []);
});
