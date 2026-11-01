import { distanceMeters } from "./geo.js";
import { isSuspendedQuestGroup } from "./quest-system-policy.js";
import { AUTONOMOUS_ATTACK_RANGE } from "./location-interaction-policy.js";

/** Même réaction hostile dans les deux modes, selon leurs unités de distance. */
export function triggerAutonomousHeroAttacks(game, playerIds) {
  const distance =
    game.coordinateMode === "simulation"
      ? (a, b) => Math.hypot(a.latitude - b.latitude, a.longitude - b.longitude)
      : distanceMeters;
  const defaultRadius =
    game.coordinateMode === "simulation"
      ? AUTONOMOUS_ATTACK_RANGE
      : game.setup.rules.engagementRadiusMeters;
  const started = [];
  for (const hero of game.heroes.filter(
    (hero) =>
      playerIds.has(hero.playerId) && hero.state === "active" && hero.position,
  )) {
    if (
      game.battles.some(
        (battle) =>
          battle.status !== "finished" &&
          battle.teams.some((team) =>
            team.heroes.some((entry) => entry.sourceId === hero.id),
          ),
      )
    )
      continue;
    const group = game.autonomousGroups.find(
      (group) =>
        !isSuspendedQuestGroup(game, group) &&
        group.behavior === "aggressive" &&
        (!group.alignment || group.alignment === "enemy") &&
        !["destroyed", "interrupted", "mission_failed", "completed"].includes(
          group.status,
        ) &&
        group.army.units.some((unit) => unit.combatantCount > 0) &&
        distance(group.position, hero.position) <=
          (group.mission?.engagementRadiusMeters ?? defaultRadius),
    );
    if (!group) continue;
    const battle = game.createBattle({
      teamParticipants: [
        { id: "heroes", heroIds: [hero.id] },
        {
          id: `autonomous-${group.id}`,
          heroIds: [],
          autonomousGroupId: group.id,
        },
      ],
      position: group.position,
    });
    group.status = "interrupted";
    started.push(battle.id);
  }
  return started;
}
