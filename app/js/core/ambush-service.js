/** Calcule la portée, la réussite et les effets d'une embuscade sans dépendre de l'interface. */
export class AmbushService {
  constructor({ preparationDurationMs = 20_000 } = {}) {
    this.preparationDurationMs = preparationDurationMs;
  }

  engagementRange({ baseRange, attackerUnits = [], unitDefinitions }) {
    const soldiers =
      attackerUnits.reduce(
        (sum, unit) => sum + (unit.combatantCount ?? unit.quantity ?? 0),
        0,
      ) || 1;
    const useful = attackerUnits.reduce((sum, unit) => {
      const tags = unitDefinitions.get(unit.typeId)?.tags ?? [];
      const quantity = unit.combatantCount ?? unit.quantity ?? 0;
      return (
        sum +
        (tags.includes("ranged") ||
        (tags.includes("cavalry") && !tags.includes("heavy_armor"))
          ? quantity
          : 0)
      );
    }, 0);
    return baseRange * (1 + Math.min(0.5, (useful / soldiers) * 0.5));
  }

  resolve({
    attacker,
    defender,
    distance,
    maximumDistance,
    preparationMs = this.preparationDurationMs,
  }) {
    const preparation = Math.min(
      10,
      Math.floor(Math.max(0, preparationMs) / 2_000),
    );
    const signature = Math.round(
      (1 - clamp(attacker.signatureMultiplier ?? 1, 0, 1)) * 20,
    );
    const unitScore = this.#unitScore(attacker.units, attacker.unitDefinitions);
    const passive = this.#passiveScore(attacker.passiveIds, [
      "harassment",
      "scouting",
      "ambush_training",
    ]);
    const attackerTrain = this.#trainScore(
      attacker.trainLoad,
      attacker.trainCapacity,
    );
    const distancePenalty =
      distance <= maximumDistance * 0.5
        ? 0
        : distance <= maximumDistance * 0.75
          ? 3
          : 7;
    const attackScore =
      signature +
      preparation +
      unitScore +
      passive -
      attackerTrain -
      distancePenalty;

    const perception = Math.max(0, Math.round(defender.perception ?? 0));
    const scout = defender.classId === "ranger" ? 20 : 0;
    const vigilance = this.#passiveScore(defender.passiveIds, [
      "scouting",
      "vigilance",
      "ambush_awareness",
    ]);
    const movement = defender.moving ? 5 : 0;
    const defenderTrain = this.#trainScore(
      defender.trainLoad,
      defender.trainCapacity,
    );
    const defenseScore =
      perception + scout + vigilance + movement + defenderTrain;
    const margin = attackScore - defenseScore;
    const level =
      margin <= 0
        ? "cancelled"
        : margin < 10
          ? "light"
          : margin < 20
            ? "success"
            : "perfect";
    return {
      level,
      margin,
      attackScore,
      defenseScore,
      effects: effectsFor(level),
      details: {
        signature,
        preparation,
        unitScore,
        passive,
        attackerTrain,
        distancePenalty,
        perception,
        scout,
        vigilance,
        movement,
        defenderTrain,
      },
    };
  }

  #unitScore(units = [], definitions = new Map()) {
    return Math.min(
      10,
      units.reduce((score, unit) => {
        const tags = definitions.get(unit.typeId)?.tags ?? [];
        const quantity = unit.combatantCount ?? unit.quantity ?? 0;
        if (tags.includes("heavy_armor"))
          return score - Math.min(4, quantity * 0.5);
        if (tags.includes("cavalry") && !tags.includes("heavy_armor"))
          return score + Math.min(5, quantity * 0.5);
        if (tags.includes("ranged")) return score + Math.min(3, quantity * 0.3);
        return score;
      }, 0),
    );
  }

  #passiveScore(ids = [], relevant) {
    return ids.filter((id) => relevant.includes(id)).length * 5;
  }
  #trainScore(load = 0, capacity = 0) {
    return capacity > 0
      ? Math.round(clamp(load / capacity, 0, 1) * 10)
      : Math.min(10, Math.max(0, Math.round(load)));
  }
}

function effectsFor(level) {
  const values = {
    cancelled: [0, 1, 1],
    light: [4_000, 1.1, 0.95],
    success: [6_000, 1.15, 0.9],
    perfect: [8_000, 1.2, 0.85],
  }[level];
  return {
    durationMs: values[0],
    attackerAttackMultiplier: values[1],
    defenderDefenseMultiplier: values[2],
  };
}
function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
