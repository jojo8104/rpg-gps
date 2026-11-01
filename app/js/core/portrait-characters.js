import { createPortraitAppearance } from "./portrait-catalog.js";

/** Identités visuelles fixes ; aucune caractéristique de jeu n’est modifiée. */
export function createMarshalAppearance() {
  return {
    ...createPortraitAppearance({
      identity: "marshal-aldren",
      gender: "male",
      locationType: "capital",
    }),
    body: "male-body-11",
    clothing: "male-clothing-11",
    clothingBack: "male-clothingBack-11",
    face: "male-face-2",
    hair: "male-hair-8",
    hairBack: null,
    hairColor: "gray",
    eyes: "male-eyes-4",
    nose: "male-nose-0",
    mouth: "male-mouth-5",
    accessory: "male-accessory-1",
    additionalAccessories: [],
    beardColor: "gray",
    beardOpacity: 100,
    headwear: null,
    glasses: null,
    prop: null,
    mask: null,
    forehead: "male-forehead-1",
    mouthLines: "male-mouthLines-1",
    eyeWrinkles: "male-eyeWrinkles-1",
    widthPercent: 115,
    background: "marshal-room",
  };
}

export function namedPortraitAppearance(portrait) {
  return portrait === "assets/characters/marshal-aldren.png"
    ? createMarshalAppearance()
    : null;
}
