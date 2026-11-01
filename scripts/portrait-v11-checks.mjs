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
  ].entries()) {
    const a = {
      ...createPortraitAppearance({ identity: "v11-proof", gender }),
      hair: `${gender}-hair-0`,
      hairBack: gender === "female" ? "female-hairBack-0" : null,
      hairColor: color,
      beardColor: null,
      accessory: gender === "male" ? "male-accessory-5" : null,
      headwear: index < 4 ? `${gender}-headwear-${(index % 2) + 1}` : null,
      widthPercent: 100,
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
writeFileSync("output/portraits/v11-assemblies.json", JSON.stringify(examples));
