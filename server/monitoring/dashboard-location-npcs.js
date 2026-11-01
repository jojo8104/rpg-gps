import { resolveLocationChief } from "../../app/js/core/location-chief-catalog.js";
import { BUILDING_DIALOGUES } from "../../app/js/core/building-dialogue-catalog.js";

/** Projection de supervision en lecture seule : aucune interaction ni rotation. */
export function dashboardLocationNpcs(game, location) {
  const result = [];
  const chief = resolveLocationChief(location);
  if (chief) result.push({ ...structuredClone(chief), source: "chief" });
  if (location.state !== "destroyed") {
    for (const [id, definition] of Object.entries(BUILDING_DIALOGUES)) {
      if (!(location.infrastructure?.[id] >= 1)) continue;
      result.push({
        id: `${id}:${location.id}`,
        name: `${definition.name} ${id === "tavern" ? "" : "· "}${location.name}`,
        title: definition.title,
        source: "building",
      });
    }
    if (location.infrastructure?.tavern >= 1)
      for (const offer of game?.tavernNpcService?.getOffers(location) ?? [])
        result.push({ ...structuredClone(offer), source: "tavern" });
  }
  for (const npc of Object.values(game?.worldState?.npcs ?? {})) {
    const data = npc.toJSON ? npc.toJSON() : structuredClone(npc);
    if (data.locationId === location.id)
      result.push({ ...data, name: data.name ?? data.id, source: "world" });
  }
  return result;
}
