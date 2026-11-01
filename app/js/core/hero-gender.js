/** Identité visuelle sérialisable ; aucune incidence sur les caractéristiques. */
export function defaultHeroGender(classId) {
  return classId === "mage" || classId === "ranger" ? "female" : "male";
}

export function requireHeroGender(gender, classId) {
  const value =
    gender === undefined || gender === null
      ? defaultHeroGender(classId)
      : gender;
  if (value !== "female" && value !== "male")
    throw new RangeError("Genre du héros inconnu.");
  return value;
}
