/** Palette de présentation commune aux formes neutres de cheveux et de barbes. */
const colors = {
  black: {
    label: "Noir",
    tones: [
      [14, 15, 20],
      [26, 27, 35],
      [45, 46, 55],
      [81, 80, 92],
      [135, 128, 135],
    ],
  },
  brown: {
    label: "Brun",
    tones: [
      [22, 13, 12],
      [54, 31, 24],
      [95, 57, 37],
      [146, 102, 65],
      [208, 164, 105],
    ],
  },
  chestnut: {
    label: "Châtain",
    tones: [
      [30, 16, 13],
      [89, 42, 24],
      [148, 76, 36],
      [195, 120, 60],
      [244, 177, 103],
    ],
  },
  blond: {
    label: "Blond",
    tones: [
      [50, 33, 21],
      [131, 94, 51],
      [191, 148, 86],
      [228, 192, 132],
      [255, 231, 183],
    ],
  },
  red: {
    label: "Roux",
    tones: [
      [38, 15, 10],
      [103, 36, 16],
      [166, 64, 24],
      [219, 109, 44],
      [250, 169, 83],
    ],
  },
  gray: {
    label: "Gris",
    tones: [
      [36, 34, 38],
      [78, 76, 84],
      [126, 123, 131],
      [174, 170, 178],
      [222, 217, 219],
    ],
  },
  white: {
    label: "Blanc",
    tones: [
      [52, 44, 44],
      [132, 130, 138],
      [196, 193, 199],
      [226, 224, 226],
      [255, 252, 246],
    ],
  },
};
export const PORTRAIT_HAIR_COLORS = Object.freeze(
  Object.fromEntries(
    Object.entries(colors).map(([key, value]) => [
      key,
      Object.freeze({
        label: value.label,
        tones: Object.freeze(value.tones.map((tone) => Object.freeze(tone))),
      }),
    ]),
  ),
);
export function isPortraitHairColor(value) {
  return (
    typeof value === "string" && Object.hasOwn(PORTRAIT_HAIR_COLORS, value)
  );
}
/** Compatibilité avec les couleurs auparavant peintes directement dans les PNG. */
export function portraitColorKeys(appearance) {
  const index = Number(appearance.hair?.split("-").at(-1));
  const legacyHair =
    index === 4
      ? "blond"
      : index === 5
        ? "brown"
        : index === 7
          ? "white"
          : "chestnut";
  const hair = appearance.hairColor ?? legacyHair;
  const beard =
    appearance.beardColor === null
      ? hair
      : (appearance.beardColor ??
        (appearance.accessory === "male-accessory-6" ? "gray" : "brown"));
  return { hair, beard };
}
/** Table exacte utilisée par les filtres SVG et les planches de contrôle. */
export function portraitColorLookup(key) {
  if (!isPortraitHairColor(key))
    throw new RangeError("Couleur de pilosité inconnue.");
  const tones = PORTRAIT_HAIR_COLORS[key].tones;
  return Array.from({ length: 256 }, (_, value) => {
    const position = (value / 255) * 4,
      left = Math.min(3, Math.floor(position)),
      fraction = position - left;
    return [0, 1, 2].map((channel) =>
      Math.round(
        tones[left][channel] * (1 - fraction) +
          tones[left + 1][channel] * fraction,
      ),
    );
  });
}
