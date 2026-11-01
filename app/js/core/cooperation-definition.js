/** Authoring contracts. Execution belongs exclusively to server services. */
export const PARTICIPATION = {
  solo: "Solo uniquement",
  open: "Solo ou multi ouvert",
  leader: "Multi avec leader",
  together: "Multi ensemble",
};
export const COOPERATION = {
  simultaneous: "Actions simultanées",
  roles: "Rôles complémentaires",
  relay: "Relais",
  contribution: "Contribution collective",
};
export function validateCooperation(quest) {
  const config = quest.cooperation;
  if (config != null) {
    if (!Object.hasOwn(PARTICIPATION, config.mode))
      throw new Error("Mode de coopération inconnu.");
    if (
      !Number.isSafeInteger(config.minimumPlayers) ||
      config.minimumPlayers < 1 ||
      !Number.isSafeInteger(config.maximumPlayers) ||
      config.maximumPlayers < config.minimumPlayers
    )
      throw new Error("Effectifs de coopération invalides.");
    if (
      config.mode === "solo" &&
      (config.minimumPlayers !== 1 || config.maximumPlayers !== 1)
    )
      throw new Error("Une quête solo attend exactement un joueur.");
    if (config.mode === "together" && config.minimumPlayers < 2)
      throw new Error("Un groupe physique attend au moins deux joueurs.");
    if (
      !["allowed", "closed"].includes(config.joinInProgress) ||
      (config.mode === "solo" && config.joinInProgress !== "closed")
    )
      throw new Error("Admission en cours invalide.");
    if (config.invitation !== "ga-messenger")
      throw new Error("Les invitations passent par un messager GA.");
  }
  for (const action of quest.actions ?? []) {
    if (
      action.cooperation != null &&
      (!config ||
        config.mode === "solo" ||
        !Object.hasOwn(COOPERATION, action.cooperation.type))
    )
      throw new Error(
        "Une mécanique coopérative nécessite une quête multijoueur et un type connu.",
      );
  }
}
