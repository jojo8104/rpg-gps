import { mkdirSync, writeFileSync } from "node:fs";
import {
  createPortraitAppearance,
  withPortraitExpression,
  portraitLayerOrder,
  portraitLayerPath,
  portraitLayerBlock,
  portraitProportions,
  isPortraitBeard,
} from "../app/js/core/portrait-catalog.js";
const examples = [];
for (const gender of ["male", "female"])
  for (let i = 0; i < 8; i++) {
    const face = [2, 3, 2, 3, 2, 3, 0, 3][i],
      hair = [0, 4, 7, 7, 6, 5, 1, 7][i],
      clothing = [4, 7, 3, 5, 8, 8, 0, 1][i];
    let appearance = {
      ...createPortraitAppearance({ identity: `v10-check:${i}`, gender }),
      face: `${gender}-face-${face}`,
      hair: `${gender}-hair-${hair}`,
      hairBack: gender === "female" ? `female-hairBack-${hair}` : null,
      body: `${gender}-body-${clothing}`,
      clothing: `${gender}-clothing-${clothing}`,
      clothingBack: `${gender}-clothingBack-${clothing}`,
      accessory:
        gender === "male" && [4, 7].includes(i)
          ? `male-accessory-${i === 4 ? 5 : 6}`
          : null,
      headwear: [4, 5].includes(i) ? `${gender}-headwear-3` : null,
      mask: i === 4 ? `${gender}-mask-1` : null,
      glasses: i === 2 ? `${gender}-glasses-1` : null,
      prop: i === 4 ? `${gender}-prop-1` : null,
      forehead: [2, 3, 7].includes(i) ? `${gender}-forehead-1` : null,
      mouthLines: [2, 3, 7].includes(i) ? `${gender}-mouthLines-1` : null,
      eyeWrinkles: [2, 3, 7].includes(i) ? `${gender}-eyeWrinkles-1` : null,
      widthPercent: i === 6 ? 70 : i === 7 ? 130 : 100,
      beardOpacity: 70,
    };
    appearance = withPortraitExpression(
      appearance,
      [
        "neutral",
        "laugh",
        "neutral",
        "neutral",
        "angry",
        "threatening",
        "angry",
        "laugh",
      ][i],
    );
    if ([2, 3].includes(i))
      appearance = { ...appearance, eyes: `${gender}-eyes-4` };
    examples.push({
      gender,
      index: i,
      appearance,
      proportions: portraitProportions(appearance),
      beard: isPortraitBeard(appearance),
      layers: portraitLayerOrder(appearance).map((part) => ({
        part,
        path: portraitLayerPath(appearance, part),
        block: portraitLayerBlock(appearance, part),
      })),
    });
  }
mkdirSync("output/portraits", { recursive: true });
writeFileSync(
  "output/portraits/v10-assemblies.json",
  JSON.stringify(examples, null, 2),
);
