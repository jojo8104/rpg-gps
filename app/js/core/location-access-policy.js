export const LOCATION_RELATIONS = Object.freeze({ OWNED: "owned", ALLIED: "allied", NEUTRAL: "neutral", ENEMY: "enemy" });

const ACTION_RELATIONS = Object.freeze({
  inspect: new Set(["owned", "allied", "neutral", "enemy"]),
  recruit: new Set(["owned", "allied", "neutral"]),
  reinforce: new Set(["owned", "allied", "neutral"]),
  heal: new Set(["owned", "allied", "neutral"]),
  collect: new Set(["owned", "allied", "neutral"]),
  deposit: new Set(["owned", "allied", "neutral"]),
  garrison: new Set(["owned", "neutral"]),
  withdrawGarrison: new Set(["owned", "allied", "neutral"]),
  attack: new Set(["enemy", "neutral"]),
});

/** Règle métier unique pour les relations et interactions avec les lieux. */
export class LocationAccessPolicy {
  constructor({ participants = [] } = {}) {
    this.teamByPlayerId = new Map(participants.map(({ playerId, teamId = null }) => [playerId, teamId]));
  }

  getRelation(playerId, location) {
    const controllerId = location.controllerId ?? location.ownerId;
    if (controllerId === null) return LOCATION_RELATIONS.NEUTRAL;
    if (controllerId === playerId) return LOCATION_RELATIONS.OWNED;
    const playerTeam = this.teamByPlayerId.get(playerId) ?? null;
    const controllerTeam = this.teamByPlayerId.get(controllerId) ?? null;
    return playerTeam !== null && playerTeam === controllerTeam ? LOCATION_RELATIONS.ALLIED : LOCATION_RELATIONS.ENEMY;
  }

  isDefender(playerId, location) {
    const relation = this.getRelation(playerId, location);
    return relation === LOCATION_RELATIONS.OWNED || relation === LOCATION_RELATIONS.ALLIED;
  }

  can(playerId, location, action) {
    const allowedRelations = ACTION_RELATIONS[action];
    if (allowedRelations === undefined) return false;
    if (!allowedRelations.has(this.getRelation(playerId, location))) return false;
    if (action === "recruit") return location.features.recruitment === true;
    if (action === "reinforce") return location.features.recruitment === true;
    if (action === "heal") return location.features.healing === true;
    if (action === "collect") return location.features.resourceProduction === true;
    if (action === "garrison" || action === "withdrawGarrison") return location.features.garrison === true;
    if (action === "attack") return location.features.battle === true || location.features.capturable === true;
    return true;
  }
}
