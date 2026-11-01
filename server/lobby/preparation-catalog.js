import { readFileSync } from "node:fs";
import { questCatalog } from "../quests/quest-catalog.js";
import { editorPackages } from "../quests/editor-catalog.js";
import { composeScenario } from "../../app/js/core/scenario-composer.js";
import { qrLocationArtKey } from "./qr-location-art.js";

const read = (path) =>
  JSON.parse(
    readFileSync(new URL(`../../data/${path}`, import.meta.url), "utf8"),
  );
const base = read("scenarios/chaos.json");
const scenario = composeScenario(
  composeScenario(base, read("scenarios/repression.json")),
  read("scenarios/granaries-of-the-king.json"),
);
const locations = [
  ...read("locations.json"),
  ...read("repression-locations.json"),
  ...read("granaries-locations.json"),
];
// Le catalogue de conception peut inclure les paquets ; le monde d’origine reste isolé.
export const standardScenario = structuredClone(scenario);
export const standardLocations = structuredClone(locations);
for (const project of editorPackages) {
  for (const slot of project.world.locationSlots)
    if (!scenario.locationSlots.some((entry) => entry.id === slot.id))
      scenario.locationSlots.push(structuredClone(slot));
  for (const location of project.world.locations)
    if (!locations.some((entry) => entry.id === location.id))
      locations.push({
        ...structuredClone(location),
        position: location.position ?? { latitude: 0, longitude: 0 },
      });
    else if (location.visual)
      locations.find((entry) => entry.id === location.id).visual =
        structuredClone(location.visual);
}
export const preparationGameData = {
  scenario,
  locations,
  heroClasses: read("hero-classes.json"),
  heroAptitudes: read("hero-aptitudes.json"),
  unitDefinitions: read("units.json"),
};
export const preparationBindings = scenario.locationSlots.map((slot) => ({
  locationSlotId: slot.id,
  locationId:
    {
      refuge: "fort-nord",
      capital: "royal-capital",
      "royal-camp": "village-vert",
      "prospectors-battlefield": "prospector-battlefield",
    }[slot.id] ?? slot.id,
}));
const fields = new Set([
  "locationSlotId",
  "locationId",
  "lieu",
  "origine",
  "destinataire",
  "targetLocationId",
  "sourceLocationSlotId",
  "destinationLocationSlotId",
]);
function references(value, result = new Set()) {
  if (Array.isArray(value)) value.forEach((entry) => references(entry, result));
  else if (value && typeof value === "object")
    for (const [key, entry] of Object.entries(value)) {
      if (fields.has(key) && typeof entry === "string") result.add(entry);
      else references(entry, result);
    }
  return result;
}
export const preparationCatalog = {
  initialLocationSlotIds: base.mapDefinition?.initialLocationSlotIds,
  id: base.id,
  name: base.name,
  intro: base.intro,
  notice:
    "Les quêtes ci-dessous utilisent le moteur de quêtes actuel. La progression de l’ancien scénario reste désactivée.",
  quests: questCatalog.map(({ definition }) => ({
    id: definition.id,
    name: definition.title,
    description: definition.description,
    linear: definition.preparation?.linear ?? false,
    requires: definition.preparation?.requires ?? [],
    locationIds: [...references(definition)].filter(
      (id) =>
        locations.some((l) => l.id === id) ||
        scenario.locationSlots.some((s) => s.id === id),
    ),
  })),
  locations: scenario.locationSlots.map((slot) => {
    const location =
      locations.find(
        (l) =>
          l.id ===
          preparationBindings.find((b) => b.locationSlotId === slot.id)
            ?.locationId,
      ) ?? locations.find((l) => l.type === slot.type);
    const starting = slot.world?.role === "starting-point";
    return {
      id: slot.id,
      name: location?.name ?? slot.id,
      type: slot.type,
      qrArt: qrLocationArtKey({
        type: slot.type,
        roles: [...(location?.roles ?? []), ...(slot.roles ?? [])],
        resources: location?.resources,
      }),
      permanent:
        base.mapDefinition?.initialLocationSlotIds?.includes(slot.id) ||
        starting ||
        slot.roles?.includes("capital-economy") === true,
      interactionRadius: location?.interactionRadius ?? 25,
      detectionRadius: location?.detectionRadius ?? 60,
      placementOptions:
        slot.preparation?.placementOptions ??
        (slot.defaultPlacement?.strategy === "distance"
          ? ["scenario"]
          : [
              "scenario",
              "random",
              "map",
              "qr",
              ...(!starting && !slot.roles?.includes("capital-economy")
                ? ["player-walk", "validated-cell"]
                : []),
            ]),
      visibilityOptions:
        slot.preparation?.visibilityOptions ??
        (starting
          ? ["known"]
          : slot.world?.visibility === "discoverable"
            ? ["discoverable", "quest"]
            : slot.appearance &&
                slot.appearance.on !== "immediate" &&
                slot.world?.visibility !== "known"
              ? ["quest"]
              : ["known", "discoverable", "activation"]),
      defaultVisibility:
        slot.world?.visibility ??
        (slot.appearance && slot.appearance.on !== "immediate"
          ? "quest"
          : "known"),
    };
  }),
};
