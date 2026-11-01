import { randomUUID } from "node:crypto";
import { validateLobbyPlayArea } from "./scenario-play-area.js";
import { mapBounds } from "../maps/osm-map-service.js";
import { mapPackageKey } from "../../app/js/map/map-package.js";

/** Bibliothèque privée ; seuls les choix explicites sont conservés. */
export class SavedMapLibrary {
  constructor(entries = []) {
    this.entries = new Map(entries.map((entry) => [entry.id, entry]));
  }
  owner(player) {
    if (player.accountId) return `account:${player.accountId}`;
    if (player.identityHash) return `identity:${player.identityHash}`;
    if (player.id) return `player:${player.id}`;
    throw new RangeError("Aucune identité joueur disponible.");
  }
  list(player) {
    return [...this.entries.values()]
      .filter((entry) => entry.owner === this.owner(player))
      .sort((a, b) => b.savedAt - a.savedAt)
      .map(({ owner, ...entry }) =>
        structuredClone({
          ...entry,
          geographyKey: mapPackageKey(entry.playArea.polygon),
        }),
      );
  }
  save(player, { name, playArea }, now) {
    if (typeof name !== "string" || !name.trim() || name.trim().length > 60)
      throw new RangeError("Donnez un nom de 1 à 60 caractères à la carte.");
    const area = validateLobbyPlayArea(playArea, "saved");
    mapBounds(area.polygon);
    const owner = this.owner(player);
    const existing = [...this.entries.values()].find(
      (entry) => entry.owner === owner && entry.name === name.trim(),
    );
    if (existing)
      throw new RangeError(
        "Ce nom existe déjà. Choisissez un autre nom ou supprimez l’ancienne carte.",
      );
    if (!existing && this.list(player).length >= 50)
      throw new RangeError("La bibliothèque contient déjà 50 cartes.");
    const entry = {
      id: existing?.id ?? randomUUID(),
      owner,
      name: name.trim(),
      playArea: { ...area, name: name.trim() },
      savedAt: now,
      geographyKey: mapPackageKey(area.polygon),
    };
    this.entries.set(entry.id, entry);
    return this.list(player).find((value) => value.id === entry.id);
  }
  delete(player, id) {
    if (this.entries.get(id)?.owner !== this.owner(player))
      throw new RangeError("Carte introuvable.");
    this.entries.delete(id);
  }
  toJSON() {
    return structuredClone([...this.entries.values()]);
  }
}
