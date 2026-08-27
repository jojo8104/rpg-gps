const PROFILES = Object.freeze({
  calm: Object.freeze({ royalCampMeters: 150, firstTraceMeters: 60, secondTraceMeters: 80, battlefieldMeters: 100 }),
  sport: Object.freeze({ royalCampMeters: 300, firstTraceMeters: 120, secondTraceMeters: 150, battlefieldMeters: 200 }),
});

/** Distances IRL des quêtes selon le rythme choisi au setup. */
export function questPaceProfile(paceMode = "calm") {
  const profile = PROFILES[paceMode];
  if (!profile) throw new RangeError("Le rythme de déplacement doit être calm ou sport.");
  return profile;
}

export function distanceForPace(values, paceMode, fallback) {
  const selected = values?.[paceMode] ?? fallback;
  if (!Number.isFinite(selected) || selected <= 0) throw new RangeError("La distance de quête adaptée au rythme doit être positive.");
  return selected;
}
