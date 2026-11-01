/** Génération exécutée par le moteur serveur, indépendante du DOM. */
export function generateBattlefield(seed) {
  const value = String(seed);
  let state = 2166136261;
  for (const char of value)
    state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let n = state;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
  const biomes = ["forest", "hill", "rock", random() < 0.5 ? "forest" : "hill"];
  for (let i = biomes.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [biomes[i], biomes[j]] = [biomes[j], biomes[i]];
  }
  const river = random() < 0.5;
  const cells = Array.from({ length: 5 }, (_, y) =>
    Array.from({ length: 3 }, (_, x) => ({
      terrain: river && y === 2 ? "water" : "grass",
      elevation: 0,
      structure:
        river && y === 2 && x === 1 ? { kind: "bridge", rotation: 90 } : null,
    })),
  );
  const sides = [
    [0, 1],
    [2, 1],
    [0, 3],
    [2, 3],
  ];
  sides.forEach(([x, y], i) => {
    cells[y][x].terrain = biomes[i];
    cells[y][x].elevation =
      biomes[i] === "rock" ? 2 : biomes[i] === "hill" ? 1 : 0;
  });
  const structures = ["tower", "barricade", "village"];
  const offset = Math.floor(random() * 4);
  structures.forEach((kind, i) => {
    const [x, y] = sides[(i + offset) % sides.length];
    cells[y][x].structure = { kind, rotation: 0 };
  });
  return {
    version: 2,
    generator: "mixed-battlefield-v2",
    seed: value,
    columns: 3,
    rows: 5,
    terrainEffectsEnabled: true,
    cells,
  };
}
