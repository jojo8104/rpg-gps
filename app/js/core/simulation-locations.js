/** Catalogue de test indépendant des lieux et objectifs du scénario. */
export function createSimulationLocations() {
  const resources = [
    ["wood", "lumber-camp", "Exploitation de bois", 12, 18],
    ["stone", "quarry", "Carrière de pierre", 12, 50],
    ["iron", "mine", "Mine de fer", 12, 82],
    ["gold", "mine", "Mine d’or", 50, 88],
  ].map(([resource, type, name, latitude, longitude]) => ({
    id: `simulation-resource-${resource}`,
    name,
    type,
    position: { latitude, longitude },
    population: 8,
    resources: {
      production: { [resource]: 2 },
      productionStock: { [resource]: 4 },
      storageCapacity: 100,
    },
    features: {
      resourceProduction: true,
      capturable: true,
      garrison: true,
      battle: true,
    },
  }));
  const settlements = [
    ["camp", "Campement neutre", 50, 12, 8],
    ["village", "Village neutre", 85, 25, 40],
    ["town", "Ville neutre", 85, 75, 120],
  ].map(([type, name, latitude, longitude, population]) => ({
    id: `simulation-neutral-${type}`,
    name,
    type,
    position: { latitude, longitude },
    population,
    populationCapacity: population * 2,
    features: {
      capturable: true,
      garrison: true,
      battle: true,
      recruitment: true,
      healing: true,
      upgradeable: true,
    },
    recruitment: {
      availableUnitTypeIds: ["militia"],
      stock: { militia: 3 },
      production: { militia: 1 },
    },
  }));
  return [...resources, ...settlements].map((location) => ({
    source: "simulation",
    visibility: "visible",
    ownerId: null,
    controllerId: null,
    interactionRadius: 5,
    detectionRadius: 12,
    ...location,
  }));
}
