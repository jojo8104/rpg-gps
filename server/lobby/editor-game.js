import { Game } from "../../app/js/core/game.js";
import {
  createMultiplayerLaunch,
  createSeededIdGenerator,
} from "../../app/js/core/multiplayer-launch.js";
import { prepareScenarioLocationsForPlayArea } from "../../app/js/core/scenario-location-preparation.js";
import { getScenarioBundle } from "./scenario-catalog.js";

/** Nouveau monde d’un scénario installé, construit exclusivement par le serveur. */
export function createEditorGame(
  lobby,
  { now, questSystemEnabled },
  bundle = getScenarioBundle(lobby.configuration.scenarioId),
) {
  const launch = createMultiplayerLaunch(lobby);
  const { data, bindings } = bundle;
  if (lobby.configuration.positionMode === "simulation") {
    // Les coordonnées GPS ne sont pas des coordonnées de la carte fictive.
    // Le même moteur place et contrôle tous les lieux dans l’aire de test.
    launch.setup.locationSetup.placements = Object.fromEntries(
      data.scenario.locationSlots.map((slot) => [
        slot.id,
        { strategy: "random" },
      ]),
    );
  }
  const game = new Game({
    ...data,
    setup: launch.setup,
    scenarioLocationBindings: bindings,
    locations: prepareScenarioLocationsForPlayArea({
      scenario: data.scenario,
      setup: launch.setup,
      bindings,
      locations: data.locations,
    }),
    coordinateMode: lobby.configuration.positionMode,
    scenarioStartsActive: false,
    questSystemEnabled,
    tacticalBattles: true,
    now,
    idGenerator: createSeededIdGenerator(launch.seed),
  });
  for (const { playerId, choice } of launch.heroChoices)
    game.chooseHero(playerId, choice);
  game.chooseHero("bandits", { name: "Rask le brigand", classId: "warrior" });
  game.start();
  const start = game.getLocationForScenarioSlot("capital");
  if (start)
    for (const hero of game.heroes.filter((hero) =>
      lobby.launch.players.some((player) => player.id === hero.playerId),
    ))
      hero.updatePosition(start.position);
  return game;
}
