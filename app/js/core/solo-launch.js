import { GameSetup } from "./game-setup.js";
import { createMultiplayerLaunch } from "./multiplayer-launch.js";

/** Un seul joueur humain, avec les préférences du setup et une identité serveur. */
export function createSoloLaunch({
  lobby,
  playerId,
  setup,
  heroChoice,
  positionMode,
}) {
  const launch = createMultiplayerLaunch(lobby);
  launch.setup = new GameSetup({
    ...setup.toJSON(),
    id: launch.setup.id,
    participants: launch.setup.participants,
    teams: launch.setup.teams,
    playerCount: launch.setup.playerCount,
    rules: {
      ...setup.rules,
      minPlayers: launch.setup.playerCount,
      maxPlayers: launch.setup.playerCount,
    },
  });
  launch.heroChoices = [
    {
      playerId,
      choice: {
        ...heroChoice,
        name:
          lobby.launch.players.find((player) => player.id === playerId)?.name ??
          heroChoice.name,
      },
    },
  ];
  return {
    ...launch,
    positionMode,
    localPlayerId: playerId,
    isHost: true,
    solo: true,
  };
}
