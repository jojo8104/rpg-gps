/** Contexte local de la partie active, sans DOM ni règle du moteur. */
export function createGameSession() {
  return {
    game: null,
    hero: null,
    enemyHero: null,
    mode: "simulation",
    localPlayerId: "local",
    activeAdventureId: "chaos",
    locationMessage: "",
    currentEncounter: null,
    interactionEngine: null,
    rangePolicy: null,
    gpsSetupActive: false,
    capitalPlaced: false,
    enabledGpsLocationIds: null,
    manualSetupPlacements: new Map(),
    validatedPlayArea: null,
    playAreaGrid: null,
  };
}

/** Efface la partie locale en conservant les accès vivants des contrôleurs. */
export function resetGameSession(session) {
  Object.assign(session, createGameSession());
}

/** Les héros sont toujours recherchés dans le moteur reçu du serveur. */
export function adoptSessionGame(session, game) {
  session.game = game;
  session.hero =
    game.heroes.find((hero) => hero.playerId === session.localPlayerId) ?? null;
  session.enemyHero =
    game.heroes.find((hero) => hero.playerId === "bandits") ?? null;
}

/** Accès vivants pour les contrôleurs, même après restauration ou changement de partie. */
export function createSessionContext(session, dependencies = {}) {
  const context = Object.defineProperties(
    {},
    Object.getOwnPropertyDescriptors(dependencies),
  );
  for (const key of Object.keys(session)) {
    if (Object.hasOwn(context, key))
      throw new Error(`Dépendance réservée à la session : ${key}`);
    Object.defineProperty(context, key, {
      enumerable: true,
      get: () => session[key],
      set: (value) => {
        session[key] = value;
      },
    });
  }
  return context;
}
