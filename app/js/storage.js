const STORAGE_KEY = "rpg-gps.game-snapshot.v1";

/** Persistance navigateur d'un instantané sérialisable du moteur. */
export function saveGameSnapshot(snapshot) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ savedAt: new Date().toISOString(), snapshot }));
}

export function loadGameSnapshot() {
  const value = localStorage.getItem(STORAGE_KEY);
  return value === null ? null : JSON.parse(value);
}

export function clearGameSnapshot() {
  localStorage.removeItem(STORAGE_KEY);
}
