import assert from "node:assert/strict";
import test from "node:test";
import definition from "../data/quests/missing-prospectors.json" with { type: "json" };
import supply from "../data/quests/royal-fort-supply.json" with { type: "json" };
import { projectPlayerPayload } from "../server/realtime/player-projection.js";
import { createScenarioWorldController } from "../app/js/controllers/scenario-world-controller.js";
import scenarioDefinition from "../data/scenarios/chaos.json" with { type: "json" };
import {
  discoverNearbyLocations,
  mapLocationEnabled,
  playerMapVisibility,
} from "../app/js/core/player-map-visibility.js";
import { normalizeLocationAppearance } from "../app/js/core/scenario-location-appearance.js";
import { Game } from "../app/js/core/game.js";
import {
  ravitaillementService,
  installRavitaillement,
  ravitaillementView,
} from "../server/quests/ravitaillement-integration.js";
import { renderQuestEngineJournal } from "../app/js/ui/quest-engine-journal-view.js";

function fixture(coordinateMode = "gps") {
  let time = 1000,
    nextId = 0;
  const ids = [
    ...new Set(
      [definition, supply].flatMap((quest) =>
        quest.actions.map(
          (action) =>
            action.lieu ??
            action.origine ??
            action.destinataire ??
            action.targetLocationId,
        ),
      ),
    ),
  ];
  const lobby = {
    game: new Game({
      setup: {
        id: "prospectors",
        name: "Test",
        mode: "quick",
        scenarioId: "chaos",
        playerCount: 2,
        participants: [
          { playerId: "p1", name: "Joueur" },
          { playerId: "p2", name: "Adversaire" },
        ],
        playArea: {
          id: "area",
          name: "Zone",
          polygon: [
            { latitude: 0, longitude: 0 },
            { latitude: 0, longitude: 1 },
            { latitude: 1, longitude: 0 },
          ],
        },
      },
      scenario: {
        id: "chaos",
        name: "Test",
        intro: "Scénario de validation",
        initialPhaseId: "idle",
        locationSlots: ids.map((id) => ({
          id,
          type: "quest",
          appearance: scenarioDefinition.locationSlots.find(
            (slot) => slot.id === id,
          )?.appearance,
          world: scenarioDefinition.locationSlots.find((slot) => slot.id === id)?.world,
          defaultPlacement: { strategy: "fixed" },
        })),
        phases: [
          {
            id: "idle",
            title: "Ancien moteur désactivé",
            description: "Validation des quêtes à actions",
            objectives: [],
            transitions: [],
          },
        ],
      },
      scenarioLocationBindings: ids.map((id) => ({
        locationSlotId: id,
        locationId: "official-" + id,
      })),
      locations: ids.map((id, index) => ({
        id: "official-" + id,
        name: id,
        type: "quest",
        population: 10,
        source: "scenario",
        visibility: "hidden",
        position: { latitude: 0.01 + index * 0.001, longitude: 0.01 },
      })),
      heroClasses: [{ id: "warrior", name: "Guerrier", abilityIds: [] }],
      questSystemEnabled: false,
      coordinateMode,
      now: () => time,
      idGenerator: (prefix) => prefix + "-" + ++nextId,
    }),
  };
  const hero = lobby.game.chooseHero("p1", {
    name: "Joueur",
    classId: "warrior",
  });
  lobby.game.chooseHero("p2", { name: "Adversaire", classId: "warrior" });
  lobby.game.start();
  const now = () => time;
  installRavitaillement(lobby, now);
  let service = ravitaillementService(lobby, now),
    instanceId;
  const arrive = (id) => {
    const currentHero = lobby.game.getHero(hero.id);
    lobby.game.locations.forEach((location) => {
      location.heroIds = [];
    });
    const location = lobby.game.getLocation("official-" + id);
    currentHero.position = { ...location.position };
    location.heroIds = [hero.id];
  };
  const act = (actionId, extra = {}) =>
    service.command("p1", { type: "act", instanceId, actionId, ...extra });
  const accept = () => {
    arrive("capital");
    const result = service.command("p1", {
      type: "accept",
      questId: definition.id,
      mode: "solo",
    });
    assert.equal(result.success, true);
    instanceId = result.instance.id;
  };
  const advanceTo = (stopId) => {
    for (const action of definition.actions) {
      if (action.id === stopId) break;
      arrive(
        action.lieu ??
          action.origine ??
          action.destinataire ??
          action.targetLocationId,
      );
      const result = act(
        action.id,
        action.action === "Parler" ? { choiceId: "continue" } : {},
      );
      assert.equal(
        result.success,
        true,
        action.id + ": " + JSON.stringify(result),
      );
    }
  };
  const battle = (source = "gold-mine", winner = "friendly") => {
    const b = lobby.game.createBattle({
      teamParticipants: [
        { id: "friendly", heroIds: [hero.id] },
        {
          id: "enemy",
          heroIds: [lobby.game.heroes.find((h) => h.playerId === "p2").id],
        },
      ],
      sourceLocationId: "official-" + source,
      position: { latitude: 0.1, longitude: 0.1 },
    });
    b.status = "finished";
    b.winnerTeamId = winner;
    b.finishedAt = ++time;
    return b;
  };
  return {
    lobby,
    hero,
    now,
    arrive,
    accept,
    act,
    advanceTo,
    battle,
    resume() {
      lobby.game = Game.fromJSON(lobby.game.toJSON(), { now });
      service = ravitaillementService(lobby, now);
    },
    event(b) {
      service.dispatchOfficialEvent(
        { id: "battle:" + b.id, type: "BattleFinished", battleId: b.id },
        "p1",
      );
    },
  };
}

for (const mode of ["gps", "simulation"])
  test(
    "parcours serveur des prospecteurs, reprise et récompense unique en " +
      mode,
    () => {
      const f = fixture(mode);
      f.accept();
      assert.equal(f.act("rescue-geologist").success, false);
      f.advanceTo("defeat-mine-chaos");
      assert.equal(
        f.lobby.game
          .getPlayer("p1")
          .discoveredLocationIds.includes("official-gold-mine"),
        true,
      );
      assert.equal(
        f.act("defeat-mine-chaos", { battleId: "invented" }).success,
        false,
      );
      const wrong = f.battle("capital");
      assert.equal(
        f.act("defeat-mine-chaos", { battleId: wrong.id }).success,
        false,
      );
      const loss = f.battle("gold-mine", "enemy");
      assert.equal(
        f.act("defeat-mine-chaos", { battleId: loss.id }).success,
        false,
      );
      const win = f.battle();
      f.event(win);
      f.resume();
      const before = f.lobby.game.getHero(f.hero.id).experience;
      for (const action of definition.actions.slice(
        definition.actions.findIndex((a) => a.id === "find-geologist"),
      )) {
        f.arrive(action.lieu ?? action.origine ?? action.destinataire);
        assert.equal(
          f.act(
            action.id,
            action.action === "Parler" ? { choiceId: "continue" } : {},
          ).success,
          true,
          action.id,
        );
      }
      const hero = f.lobby.game.getHero(f.hero.id);
      assert.equal(hero.experience - before, 50);
      assert.equal(hero.resources.gold, 25);
      assert.equal(hero.carriedLoot.length, 0);
      assert.equal(f.act("deliver-report").success, false);
      assert.equal(hero.experience - before, 50);
      const view = ravitaillementView(f.lobby.game.toJSON(), "p1");
      assert.equal(view.instances[0].title, definition.title);
      assert.deepEqual(
        view.offers.map((o) => o.id),
        [supply.id],
      );
      const element = {};
      renderQuestEngineJournal(element, view);
      assert.match(element.innerHTML, /disparition des prospecteurs/);
      assert.doesNotMatch(element.innerHTML, /Ravitaillement terminé/);
      assert.equal(
        ravitaillementView(f.lobby.game.toJSON(), "p2").instances.length,
        0,
      );
    },
  );

test("accepter et dialoguer exige la présence officielle ; aucune récompense à l’abandon", () => {
  const f = fixture();
  assert.equal(
    ravitaillementService(f.lobby, f.now).command("p1", {
      type: "accept",
      questId: definition.id,
    }).reason,
    "not_at_quest_giver",
  );
  f.accept();
  f.arrive("royal-camp");
  assert.equal(f.act("receive-order", { choiceId: "continue" }).success, false);
  const instance = f.lobby.game.questEngineState.engine.instances[0];
  assert.equal(
    ravitaillementService(f.lobby, f.now).command("p1", {
      type: "abandon",
      instanceId: instance.id,
    }).success,
    true,
  );
  assert.equal(f.lobby.game.getHero(f.hero.id).experience, 0);
});

for (const mode of ["gps", "simulation"])
  test(
    "apparition déclarée par le scénario, isolée par joueur et conservée à la reprise en " +
      mode,
    () => {
      const f = fixture(mode);
      const visible = (slotId, playerId = "p1") =>
        mapLocationEnabled(
          f.lobby.game.getLocation("official-" + slotId),
          f.lobby.game,
          playerId,
        );
      assert.equal(visible("capital"), true);
      assert.equal(visible("royal-camp"), true);
      f.arrive("prospectors-trace-1");
      discoverNearbyLocations(f.lobby.game);
      assert.equal(visible("prospectors-trace-1"), false);
      assert.equal(
        f.lobby.game
          .getLocation("official-prospectors-trace-1")
          .heroIds.includes(f.hero.id),
        false,
      );
      assert.equal(
        playerMapVisibility(f.lobby.game.toJSON(), "p1").locations.has(
          "official-prospectors-trace-1",
        ),
        false,
      );
      f.accept();
      assert.equal(visible("royal-camp"), true);
      assert.equal(visible("royal-camp", "p2"), true);
      assert.equal(visible("prospectors-trace-1"), false);
      f.advanceTo("reach-first-trace");
      assert.equal(visible("prospectors-trace-1"), true);
      assert.equal(visible("prospectors-trace-2"), false);
      f.arrive("prospectors-trace-1");
      assert.equal(f.act("reach-first-trace").success, true);
      const dialogue = f.act("inspect-first-trace");
      assert.equal(dialogue.reason, "dialogue_pending");
      assert.equal(visible("prospectors-trace-2"), false);
      assert.equal(
        f.act("inspect-first-trace", { choiceId: "continue" }).success,
        true,
      );
      assert.equal(visible("prospectors-trace-2"), true);
      assert.equal(visible("prospectors-trace-1"), false);
      assert.equal(visible("prospectors-trace-2", "p2"), false);
      assert.equal(visible("prospectors-battlefield"), false);
      const saved = structuredClone(f.lobby.game.scenarioRuntime);
      f.resume();
      assert.deepEqual(f.lobby.game.scenarioRuntime, saved);
      assert.equal(visible("prospectors-trace-2"), true);
      const view = playerMapVisibility(f.lobby.game.toJSON(), "p1");
      assert.equal(view.locations.has("official-prospectors-trace-2"), true);
      assert.equal(
        view.locations.has("official-prospectors-battlefield"),
        false,
      );
      const controller = createScenarioWorldController({
        getSession: () => ({ game: f.lobby.game, localPlayerId: "p1" }),
      });
      assert.equal(
        controller.isLocationEnabled(
          f.lobby.game.getLocation("official-prospectors-trace-2"),
        ),
        true,
      );
      const state = f.lobby.game.toJSON();
      const projected = projectPlayerPayload(
        { code: "TEST", revision: 1, state },
        {
          playerId: "p1",
          lobby: {
            configuration: { gameType: "cooperation" },
            players: f.lobby.game.players,
          },
          gameSnapshot: { state },
          positions: { positions: [] },
          now: 1000,
        },
      ).state;
      assert.equal(
        projected.locations.some(
          (location) => location.id === "official-prospectors-trace-2",
        ),
        true,
      );
      assert.equal(
        projected.locations.some(
          (location) => location.id === "official-prospectors-battlefield",
        ),
        false,
      );
      assert.equal(
        projected.scenarioRuntime.placements["prospectors-battlefield"],
        undefined,
      );
      assert.doesNotThrow(() => Game.fromJSON(projected));
    },
  );

test("le contrat d’apparition refuse les déclencheurs inconnus et les actions manquantes", () => {
  assert.throws(
    () => normalizeLocationAppearance({ on: "unknown" }),
    /inconnu/,
  );
  assert.throws(
    () =>
      normalizeLocationAppearance({
        on: "ActionCompleted",
        questId: "missing-prospectors",
      }),
    /actionId/,
  );
  assert.deepEqual(normalizeLocationAppearance({ on: "immediate" }), {
    on: "immediate",
  });
  const f = fixture();
  f.lobby.game.scenario.locationSlots.find(
    (slot) => slot.id === "gold-mine",
  ).appearance.actionId = "typo";
  assert.throws(
    () => ravitaillementService(f.lobby, f.now),
    /Action d’apparition inconnue/,
  );
});
