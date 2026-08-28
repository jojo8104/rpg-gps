const STORAGE_KEY = "rpg-gps-field-state-v1";

/** Conserve uniquement les diagnostics réutilisés au prochain lancement. */
export function saveFieldState({ mode, gpsAccuracyLog }) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        savedAt: new Date().toISOString(),
        mode,
        gpsAccuracyLog: gpsAccuracyLog?.toJSON() ?? null,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export function loadFieldState() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

export function clearFieldState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
