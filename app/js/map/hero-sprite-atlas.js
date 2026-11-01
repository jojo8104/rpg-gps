import { HERO_GENDER_SHEETS } from "./hero-gender-sheets.js";
import { HERO_CLASS_SHEETS } from "./hero-class-sheets.js";

/** Rectangles mesurés sur alpha ; les pixels source restent inchangés. */
export const HERO_ATLAS = [
  [
    { x: 84, y: 44, width: 129, height: 204, axis: 148.0 },
    { x: 317, y: 44, width: 131, height: 205, axis: 382.0 },
    { x: 554, y: 44, width: 130, height: 205, axis: 618.5 },
  ],
  [
    { x: 76, y: 281, width: 138, height: 207, axis: 153.5 },
    { x: 313, y: 281, width: 141, height: 207, axis: 392.0 },
    { x: 554, y: 281, width: 133, height: 207, axis: 626.5 },
  ],
  [
    { x: 74, y: 518, width: 139, height: 215, axis: 151.5 },
    { x: 310, y: 517, width: 142, height: 218, axis: 389.0 },
    { x: 547, y: 518, width: 143, height: 217, axis: 627.0 },
  ],
  [
    { x: 69, y: 766, width: 146, height: 216, axis: 152.5 },
    { x: 304, y: 766, width: 150, height: 219, axis: 389.5 },
    { x: 538, y: 767, width: 152, height: 217, axis: 627.0 },
  ],
  [
    { x: 69, y: 1014, width: 156, height: 219, axis: 147.0 },
    { x: 303, y: 1014, width: 158, height: 225, axis: 382.5 },
    { x: 548, y: 1015, width: 148, height: 224, axis: 617.5 },
  ],
  [
    { x: 79, y: 1268, width: 139, height: 218, axis: 144.0 },
    { x: 315, y: 1268, width: 145, height: 218, axis: 380.5 },
    { x: 554, y: 1268, width: 141, height: 218, axis: 617.5 },
  ],
  [
    { x: 79, y: 1516, width: 139, height: 222, axis: 144.0 },
    { x: 314, y: 1517, width: 143, height: 221, axis: 380.0 },
    { x: 551, y: 1517, width: 144, height: 221, axis: 617.0 },
  ],
  [
    { x: 74, y: 1768, width: 145, height: 219, axis: 137.5 },
    { x: 310, y: 1768, width: 147, height: 219, axis: 373.5 },
    { x: 549, y: 1771, width: 142, height: 216, axis: 611.0 },
  ],
];
export const HERO_PIXEL_SCALE = 80 / 256;
export const HERO_FEET_LINE = 76;
export function heroPoseStyle(
  direction,
  step,
  classId = "warrior",
  gender = null,
) {
  const variantId = `${classId}-${gender}`;
  const variant = HERO_GENDER_SHEETS[variantId];
  const sheet = variant ?? HERO_CLASS_SHEETS[classId];
  const scale = sheet?.scale ?? HERO_PIXEL_SCALE;
  const row = direction > 4 ? 8 - direction : direction;
  const pose = (sheet?.poses ?? HERO_ATLAS)[row][step];
  const mirrored = direction > 4;
  return {
    backgroundImage: `url("${new URL(`../../assets/heroes/${sheet?.image ?? (sheet ? (variant ? variantId : classId) + "-jrpg-walk-v1.png" : "hero-jrpg-walk-v2.png")}`, import.meta.url).href}")`,
    backgroundSize: `${(sheet?.width ?? 768) * scale}px ${(sheet?.height ?? 2046) * scale}px`,
    left: `${40 - (pose.axis - pose.x) * scale}px`,
    top: `${HERO_FEET_LINE - pose.height * scale}px`,
    width: `${pose.width * scale}px`,
    height: `${pose.height * scale}px`,
    backgroundPosition: `${-pose.x * scale}px ${-pose.y * scale}px`,
    transform: mirrored ? "scaleX(-1)" : "none",
    transformOrigin: `${(pose.axis - pose.x) * scale}px bottom`,
  };
}
