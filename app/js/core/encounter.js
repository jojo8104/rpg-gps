export class Encounter {
  constructor({ id, actorId, locationId, enemy, aggressive = false }) {
    this.id = id; this.actorId = actorId; this.locationId = locationId;
    this.enemy = structuredClone(enemy); this.aggressive = aggressive;
    this.status = aggressive ? "attacking" : "awaiting_decision";
  }
  choose(action) {
    if (this.status !== "awaiting_decision" || !["fight", "avoid"].includes(action)) return false;
    this.status = action === "fight" ? "attacking" : "avoided"; return true;
  }
  toJSON() { return structuredClone({ id: this.id, actorId: this.actorId, locationId: this.locationId, enemy: this.enemy, aggressive: this.aggressive, status: this.status }); }
}

