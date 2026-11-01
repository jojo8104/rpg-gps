import { writeFileSync, mkdirSync } from "node:fs";
import {
  createPortraitAppearance,
  PORTRAIT_LAYER_ORDER,
  portraitLayerPath,
  portraitLayerBlock,
  portraitProportions,
  isPortraitBeard,
} from "../app/js/core/portrait-catalog.js";
const examples = [];
for (const gender of ["male", "female"])
  for (let i = 0; i < 8; i++) {
    const appearance = {
      ...createPortraitAppearance({
        identity: `v9-check:${i}`,
        gender,
        role: "brigand",
      }),
      face: `${gender}-face-${i % 2}`,
      hair: `${gender}-hair-${[4, 5, 6, 0, 4, 5, 6, 3][i]}`,
      hairBack:
        gender === "female"
          ? `female-hairBack-${[4, 5, 6, 0, 4, 5, 6, 3][i]}`
          : null,
      eyes: `${gender}-eyes-${(i % 2) + 2}`,
      nose: `${gender}-nose-${(i % 2) + 2}`,
      mouth: `${gender}-mouth-${((i + 1) % 2) + 2}`,
      clothing: `${gender}-clothing-${[8, 8, 8, 0, 3, 5, 1, 6][i]}`,
      body: `${gender}-body-${[8, 8, 8, 0, 3, 5, 1, 6][i]}`,
      clothingBack: `${gender}-clothingBack-${[8, 8, 8, 0, 3, 5, 1, 6][i]}`,
      accessory:
        gender === "male" && [1, 4, 7].includes(i)
          ? `male-accessory-${i === 7 ? 6 : 5}`
          : null,
      glasses: i % 3 === 1 ? `${gender}-glasses-1` : null,
      headwear: [
        null,
        `${gender}-headwear-1`,
        `${gender}-headwear-2`,
        null,
        null,
        `${gender}-headwear-2`,
        null,
        `${gender}-headwear-1`,
      ][i],
      prop: i % 4 === 0 ? null : `${gender}-prop-${(i % 3) + 1}`,
      widthPercent: i === 6 ? 70 : i === 7 ? 130 : 100,
      beardOpacity: i === 4 ? 45 : 100,
    };
    examples.push({
      gender,
      index: i,
      appearance,
      proportions: portraitProportions(appearance),
      beard: isPortraitBeard(appearance),
      layers: PORTRAIT_LAYER_ORDER.filter(
        (part) => appearance[part] !== null,
      ).map((part) => ({
        part,
        path: portraitLayerPath(appearance, part),
        block: portraitLayerBlock(appearance, part),
      })),
    });
  }
mkdirSync("output/portraits", { recursive: true });
writeFileSync(
  "output/portraits/v9-assemblies.json",
  JSON.stringify(examples, null, 2),
);
