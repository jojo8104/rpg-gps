import supply from "../../data/quests/royal-fort-supply.json" with { type: "json" };
import supplyDialogues from "../../data/quests/royal-fort-supply-dialogues.json" with { type: "json" };
import prospectors from "../../data/quests/missing-prospectors.json" with { type: "json" };
import prospectorsDialogues from "../../data/quests/missing-prospectors-dialogues.json" with { type: "json" };
import { editorPackages } from "./editor-catalog.js";

const entries = [
  { definition: supply, dialogues: supplyDialogues },
  { definition: prospectors, dialogues: prospectorsDialogues },
];
const catalog = new Map(entries.map((entry) => [entry.definition.id, entry]));
for (const project of editorPackages) {
  const roots = project.campaign?.initialQuestIds ?? [project.quest.id];
  for (const definition of project.campaign?.quests ?? [project.quest])
    catalog.set(definition.id, {
      definition,
      dialogues: project.dialogues,
      editorProject: project.editorSource,
      initial: roots.includes(definition.id),
    });
}
export const questCatalog = [...catalog.values()];
