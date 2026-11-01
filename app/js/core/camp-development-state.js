export function campDevelopmentState(location, hero, camps, progression) {
  if (!["camp", "village", "town", "capital", "fort"].includes(location.type))
    return null;
  return {
    ...camps.getState(location, hero),
    progressionImprovementIds: camps.getProgressionImprovementIds(location),
    levelUp:
      location.type === "camp"
        ? camps.getLevelUpStatus(location, hero)
        : { eligible: false, reason: "location_is_not_a_camp" },
    evolutions:
      location.type === "camp" ? camps.getEvolutionState(location, hero) : [],
    experience: location.progression.experience,
    experienceRequired: progression.getExperienceRequired(location),
  };
}
