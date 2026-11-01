import { parsePortraitEditorState } from "../../app/js/core/portrait-editor-state.js";
import { AutonomousGroup } from "../../app/js/core/autonomous-group.js";
import {
  createUniqueItemDefinition,
  getItemDefinition,
} from "../../app/js/core/item-catalog.js";
export function validateEditorAssets(project, { error, warn, area }) {
  const assets = project.assets ?? {},
    files = {},
    itemIds = new Set();
  for (const kind of ["npcs", "groups", "items"]) {
    const entries = assets[kind] ?? [];
    if (!Array.isArray(entries)) {
      error(`assets.${kind}`, "Un catalogue doit être une liste.");
      continue;
    }
    const ids = new Set(),
      normalized = [];
    for (const [index, entry] of entries.entries()) {
      const path = `assets.${kind}.${index}`;
      try {
        if (!entry || typeof entry !== "object" || !entry.id?.trim())
          throw new Error("Identifiant obligatoire.");
        if (ids.has(entry.id))
          throw new Error("Identifiant dupliqué dans ce catalogue.");
        ids.add(entry.id);
        if (kind === "groups") {
          const group = new AutonomousGroup(entry);
          if (
            !Number.isFinite(group.position.latitude) ||
            Math.abs(group.position.latitude) > 90 ||
            Math.abs(group.position.longitude) > 180
          )
            throw new Error("Coordonnées GPS invalides.");
          if (area && !area.allowsPlacement(group.position))
            throw new Error(
              "Groupe hors de la play area ou dans une exclusion.",
            );
          if (
            entry.originLocationId &&
            !project.world.locations.some(
              (place) => place.id === entry.originLocationId,
            )
          )
            throw new Error("Lieu d’origine inconnu.");
          normalized.push(group.toJSON());
        } else if (kind === "items") {
          if (!entry.name?.trim())
            throw new Error("Nom de l’objet obligatoire.");
          if (getItemDefinition(entry.id))
            throw new Error(
              "Cet identifiant appartient déjà au catalogue officiel d’objets.",
            );
          if (
            !entry.modifiers ||
            typeof entry.modifiers !== "object" ||
            Array.isArray(entry.modifiers) ||
            Object.values(entry.modifiers).some(
              (value) => !Number.isFinite(value),
            )
          )
            throw new Error(
              "Les bonus doivent être un objet de nombres finis.",
            );
          if (
            entry.category === "equipment" &&
            ![
              "head",
              "neck",
              "torso",
              "mainHand",
              "offHand",
              "feet",
              "accessory",
            ].includes(entry.equipmentSlot)
          )
            throw new Error("Un équipement doit avoir un emplacement valide.");
          normalized.push(createUniqueItemDefinition(entry));
          itemIds.add(entry.id);
        } else {
          if (!entry.name?.trim()) throw new Error("Nom du PNJ obligatoire.");
          if (entry.portraitEditor)
            parsePortraitEditorState(entry.portraitEditor);
          if (
            entry.locationId &&
            !project.world.locations.some(
              (place) => place.id === entry.locationId,
            )
          )
            throw new Error("Lieu du PNJ inconnu.");
          if (entry.dialogueId && !project.dialogues?.[entry.dialogueId])
            throw new Error("Dialogue du PNJ inconnu.");
          const dialogue = project.dialogues?.[entry.dialogueId];
          if (dialogue && dialogue.speakerId !== entry.id)
            throw new Error(
              "Le speakerId du dialogue doit correspondre à l’identifiant du PNJ.",
            );
          if (
            dialogue &&
            entry.locationId &&
            dialogue.locationId !== entry.locationId
          )
            throw new Error(
              "Le PNJ et son dialogue doivent utiliser le même lieu.",
            );
          normalized.push(structuredClone(entry));
        }
      } catch (issue) {
        error(path, issue.message);
      }
    }
    files[kind] = {
      name: {
        npcs: "npcs.json",
        groups: "autonomous-groups.json",
        items: "items.json",
      }[kind],
      data: normalized,
    };
    if (entries.length)
      warn(
        `assets.${kind}`,
        kind === "npcs"
          ? "Fiches narratives : intégrer les identifiants et dialogues ; elles ne créent pas de PNJ combattants ou de recrutement."
          : "Catalogue personnalisé à intégrer au serveur avant utilisation en partie. L’export ne fait apparaître aucun contenu automatiquement.",
      );
  }
  return { files, itemIds };
}
