import { CARAVAN_SHEET } from "./caravan-sprite-atlas.js";

/** Effet visuel uniquement, à partir de la trajectoire officielle. */
export function caravanHeading(group, simulation = false) {
  const destination = group.movement?.destination;
  if (!destination) return 180;
  const origin = Array.isArray(group.position)
    ? { latitude: group.position[0], longitude: group.position[1] }
    : group.position;
  const north = destination.latitude - origin.latitude;
  const east =
    (destination.longitude - origin.longitude) *
    (simulation ? 1 : Math.cos((origin.latitude * Math.PI) / 180));
  return north === 0 && east === 0
    ? 180
    : ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
}
export function caravanPoseStyle(direction, step) {
  const pose =
    CARAVAN_SHEET.poses[direction > 4 ? 8 - direction : direction][step];
  const scale = CARAVAN_SHEET.scale;
  const axis = pose.width / 2;
  return {
    left: `${40 - axis * scale}px`,
    top: `${76 - pose.height * scale}px`,
    width: `${pose.width * scale}px`,
    height: `${pose.height * scale}px`,
    backgroundImage: `url("${new URL("../../assets/groups/caravan-jrpg-walk-v1.png", import.meta.url).href}")`,
    backgroundSize: `${CARAVAN_SHEET.width * scale}px ${CARAVAN_SHEET.height * scale}px`,
    backgroundPosition: `${-pose.x * scale}px ${-pose.y * scale}px`,
    transform: direction > 4 ? "scaleX(-1)" : "none",
    transformOrigin: `${axis * scale}px bottom`,
  };
}
export function caravanSprite({ shadow = false } = {}) {
  return (
    (shadow
      ? '<span class="rpg-hero-foot-shadow" aria-hidden="true"></span>'
      : "") +
    '<span class="rpg-hero-sprite" aria-hidden="true"><span class="rpg-hero-pose" data-step="0"></span><span class="rpg-hero-pose" data-step="1"></span><span class="rpg-hero-pose" data-step="2"></span></span>'
  );
}
