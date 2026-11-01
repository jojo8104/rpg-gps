import {
  clueItem,
  discovery,
  exceptionalSite,
  expedition,
  localizationSeries,
  naturalCell,
  searchAttempt,
} from "./exploration-records.js";
import {
  choice,
  identifier,
  list,
  nonnegative,
  instant,
  nullableData,
  record,
  unique,
} from "./exploration-validation.js";

export const EXPLORATION_STATE_VERSION = 1;

/**
 * État privé du serveur. Aucune génération, dépense, découverte ou récompense
 * n’est déclenchée à la construction ou à la reprise d’une sauvegarde.
 * Les futures commandes du moteur modifient ces objets de données simples.
 */
export class ExplorationState {
  constructor(snapshot = null) {
    Object.assign(this, normalize(snapshot ?? {}));
  }

  toJSON() {
    // Revalider aussi les changements effectués par les services du moteur.
    return normalize({ ...this });
  }
}

function normalize(source) {
  record(source, "L’état d’exploration");
  if (
    (source.version ?? EXPLORATION_STATE_VERSION) !== EXPLORATION_STATE_VERSION
  )
    throw new RangeError("Version d’exploration non prise en charge.");
  const collection = (name, convert) =>
    unique(list(source[name] ?? [], convert, name), (entry) => entry.id, name);
  const grid = source.grid == null ? null : gridDefinition(source.grid);
  const generation = nullableData(source.generation, "La génération");
  if (generation) {
    identifier(generation.seed, "La graine de génération");
    nonnegative(generation.generatedAt, "La date de génération", true);
  }
  const state = {
    version: EXPLORATION_STATE_VERSION,
    grid,
    generation,
    cells: collection("cells", naturalCell),
    sites: collection("sites", exceptionalSite),
    clueSeries: collection("clueSeries", localizationSeries),
    clues: collection("clues", clueItem),
    rumorPurchases: collection("rumorPurchases", (entry) => {
      record(entry, "L’écoute de taverne");
      const roll = nonnegative(entry.roll, "Le tirage de rumeur");
      const chance = nonnegative(entry.chance, "La chance de rumeur");
      if (roll >= 1 || chance > 1)
        throw new RangeError("Probabilité de rumeur invalide.");
      const outcome = choice(
        entry.outcome,
        ["clue", "ambient"],
        "La rumeur reçue",
      );
      const clueId =
        entry.clueId == null
          ? null
          : identifier(entry.clueId, "Le message remis");
      if ((outcome === "clue") !== (clueId !== null))
        throw new RangeError("Résultat de rumeur incohérent.");
      return {
        id: identifier(entry.id, "L’écoute"),
        playerId: identifier(entry.playerId, "Le joueur"),
        heroId: identifier(entry.heroId, "Le héros"),
        locationId: identifier(entry.locationId, "La taverne"),
        at: nonnegative(entry.at, "La date d’écoute", true),
        outcome,
        clueId,
        text: identifier(entry.text, "La conversation"),
        roll,
        chance,
      };
    }),
    rumorKnowledge: collection("rumorKnowledge", (entry) => {
      record(entry, "La rumeur apprise");
      return {
        id: identifier(entry.id, "La rumeur"),
        playerId: identifier(entry.playerId, "Le destinataire"),
        seriesId: identifier(entry.seriesId, "La carte expliquée"),
        locationId:
          entry.locationId == null
            ? null
            : identifier(entry.locationId, "Le repère expliqué"),
        text: identifier(entry.text, "L’explication"),
        learnedAt: nonnegative(
          entry.learnedAt,
          "La date de l’explication",
          true,
        ),
        source: choice(entry.source, ["chief", "tavern"], "Le PNJ"),
      };
    }),
    discoveryAttempts: unique(
      list(
        source.discoveryAttempts ?? [],
        (entry) => {
          record(entry, "L’essai du spécialiste");
          const chance = nonnegative(entry.chance, "La chance de découverte");
          const roll = nonnegative(entry.roll, "Le tirage de découverte");
          if (chance > 1 || roll >= 1)
            throw new RangeError("Probabilité ou tirage invalide.");
          return {
            playerId: identifier(entry.playerId, "Le joueur"),
            cellId: identifier(entry.cellId, "La cellule prospectée"),
            specialistId: identifier(entry.specialistId, "La spécialité"),
            chance,
            roll,
            at: nonnegative(entry.at, "La date de l’essai", true),
          };
        },
        "Les essais de découverte",
      ),
      (entry) =>
        JSON.stringify([entry.playerId, entry.cellId, entry.specialistId]),
      "Les essais de découverte",
    ),
    announcements: collection("announcements", (entry) => {
      record(entry, "L’annonce de disparition");
      const dueAt = nonnegative(entry.dueAt, "La date de l’annonce", true);
      const publishedAt = instant(
        entry.publishedAt,
        "La publication de l’annonce",
      );
      if (publishedAt !== null && publishedAt < dueAt)
        throw new RangeError("Annonce publiée trop tôt.");
      return {
        id: identifier(entry.id, "L’annonce"),
        siteId: identifier(entry.siteId, "Le site annoncé"),
        name: identifier(entry.name, "Le nom annoncé"),
        message: identifier(entry.message, "Le message annoncé"),
        dueAt,
        publishedAt,
      };
    }),
    clueEvents: unique(
      list(
        source.clueEvents ?? [],
        (entry) => {
          record(entry, "L’événement d’indice");
          identifier(entry.siteId, "Le site de l’événement");
          identifier(entry.eventId, "L’événement de perte");
          nonnegative(entry.at, "La date de perte", true);
          nonnegative(entry.roll, "Le tirage de perte");
          if (entry.roll >= 1)
            throw new RangeError("Tirage de perte invalide.");
          return {
            siteId: entry.siteId,
            eventId: entry.eventId,
            at: entry.at,
            roll: entry.roll,
          };
        },
        "Les événements d’indices",
      ),
      (entry) => JSON.stringify([entry.siteId, entry.eventId]),
      "Les événements d’indices",
    ),
    discoveries: unique(
      list(source.discoveries ?? [], discovery, "discoveries"),
      (entry) =>
        JSON.stringify([entry.playerId, entry.targetKind, entry.targetId]),
      "Les connaissances du joueur",
    ),
    searches: collection("searches", searchAttempt),
    expeditions: collection("expeditions", expedition),
  };
  validateReferences(state);
  return state;
}

function gridDefinition(source) {
  record(source, "La grille d’exploration");
  const cellSizeMeters = nonnegative(
    source.cellSizeMeters,
    "La taille des cellules",
  );
  if (cellSizeMeters === 0)
    throw new RangeError("La taille des cellules doit être positive.");
  return {
    playAreaId: identifier(source.playAreaId, "La play area"),
    coordinateMode: choice(
      source.coordinateMode,
      ["gps", "simulation"],
      "Le mode de coordonnées",
    ),
    cellSizeMeters,
  };
}

function validateReferences(state) {
  if (state.grid === null && (state.cells.length || state.generation !== null))
    throw new RangeError(
      "Les cellules et leur génération nécessitent une grille.",
    );
  unique(
    state.cells,
    (cell) => `${cell.row}:${cell.column}`,
    "Les coordonnées de cellule",
  );
  unique(
    state.sites,
    (site) => site.cellId,
    "Les sites exceptionnels par cellule",
  );
  const cells = new Map(state.cells.map((cell) => [cell.id, cell]));
  const sites = new Map(state.sites.map((site) => [site.id, site]));
  const series = new Map(state.clueSeries.map((entry) => [entry.id, entry]));
  const clues = new Map(state.clues.map((entry) => [entry.id, entry]));
  const requireRef = (map, id, label) => {
    if (!map.has(id))
      throw new RangeError(`${label} : référence inconnue ${id}.`);
    return map.get(id);
  };
  for (const site of state.sites) requireRef(cells, site.cellId, "Le site");
  for (const entry of state.announcements) {
    const site = requireRef(sites, entry.siteId, "Le site annoncé");
    if (
      !["disappeared", "won"].includes(site.status) ||
      entry.dueAt <
        site.resolution.at + (site.status === "disappeared" ? 300_000 : 0)
    )
      throw new RangeError("Annonce de clôture invalide.");
  }
  for (const entry of state.clueSeries)
    requireRef(sites, entry.siteId, "La série");
  for (const entry of state.rumorKnowledge)
    requireRef(series, entry.seriesId, "La carte expliquée");
  for (const entry of state.discoveryAttempts)
    requireRef(cells, entry.cellId, "La cellule prospectée");
  for (const entry of state.rumorPurchases)
    if (entry.clueId !== null) {
      const clue = requireRef(clues, entry.clueId, "Le message remis");
      if (clue.kind !== "search")
        throw new RangeError("Une rumeur utile remet un indice de recherche.");
    }
  for (const clue of state.clues) {
    requireRef(sites, clue.siteId, "L’indice");
    if (clue.kind === "localization") {
      const entry = requireRef(series, clue.seriesId, "La série de l’indice");
      if (
        entry.siteId !== clue.siteId ||
        !entry.fragments.some((f) => f.id === clue.fragmentId)
      )
        throw new RangeError(
          "Le fragment de localisation ne correspond pas au site de l’indice.",
        );
    }
  }
  for (const known of state.discoveries)
    requireRef(
      known.targetKind === "cell" ? cells : sites,
      known.targetId,
      "La découverte",
    );
  for (const mission of [...state.searches, ...state.expeditions]) {
    if (mission.cellId !== null)
      requireRef(cells, mission.cellId, "La cellule de la mission");
    if (mission.siteId) {
      const site = requireRef(sites, mission.siteId, "Le site de l’expédition");
      if (mission.kind !== site.type)
        throw new RangeError(
          "Le type d’expédition ne correspond pas au site visé.",
        );
    }
    for (const clueId of mission.preparation.clueIds)
      requireRef(clues, clueId, "L’indice engagé");
    if (
      mission.status === "completed" &&
      (mission.result === null || mission.completedAt === null)
    )
      throw new RangeError(
        "Une expédition terminée doit conserver son résultat et sa date.",
      );
  }
}
