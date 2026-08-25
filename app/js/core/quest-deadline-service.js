import { distanceMeters } from "./geo.js";

/** Calcule un délai de quête depuis la géographie et le rythme choisi au setup. */
export class QuestDeadlineService {
  calculateMinutes({ origin, destination, paceMode = "calm", baseMinutes = 1, calmMetersPerMinute = 60, sportMetersPerMinute = 100, minimumMinutes = 1 }) {
    if (!origin || !destination) throw new TypeError("Les positions du délai de quête sont obligatoires.");
    if (!new Set(["calm", "sport"]).has(paceMode)) throw new RangeError("Le rythme de déplacement est invalide.");
    const speed = paceMode === "sport" ? sportMetersPerMinute : calmMetersPerMinute;
    if (![baseMinutes, speed, minimumMinutes].every((value) => Number.isFinite(value) && value > 0)) throw new RangeError("Les paramètres du délai doivent être positifs.");
    const distance = distanceMeters(origin, destination);
    return { distanceMeters: distance, paceMode, minutes: Math.max(minimumMinutes, Math.ceil(baseMinutes + distance / speed)) };
  }
}
