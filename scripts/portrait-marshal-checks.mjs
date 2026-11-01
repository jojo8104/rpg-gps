import { writeFileSync } from "node:fs";
import { createMarshalAppearance } from "../app/js/core/portrait-characters.js";
import {
  portraitLayerOrder,
  portraitLayerPath,
  portraitLayerBlock,
  portraitProportions,
} from "../app/js/core/portrait-catalog.js";
import { portraitColorLookup } from "../app/js/core/portrait-hair-colors.js";
const appearance = createMarshalAppearance();
const recipe = {
  backgroundPath: "assets/portraits/modular/v1/background-marshal-room.png",
  gender: "male",
  index: 0,
  appearance,
  proportions: portraitProportions(appearance),
  beard: true,
  layers: portraitLayerOrder(appearance).map((part) => ({
    part,
    path: portraitLayerPath(appearance, part),
    block: portraitLayerBlock(appearance, part),
    lookup: ["hair", "accessory"].includes(part)
      ? portraitColorLookup("gray")
      : null,
  })),
};
writeFileSync(
  "output/portraits/marshal-front-room-assemblies.json",
  JSON.stringify([recipe]),
);
