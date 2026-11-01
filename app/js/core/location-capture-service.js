/** Résout les captures simples sans dépendre de l'interface ou du GPS. */
export class LocationCaptureService {
  getRequirement({
    location,
    relation,
    canCapture = true,
    isQuestCompleted = () => false,
  }) {
    if (location.features.capturable !== true)
      return { state: "not_capturable" };
    if (relation === "owned" || relation === "allied")
      return { state: "already_controlled" };
    if (!canCapture) return { state: "capture_forbidden" };
    const objectiveId = location.capture.questObjectiveId;
    if (objectiveId !== null && !isQuestCompleted(objectiveId))
      return { state: "quest_required", objectiveId };
    if (location.garrison.units.some((unit) => unit.quantity > 0))
      return { state: "battle_required" };
    return { state: "can_capture" };
  }

  capture({
    location,
    playerId,
    relation,
    isQuestCompleted = () => false,
    afterBattle = false,
    canCapture = true,
  }) {
    const requirement = this.getRequirement({
      location,
      relation,
      canCapture,
      isQuestCompleted,
    });
    if (!afterBattle && requirement.state !== "can_capture")
      return {
        success: false,
        reason: requirement.state,
        objectiveId: requirement.objectiveId ?? null,
      };
    if (
      afterBattle &&
      !["battle_required", "can_capture"].includes(requirement.state)
    )
      return {
        success: false,
        reason: requirement.state,
        objectiveId: requirement.objectiveId ?? null,
      };
    const previousOwnerId = location.ownerId;
    location.setOwner(playerId);
    location.setController(playerId);
    return {
      success: true,
      locationId: location.id,
      previousOwnerId,
      ownerId: playerId,
      method: afterBattle
        ? "battle"
        : location.capture.questObjectiveId
          ? "quest"
          : "interaction",
    };
  }
}
