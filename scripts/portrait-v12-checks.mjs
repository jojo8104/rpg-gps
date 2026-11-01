import { writeFileSync, mkdirSync } from "node:fs";
import {
  createPortraitAppearance,
  portraitLayerOrder,
  portraitLayerPath,
  portraitLayerBlock,
  portraitProportions,
  isPortraitBeard,
} from "../app/js/core/portrait-catalog.js";
import {
  PORTRAIT_HAIR_COLORS,
  portraitColorLookup,
} from "../app/js/core/portrait-hair-colors.js";
const examples = [];
for (const gender of ["male", "female"])
  for (const [index, color] of [
    ...Object.keys(PORTRAIT_HAIR_COLORS),
    "chestnut",
    "brown",
    "red",
    "gray",
    "white",
  ].entries()) {
    const a = {
      ...createPortraitAppearance({ identity: "v12-proof", gender }),
      hair: `${gender}-hair-0`,
      hairBack: gender === "female" ? "female-hairBack-0" : null,
      hairColor: color,
      beardColor: null,
      accessory:
        gender === "male"
          ? index >= 8
            ? "male-accessory-7"
            : "male-accessory-5"
          : null,
      body: `${gender}-body-${index >= 8 ? 10 : index < 4 ? 9 : 3}`,
      clothing: `${gender}-clothing-${index >= 8 ? 10 : index < 4 ? 9 : 3}`,
      clothingBack: `${gender}-clothingBack-${index >= 8 ? 10 : index < 4 ? 9 : 3}`,
      headwear: index >= 8 ? null : `${gender}-headwear-${index < 4 ? 1 : 4}`,
      mask: null,
      glasses: null,
      prop: null,
      forehead: null,
      mouthLines: null,
      eyeWrinkles: null,
      widthPercent: [70, 100, 130, 100, 70, 100, 130, 100, 70, 100, 130, 100][
        index
      ],
      beardOpacity: 100,
    };
    examples.push({
      gender,
      index,
      appearance: a,
      proportions: portraitProportions(a),
      beard: isPortraitBeard(a),
      layers: portraitLayerOrder(a).map((part) => ({
        part,
        path: portraitLayerPath(a, part),
        block: portraitLayerBlock(a, part),
        lookup:
          ["hair", "hairBack"].includes(part) ||
          (part === "accessory" && isPortraitBeard(a))
            ? portraitColorLookup(color)
            : null,
      })),
    });
  }
mkdirSync("output/portraits", { recursive: true });
writeFileSync("output/portraits/v12-assemblies.json", JSON.stringify(examples));
