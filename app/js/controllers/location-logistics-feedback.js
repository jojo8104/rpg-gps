export function convoyMessage(result) {
  const labels = {
    hero_not_at_origin: "Le héros doit se trouver au comptoir.",
    trading_post_unavailable: "Le comptoir n’est plus opérationnel.",
    insufficient_resources: `Ressources insuffisantes${result?.missingResources?.length ? ` : ${result.missingResources.join(", ")}` : ""}.`,
    destination_not_owned: "La destination ne vous appartient plus.",
    destination_not_found: "La destination n’existe plus.",
    resource_unavailable: "Cette ressource n’est pas produite à destination.",
    convoy_not_active: "Ce convoi est déjà arrêté.",
    convoy_not_owned: "Ce convoi ne vous appartient pas.",
  };
  return result?.success
    ? "Opération confirmée."
    : (labels[result?.reason] ??
        `Opération impossible : ${result?.reason ?? "erreur inconnue"}.`);
}

export function prospectingMessage(result) {
  const labels = {
    hero_not_at_origin: "Le héros doit se trouver au poste.",
    insufficient_population: "Il faut 5 habitants disponibles.",
    invalid_expedition_supplies: "Choisissez 0 à 2 bières et 0 à 10 chevaux.",
    prospecting_post_unavailable:
      "Le poste de prospection n’est plus opérationnel.",
    invalid_specialist: "Ce spécialiste ne peut pas diriger l’expédition.",
    insufficient_food: `Il faut au moins ${result?.minimumFood ?? 0} vivres.`,
    insufficient_resources: `Ressources insuffisantes${result?.missingResources?.length ? ` : ${result.missingResources.join(", ")}` : ""}.`,
  };
  return result?.success
    ? "L’expédition est partie."
    : (labels[result?.reason] ??
        `Départ impossible : ${result?.reason ?? "erreur inconnue"}.`);
}
