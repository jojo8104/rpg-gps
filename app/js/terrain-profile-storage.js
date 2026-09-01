const STORAGE_KEY = "rpg-gps-terrain-profile-v1";

/** Stocke uniquement la géométrie réutilisable du terrain, jamais la partie. */
export function saveTerrainProfile(playArea) {
  if (!playArea) throw new TypeError("Une zone validée est nécessaire.");
  const profile = {
    schemaVersion: 1,
    savedAt: Date.now(),
    playArea: playArea.toJSON(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  return structuredClone(profile);
}

export function loadTerrainProfile() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const profile = JSON.parse(raw);
  if (profile?.schemaVersion !== 1 || !profile.playArea)
    throw new Error("Le terrain enregistré utilise un format incompatible.");
  return structuredClone(profile);
}
