import test from "node:test";
import assert from "node:assert/strict";
import { QuestService } from "../server/quests/quest-service.js";
import { socialGame } from "./fixtures/player-social-game.js";
import { Quest } from "../app/js/core/quest.js";
import { validateEditorProject } from "../server/editor/editor-validation.js";
import { branchExample } from "../editor/js/branch-example.js";
import { Game } from "../app/js/core/game.js";
const modification = {
  target: "hero",
  property: "resource",
  operation: "remove",
  key: "gold",
  amount: 20,
};
test("une variation de commandement met à jour sa capacité et survit à une sauvegarde", () => {
  const f = fixture([
    {
      id: "commander",
      action: "Modifier",
      modification: {
        target: "hero",
        property: "stat",
        key: "command",
        amount: 1,
      },
    },
  ]);
  const hero = f.game.heroes.find((hero) => hero.playerId === "a"),
    before = hero.maxCommandPoints;
  f.service.command("a", { type: "publish", questId: "punition" });
  f.service.command("a", { type: "accept", questId: "punition" });
  assert.equal(hero.maxCommandPoints, before + 1);
  const restored = Game.fromJSON(f.game.toJSON());
  assert.equal(restored.getHero(hero.id).maxCommandPoints, before + 1);
  assert.deepEqual(restored.getHero(hero.id).baseStats, hero.baseStats);
});
function fixture(actions, links = []) {
  let { game } = socialGame();
  const definition = { id: "punition", title: "Punition", actions, links };
  const service = new QuestService({
    definitions: [definition],
    dialogues: {},
    getGame: () => game,
    replaceGame: (value) => {
      game = value;
    },
    now: () => 1000,
  });
  return {
    service,
    get game() {
      return game;
    },
    definition,
  };
}
test("Modifier prélève au plus l’or disponible, automatiquement et une seule fois", () => {
  const f = fixture([{ id: "modifier", action: "Modifier", modification }]);
  const hero = f.game.heroes.find((hero) => hero.playerId === "a");
  hero.resources.gold = 12;
  f.service.command("a", { type: "publish", questId: "punition" });
  const accepted = f.service.command("a", {
    type: "accept",
    questId: "punition",
  });
  assert.equal(f.game.getHero(hero.id).resources.gold, 0);
  assert.equal(f.service.engine.toJSON().instances[0].status, "completed");
  f.game.getHero(hero.id).resources.gold = 10;
  f.service.command("a", {
    type: "act",
    instanceId: accepted.instance.id,
    actionId: "modifier",
  });
  f.service.dispatchOfficialEvent(
    { id: "position", type: "PositionUpdated" },
    "a",
  );
  assert.equal(f.game.getHero(hero.id).resources.gold, 10);
});
test("la modification reste bloquée derrière sa dépendance et ignore les montants client", () => {
  const f = fixture([
    { id: "marcher", action: "Parcourir", distance: 20 },
    { id: "modifier", action: "Modifier", modification, requires: ["marcher"] },
  ]);
  const hero = f.game.heroes.find((hero) => hero.playerId === "a");
  hero.resources.gold = 50;
  f.service.command("a", { type: "publish", questId: "punition" });
  const accepted = f.service.command("a", {
    type: "accept",
    questId: "punition",
  });
  assert.equal(hero.resources.gold, 50);
  f.service.command("a", {
    type: "act",
    instanceId: accepted.instance.id,
    actionId: "modifier",
    amount: 500,
  });
  assert.equal(hero.resources.gold, 50);
  hero.travelProgress.totalDistanceMeters = 30;
  f.service.command("a", {
    type: "act",
    instanceId: accepted.instance.id,
    actionId: "marcher",
  });
  assert.equal(hero.resources.gold, 30);
});
test("les opérations inconnues sont rejetées par le modèle et l’éditeur valide Modifier", () => {
  assert.throws(
    () =>
      new Quest({
        id: "invalid",
        title: "Invalide",
        actions: [
          {
            id: "bad",
            action: "Modifier",
            modification: { ...modification, property: "arbitrary" },
          },
        ],
      }),
  );
  const project = branchExample();
  project.quest.actions.push({ id: "mod", action: "Modifier", modification });
  const result = validateEditorProject(project);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});
