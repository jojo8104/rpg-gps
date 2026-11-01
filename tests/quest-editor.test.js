import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import {
  getEditorCatalog,
  validateEditorProject,
} from "../server/editor/editor-validation.js";
import { createEditorHttpApi } from "../server/editor/editor-http-api.js";
import { branchExample } from "../editor/js/branch-example.js";
import {
  importProject,
  newProject,
  addAction,
  addLink,
  renameAction,
  renameLocation,
  removeAction,
} from "../editor/js/project.js";
import { createZip } from "../editor/js/zip.js";
import { addAsset, renameAsset } from "../editor/js/asset-model.js";
import { fieldHelp } from "../editor/js/field-help.js";
import {
  storeCurrentQuest,
  addCampaignQuest,
  linkCampaignQuests,
  switchCampaignQuest,
} from "../editor/js/campaign-model.js";
import { Quest } from "../app/js/core/quest.js";
import { Scenario } from "../app/js/core/scenario.js";
import { Location } from "../app/js/core/location.js";

test("scenario composes current quests and exports official transitions and launch manifest", () => {
  const samples = getEditorCatalog().samples;
  const project = importProject(samples[0].project);
  storeCurrentQuest(project);
  addCampaignQuest(project, samples[1].project);
  linkCampaignQuests(project, samples[0].id, samples[1].id, "success");
  const report = validateEditorProject(project);
  assert.equal(report.valid, true, JSON.stringify(report.errors));
  assert.deepEqual(report.files.campaign.data.initialQuestIds, [samples[0].id]);
  assert.equal(
    report.files[`campaignQuest:${samples[0].id}`].data.transitions.at(-1)
      .questId,
    samples[1].id,
  );
  assert.equal(report.summary.quests, 2);
  switchCampaignQuest(project, samples[1].id);
  assert.equal(project.quest.id, samples[1].id);
  assert.equal(
    project.campaign.quests[0].transitions.at(-1).outcome,
    "success",
  );
  assert.equal(
    importProject(JSON.parse(JSON.stringify(project))).campaign.quests.length,
    2,
  );
});

test("scenario validation rejects missing starts, unknown targets and quest cycles", () => {
  const project = importProject(branchExample());
  storeCurrentQuest(project);
  project.campaign.initialQuestIds = [];
  project.quest.transitions = [{ questId: "absent", outcome: "success" }];
  let report = validateEditorProject(project);
  assert.equal(report.valid, false);
  assert.ok(report.errors.some((issue) => /départ/.test(issue.message)));
  assert.ok(report.errors.some((issue) => /suite absente/.test(issue.message)));
  project.campaign.initialQuestIds = [project.quest.id];
  project.quest.transitions = [
    { questId: project.quest.id, outcome: "success" },
  ];
  report = validateEditorProject(project);
  assert.ok(report.errors.some((issue) => /cycle/.test(issue.message)));
});

test("custom NPC, group and item catalogues validate and survive project import/export", () => {
  const project = importProject(branchExample());
  const npc = addAsset(project, "npcs");
  npc.id = "intendant";
  npc.locationId = "capital";
  npc.dialogueId = "briefing";
  const group = addAsset(project, "groups");
  const item = addAsset(project, "items");
  project.quest.outcomes.success.push({
    type: "item",
    itemId: item.id,
    amount: 1,
  });
  const restored = importProject(JSON.parse(JSON.stringify(project)));
  const report = validateEditorProject(restored);
  assert.equal(report.valid, true, JSON.stringify(report.errors));
  assert.equal(report.files.npcs.data[0].id, "intendant");
  assert.equal(report.files.groups.data[0].id, group.id);
  assert.equal(report.files.items.data[0].unique, true);
  renameAsset(restored, "items", item.id, "preuve");
  assert.equal(restored.quest.outcomes.success.at(-1).itemId, "preuve");
  renameAsset(restored, "npcs", "intendant", "officier");
  assert.equal(restored.quest.actions[0].dialogue.qui, "officier");
  assert.equal(restored.dialogues.briefing.speakerId, "officier");
});

test("asset validation rejects duplicate ids, missing dialogue, invalid groups and equipment slots", () => {
  const project = importProject(branchExample());
  addAsset(project, "npcs").dialogueId = "missing";
  project.assets.npcs.push({ ...project.assets.npcs[0] });
  addAsset(project, "groups").position.latitude = 100;
  const item = addAsset(project, "items");
  item.category = "equipment";
  item.equipmentSlot = "unknown";
  const report = validateEditorProject(project);
  assert.equal(report.valid, false);
  assert.ok(
    report.errors.some((entry) =>
      /Dialogue du PNJ inconnu/.test(entry.message),
    ),
  );
  assert.ok(report.errors.some((entry) => /dupliqué/.test(entry.message)));
  assert.ok(
    report.errors.some((entry) => /Coordonnées GPS/.test(entry.message)),
  );
  assert.ok(
    report.errors.some((entry) => /emplacement valide/.test(entry.message)),
  );
});

test("contextual help explains source stock, server distance and OR/AND joins", () => {
  assert.match(
    fieldHelp(["quest", "actions", 0, "origine"], "Origine"),
    /stock réservé/,
  );
  assert.match(
    fieldHelp(["quest", "actions", 0, "distance"], "Distance"),
    /mètres/,
  );
  assert.match(
    fieldHelp(["quest", "actions", 0, "join"], "Jonction"),
    /OU.*ET/,
  );
});

test("editor examples and current quests export definitions accepted by the server models", () => {
  for (const project of [
    branchExample(),
    ...getEditorCatalog().samples.map((entry) => entry.project),
  ]) {
    const before = JSON.stringify(project);
    const report = validateEditorProject(project);
    assert.equal(report.valid, true, JSON.stringify(report.errors));
    assert.equal(JSON.stringify(project), before);
    assert.doesNotThrow(() => new Quest(report.files.quest.data));
    assert.doesNotThrow(() => new Scenario(report.files.scenario.data));
    for (const definition of report.files.locations.data)
      assert.doesNotThrow(() => new Location(definition));
  }
});

test("editor refuses cycles, missing dialogues and invalid item references", () => {
  const project = branchExample();
  project.quest.links.push({
    id: "cycle",
    from: "livrer",
    output: "success",
    to: "choisir",
  });
  delete project.dialogues[project.quest.actions[0].dialogue.id];
  project.quest.actions.find((entry) => entry.id === "collecter").quoi =
    "missing-item";
  const report = validateEditorProject(project);
  assert.equal(report.valid, false);
  assert.equal(report.files, undefined);
  assert.ok(report.errors.some((entry) => /cycle/i.test(entry.message)));
});

test("editor verifies references independently when the graph is valid", () => {
  const project = branchExample();
  delete project.dialogues[project.quest.actions[0].dialogue.id];
  project.quest.actions.find((entry) => entry.id === "collecter").origine =
    "missing-location";
  const report = validateEditorProject(project);
  assert.equal(report.valid, false);
  assert.ok(
    report.errors.some((entry) => /Dialogue absent/.test(entry.message)),
  );
  assert.ok(report.errors.some((entry) => /Lieu inconnu/.test(entry.message)));
});

test("map validation checks actual play area boundaries and official spacing", () => {
  const project = branchExample();
  project.world.playArea = {
    id: "area",
    name: "Terrain",
    polygon: [
      { latitude: 48, longitude: 2 },
      { latitude: 48, longitude: 2.02 },
      { latitude: 48.02, longitude: 2.02 },
      { latitude: 48.02, longitude: 2 },
    ],
  };
  project.world.locations[0].position = { latitude: 48.01, longitude: 2.01 };
  project.world.locations[1].position = { latitude: 48.01, longitude: 2.01 };
  project.world.locations[2].position = { latitude: 49, longitude: 2 };
  const report = validateEditorProject(project);
  assert.equal(report.valid, false);
  assert.ok(report.errors.some((entry) => /Trop proche/.test(entry.message)));
  assert.ok(
    report.errors.some((entry) => /hors de la play area/.test(entry.message)),
  );
});

test("action and location renames preserve links, dependencies, dialogue and world references", () => {
  const project = importProject(branchExample());
  project.quest.actions[1].requires = ["choisir"];
  project.quest.events = [
    { id: "event", on: "ActionCompleted", actionId: "choisir", effects: [] },
  ];
  const position = project.editor.positions.choisir;
  renameAction(project, "choisir", "mission");
  assert.equal(project.quest.links[0].from, "mission");
  assert.deepEqual(project.quest.actions[1].requires, ["mission"]);
  assert.equal(project.quest.events[0].actionId, "mission");
  assert.deepEqual(project.editor.positions.mission, position);
  renameLocation(project, "capital", "depart");
  assert.equal(project.quest.actions[0].lieu, "depart");
  assert.equal(
    project.dialogues[project.quest.actions[0].dialogue.id].locationId,
    "depart",
  );
  removeAction(project, "mission");
  assert.ok(
    project.quest.links.every(
      (entry) => entry.from !== "mission" && entry.to !== "mission",
    ),
  );
  assert.deepEqual(project.quest.actions[0].requires, []);
});

test("new typed actions serialize without DOM and imported extension fields survive", () => {
  const project = newProject();
  const talk = addAction(project, "Parler");
  const reach = addAction(project, "Atteindre");
  addLink(project, talk.id, "success", reach.id);
  assert.ok(project.dialogues[talk.dialogue.id].nodes.length);
  assert.throws(() => addLink(project, talk.id, "success", reach.id), /existe/);
  project.quest.customEditorExtension = { value: 42 };
  const copy = importProject(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(copy.quest.customEditorExtension, { value: 42 });
  assert.notEqual(copy.quest, project.quest);
});

test("ZIP keeps UTF-8 JSON content and valid central-directory offsets", async () => {
  const content = '{"title":"Une quête"}';
  const buffer = Buffer.from(
    await createZip([{ name: "quête.json", content }]).arrayBuffer(),
  );
  assert.equal(buffer.readUInt32LE(0), 0x04034b50);
  const length = buffer.readUInt16LE(26);
  assert.equal(buffer.subarray(30, 30 + length).toString(), "quête.json");
  assert.equal(
    buffer
      .subarray(30 + length, 30 + length + buffer.readUInt32LE(18))
      .toString(),
    content,
  );
  const end = buffer.length - 22;
  assert.equal(buffer.readUInt32LE(end), 0x06054b50);
  assert.equal(buffer.readUInt32LE(buffer.readUInt32LE(end + 16)), 0x02014b50);
  assert.equal(
    buffer.readUInt32LE(14),
    buffer.readUInt32LE(buffer.readUInt32LE(end + 16) + 16),
  );
});

test("editor HTTP API validates drafts without applying them to a running game", async () => {
  const handle = createEditorHttpApi();
  const server = createServer(async (req, res) => {
    if (!(await handle(req, res))) {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base + "/api/editor/catalog")).status, 200);
    const send = (body, origin) =>
      fetch(base + "/api/editor/validate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(origin ? { Origin: origin } : {}),
        },
        body,
      });
    assert.equal(
      (await send(JSON.stringify(branchExample()), base)).status,
      200,
    );
    assert.equal((await send("{}", "malformed")).status, 403);
    assert.equal((await send("{}", "https://another.example")).status, 403);
    assert.equal((await send("{")).status, 400);
    const response = await send(JSON.stringify(newProject()));
    assert.equal((await response.json()).valid, false);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
