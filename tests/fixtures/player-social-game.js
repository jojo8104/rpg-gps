import { Game } from "../../app/js/core/game.js";
export function socialGame({ enemy = false, allowPvP = false } = {}) {
  let id = 0;
  let at = 1000;
  const game = new Game({
    setup: {
      id: "social",
      name: "Partie",
      mode: "quick",
      scenarioId: "chaos",
      playerCount: 2,
      teams: [
        { id: "green", name: "Verts", factionId: "kingdom" },
        { id: "red", name: "Rouges", factionId: "bandits" },
      ],
      participants: [
        { playerId: "a", name: "Alice", teamId: "green" },
        { playerId: "b", name: "Bastien", teamId: enemy ? "red" : "green" },
      ],
      rules: { allowPvP, engagementRadiusMeters: 8 },
      playArea: {
        id: "area",
        name: "Parc",
        polygon: [
          { latitude: 0, longitude: 0 },
          { latitude: 0, longitude: 1 },
          { latitude: 1, longitude: 0 },
        ],
      },
    },
    heroClasses: [{ id: "warrior", name: "Guerrier", abilityIds: [] }],
    unitDefinitions: [
      {
        id: "militia",
        authorityCost: 1,
        stats: { attack: 1, defense: 1, speed: 1, range: 1 },
      },
    ],
    now: () => at,
    idGenerator: (prefix) => `${prefix}-${++id}`,
  });
  for (const player of game.players) {
    const hero = game.chooseHero(player.id, {
      name: player.name,
      classId: "warrior",
    });
    hero.updatePosition({ latitude: 0, longitude: 0 });
  }
  game.start();
  return { game, heroes: game.heroes, advance: (ms) => (at += ms) };
}
