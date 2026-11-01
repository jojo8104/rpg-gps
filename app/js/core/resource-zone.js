/** Gisement persistant mais caché tant qu'une prospection ne l'a pas révélé. */
export class ResourceZone {
  constructor({
    id,
    resourceId,
    locationType,
    position,
    discoveryRadius = 35,
    discoveredByPlayerIds = [],
    locationId = null,
    productionRate = 1,
  }) {
    this.id = text(id, "L'identifiant de la zone de ressource");
    this.resourceId = text(resourceId, "La ressource de la zone");
    this.locationType = text(locationType, "Le type de lieu produit");
    this.position = positionValue(position);
    if (!Number.isFinite(discoveryRadius) || discoveryRadius <= 0)
      throw new RangeError("Le rayon de découverte doit être positif.");
    if (!Number.isFinite(productionRate) || productionRate <= 0)
      throw new RangeError("La production de la zone doit être positive.");
    this.discoveryRadius = discoveryRadius;
    this.productionRate = productionRate;
    this.discoveredByPlayerIds = [...new Set(discoveredByPlayerIds.map((id) => text(id, "Le joueur ayant découvert la zone")))];
    this.locationId = locationId === null ? null : text(locationId, "Le lieu révélé");
  }

  discover(playerId, locationId = this.locationId) {
    const id = text(playerId, "Le joueur");
    const newlyDiscovered = !this.discoveredByPlayerIds.includes(id);
    if (newlyDiscovered) this.discoveredByPlayerIds.push(id);
    if (locationId !== null) this.locationId = text(locationId, "Le lieu révélé");
    return newlyDiscovered;
  }

  isDiscoveredBy(playerId) {
    return this.discoveredByPlayerIds.includes(playerId);
  }

  toJSON() {
    return {
      id: this.id,
      resourceId: this.resourceId,
      locationType: this.locationType,
      position: { ...this.position },
      discoveryRadius: this.discoveryRadius,
      discoveredByPlayerIds: [...this.discoveredByPlayerIds],
      locationId: this.locationId,
      productionRate: this.productionRate,
    };
  }
}

function text(value, label) {
  if (typeof value !== "string" || value.trim() === "")
    throw new TypeError(`${label} doit être un texte non vide.`);
  return value.trim();
}

function positionValue(position) {
  if (!position || !Number.isFinite(position.latitude) || !Number.isFinite(position.longitude))
    throw new TypeError("La position de la zone de ressource est invalide.");
  return { latitude: position.latitude, longitude: position.longitude };
}
