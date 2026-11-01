import {
  createPortraitAppearance,
  isPortraitAppearance,
  PORTRAIT_VARIANTS,
  PORTRAIT_VERSION,
  PORTRAIT_WIDTH_LIMITS,
  PORTRAIT_OPTIONAL_PARTS,
  withPortraitExpression,
} from "./portrait-catalog.js";
import { portraitColorKeys } from "./portrait-hair-colors.js";

export const PORTRAIT_EDITOR_GROUPS = Object.freeze({
  head: {
    label: "Tête et traits",
    parts: [
      "face",
      "eyes",
      "nose",
      "mouth",
      "forehead",
      "mouthLines",
      "eyeWrinkles",
    ],
  },
  hair: { label: "Coiffure avant et arrière", parts: ["hair", "hairBack"] },
  body: { label: "Cou et torse", parts: ["body"] },
  clothing: {
    label: "Vêtement et col arrière",
    parts: ["clothingBack", "clothing"],
  },
  eyes: { label: "Yeux", parts: ["eyes"] },
  nose: { label: "Nez", parts: ["nose"] },
  mouth: { label: "Bouche", parts: ["mouth"] },
  accessory: { label: "Accessoire", parts: ["accessory"] },
  headwear: { label: "Couvre-chef", parts: ["headwear"] },
  glasses: { label: "Lunettes", parts: ["glasses"] },
  prop: { label: "Lance, fourche ou bâton", parts: ["prop"] },
  mask: { label: "Foulard du visage", parts: ["mask"] },
  forehead: { label: "Rides du front", parts: ["forehead"] },
  mouthLines: { label: "Plis de la bouche", parts: ["mouthLines"] },
  eyeWrinkles: { label: "Pattes-d’oie", parts: ["eyeWrinkles"] },
});
export const PORTRAIT_EDITOR_LIMITS = Object.freeze({
  x: [-120, 120],
  y: [-160, 160],
  scaleX: [60, 140],
  scaleY: [60, 140],
  opacity: [0, 100],
});
export const PORTRAIT_SCENE_LIMITS = Object.freeze({
  x: [-150, 150],
  y: [-150, 150],
  scale: [60, 140],
});
export const defaultPortraitAdjustment = () => ({
  x: 0,
  y: 0,
  scaleX: 100,
  scaleY: 100,
  opacity: 100,
  visible: true,
});
export function createPortraitEditorState(gender = "female") {
  return {
    schema: "rpg-gps-portrait-editor",
    version: 1,
    appearance: {
      ...createPortraitAppearance({
        identity: "editor:fixed",
        gender,
        role: "mine",
        locationType: "mine",
      }),
      widthPercent: 100,
      beardOpacity: 100,
      additionalAccessories: [],
    },
    adjustments: Object.fromEntries(
      Object.keys(PORTRAIT_EDITOR_GROUPS).map((key) => [
        key,
        defaultPortraitAdjustment(),
      ]),
    ),
    scene: { x: 0, y: 0, scale: 100 },
    text: {
      name: "Chef des mineurs",
      place: "Mine de fer de la Couronne",
      line: "Bienvenue à la mine. Je dirige les mineurs.",
    },
    choices: false,
    guides: false,
    transparent: false,
    legacyNeck: null,
  };
}
export function selectPortraitEditorPart(state, part, index) {
  if (part === "accessory")
    return selectPortraitEditorAccessories(state, index === 0 ? [] : [index]);
  const appearance = { ...state.appearance };
  const gender = appearance.gender;
  if (PORTRAIT_OPTIONAL_PARTS.includes(part) && index === 0)
    appearance[part] = null;
  else {
    if (
      ![
        "face",
        "hair",
        "eyes",
        "nose",
        "mouth",
        "clothing",
        ...PORTRAIT_OPTIONAL_PARTS,
      ].includes(part) ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= PORTRAIT_VARIANTS[gender][part]
    )
      throw new Error("Pièce inconnue.");
    appearance[part] = `${gender}-${part}-${index}`;
  }
  if (part === "hair")
    appearance.hairBack =
      gender === "female" ? `${gender}-hairBack-${index}` : null;
  if (part === "clothing") {
    appearance.body = `${gender}-body-${index}`;
    appearance.clothingBack = `${gender}-clothingBack-${index}`;
  }
  if (!isPortraitAppearance(appearance))
    throw new Error("Assemblage incompatible.");
  return { ...state, appearance };
}
export function selectPortraitEditorAccessories(state, indices) {
  if (
    !Array.isArray(indices) ||
    indices.some(
      (i) =>
        !Number.isInteger(i) ||
        i < 1 ||
        i >= PORTRAIT_VARIANTS[state.appearance.gender].accessory,
    ) ||
    new Set(indices).size !== indices.length
  )
    throw new Error("Accessoires incompatibles.");
  const refs = indices.map((i) => `${state.appearance.gender}-accessory-${i}`);
  const appearance = {
    ...state.appearance,
    accessory: refs[0] ?? null,
    additionalAccessories: refs.slice(1),
    beardOpacity: 100,
  };
  if (!isPortraitAppearance(appearance))
    throw new Error("Accessoires incompatibles.");
  return { ...state, appearance };
}
export function selectPortraitEditorExpression(state, key) {
  return {
    ...state,
    appearance: withPortraitExpression(state.appearance, key),
  };
}
function bounded(value, min, max) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw new Error("Réglage hors limites.");
  return value;
}
/** Import explicite : aucun chemin, CSS ou HTML libre ne passe dans l’aperçu. */
export function parsePortraitEditorState(input) {
  const appearance = [5, 6, 7, 8, 9, 10, 11].includes(
    input?.appearance?.version,
  )
    ? {
        ...input.appearance,
        version: PORTRAIT_VERSION,
        neck: null,
        headwear: input.appearance.headwear ?? null,
        glasses: input.appearance.glasses ?? null,
        prop: input.appearance.prop ?? null,
        mask: input.appearance.mask ?? null,
        forehead: input.appearance.forehead ?? null,
        mouthLines: input.appearance.mouthLines ?? null,
        eyeWrinkles: input.appearance.eyeWrinkles ?? null,
        hairColor: portraitColorKeys(input.appearance).hair,
        beardColor: portraitColorKeys(input.appearance).beard,
        clothingBack: input.appearance.clothing?.replace(
          "-clothing-",
          "-clothingBack-",
        ),
      }
    : input?.appearance;
  // Reprendre les anciennes corpulences 50–180 dans la plage actuelle.
  const normalizedAppearance =
    appearance &&
    Number.isInteger(appearance.widthPercent) &&
    appearance.widthPercent >= 50 &&
    appearance.widthPercent <= 180
      ? {
          ...appearance,
          widthPercent: Math.max(
            PORTRAIT_WIDTH_LIMITS[0],
            Math.min(PORTRAIT_WIDTH_LIMITS[1], appearance.widthPercent),
          ),
        }
      : appearance;
  if (
    !input ||
    input.schema !== "rpg-gps-portrait-editor" ||
    input.version !== 1 ||
    !isPortraitAppearance(normalizedAppearance)
  )
    throw new Error("Ce fichier ne correspond pas à cet éditeur.");
  const base = createPortraitEditorState(appearance.gender);
  const legacyNeck = [5, 6].includes(input.appearance.version)
    ? input.adjustments?.neck
    : input.legacyNeck;
  if (legacyNeck) {
    if (typeof legacyNeck.visible !== "boolean")
      throw new Error("Ancien réglage du cou invalide.");
    const saved = {
      visible: legacyNeck.visible,
      ...Object.fromEntries(
        Object.entries(PORTRAIT_EDITOR_LIMITS).map(([field, [min, max]]) => [
          field,
          bounded(legacyNeck[field], min, max),
        ]),
      ),
    };
    if (
      Object.entries(defaultPortraitAdjustment()).some(
        ([key, value]) => saved[key] !== value,
      )
    )
      base.legacyNeck = saved;
  }
  base.appearance = Object.fromEntries(
    Object.keys(base.appearance).map((key) => [
      key,
      key === "beardOpacity"
        ? 100
        : key === "additionalAccessories"
          ? [...(appearance.additionalAccessories ?? [])]
          : ["widthPercent"].includes(key)
            ? (normalizedAppearance[key] ?? 100)
            : key === "hairColor"
              ? portraitColorKeys(appearance).hair
              : key === "beardColor"
                ? appearance.beardColor === null
                  ? null
                  : portraitColorKeys(appearance).beard
                : appearance[key],
    ]),
  );
  for (const key of Object.keys(PORTRAIT_EDITOR_GROUPS)) {
    const value = input.adjustments?.[key];
    if (
      [5, 6, 7, 8, 9, 10, 11].includes(input.appearance.version) &&
      [
        "headwear",
        "glasses",
        "prop",
        "mask",
        "forehead",
        "mouthLines",
        "eyeWrinkles",
      ].includes(key) &&
      value === undefined
    )
      continue;
    if (!value || typeof value.visible !== "boolean")
      throw new Error("Calque incomplet.");
    base.adjustments[key] = {
      visible: value.visible,
      ...Object.fromEntries(
        Object.entries(PORTRAIT_EDITOR_LIMITS).map(([field, [min, max]]) => [
          field,
          bounded(value[field], min, max),
        ]),
      ),
    };
  }
  base.scene = {
    x: bounded(input.scene?.x, ...PORTRAIT_SCENE_LIMITS.x),
    y: bounded(input.scene?.y, ...PORTRAIT_SCENE_LIMITS.y),
    scale: bounded(input.scene?.scale, 60, 140),
  };
  for (const key of ["name", "place", "line"]) {
    const value = input.text?.[key];
    if (
      typeof value !== "string" ||
      value.length > (key === "line" ? 8000 : 160)
    )
      throw new Error("Texte invalide.");
    base.text[key] = value;
  }
  for (const key of ["choices", "guides", "transparent"]) {
    if (typeof input[key] !== "boolean") throw new Error("Option invalide.");
    base[key] = input[key];
  }
  return base;
}
