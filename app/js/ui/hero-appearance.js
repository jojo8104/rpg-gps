import { defaultHeroGender } from "../core/hero-gender.js";

export function heroPortrait(classId = "warrior", gender) {
  const resolvedClass = ["warrior", "mage", "ranger"].includes(classId)
    ? classId
    : "warrior";
  const resolvedGender = ["male", "female"].includes(gender)
    ? gender
    : defaultHeroGender(resolvedClass);
  return `assets/portraits/hero-${resolvedClass}-${resolvedGender}-anime-v2.png`;
}

export function heroClassName(classId, gender, fallback) {
  const names = { warrior: "Guerrier", ranger: "Éclaireur", mage: "Mage" };
  if (fallback && fallback !== names[classId]) return fallback;
  if (classId === "warrior")
    return gender === "female" ? "Guerrière" : "Guerrier";
  if (classId === "ranger")
    return gender === "male" ? "Éclaireur" : "Éclaireuse";
  return fallback ?? "Mage";
}
