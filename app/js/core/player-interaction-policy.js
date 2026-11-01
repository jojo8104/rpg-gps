import { distanceMeters } from "./geo.js";

/** Calcule les informations visibles et les actions sans dépendre de la carte. */
export function buildPlayerInteractionIntel({
  observerPlayerId,
  target,
  participants,
  observerPosition,
  interactionRange = 25,
  detectionRange = 150,
  allowPvP = false,
}) {
  const participantById = new Map(
    participants.map((entry) => [entry.playerId, entry]),
  );
  const observer = participantById.get(observerPlayerId);
  const observed = participantById.get(target.playerId);
  const allied = Boolean(
    observer?.teamId && observed?.teamId && observer.teamId === observed.teamId,
  );
  const distance = target.position
    ? distanceMeters(observerPosition, target.position)
    : Infinity;
  const informationLevel = allied
    ? 3
    : distance <= interactionRange
      ? 3
      : distance <= detectionRange / 2
        ? 2
        : 1;
  const inRange = distance <= interactionRange;
  const soldiers = target.heroState?.units?.reduce(
    (sum, unit) => sum + (unit.combatantCount ?? unit.quantity ?? 0),
    0,
  );
  const summary =
    informationLevel === 1
      ? `${Math.round(distance)} m · silhouette ${allied ? "alliée" : "hostile"}.`
      : informationLevel === 2
        ? `${Math.round(distance)} m · ${target.heroClassId ?? "classe inconnue"} · niveau ${target.heroState?.level ?? "?"}.`
        : `${Math.round(distance)} m · niveau ${target.heroState?.level ?? "?"} · ${target.heroState?.health ?? "?"}/${target.heroState?.maxHealth ?? "?"} PV · ${soldiers ?? "?"} soldats.`;

  return {
    ...target,
    distance,
    informationLevel,
    relation: allied ? "ally" : "enemy",
    relationLabel: allied ? "Équipe verte" : "Équipe rouge",
    teamColor: allied ? "green" : "red",
    summary,
    actions: allied
      ? [
          { id: "talk", label: "Parler", enabled: inRange },
          { id: "trade", label: "Échanger", enabled: inRange },
        ]
      : [{ id: "attack", label: "Attaquer", enabled: inRange && allowPvP }],
  };
}
