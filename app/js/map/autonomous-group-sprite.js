import { GROUP_SHEETS } from "./autonomous-group-sprite-atlas.js";
import { ENEMY_GROUP_SHEETS } from "./enemy-group-sheets.js";
import { getAutonomousGroupArchetype } from "../core/autonomous-group-catalog.js";
import {
  caravanHeading,
  caravanPoseStyle,
  caravanSprite,
} from "./caravan-sprite.js";

export { caravanHeading as autonomousGroupHeading };

export function autonomousGroupSprite(kind) {
  return caravanSprite({ shadow: kind !== "caravan" });
}

/** Sélection visuelle sur les seules données de groupe déjà visibles. */
export function autonomousGroupSpriteKind(group) {
  if (getAutonomousGroupArchetype(group.archetypeId)) return group.archetypeId;
  if (group.type === "convoy") return "caravan";
  if (group.type === "scout") return "scout";
  if (
    ["army", "rogue"].includes(group.type) &&
    (group.factionId === "bandits" || group.owner?.id === "bandits")
  )
    return "brigands";
  return null;
}

export function autonomousGroupPoseStyle(kind, direction, step) {
  const enemySheet = ENEMY_GROUP_SHEETS[kind];
  if (enemySheet) {
    // N, NE, NW : dos. Les autres directions utilisent la face, sans miroir.
    const pose = enemySheet.poses[[0, 1, 7].includes(direction) ? 1 : 0];
    const targetHeight = {
      goblins: 52,
      orcs: 64,
      wolves: 48,
      bear: 62,
      boar: 44,
      deer: 64,
    }[kind];
    const scale =
      targetHeight / Math.max(...enemySheet.poses.map((entry) => entry.height));
    return {
      left: `${40 - (pose.width * scale) / 2}px`,
      top: `${76 - pose.height * scale}px`,
      width: `${pose.width * scale}px`,
      height: `${pose.height * scale}px`,
      backgroundImage: `url("${new URL(`../../assets/groups/${getAutonomousGroupArchetype(kind).sprite}`, import.meta.url).href}")`,
      backgroundSize: `${enemySheet.width * scale}px ${enemySheet.height * scale}px`,
      backgroundPosition: `${-pose.x * scale}px ${-pose.y * scale}px`,
      transform: "none",
      transformOrigin: `${(pose.width * scale) / 2}px bottom`,
    };
  }
  if (kind === "caravan") return caravanPoseStyle(direction, step);
  const sheet = GROUP_SHEETS[kind];
  const pose = sheet.poses[direction > 4 ? 8 - direction : direction][step];
  const scale = sheet.scale;
  const axis = kind === "scout" ? pose.axis - pose.x : pose.width / 2;
  return {
    left: `${40 - axis * scale}px`,
    top: `${76 - pose.height * scale}px`,
    width: `${pose.width * scale}px`,
    height: `${pose.height * scale}px`,
    backgroundImage: `url("${new URL(`../../assets/groups/${kind}-jrpg-walk-v1.png`, import.meta.url).href}")`,
    backgroundSize: `${sheet.width * scale}px ${sheet.height * scale}px`,
    backgroundPosition: `${-pose.x * scale}px ${-pose.y * scale}px`,
    transform: direction > 4 ? "scaleX(-1)" : "none",
    transformOrigin: `${axis * scale}px bottom`,
  };
}
