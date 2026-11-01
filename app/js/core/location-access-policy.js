import { hasDefaultLocationChief } from "./location-chief-catalog.js";

export const LOCATION_RELATIONS = Object.freeze({
  OWNED: "owned",
  ALLIED: "allied",
  NEUTRAL: "neutral",
  ENEMY: "enemy",
});

const ACTION_RELATIONS = Object.freeze({
  inspect: new Set(["owned", "allied", "neutral", "enemy"]),
  recruit: new Set(["owned", "allied", "neutral"]),
  reinforce: new Set(["owned", "allied", "neutral"]),
  heal: new Set(["owned", "allied", "neutral"]),
  train: new Set(["owned", "allied", "neutral"]),
  collect: new Set(["owned", "allied", "neutral"]),
  deposit: new Set(["owned", "allied", "neutral"]),
  manageReserves: new Set(["owned"]),
  dismantle: new Set(["owned"]),
  trade: new Set(["owned", "allied", "neutral"]),
  talkChief: new Set(["owned", "allied", "neutral"]),
  visitTavern: new Set(["owned", "allied", "neutral"]),
  garrison: new Set(["owned", "neutral"]),
  withdrawGarrison: new Set(["owned", "allied", "neutral"]),
  attack: new Set(["enemy", "neutral"]),
  build: new Set(["owned"]),
});

/** Règle métier unique pour les relations et interactions avec les lieux. */
export class LocationAccessPolicy {
  constructor({
    participants = [],
    alliedControllerIds = ["kingdom"],
    rules = {},
    enemyControllerIds = ["bandits", "chaos", "enemy", "rogue"],
  } = {}) {
    this.rules = rules;
    this.enemyControllerIds = new Set(enemyControllerIds);
    this.teamByPlayerId = new Map(
      participants.map(({ playerId, teamId = null }) => [playerId, teamId]),
    );
    this.alliedControllerIds = new Set(alliedControllerIds);
  }

  getRelation(playerId, location) {
    const controllerId = location.controllerId ?? location.ownerId;
    if (controllerId === null || controllerId === "neutral")
      return LOCATION_RELATIONS.NEUTRAL;
    if (controllerId === playerId) return LOCATION_RELATIONS.OWNED;
    const actorIsEnemy = this.enemyControllerIds.has(playerId);
    const targetIsEnemy =
      (this.enemyControllerIds.has(controllerId) ||
        !this.teamByPlayerId.has(controllerId)) &&
      !this.alliedControllerIds.has(controllerId);
    if (actorIsEnemy)
      return targetIsEnemy
        ? LOCATION_RELATIONS.ALLIED
        : LOCATION_RELATIONS.ENEMY;
    if (this.enemyControllerIds.has(controllerId))
      return LOCATION_RELATIONS.ENEMY;
    if (this.alliedControllerIds.has(controllerId))
      return LOCATION_RELATIONS.ALLIED;
    const playerTeam = this.teamByPlayerId.get(playerId) ?? null;
    const controllerTeam = this.teamByPlayerId.get(controllerId) ?? null;
    return playerTeam !== null && playerTeam === controllerTeam
      ? LOCATION_RELATIONS.ALLIED
      : LOCATION_RELATIONS.ENEMY;
  }

  isDefender(playerId, location) {
    const relation = this.getRelation(playerId, location);
    return (
      relation === LOCATION_RELATIONS.OWNED ||
      relation === LOCATION_RELATIONS.ALLIED
    );
  }

  canCapture(playerId, location) {
    if (
      !playerId ||
      playerId === "neutral" ||
      this.rules.allowCapture === false
    )
      return false;
    const controllerId = location.controllerId ?? location.ownerId;
    const relation = this.getRelation(playerId, location);
    if (["owned", "allied"].includes(relation)) return false;
    if (
      !this.enemyControllerIds.has(playerId) &&
      !this.enemyControllerIds.has(controllerId) &&
      this.teamByPlayerId.has(playerId) &&
      this.teamByPlayerId.has(controllerId)
    )
      return this.rules.allowPvP === true;
    return true;
  }

  can(playerId, location, action) {
    const allowedRelations = ACTION_RELATIONS[action];
    if (allowedRelations === undefined) return false;
    const missionAccess = ["build", "garrison", "collect", "deposit", "manageReserves"].includes(action) &&
      (this.teamFortQuests ?? []).some((quest) => quest.status === "active" &&
        quest.locationId === location.id && quest.playerIds.includes(playerId) &&
        (location.controllerId ?? location.ownerId) === quest.controllerId);
    if (!missionAccess && !allowedRelations.has(this.getRelation(playerId, location)))
      return false;
    if (
      (location.population ?? 1) === 0 &&
      !["inspect", "manageReserves", "dismantle", "attack"].includes(action)
    )
      return false;
    if (action === "recruit") return location.features.recruitment === true;
    if (action === "reinforce") return location.features.recruitment === true;
    if (action === "heal") return location.features.healing === true;
    if (action === "collect")
      return location.features.resourceProduction === true;
    if (action === "trade")
      return (
        location.features.trade === true ||
        (location.interactionIds.includes("local-chief-trade") &&
          (location.statistics.chiefTradeRemaining ?? 0) > 0)
      );
    if (action === "talkChief")
      return location.chief != null || hasDefaultLocationChief(location.type);
    if (action === "visitTavern")
      return (location.infrastructure.tavern ?? 0) > 0;
    if (action === "garrison" || action === "withdrawGarrison")
      return location.features.garrison === true;
    if (action === "attack")
      return (
        this.canCapture(playerId, location) &&
        (location.features.battle === true ||
          location.features.capturable === true)
      );
    return true;
  }
}
