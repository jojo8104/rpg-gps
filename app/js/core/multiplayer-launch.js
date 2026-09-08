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
  const players = lobby.launch.players;
  if (!Array.isArray(players) || players.length < 2)
    throw new Error("L’instantané de lancement ne contient pas assez de joueurs.");
  const configuration = lobby.launch.configuration;
  const difficulty = DIFFICULTY_RULES[configuration.difficulty];
  if (!difficulty)
    throw new Error("La difficulté de la partie est inconnue.");
  if (configuration.positionMode === "gps" && !lobby.launch.playArea)
    throw new Error("La zone GPS n’a pas été transmise par le serveur.");

  const participants = [
    ...players.map((player) => ({
      playerId: player.id,
      name: player.name,
    })),
    { playerId: "bandits", name: "Chef brigand" },
  ];
  const setup = new GameSetup({
    id: lobby.launch.id,
    name: `Partie ${lobby.code}`,
    mode: "quick",
    scenarioId: "chaos",
    playerCount: participants.length,
    participants,
    rules: {
      minPlayers: participants.length,
      maxPlayers: participants.length,
      enableContentment: difficulty.expertRules,
      locationMode: difficulty.expertRules ? "expert" : "casual",
      travelPaceMode: difficulty.travelPaceMode,
    },
    locationSetup: { density: difficulty.density },
    playArea:
      configuration.positionMode === "gps"
        ? lobby.launch.playArea
        : PROVISIONAL_PLAY_AREA,
  });
  return {
    setup,
    positionMode: configuration.positionMode,
    adventureId: configuration.scenarioId,
    difficulty: configuration.difficulty,
    heroChoices: players.map((player) => ({
      playerId: player.id,
      choice: createHeroChoice(player.name, player.heroClassId),
    })),
    seed: lobby.launch.seed,
  };
}

export function createSeededIdGenerator(seed) {
  let index = 0;
  const normalized = String(seed ?? "multiplayer").replace(/[^a-zA-Z0-9-]/g, "");
  return (prefix) => `${prefix}-${normalized}-${++index}`;
}

function createHeroChoice(name, classId) {
  const appearances = { warrior: "knight", ranger: "ranger", mage: "mage" };
  return {
    name,
    classId,
    appearanceId: appearances[classId] ?? "knight",
    ...(classId === "mage" ? { firstAptitudeId: "offensive_magic" } : {}),
  };
}
