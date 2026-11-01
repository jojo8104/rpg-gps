import { GameSetup } from "./game-setup.js";

const PROVISIONAL_PLAY_AREA = {
  id: "multiplayer-initial-area",
  name: "Zone multijoueur provisoire",
  polygon: [
    { latitude: -89, longitude: -179 },
    { latitude: -89, longitude: 179 },
    { latitude: 89, longitude: 0 },
  ],
};

const DIFFICULTY_RULES = {
  easy: { expertRules: false, travelPaceMode: "calm", density: "low" },
  normal: {
    expertRules: false,
    travelPaceMode: "calm",
    density: "balanced",
  },
  hard: { expertRules: true, travelPaceMode: "sport", density: "high" },
};

export function createMultiplayerLaunch(lobby) {
  if (lobby?.status !== "started" || !lobby.launch)
    throw new Error("La partie multijoueur n’est pas prête à démarrer.");
  const preparation = lobby.launch.configuration.preparation;
  const players =
    preparation?.enabled && preparation.organizerRole !== "advanced-player"
      ? lobby.launch.players.filter((p) => p.id !== lobby.hostPlayerId)
      : lobby.launch.players;
  if (!Array.isArray(players) || players.length < 1)
    throw new Error(
      "L’instantané de lancement ne contient pas assez de joueurs.",
    );
  const configuration = lobby.launch.configuration;
  const gameType = configuration.gameType ?? "cooperation";
  if (!["cooperation", "competition", "duel"].includes(gameType))
    throw new Error("Type de partie inconnu.");
  if (gameType === "duel" && players.length !== 2)
    throw new Error("Un duel exige exactement deux joueurs.");
  const difficulty = DIFFICULTY_RULES[configuration.difficulty];
  if (!difficulty) throw new Error("La difficulté de la partie est inconnue.");
  if (configuration.positionMode === "gps" && !lobby.launch.playArea)
    throw new Error("La zone GPS n’a pas été transmise par le serveur.");

  const participants = [
    ...players.map((player) => ({
      playerId: player.id,
      name: player.name,
      teamId: gameType === "cooperation" ? "green" : `team-${player.id}`,
    })),
    { playerId: "bandits", name: "Chef brigand", teamId: "red" },
  ];
  const setup = new GameSetup({
    id: lobby.launch.id,
    name: `Partie ${lobby.code}`,
    mode: "quick",
    scenarioId: configuration.scenarioId ?? "chaos",
    playerCount: participants.length,
    participants,
    teams: [
      ...(gameType === "cooperation"
        ? [{ id: "green", name: "Équipe commune", factionId: "kingdom" }]
        : players.map((player) => ({
            id: `team-${player.id}`,
            name: player.name,
            factionId: "kingdom",
          }))),
      { id: "red", name: "Équipe rouge", factionId: "bandits" },
    ],
    rules: {
      allowPvP: gameType !== "cooperation",
      minPlayers: participants.length,
      maxPlayers: participants.length,
      enableContentment: difficulty.expertRules,
      locationMode: difficulty.expertRules ? "expert" : "casual",
      travelPaceMode: configuration.travelPaceMode ?? difficulty.travelPaceMode,
    },
    locationSetup: {
      density: difficulty.density,
      ...(preparation?.enabled
        ? {
            placements: Object.fromEntries(
              Object.entries(preparation.locations ?? {}).flatMap(
                ([id, entry]) => {
                  if (["map", "qr"].includes(entry.placement) && entry.position)
                    return [
                      [id, { strategy: "fixed", position: entry.position }],
                    ];
                  if (
                    ["player-walk", "validated-cell"].includes(entry.placement)
                  )
                    return [
                      [
                        id,
                        {
                          strategy: entry.placement,
                          walkingDistanceMeters:
                            entry.walkingDistanceMeters ?? 300,
                        },
                      ],
                    ];
                  if (entry.placement === "random")
                    return [[id, { strategy: "random" }]];
                  return [];
                },
              ),
            ),
          }
        : {}),
    },
    playArea:
      configuration.positionMode === "gps"
        ? lobby.launch.playArea
        : PROVISIONAL_PLAY_AREA,
  });
  return {
    setup,
    prepared: Boolean(preparation?.enabled || lobby.launch.serverCreatedGame),
    ...(configuration.solo ? { solo: true } : {}),
    gameType,
    resumesSavedGame: Boolean(lobby.resume),
    positionMode: configuration.positionMode,
    adventureId: gameType === "duel" ? "villages" : configuration.scenarioId,
    difficulty: configuration.difficulty,
    heroChoices: players.map((player) => ({
      playerId: player.id,
      choice: createHeroChoice(
        player.name,
        player.heroClassId,
        player.heroGender,
      ),
    })),
    seed: lobby.launch.seed,
  };
}

export function createSeededIdGenerator(seed) {
  let index = 0;
  const normalized = String(seed ?? "multiplayer").replace(
    /[^a-zA-Z0-9-]/g,
    "",
  );
  return (prefix) => `${prefix}-${normalized}-${++index}`;
}

function createHeroChoice(name, classId, gender) {
  const appearances = { warrior: "knight", ranger: "ranger", mage: "mage" };
  return {
    name,
    classId,
    ...(gender ? { gender } : {}),
    appearanceId: appearances[classId] ?? "knight",
    ...(classId === "mage" ? { firstAptitudeId: "offensive_magic" } : {}),
  };
}
