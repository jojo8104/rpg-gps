import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { validateEditorProject } from "./editor-validation.js";
import { validateProjectMedia } from "./editor-media.js";
import { questDataDirectory } from "../quests/editor-catalog.js";

let pending = Promise.resolve();
/** Paquet immuable puis remplacement atomique du registre ; anciens paquets conservés. */
export function installEditorProject(input, directory = questDataDirectory) {
  const operation = pending.then(async () => {
    const report = validateEditorProject(input);
    if (!report.valid) return report;
    const project = report.project;
    if (
      project.strategicEvents?.length ||
      project.strategicBlocks?.length ||
      [project.quest, ...(project.campaign?.quests ?? [])].some(
        (q) => q.cooperation || q.actions?.some((a) => a.cooperation),
      )
    )
      return {
        valid: false,
        errors: [
          {
            path: "strategicEvents",
            message:
              "Conception enregistrable et exportable. Installation bloquée : exécution serveur de la coopération et des événements stratégiques à développer.",
          },
        ],
        warnings: report.warnings,
      };
    const quests = project.campaign?.quests ?? [project.quest];
    if (!quests.every((quest) => /^[a-zA-Z0-9_-]+$/.test(quest.id)))
      throw new Error(
        "Pour enregistrer, les identifiants de quête utilisent lettres, chiffres, tirets ou underscores.",
      );
    const id = project.campaign?.id ?? project.quest.id;
    if (id === "chaos")
      throw new Error(
        "L’identifiant chaos est réservé au scénario du jeu. Choisissez un identifiant différent dans Scénario & quêtes.",
      );
    const registryUrl = new URL("editor-catalog.json", directory);
    let registry = [];
    try {
      registry = JSON.parse(await readFile(registryUrl, "utf8"));
    } catch (issue) {
      if (issue.code !== "ENOENT") throw issue;
    }
    if (!Array.isArray(registry))
      throw new Error("Catalogue éditeur invalide.");
    for (const entry of registry.filter((entry) => entry.id !== id))
      if (
        entry.questIds.some((questId) =>
          quests.some((quest) => quest.id === questId),
        )
      )
        throw new Error(
          "Une quête de ce projet appartient déjà à un autre scénario installé.",
        );
    const packageDirectory = `editor-${randomUUID()}`;
    const packageUrl = new URL(`${packageDirectory}/`, directory);
    await mkdir(packageUrl, { recursive: true });
    const save = (name, data) =>
      writeFile(
        new URL(name, packageUrl),
        JSON.stringify(data, null, 2) + "\n",
        "utf8",
      );
    await save("project.json", project);
    const media = validateProjectMedia(project, (path, message) => {
      throw new Error(`${path} : ${message}`);
    });
    if (media.files.length) {
      await mkdir(new URL("assets/images/", packageUrl), { recursive: true });
      for (const file of media.files)
        await writeFile(new URL(file.name, packageUrl), file.content);
    }
    await mkdir(new URL("quests/", packageUrl));
    for (const quest of quests) await save(`quests/${quest.id}.json`, quest);
    // Ces fichiers restent les mêmes définitions que celles téléchargées par l’éditeur.
    for (const file of Object.values(report.files)) {
      if (!/^[a-zA-Z0-9_-]+\.json$/.test(file.name)) continue;
      await save(file.name, file.data);
    }
    registry = registry.filter((entry) => entry.id !== id);
    registry.push({
      id,
      packageDirectory,
      questIds: quests.map((quest) => quest.id),
      initialQuestIds: project.campaign?.initialQuestIds ?? [project.quest.id],
    });
    const temporary = new URL(`editor-catalog-${randomUUID()}.tmp`, directory);
    await writeFile(
      temporary,
      JSON.stringify(registry, null, 2) + "\n",
      "utf8",
    );
    await rename(temporary, registryUrl);
    return {
      valid: true,
      installed: true,
      packageDirectory,
      questIds: quests.map((quest) => quest.id),
      restartRequired: true,
    };
  });
  pending = operation.catch(() => {});
  return operation;
}
