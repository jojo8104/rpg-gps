import {
  amounts,
  choice,
  identifier,
  identifiers,
  instant,
  list,
  nonnegative,
  nullableData,
  nullableIdentifier,
  position,
  record,
  unique,
} from "./exploration-validation.js";

export function naturalCell(value) {
  record(value, "La cellule");
  return {
    id: identifier(value.id, "La cellule"),
    row: nonnegative(value.row, "La ligne", true),
    column: nonnegative(value.column, "La colonne", true),
    resource: choice(
      value.resource,
      ["none", "wood", "stone", "fertile-land", "iron", "gold"],
      "Le contenu naturel",
    ),
    suppressedByLocationIds: identifiers(
      value.suppressedByLocationIds ?? [],
      "Les influences",
    ),
    campLocationId: nullableIdentifier(value.campLocationId, "Le camp"),
  };
}

export function exceptionalSite(value) {
  record(value, "Le site exceptionnel");
  const status = choice(
    value.status ?? "active",
    ["active", "won", "disappeared"],
    "Le statut du site",
  );
  const resolution = nullableData(value.resolution, "L’issue du site");
  if ((status === "active") !== (resolution === null))
    throw new RangeError(
      "Un site clôturé doit conserver son issue, un site actif n’en a pas.",
    );
  if (resolution) {
    identifier(resolution.eventId, "L’événement de clôture");
    nonnegative(resolution.at, "La date de clôture", true);
    if (status === "won") identifier(resolution.playerId, "Le vainqueur");
  }
  const requirements = record(value.requirements ?? {}, "Les scores cibles");
  const threshold = (score, label) => {
    if (score == null) return null;
    nonnegative(score, label);
    if (score === 0)
      throw new RangeError(`${label} doit être strictement positif.`);
    return score;
  };
  return {
    id: identifier(value.id, "Le site exceptionnel"),
    name: nullableIdentifier(value.name, "Le nom du site"),
    cellId: identifier(value.cellId, "La cellule du site"),
    type: choice(
      value.type,
      ["artifact", "treasure", "dungeon"],
      "Le type exceptionnel",
    ),
    hostLocationId: nullableIdentifier(
      value.hostLocationId,
      "Le lieu principal",
    ),
    position:
      value.position == null
        ? null
        : position(value.position, "La position du site"),
    status,
    ...(value.relevantNpcIds == null
      ? {}
      : {
          relevantNpcIds: identifiers(
            value.relevantNpcIds,
            "Les spécialités pertinentes",
          ),
        }),
    requirements: {
      expedition: threshold(requirements.expedition, "La cible d’expédition"),
      power: threshold(requirements.power, "La cible de puissance"),
    },
    rewards: nullableData(value.rewards, "Les récompenses configurées"),
    resolution,
  };
}

export function localizationSeries(value) {
  record(value, "La série de localisation");
  const fragments = unique(
    list(
      value.fragments,
      (entry) => {
        record(entry, "Le fragment");
        return {
          id: identifier(entry.id, "Le fragment"),
          text: identifier(entry.text, "Le texte du fragment"),
        };
      },
      "Les fragments",
    ),
    (entry) => entry.id,
    "Les fragments",
  );
  if (fragments.length < 1 || fragments.length > 3)
    throw new RangeError(
      "Une série de localisation contient de un à trois fragments ordonnés.",
    );
  return {
    id: identifier(value.id, "La série"),
    siteId: identifier(value.siteId, "Le site de la série"),
    style: choice(
      value.style ?? "directions",
      ["directions", "name", "anagram", "old-name", "legend"],
      "La désignation",
    ),
    referenceLocationId: nullableIdentifier(
      value.referenceLocationId,
      "Le lieu de référence",
    ),
    solution: nullableData(
      value.solution,
      "La vérification privée des indications",
    ),
    fragments,
  };
}

export function clueItem(value) {
  record(value, "L’item indice");
  const kind = choice(
    value.kind,
    ["localization", "search"],
    "L’effet de l’indice",
  );
  const seriesId = nullableIdentifier(value.seriesId, "La série de l’indice");
  const fragmentId = nullableIdentifier(
    value.fragmentId,
    "Le fragment de l’indice",
  );
  const text = nullableIdentifier(value.text, "Le texte de recherche");
  // Une localisation ne donne pas également une aide de recherche.
  if (
    kind === "localization"
      ? !seriesId || !fragmentId || text !== null
      : seriesId !== null || fragmentId !== null || text === null
  )
    throw new RangeError(
      "L’indice doit avoir un seul effet : localisation ou recherche.",
    );
  const holder =
    value.holder == null ? null : record(value.holder, "Le détenteur");
  return {
    id: identifier(value.id, "L’item indice"),
    siteId: identifier(value.siteId, "Le site de l’indice"),
    kind,
    medium: choice(
      value.medium ?? (kind === "localization" ? "map" : "parchment"),
      ["map", "message", "parchment", "paper"],
      "Le support de l’indice",
    ),
    seriesId,
    fragmentId,
    text,
    status: choice(
      value.status ?? "active",
      ["active", "obsolete", "archived", "sold", "lost"],
      "Le statut de l’indice",
    ),
    holder:
      holder === null
        ? null
        : {
            kind: choice(
              holder.kind,
              ["hero", "location", "group", "player", "archive"],
              "Le détenteur",
            ),
            id: identifier(holder.id, "Le détenteur"),
          },
    createdAt: instant(value.createdAt, "La création de l’indice"),
    origin: nullableData(value.origin, "La provenance de l’indice"),
    lifecycle: nullableData(
      value.lifecycle,
      "Le dernier événement de l’indice",
    ),
  };
}

export function discovery(value) {
  record(value, "La découverte");
  return {
    playerId: identifier(value.playerId, "Le joueur"),
    targetKind: choice(
      value.targetKind,
      ["cell", "site"],
      "La cible découverte",
    ),
    targetId: identifier(value.targetId, "La cible découverte"),
    discoveredAt: nonnegative(
      value.discoveredAt,
      "La date de découverte",
      true,
    ),
    source: choice(
      value.source,
      ["prospecting", "specialist", "search", "dialogue", "scenario"],
      "La source de découverte",
    ),
  };
}

function provisions(value = {}) {
  record(value, "La préparation");
  return {
    clueIds: identifiers(value.clueIds ?? [], "Les indices engagés"),
    npcIds: identifiers(value.npcIds ?? [], "Les PNJ engagés"),
    volunteers: unique(
      list(
        value.volunteers ?? [],
        (entry) => {
          record(entry, "Les volontaires");
          return {
            unitId: identifier(entry.unitId, "La troupe volontaire"),
            quantity: nonnegative(entry.quantity, "L’effectif engagé", true),
          };
        },
        "Les volontaires",
      ),
      (entry) => entry.unitId,
      "Les volontaires",
    ),
    mounts: amounts(value.mounts ?? {}, "Les montures"),
    equipment: amounts(value.equipment ?? {}, "Le matériel"),
    resources: amounts(value.resources ?? {}, "Les ressources"),
  };
}

export function searchAttempt(value) {
  record(value, "La recherche");
  const startedAt = nonnegative(value.startedAt, "Le début de recherche", true);
  const cooldownUntil = nonnegative(
    value.cooldownUntil,
    "La fin de recharge",
    true,
  );
  const discretionPenaltyUntil = nonnegative(
    value.discretionPenaltyUntil,
    "La fin de pénalité",
    true,
  );
  if (cooldownUntil < startedAt || discretionPenaltyUntil < startedAt)
    throw new RangeError("Les échéances de recherche précèdent son début.");
  const status = choice(
    value.status ?? "preparing",
    ["preparing", "resolved", "cancelled"],
    "Le statut de recherche",
  );
  const result = nullableData(value.result, "Le résultat de recherche");
  if ((status === "resolved") !== (result !== null))
    throw new RangeError("Seule une recherche résolue conserve un résultat.");
  return {
    id: identifier(value.id, "La recherche"),
    playerId: identifier(value.playerId, "Le joueur"),
    heroId: identifier(value.heroId, "Le héros qui cherche"),
    position: position(value.position, "La position de recherche"),
    cellId: nullableIdentifier(value.cellId, "La cellule cherchée"),
    status,
    startedAt,
    cooldownUntil,
    discretionPenaltyUntil,
    preparation: provisions(value.preparation),
    result,
    gauge: nullableData(value.gauge, "La jauge de recherche"),
  };
}

export function expedition(value) {
  record(value, "L’expédition");
  const kind = choice(
    value.kind,
    ["installation", "artifact", "treasure", "dungeon"],
    "La mission d’expédition",
  );
  const cellId = nullableIdentifier(value.cellId, "La cellule d’installation");
  const siteId = nullableIdentifier(value.siteId, "Le site visé");
  if (
    kind === "installation"
      ? !cellId || siteId !== null
      : !siteId || cellId !== null
  )
    throw new RangeError(
      "Une expédition vise une cellule à installer ou un site exceptionnel.",
    );
  const heroId = nullableIdentifier(value.heroId, "Le héros engagé");
  const groupId = nullableIdentifier(value.groupId, "Le groupe envoyé");
  if (Boolean(heroId) === Boolean(groupId))
    throw new RangeError(
      "Une expédition engage soit le héros, soit un groupe envoyé.",
    );
  const scores = record(value.scores ?? {}, "Les scores engagés");
  const score = (v, label) => (v == null ? null : nonnegative(v, label));
  return {
    id: identifier(value.id, "L’expédition"),
    playerId: identifier(value.playerId, "Le joueur"),
    kind,
    cellId,
    siteId,
    heroId,
    groupId,
    originLocationId: nullableIdentifier(
      value.originLocationId,
      "Le lieu de départ",
    ),
    status: choice(
      value.status ?? "preparing",
      [
        "preparing",
        "travelling",
        "resolving",
        "returning",
        "completed",
        "cancelled",
      ],
      "Le statut d’expédition",
    ),
    createdAt: nonnegative(value.createdAt, "La création d’expédition", true),
    departedAt: instant(value.departedAt, "Le départ"),
    resolvesAt: instant(value.resolvesAt, "La résolution prévue"),
    completedAt: instant(value.completedAt, "La fin d’expédition"),
    preparation: provisions(value.preparation),
    scores: {
      expedition: score(scores.expedition, "Le score d’expédition"),
      power: score(scores.power, "La puissance"),
      narrative: nonnegative(scores.narrative ?? 0, "Le bonus narratif"),
    },
    narrative: nullableData(value.narrative, "Le parcours narratif"),
    engagement: nullableData(value.engagement, "Les moyens engagés"),
    // Résultat officiel, consommation, dégâts, moral et récompenses déjà appliqués.
    result: nullableData(value.result, "L’issue de l’expédition"),
    processedEventIds: identifiers(
      value.processedEventIds ?? [],
      "Les événements déjà appliqués",
    ),
  };
}
