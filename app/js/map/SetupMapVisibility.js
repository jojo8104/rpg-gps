export function setupMapVisibility({
  setupActive = false,
  fogEnabled = true,
} = {}) {
  return {
    fogEnabled: setupActive ? false : fogEnabled,
    knownOnly: !setupActive,
    includeHiddenLocations: setupActive,
  };
}
