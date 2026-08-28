import { distanceMeters, validatePosition } from "./geo.js";

const DEFAULT_CONFIG = {
  engagementRadiusMeters: 75,
  battleMarginMeters: 30,
  minBattleRadiusMeters: 50,
  maxBattleRadiusMeters: 250,
  fleeConfirmations: 2,
  fleeSafetyMarginMeters: 10,
};

/** Détermine uniquement la proximité physique d'un engagement. */
export class EngagementService {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    for (const [name, value] of Object.entries(this.config)) {
      if (!Number.isFinite(value) || value <= 0)
        throw new RangeError(`${name} doit être positif.`);
    }
  }

  canEngage(firstHero, secondHero) {
    if (
      firstHero?.state !== "active" ||
      secondHero?.state !== "active" ||
      firstHero.position === null ||
      secondHero.position === null
    )
      return false;
    return (
      distanceMeters(firstHero.position, secondHero.position) <=
      this.config.engagementRadiusMeters
    );
  }

  createContext(participants) {
    if (!Array.isArray(participants) || participants.length < 2)
      throw new RangeError("Un engagement exige au moins deux héros.");
    participants.forEach((participant) =>
      validatePosition(participant.position),
    );
    const center = {
      latitude:
        participants.reduce(
          (sum, participant) => sum + participant.position.latitude,
          0,
        ) / participants.length,
      longitude:
        participants.reduce(
          (sum, participant) => sum + participant.position.longitude,
          0,
        ) / participants.length,
    };
    const furthestDistance = Math.max(
      ...participants.map((participant) =>
        distanceMeters(center, participant.position),
      ),
    );
    const radiusMeters = Math.max(
      this.config.minBattleRadiusMeters,
      Math.min(
        this.config.maxBattleRadiusMeters,
        furthestDistance + this.config.battleMarginMeters,
      ),
    );
    return {
      center,
      radiusMeters,
      participantPositions: participants.map((participant) => ({
        heroId: participant.id,
        position: { ...participant.position },
      })),
    };
  }

  createTeamParticipants({ teams, context }) {
    if (!Array.isArray(teams) || teams.length < 2)
      throw new RangeError("La bataille requiert au moins deux équipes.");
    const present = new Set(
      context.participantPositions.map((item) => item.heroId),
    );
    if (
      teams.some((team) => team.heroIds.some((heroId) => !present.has(heroId)))
    )
      throw new RangeError("Un héros engagé n'a pas de position GPS.");
    return teams.map((team) => ({ id: team.id, heroIds: [...team.heroIds] }));
  }

  canJoinBattle(hero, context) {
    return (
      hero?.state === "active" &&
      hero.position !== null &&
      distanceMeters(hero.position, context.center) <= context.radiusMeters
    );
  }

  isOutsideBattleZone(position, context) {
    validatePosition(position);
    return (
      distanceMeters(position, context.center) >
      context.radiusMeters + this.config.fleeSafetyMarginMeters
    );
  }
}
