/** Navigation de présentation fondée exclusivement sur les erreurs officielles. */
export function preparationSteps(preparation) {
  const qr = Object.values(preparation?.locations ?? {}).some(
    (entry) => entry.placement === "qr",
  );
  return [
    "scenario",
    "locations",
    ...(qr ? ["print", "install"] : []),
    "review",
  ];
}

export function preparationBlockedStep(lobby, target) {
  const steps = [
    "terrain",
    ...preparationSteps(lobby.configuration.preparation),
  ];
  const index = target === "players" ? steps.length : steps.indexOf(target);
  return (
    steps
      .slice(0, index)
      .find((step) => lobby.preparationStepProblems?.[step]?.length) ?? null
  );
}
