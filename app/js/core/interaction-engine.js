import { Encounter } from "./encounter.js";

/** Donne un sens ludique aux événements techniques de localisation et de QR. */
export class InteractionEngine {
  constructor({ locations = [], enemyResolver = () => null, idGenerator = () => `encounter-${Date.now()}` } = {}) {
    this.locations = new Map(locations.map((location) => [location.id, location]));
    this.enemyResolver = enemyResolver; this.idGenerator = idGenerator;
  }
  handle(event, context = {}) {
    if (event.type === "LocationExited") return { type: "location_exited", locationId: event.locationId };
    if (!["LocationEntered", "QRTriggered"].includes(event.type)) return null;
    const location = this.locations.get(event.locationId); if (!location) return null;
    const enemy = this.enemyResolver({ location, event, context });
    if (enemy) {
      const aggressive = typeof enemy.aggressive === "function" ? enemy.aggressive(context) : enemy.aggressive === true;
      return { type: "encounter", encounter: new Encounter({ id: this.idGenerator(), actorId: event.actorId, locationId: location.id, enemy, aggressive }), autoBattle: aggressive };
    }
    if (location.roles?.includes("quest")) return { type: "quest", locationId: location.id };
    if (location.roles?.includes("resource") || location.type === "ruin") return { type: "explore", locationId: location.id };
    return { type: "location", locationId: location.id };
  }
}

