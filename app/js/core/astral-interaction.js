import { distanceMeters } from "./geo.js";
/** Portée et consommation d’une interaction astrale, exécutées par le serveur. */
export function astralTargetInReach(game, hero, kind, target) {
  const travel = game.heroClassFeatureService.activeAstralTravel?.(hero);
  if (
    !travel ||
    travel.targetKind !== kind ||
    travel.targetId !== target?.id ||
    !target?.position ||
    !hero?.position
  )
    return false;
  const distance =
    game.coordinateMode === "simulation"
      ? Math.hypot(
          hero.position.latitude - target.position.latitude,
          hero.position.longitude - target.position.longitude,
        )
      : distanceMeters(hero.position, target.position);
  return distance <= travel.reachBonus;
}

export function consumeAstralInteraction(
  game,
  playerId,
  command,
  input,
  result,
) {
  if (
    result == null ||
    result === false ||
    result.success === false ||
    ["activateHeroAstralTravel", "selectHeroAstralTarget"].includes(command)
  )
    return;
  const hero = game.heroes.find((item) => item.playerId === playerId);
  const travel = game.heroClassFeatureService.activeAstralTravel?.(hero);
  if (!travel?.targetId) return;
  const questTarget =
    command === "selectQuestChoice" &&
    ((travel.targetKind === "group" &&
      travel.targetId === "repression-provost" &&
      input === "TALK_PROVOST") ||
      (travel.targetKind === "location" &&
        [
          "ASSAULT_VILLAGE",
          "NEGOTIATE",
          "ULTIMATUM",
          "INVESTIGATE",
          "SUPPORT_PROVOST",
          "DEFEND_VILLAGE",
          "STAND_ASIDE",
        ].includes(input)));
  const matches =
    questTarget ||
    (travel.targetKind === "location"
      ? input?.locationId === travel.targetId ||
        input?.sourceLocationId === travel.targetId
      : travel.targetKind === "hero"
        ? input?.targetHeroId === travel.targetId ||
          input?.targetPlayerId === game.getHero(travel.targetId)?.playerId ||
          input?.teamParticipants?.some((team) =>
            team.heroIds?.includes(travel.targetId),
          )
        : input?.groupId === travel.targetId ||
          input?.teamParticipants?.some(
            (team) => team.autonomousGroupId === travel.targetId,
          ));
  if (matches) game.heroClassFeatureService.consumeAstralTravel(hero);
}
