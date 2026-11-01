import { editorPackages } from "../quests/editor-catalog.js";
import {
  preparationGameData,
  preparationCatalog,
  preparationBindings,
  standardScenario,
  standardLocations,
} from "./preparation-catalog.js";

/** Catalogue de lancement officiel, lu au démarrage comme les quêtes installées. */
export function buildScenarioBundles(projects = editorPackages) {
  const standardIds = new Set(
    standardScenario.locationSlots.map((slot) => slot.id),
  );
  const installedQuestIds = new Set(
    [...editorPackages, ...projects].flatMap((project) =>
      (project.campaign?.quests ?? [project.quest]).map((quest) => quest.id),
    ),
  );
  const standardCatalog = {
    ...structuredClone(preparationCatalog),
    quests: preparationCatalog.quests.filter(
      (quest) => !installedQuestIds.has(quest.id),
    ),
    locations: preparationCatalog.locations.filter((location) =>
      standardIds.has(location.id),
    ),
  };
  const bundles = new Map([
    [
      "chaos",
      {
        data: {
          ...preparationGameData,
          scenario: standardScenario,
          locations: standardLocations,
        },
        catalog: standardCatalog,
        bindings: preparationBindings.filter((binding) =>
          standardIds.has(binding.locationSlotId),
        ),
        questIds: standardCatalog.quests.map((quest) => quest.id),
      },
    ],
  ]);
  for (const project of projects) {
    const campaign = project.campaign;
    const id = campaign?.id ?? project.quest.id;
    if (!id || id === "chaos")
      throw new Error(
        "Le scénario éditeur doit avoir un identifiant distinct de chaos.",
      );
    const quests = campaign?.quests ?? [project.quest];
    const slots = new Map();
    for (const slot of project.world.locationSlots)
      slots.set(slot.id, structuredClone(slot));
    const locations = new Map();
    for (const location of project.world.locations)
      locations.set(location.id, {
        ...structuredClone(location),
        position: location.position ?? { latitude: 0, longitude: 0 },
      });
    const bindings = [...slots.keys()].map((slotId) => ({
      locationSlotId: slotId,
      locationId: slotId,
    }));
    const scenario = {
      playerStart: structuredClone(standardScenario.playerStart),
      mapDefinition: null,
      factions: [],
      id,
      name: campaign?.name || project.world.name || project.quest.title,
      intro:
        campaign?.intro ||
        project.quest.description ||
        "Scénario créé dans l’éditeur.",
      locationSlots: [...slots.values()],
      initialPhaseId: "editor-idle",
      phases: [
        {
          id: "editor-idle",
          title: "Quêtes à actions",
          description: "Progression assurée par le moteur de quêtes.",
          objectives: [],
          transitions: [],
        },
      ],
      dialogues: {},
      trails: [],
      events: [],
      victoryConditions: [],
      defeatConditions: [],
      worldState: {},
    };
    const questIds = quests.map((quest) => quest.id);
    const catalog = {
      ...structuredClone(preparationCatalog),
      initialLocationSlotIds: undefined,
      id,
      name: scenario.name,
      intro: scenario.intro,
      notice:
        "Scénario de l’éditeur : seuls ses quêtes et ses lieux sont chargés.",
      quests: quests.map((quest) => ({
        id: quest.id,
        name: quest.title,
        description: quest.description,
        linear: false,
        requires: quest.preparation?.requires ?? [],
        locationIds: preparationCatalog.quests.find(
          (entry) => entry.id === quest.id,
        )?.locationIds ?? [...slots.keys()],
      })),
      locations: [...slots.values()].map((slot) => {
        const location = locations.get(
          bindings.find((binding) => binding.locationSlotId === slot.id)
            .locationId,
        );
        return {
          ...structuredClone(
            preparationCatalog.locations.find(
              (entry) => entry.id === slot.id,
            ) ?? {
              id: slot.id,
              type: slot.type,
              placementOptions: ["scenario", "random", "map", "qr"],
              visibilityOptions: ["known", "discoverable", "quest"],
              defaultVisibility: slot.world?.visibility ?? "known",
            },
          ),
          name: location?.name ?? slot.id,
          permanent: slot.world?.role === "starting-point",
          interactionRadius: location?.interactionRadius ?? 25,
          detectionRadius: location?.detectionRadius ?? 60,
        };
      }),
    };
    bundles.set(id, {
      data: {
        ...preparationGameData,
        scenario,
        locations: [...locations.values()].filter((location) =>
          bindings.some((binding) => binding.locationId === location.id),
        ),
      },
      catalog,
      bindings,
      questIds,
      playArea: project.world.playArea
        ? structuredClone(project.world.playArea)
        : null,
    });
  }
  return bundles;
}
export const scenarioBundles = buildScenarioBundles();
export const launchScenarios = [...scenarioBundles.values()].map(
  ({ catalog, playArea }) => ({
    id: catalog.id,
    name: catalog.name,
    intro: catalog.intro,
    hasPlayArea: Boolean(playArea),
  }),
);
export function getScenarioBundle(id = "chaos") {
  const bundle = scenarioBundles.get(id);
  if (!bundle) throw new RangeError("Scénario inconnu.");
  return bundle;
}
