export const RESOURCE_CAMP_PRODUCTION_RATE = 1;
export const TERRAIN_CAMP_TYPES = Object.freeze({
  none: Object.freeze(["camp", "fort"]),
  wood: Object.freeze(["camp", "lumber-camp"]),
  stone: Object.freeze(["camp", "quarry"]),
  "fertile-land": Object.freeze(["camp", "village", "town"]),
  iron: Object.freeze(["camp", "mine"]),
  gold: Object.freeze(["camp", "mine"]),
});
export const CAMP_FOUNDATION_COST = Object.freeze({
  wood: 20,
  food: 10,
  exploration_tools: 1,
});
export const RESOURCE_CAMP_COST = Object.freeze({
  wood: 20,
  stone: 10,
  gold: 10,
});
export function normalizeCampTerrain(value) {
  if (value == null) return null;
  if (
    typeof value.cellId !== "string" ||
    !value.cellId ||
    !Object.hasOwn(TERRAIN_CAMP_TYPES, value.resource)
  )
    throw new RangeError("Terrain de camp invalide.");
  return { cellId: value.cellId, resource: value.resource };
}
export function terrainAllowsType(location, type) {
  return (
    !location.terrain ||
    TERRAIN_CAMP_TYPES[location.terrain.resource].includes(type)
  );
}
export function terrainAllowsBranch(location, branch) {
  return (
    terrainAllowsType(location, branch.targetType) &&
    (!branch.terrainResource ||
      location.terrain?.resource === branch.terrainResource)
  );
}
