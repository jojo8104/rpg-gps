/** Construit les vagues du Chaos sans dépendre de l'interface ou du GPS. */
export class ChaosWaveService {
  constructor({
    random = Math.random,
    idGenerator = () => `chaos-wave-${Date.now()}`,
  } = {}) {
    this.random = random;
    this.idGenerator = idGenerator;
  }

  create({
    playArea,
    locations,
    unitTypeId = "chaos-raider",
    now = Date.now(),
  }) {
    if (!playArea?.polygon?.length)
      throw new Error("Une zone de jeu est nécessaire pour créer une vague.");
    const targets = locations.filter(
      (location) => location.state !== "destroyed",
    );
    if (targets.length === 0)
      throw new Error("Une vague doit avoir au moins une cible.");
    const target = targets[Math.floor(this.random() * targets.length)];
    const edge = Math.floor(this.random() * playArea.polygon.length);
    const first = playArea.polygon[edge];
    const second = playArea.polygon[(edge + 1) % playArea.polygon.length];
    const ratio = 0.15 + this.random() * 0.7;
    const position = {
      latitude: first.latitude + (second.latitude - first.latitude) * ratio,
      longitude: first.longitude + (second.longitude - first.longitude) * ratio,
    };
    const tier = Math.min(4, 1 + Math.floor(this.random() * 4));
    const quantity = 3 + tier * 3;
    const id = this.idGenerator();
    return {
      id,
      type: "army",
      owner: { kind: "faction", id: "chaos" },
      factionId: "chaos",
      position,
      status: "idle",
      behavior: "aggressive",
      morale: 4 + tier,
      mission: {
        kind: "attack_location",
        targetId: target.id,
        speedMetersPerSecond: 0.8 + tier * 0.18,
        spawnedAt: now,
        threatTier: tier,
      },
      army: {
        units: [
          {
            id: `${id}-raiders`,
            ownerPlayerId: "chaos",
            typeId: unitTypeId,
            quantity,
            rank: "soldier",
          },
        ],
      },
      history: [
        {
          type: "chaos_wave_spawned",
          targetLocationId: target.id,
          threatTier: tier,
          at: now,
        },
      ],
    };
  }
}
