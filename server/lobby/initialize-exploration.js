import { randomBytes } from "node:crypto";
import { generateExplorationState } from "../../app/js/core/exploration-generation.js";
import { generateLocalization } from "../../app/js/core/exploration-localization.js";
import { initializeClueItems } from "../../app/js/core/exploration-clue-service.js";

/** Lancement neuf uniquement ; jamais appelé lors d’une reprise officielle. */
export function initializeExploration(
  game,
  { seed = null, now = game.now } = {},
) {
  const state = game.explorationState;
  if (
    state.grid !== null ||
    state.generation !== null ||
    [
      state.cells,
      state.sites,
      state.clueSeries,
      state.clues,
      state.discoveries,
      state.searches,
      state.expeditions,
    ].some((entries) => entries.length)
  )
    return false;
  const generated = generateExplorationState(game, {
    seed: seed ?? randomBytes(16).toString("hex"),
    generatedAt: now(),
  });
  game.explorationState = initializeClueItems(
    game,
    generateLocalization(game, generated),
  );
  return true;
}
