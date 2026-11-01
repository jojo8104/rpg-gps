// Shared by local games and the authoritative server. Only committed activity calls this.
export const CAMP_ACTIVITY_EXPERIENCE = Object.freeze({
  trade: 5,
  recruitment: 10,
  reinforcement: 5,
  healing: 10,
  sideQuest: 40,
});

export function awardCampActivityExperience(progression, location, activity, count = 1) {
  if (location?.type !== "camp" || !Number.isFinite(count) || count <= 0) return 0;
  const amount = Math.ceil((CAMP_ACTIVITY_EXPERIENCE[activity] ?? 0) * count);
  if (amount > 0) progression.awardExperience(location, amount, `activity_${activity}`);
  return amount;
}

export function campProductionExperience(produced, recruits, cycles = 1, soldSurplus = 0) {
  const total = [...Object.values(produced), ...Object.values(recruits), soldSurplus]
    .reduce((sum, amount) => sum + Math.max(0, amount), 0);
  return Math.min(10 * cycles, Math.ceil(total));
}
