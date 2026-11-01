import { isPortraitHairColor } from "./portrait-hair-colors.js";
/** Présentation versionnée ; les pièces ne traversent pas les bibliothèques. */
export const PORTRAIT_VERSION = 12;
export const PORTRAIT_OPTIONAL_PARTS = Object.freeze([
  "accessory",
  "headwear",
  "glasses",
  "prop",
  "mask",
  "forehead",
  "mouthLines",
  "eyeWrinkles",
]);
export const PORTRAIT_EXPRESSION_PRESETS = Object.freeze({
  neutral: Object.freeze({ label: "Neutre", eyes: 0, mouth: 0 }),
  laugh: Object.freeze({ label: "Rire", eyes: 5, mouth: 4 }),
  angry: Object.freeze({ label: "Colère", eyes: 6, mouth: 5 }),
  threatening: Object.freeze({ label: "Menaçant", eyes: 7, mouth: 6 }),
});
export function portraitExpressionKey(appearance) {
  return (
    Object.entries(PORTRAIT_EXPRESSION_PRESETS).find(
      ([, preset]) =>
        appearance.eyes === `${appearance.gender}-eyes-${preset.eyes}` &&
        appearance.mouth === `${appearance.gender}-mouth-${preset.mouth}`,
    )?.[0] ?? "custom"
  );
}
export function withPortraitExpression(appearance, key) {
  const preset = PORTRAIT_EXPRESSION_PRESETS[key];
  if (
    !isPortraitAppearance(appearance) ||
    !Object.hasOwn(PORTRAIT_EXPRESSION_PRESETS, key)
  )
    throw new RangeError("Expression inconnue.");
  return {
    ...appearance,
    eyes: `${appearance.gender}-eyes-${preset.eyes}`,
    mouth: `${appearance.gender}-mouth-${preset.mouth}`,
  };
}
export function portraitAccessories(appearance) {
  return [
    ...(appearance.accessory ? [appearance.accessory] : []),
    ...(appearance.additionalAccessories ?? []),
  ];
}
export function isPortraitBeardReference(reference) {
  return [
    "male-accessory-1",
    "male-accessory-5",
    "male-accessory-6",
    "male-accessory-7",
  ].includes(reference);
}
export function isPortraitBeard(appearance) {
  return portraitAccessories(appearance).some(isPortraitBeardReference);
}
export const PORTRAIT_GENDERS = Object.freeze(["male", "female"]);
export const PORTRAIT_WIDTH_LIMITS = Object.freeze([70, 130]);
/** Deux blocs de largeur liés ; le gabarit de référence reste 100/100. */
export function portraitProportions(appearance) {
  const bodyPercent = appearance.widthPercent ?? 100;
  const headPercent = 100 + (bodyPercent - 100) / 3;
  return { bodyPercent, headPercent: Math.round(headPercent * 100) / 100 };
}
/** Les calques restent dans leur ordre de profondeur, même entre les deux blocs. */
export function portraitLayerBlock(appearance, part) {
  if (["body", "clothing", "clothingBack", "prop"].includes(part))
    return "body";
  if (
    part === "accessory" &&
    ["male-accessory-4", "female-accessory-3"].includes(appearance.accessory)
  )
    return "body";
  return "head";
}
export const PORTRAIT_VARIANTS = Object.freeze({
  male: Object.freeze({
    body: 12,
    neck: 0,
    clothingBack: 12,
    face: 4,
    hair: 9,
    hairBack: 0,
    eyes: 8,
    nose: 4,
    mouth: 7,
    clothing: 12,
    accessory: 8,
    headwear: 5,
    glasses: 2,
    prop: 4,
    mask: 2,
    forehead: 2,
    mouthLines: 2,
    eyeWrinkles: 2,
  }),
  female: Object.freeze({
    body: 11,
    neck: 0,
    clothingBack: 11,
    face: 4,
    hair: 8,
    hairBack: 8,
    eyes: 8,
    nose: 4,
    mouth: 7,
    clothing: 11,
    accessory: 4,
    headwear: 5,
    glasses: 2,
    prop: 4,
    mask: 2,
    forehead: 2,
    mouthLines: 2,
    eyeWrinkles: 2,
  }),
});
export const PORTRAIT_LAYER_ORDER = Object.freeze([
  "prop",
  "hairBack",
  "clothingBack",
  "body",
  "face",
  "clothing",
  "forehead",
  "eyes",
  "eyeWrinkles",
  "nose",
  "mouth",
  "mouthLines",
  "hair",
  "accessory",
  "mask",
  "glasses",
  "headwear",
]);
/** Le rire ouvert doit rester visible devant la barbe ; le foulard reste au-dessus. */
export function portraitLayerOrder(appearance) {
  const order = PORTRAIT_LAYER_ORDER.filter((part) =>
    part === "accessory"
      ? portraitAccessories(appearance).length > 0
      : appearance[part] !== null,
  );
  if (isPortraitBeard(appearance) && appearance.mouth === "male-mouth-4") {
    order.splice(order.indexOf("accessory"), 1);
    order.splice(order.indexOf("mouth"), 0, "accessory");
  }
  return order;
}
export const PORTRAIT_BACKGROUNDS = Object.freeze([
  "village",
  "town",
  "fort",
  "mine",
  "quarry",
  "forest",
  "tavern",
  "forge",
  "marshal-room",
]);
export const MODULAR_PORTRAIT_ASSETS = Object.freeze([
  ...PORTRAIT_BACKGROUNDS.map(
    (name) => `portraits/modular/v1/background-${name}.png`,
  ),
  ...PORTRAIT_GENDERS.flatMap((gender) =>
    Object.entries(PORTRAIT_VARIANTS[gender]).flatMap(([part, count]) =>
      Array.from({ length: count }, (_, index) => index)
        .filter((index) => !PORTRAIT_OPTIONAL_PARTS.includes(part) || index > 0)
        .map(
          (index) =>
            `portraits/modular/v12/${gender}/${part}-${index}${gender === "male" && part === "hair" && index === 8 ? "-front" : ""}.png`,
        ),
    ),
  ),
]);
export function portraitBackground(locationType, role = "chief") {
  if (role === "tavern" || role === "forge") return role;
  return (
    { capital: "town", camp: "forest", "lumber-camp": "forest" }[
      locationType
    ] ??
    (PORTRAIT_BACKGROUNDS.includes(locationType) ? locationType : "village")
  );
}
/** Coiffure indépendante du visage ; les parties avant/arrière restent assorties.
 * Sans genre explicite, conserver la bibliothèque correspondant à la base v1.
 */
export function createPortraitAppearance({
  identity,
  locationType = "village",
  role = "chief",
  gender,
}) {
  gender ??= hash(`${identity}:face:v1`) % 2 === 0 ? "male" : "female";
  if (!PORTRAIT_GENDERS.includes(gender))
    throw new RangeError("Bibliothèque de portrait inconnue.");
  const variants = PORTRAIT_VARIANTS[gender];
  const pick = (part) =>
    hash(`${identity}:${gender}:${part}:v2`) % variants[part];
  const reference = (part, index) => `${gender}-${part}-${index}`;
  const clothing =
    role === "barbarian"
      ? 10
      : role === "soldier"
        ? 9
        : role === "brigand"
          ? 8
          : role === "forge"
            ? 6
            : role === "tavern"
              ? 7
              : ["mine", "quarry", "lumber-camp", "worker"].includes(role)
                ? 3
                : role === "officer" || role === "fort"
                  ? 0
                  : role === "trainer"
                    ? 1
                    : role === "specialist"
                      ? 2
                      : 4 + (hash(`${identity}:coat`) % 2);
  const older = hash(`${identity}:${gender}:older:v1`) % 4 === 0;
  const hair = hash(`${identity}:${gender}:hair:v2`) % 8;
  const hairColor = older
    ? hash(`${identity}:${gender}:white-hair:v1`) % 2 === 0
      ? "white"
      : "gray"
    : ["black", "brown", "chestnut", "blond", "red"][
        hash(`${identity}:${gender}:hair-color:v1`) % 5
      ];
  const expression = ["laugh", "angry", "threatening"][
    hash(`${identity}:${gender}:expression:v1`) % 8
  ];
  const preset = expression ? PORTRAIT_EXPRESSION_PRESETS[expression] : null;
  const accessory = pick("accessory");
  const optional = (part, frequency) =>
    hash(`${identity}:${gender}:${part}:presence`) % frequency === 0
      ? reference(
          part,
          1 + (hash(`${identity}:${gender}:${part}:v1`) % (variants[part] - 1)),
        )
      : null;
  return {
    version: PORTRAIT_VERSION,
    gender,
    body: reference("body", clothing),
    neck: null,
    clothingBack: reference("clothingBack", clothing),
    face: reference("face", pick("face")),
    hair: reference("hair", hair),
    hairBack: gender === "female" ? reference("hairBack", hair) : null,
    eyes: reference("eyes", preset?.eyes ?? (older ? 4 : pick("eyes") % 4)),
    nose: reference("nose", pick("nose")),
    mouth: reference("mouth", preset?.mouth ?? pick("mouth") % 4),
    clothing: reference("clothing", clothing),
    accessory: accessory === 0 ? null : reference("accessory", accessory),
    additionalAccessories: [],
    headwear: optional("headwear", 4),
    glasses: optional("glasses", 5),
    prop: optional("prop", 4),
    mask: optional("mask", role === "brigand" ? 2 : 8),
    forehead: older ? reference("forehead", 1) : null,
    mouthLines: older ? reference("mouthLines", 1) : null,
    eyeWrinkles: older ? reference("eyeWrinkles", 1) : null,
    background: portraitBackground(locationType, role),
    widthPercent:
      PORTRAIT_WIDTH_LIMITS[0] +
      (hash(`${identity}:${gender}:width:v1`) %
        (PORTRAIT_WIDTH_LIMITS[1] - PORTRAIT_WIDTH_LIMITS[0] + 1)),
    beardOpacity: 100,
    hairColor,
    beardColor: null,
  };
}
export function isPortraitAppearance(value) {
  if (
    !value ||
    typeof value !== "object" ||
    value.version !== PORTRAIT_VERSION ||
    !PORTRAIT_GENDERS.includes(value.gender) ||
    !PORTRAIT_BACKGROUNDS.includes(value.background) ||
    !optionalPercent(value.widthPercent, ...PORTRAIT_WIDTH_LIMITS) ||
    !optionalPercent(value.beardOpacity, 0, 100) ||
    (value.hairColor !== undefined && !isPortraitHairColor(value.hairColor)) ||
    (value.beardColor !== undefined &&
      value.beardColor !== null &&
      !isPortraitHairColor(value.beardColor))
  )
    return false;
  if (value.additionalAccessories !== undefined) {
    if (
      !Array.isArray(value.additionalAccessories) ||
      value.additionalAccessories.length >=
        PORTRAIT_VARIANTS[value.gender].accessory ||
      value.additionalAccessories.some(
        (ref) =>
          typeof ref !== "string" ||
          !Array.from(
            { length: PORTRAIT_VARIANTS[value.gender].accessory - 1 },
            (_, i) => `${value.gender}-accessory-${i + 1}`,
          ).includes(ref),
      ) ||
      new Set(portraitAccessories(value)).size !==
        portraitAccessories(value).length
    )
      return false;
  }
  const valid = Object.entries(PORTRAIT_VARIANTS[value.gender]).every(
    ([part, count]) => {
      if (count === 0) return value[part] === null;
      if (PORTRAIT_OPTIONAL_PARTS.includes(part) && value[part] === null)
        return true;
      return Array.from({ length: count }, (_, index) => index)
        .filter((index) => !PORTRAIT_OPTIONAL_PARTS.includes(part) || index > 0)
        .some((index) => value[part] === `${value.gender}-${part}-${index}`);
    },
  );
  return (
    valid &&
    value.body === value.clothing.replace("-clothing-", "-body-") &&
    value.clothingBack ===
      value.clothing.replace("-clothing-", "-clothingBack-") &&
    (value.gender === "male" ||
      value.hairBack.replace("-hairBack-", "-hair-") === value.hair)
  );
}
// Les anciens descripteurs sans ces champs conservent un rendu à 100 %.
function optionalPercent(value, min, max) {
  return (
    value === undefined ||
    (Number.isInteger(value) && value >= min && value <= max)
  );
}
/** Référence strictement issue de la bibliothèque validée, sans chemin libre. */
export function portraitLayerPath(appearance, part) {
  if (
    !isPortraitAppearance(appearance) ||
    !PORTRAIT_LAYER_ORDER.includes(part) ||
    appearance[part] === null
  )
    return null;
  let filename = appearance[part].slice(appearance.gender.length + 1);
  if (appearance.gender === "male" && filename === "hair-8")
    filename = "hair-8-front";
  return `assets/portraits/modular/v12/${appearance.gender}/${filename}.png`;
}
function hash(text) {
  let value = 2166136261;
  for (const character of String(text)) {
    value ^= character.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
  return (value ^ (value >>> 16)) >>> 0;
}
