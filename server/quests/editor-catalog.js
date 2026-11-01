import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const questDataDirectory = new URL(
  "../../data/quests/",
  import.meta.url,
);
/** Paquets installés : lecture au démarrage, aucune modification des parties en cours. */
export function readEditorPackages(
  directory = questDataDirectory,
  { runtime = false } = {},
) {
  const registry = new URL("editor-catalog.json", directory);
  if (!existsSync(registry)) return [];
  const entries = JSON.parse(readFileSync(registry, "utf8"));
  if (!Array.isArray(entries)) throw new Error("Catalogue éditeur invalide.");
  return entries.map(({ packageDirectory }) => {
    if (
      typeof packageDirectory !== "string" ||
      !/^editor-[a-zA-Z0-9-]+$/.test(packageDirectory) ||
      path.basename(packageDirectory) !== packageDirectory
    )
      throw new Error("Chemin de paquet éditeur invalide.");
    const project = JSON.parse(
      readFileSync(
        new URL(`${packageDirectory}/project.json`, directory),
        "utf8",
      ),
    );
    if (runtime) {
      project.editorSource = structuredClone(project);
      const visit = (value) => {
        if (!value || typeof value !== "object") return;
        if (value.visual)
          for (const key of ["icon", "illustration"])
            if (value.visual[key]?.startsWith("assets/images/"))
              value.visual[key] =
                `/editor-media/${packageDirectory}/${value.visual[key].slice("assets/images/".length)}`;
        for (const [key, entry] of Object.entries(value))
          if (!["editorSource", "media"].includes(key)) visit(entry);
      };
      visit(project);
      for (const npc of project.assets?.npcs ?? []) {
        for (const dialogue of Object.values(project.dialogues ?? {})) {
          if (dialogue.speakerId !== npc.id) continue;
          if (npc.portraitEditor) {
            dialogue.portraitEditor = structuredClone(npc.portraitEditor);
            dialogue.appearance = structuredClone(
              npc.portraitEditor.appearance,
            );
            delete dialogue.portrait;
          } else if (npc.visual?.illustration || npc.visual?.icon) {
            dialogue.portrait = npc.visual.illustration ?? npc.visual.icon;
          }
        }
      }
    }
    return project;
  });
}
export const editorPackages = readEditorPackages(questDataDirectory, {
  runtime: true,
});
