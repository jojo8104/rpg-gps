import { Game } from "../../app/js/core/game.js";
import {
  createMultiplayerLaunch,
  createSeededIdGenerator,
} from "../../app/js/core/multiplayer-launch.js";
import { prepareScenarioLocationsForPlayArea } from "../../app/js/core/scenario-location-preparation.js";
import { applyPartyPreparation } from "../../app/js/core/party-preparation.js";
import { getScenarioBundle } from "./scenario-catalog.js";
import { LocationSpacingPolicy } from "../../app/js/core/location-spacing-policy.js";
import { selectPreparedWorld } from "./prepared-world-selection.js";

export function createPreparedGame(lobby, { now, questSystemEnabled }) {
  const {
    data,
    bindings: preparationBindings,
    catalog: preparationCatalog,
  } = getScenarioBundle(lobby.configuration.scenarioId);
  const role = lobby.configuration.preparation.organizerRole;
  const source = structuredClone(lobby);
  const selected = selectPreparedWorld(
    data,
    preparationBindings,
    preparationCatalog,
    lobby.configuration.preparation,
  );
  source.launch.configuration.preparation = selected.preparation;
  if (role !== "advanced-player")
    source.launch.players = source.launch.players.filter(
      (p) => p.id !== lobby.hostPlayerId,
    );
  if (!source.launch.players.length)
    throw new RangeError(
      "Invitez au moins un joueur pour ce rôle organisateur.",
    );
  const launch = createMultiplayerLaunch(source);
  const game = new Game({
    ...data,
    scenario: selected.scenario,
    setup: launch.setup,
    scenarioLocationBindings: selected.bindings,
    locations: prepareScenarioLocationsForPlayArea({
      scenario: selected.scenario,
      setup: launch.setup,
      bindings: selected.bindings,
      // Les lieux de démonstration non liés ne font pas partie du terrain IRL.
      locations: selected.locations,
    }),
    coordinateMode: "gps",
    scenarioStartsActive: false,
    questSystemEnabled,
    tacticalBattles: true,
    now,
    idGenerator: createSeededIdGenerator(launch.seed),
  });
  // Les coordonnées choisies dans la préparation ont priorité sur la génération.
  for (const { playerId, choice } of launch.heroChoices) {
    if (playerId === lobby.hostPlayerId && role !== "advanced-player") continue;
    game.chooseHero(playerId, choice);
  }
  game.chooseHero("bandits", { name: "Rask le brigand", classId: "warrior" });
  game.start();
  const spacing = new LocationSpacingPolicy({
    setup: game.setup,
    coordinateMode: "gps",
  });
  for (const [slotId, entry] of Object.entries(
    selected.preparation.locations,
  )) {
    if (entry.placement !== "random") continue;
    const id =
      preparationBindings.find((b) => b.locationSlotId === slotId)
        ?.locationId ?? slotId;
    const location = game.getLocation(id);
    entry.position = { ...location.position };
    const configured = lobby.configuration.preparation.locations[slotId];
    if (configured) configured.position = { ...location.position };
  }
  applyPartyPreparation(game, selected.preparation);
  // Le serveur ne déplace jamais un placement explicite pour résoudre un conflit.
  for (const [slotId, entry] of Object.entries(
    selected.preparation.locations,
  )) {
    if (!entry.position) continue;
    const location = game.getLocation(
      preparationBindings.find((b) => b.locationSlotId === slotId)
        ?.locationId ?? slotId,
    );
    const check = spacing.check(location, entry.position, game.locations);
    if (!check.success)
      throw new RangeError(
        `Le placement de ${location.name} chevauche ${game.getLocation(check.conflictingLocationId)?.name ?? check.conflictingLocationId}. Déplacez-le sur la carte.`,
      );
  }
  const capital = game.getLocationForScenarioSlot("capital");
  for (const hero of game.heroes.filter((h) =>
    source.launch.players.some((p) => p.id === h.playerId),
  ))
    hero.updatePosition(capital.position);
  return game;
}
