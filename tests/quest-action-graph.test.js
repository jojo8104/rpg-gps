import assert from "node:assert/strict";
import test from "node:test";
import { Quest } from "../app/js/core/quest.js";
import { QuestEngine } from "../app/js/core/quest-engine.js";
import { QuestService } from "../server/quests/quest-service.js";
import { Location } from "../app/js/core/location.js";
import { socialGame } from "./fixtures/player-social-game.js";
import { renderQuestEngineJournal } from "../app/js/ui/quest-engine-journal-view.js";

const actor = { playerId: "a", heroId: "hero-a" };
const reach = (id, extra = {}) => ({
  id,
  action: "Atteindre",
  lieu: "site",
  ...extra,
});
const link = (id, from, output, to, conditions = []) => ({
  id,
  from,
  output,
  to,
  conditions,
});
function branched() {
  return {
    id: "branch",
    title: "Choisir une mission",
    actions: [
      {
        id: "choose",
        action: "Parler",
        lieu: "site",
        dialogue: { id: "choice", qui: "guard" },
        outputs: ["delivery", "exploration"],
      },
      reach("delivery"),
      reach("exploration"),
      reach("delivery-next", { requires: ["delivery"] }),
      reach("finish"),
    ],
    links: [
      link("delivery-path", "choose", "delivery", "delivery"),
      link("explore-path", "choose", "exploration", "exploration"),
      link("delivery-end", "delivery-next", "success", "finish"),
      link("explore-end", "exploration", "success", "finish"),
    ],
    outcomes: {
      success: [{ type: "xp", amount: 50 }],
      failure: [],
      abandoned: [],
    },
  };
}
function harness(definition = branched(), snapshot = null) {
  const effects = [],
    activations = [];
  let result = { success: true },
    allowed = true;
  const adapter = {
    transaction: (operation) => operation(),
    canAccess: () => allowed,
    participants: () => ["a"],
    perform: () => result,
    applyEffect: (effect) => effects.push(effect),
    create() {},
    activate: (action) => activations.push(action.id),
  };
  const engine = new QuestEngine({
    definitions: [definition],
    adapter,
    snapshot,
    now: () => 1000,
  });
  const accepted = snapshot
    ? { instance: engine.state.instances[0] }
    : (engine.publish(definition.id, actor),
      engine.accept({ questId: definition.id, actor }));
  const id = accepted.instance.id;
  return {
    engine,
    effects,
    activations,
    id,
    act(actionId, output = "success", intent = {}) {
      result = { success: true, output };
      return engine.act({ instanceId: id, actionId, actor, intent });
    },
    deny() {
      allowed = false;
    },
    perform(value) {
      result = value;
    },
    state: () => engine.toJSON().instances[0],
  };
}

for (const choice of ["delivery", "exploration"]) {
  test(`branche ${choice} : seule la voie choisie progresse, jonction et récompense uniques`, () => {
    const h = harness();
    assert.deepEqual(h.activations, ["choose"]);
    assert.equal(h.act("finish").reason, "action_not_active");
    h.act("choose", choice, {
      output: choice === "delivery" ? "exploration" : "delivery",
    });
    const discarded = choice === "delivery" ? "exploration" : "delivery";
    assert.equal(h.state().actions[discarded].status, "skipped");
    assert.equal(h.act(discarded).reason, "action_not_active");
    h.act(choice);
    if (choice === "delivery") h.act("delivery-next");
    else assert.equal(h.state().actions["delivery-next"].status, "skipped");
    assert.equal(h.state().actions.finish.status, "active");
    h.act("finish");
    assert.equal(h.state().status, "completed");
    assert.equal(h.effects.length, 1);
    assert.equal(h.act("finish").reason, "quest_not_active");
    assert.equal(h.effects.length, 1);
    const resumed = harness(branched(), h.engine.toJSON());
    assert.deepEqual(resumed.state(), h.state());
    assert.equal(resumed.effects.length, 0);
  });
}

test("les conditions de lien sont figées à la sortie et une branche refusée est écartée", () => {
  const definition = {
    id: "conditional",
    title: "Conditions",
    actions: [reach("source"), reach("target")],
    links: [
      link("gate", "source", "success", "target", [
        { type: "flag", path: "allowed", equals: true },
      ]),
    ],
  };
  const h = harness(definition);
  h.deny();
  h.act("source");
  assert.equal(h.state().actions.target.status, "skipped");
  assert.equal(h.state().links.gate, "discarded");
  assert.equal(h.state().status, "completed");
});

test("jonction all : attend deux sorties sélectionnées, any : une suffit", () => {
  for (const join of ["all", "any"]) {
    const definition = {
      id: join,
      title: join,
      actions: [reach("a"), reach("b"), reach("merge", { join })],
      links: [
        link("a-end", "a", "success", "merge"),
        link("b-end", "b", "success", "merge"),
      ],
    };
    const h = harness(definition);
    h.act("a");
    assert.equal(
      h.state().actions.merge.status,
      join === "all" ? "locked" : "active",
    );
    h.act("b");
    assert.equal(h.state().actions.merge.status, "active");
    assert.equal(h.activations.filter((id) => id === "merge").length, 1);
    h.act("merge");
    assert.equal(h.state().status, "completed");
  }
});

test("jonction all écartée si un lien est refusé ; requires reste obligatoire", () => {
  const definition = branched();
  definition.actions.find((action) => action.id === "finish").join = "all";
  const h = harness(definition);
  h.act("choose", "delivery");
  assert.equal(h.state().actions.finish.status, "skipped");
  assert.equal(h.state().actions["delivery-next"].status, "locked");
  h.act("delivery");
  h.act("delivery-next");
  assert.equal(h.state().status, "completed");
});

test("fin explicite failure termine la quête et écarte les objectifs restants", () => {
  const definition = {
    id: "end",
    title: "Fin",
    actions: [reach("end", { terminalOutcome: "failure" }), reach("other")],
    outcomes: {
      success: [],
      failure: [{ type: "narration", text: "Retour" }],
      abandoned: [],
    },
  };
  const h = harness(definition);
  h.act("end");
  assert.equal(h.state().status, "failed");
  assert.equal(h.state().actions.other.status, "skipped");
  assert.equal(h.effects.length, 1);
});

test("réaction filtrée par sortie et condition évaluée après ses effets", () => {
  const definition = branched();
  definition.events = [
    {
      id: "selected",
      on: "ActionCompleted",
      actionId: "choose",
      output: "delivery",
      effects: [{ type: "narration", text: "Livraison" }],
    },
    {
      id: "ignored",
      on: "ActionCompleted",
      actionId: "choose",
      output: "exploration",
      effects: [{ type: "narration", text: "Exploration" }],
    },
  ];
  const h = harness(definition);
  h.act("choose", "delivery");
  assert.deepEqual(
    h.effects.map((effect) => effect.text),
    ["Livraison"],
  );
});

test("refus et sortie inconnue ne modifient pas la progression", () => {
  const h = harness();
  const before = h.engine.toJSON();
  h.perform({ success: false, reason: "dialogue_pending" });
  assert.equal(
    h.engine.act({ instanceId: h.id, actionId: "choose", actor }).reason,
    "dialogue_pending",
  );
  assert.deepEqual(h.engine.toJSON(), before);
  assert.throws(() => h.act("choose", "invented"), /Sortie/);
  assert.deepEqual(h.engine.toJSON(), before);
});

test("sauvegarde et reprise au milieu d'une branche conservent le choix", () => {
  const h = harness();
  h.act("choose", "delivery");
  const resumed = harness(branched(), h.engine.toJSON());
  assert.equal(resumed.state().actions.exploration.status, "skipped");
  assert.equal(
    resumed.act("choose", "exploration").reason,
    "action_not_active",
  );
  resumed.act("delivery");
  resumed.act("delivery-next");
  resumed.act("finish");
  assert.equal(resumed.state().status, "completed");
  const corrupted = h.engine.toJSON();
  delete corrupted.instances[0].links["delivery-path"];
  assert.throws(() => harness(branched(), corrupted), /manquante/);
});

test("une ancienne sauvegarde sans liens reste lisible", () => {
  const definition = {
    id: "legacy",
    title: "Avant",
    actions: [reach("first"), reach("second", { requires: ["first"] })],
  };
  const h = harness(definition);
  const snapshot = h.engine.toJSON();
  delete snapshot.instances[0].links;
  const resumed = harness(definition, snapshot);
  resumed.act("first");
  resumed.act("second");
  assert.equal(resumed.state().status, "completed");
});

test("validation : références, sorties, cycles mixtes et fins invalides refusés", () => {
  const invalid = [
    { links: [link("bad", "choose", "unknown", "delivery")] },
    { links: [link("bad", "choose", "delivery", "missing")] },
    { links: [link("bad", "choose", "delivery", "choose")] },
    {
      links: [
        link("one", "choose", "delivery", "delivery"),
        link("one", "choose", "exploration", "exploration"),
      ],
    },
    {
      actions: [reach("a", { requires: ["b"] }), reach("b")],
      links: [link("cycle", "a", "success", "b")],
    },
    { actions: [reach("a", { outputs: ["custom"] })], links: [] },
    { actions: [reach("a", { join: "unknown" })], links: [] },
    { actions: [reach("a", { terminalOutcome: "unknown" })], links: [] },
    {
      actions: [reach("a", { terminalOutcome: "success" }), reach("b")],
      links: [link("bad", "a", "success", "b")],
    },
  ];
  for (const update of invalid)
    assert.throws(() => new Quest({ ...branched(), ...update }));
});

function serviceFixture(definition, dialogues = {}) {
  const { game, heroes } = socialGame();
  game.locations = [
    new Location({
      id: "site",
      name: "Site",
      type: "village",
      source: "scenario",
      position: { latitude: 0, longitude: 0 },
      heroIds: [heroes[0].id],
    }),
  ];
  game.getPlayer("a").discoverLocation("site");
  const service = new QuestService({
    definitions: [definition],
    dialogues,
    getGame: () => game,
    replaceGame() {},
    now: () => 1000,
  });
  service.command("a", { type: "publish", questId: definition.id });
  const result = service.command("a", {
    type: "accept",
    questId: definition.id,
  });
  return { game, service, hero: heroes[0], instanceId: result.instance.id };
}

test("dialogue serveur : le choix officiel détermine la sortie, pas le résultat client", () => {
  const definition = branched();
  const { service, instanceId } = serviceFixture(definition, {
    choice: {
      speakerId: "guard",
      locationId: "site",
      initialNodeId: "start",
      nodes: [
        {
          id: "start",
          lines: [],
          choices: [
            { id: "deliver", label: "Livrer", goal: "delivery" },
            {
              id: "explore",
              label: "Explorer",
              goal: "exploration",
              conditions: [
                { type: "hasResource", resource: "gold", amount: 100000 },
              ],
            },
          ],
        },
      ],
    },
  });
  const command = { type: "act", instanceId, actionId: "choose" };
  assert.equal(
    service.command("b", { ...command, choiceId: "deliver" }).reason,
    "instance_access",
  );
  assert.equal(
    service.command("a", { ...command, choiceId: "explore" }).reason,
    "dialogue_choice_unavailable",
  );
  const result = service.command("a", {
    ...command,
    choiceId: "deliver",
    output: "exploration",
  });
  assert.equal(result.instance.actions.choose.output, "delivery");
  assert.equal(result.instance.actions.exploration.status, "skipped");
});

for (const output of ["victory", "defeat", "draw"]) {
  test(`preuve de combat officielle : branche ${output}`, () => {
    const definition = {
      id: "battle",
      title: "Combat",
      actions: [
        {
          id: "fight",
          action: "Combattre",
          qui: "enemy",
          outputs: ["victory", "defeat", "draw"],
        },
        reach("next"),
      ],
      links: [link("next", "fight", output, "next")],
    };
    const { game, service, hero, instanceId } = serviceFixture(definition);
    const command = {
      type: "act",
      instanceId,
      actionId: "fight",
      battleId: "battle-proof",
    };
    assert.equal(service.command("a", command).reason, "battle_not_finished");
    addBattle(game, {
      id: "battle-proof",
      status: "finished",
      finishedAt: 1001,
      winnerTeamId:
        output === "victory" ? "own" : output === "defeat" ? "opponent" : null,
      teams: [
        { id: "own", heroes: [{ sourceId: hero.id }] },
        { id: "opponent", heroes: [], autonomousGroupId: "enemy" },
      ],
    });
    service.dispatchOfficialEvent(
      { id: "official", type: "BattleFinished", battleId: "battle-proof" },
      "a",
    );
    const state = service.engine.toJSON().instances[0];
    assert.equal(state.actions.fight.output, output);
    assert.equal(state.actions.fight.evidenceId, "battle-proof");
    assert.equal(state.actions.next.status, "completed");
    assert.equal(state.status, "completed");
  });
}

test("une défaite ne valide pas les anciens objectifs de victoire", () => {
  const definition = {
    id: "old-battle",
    title: "Combat",
    actions: [{ id: "fight", action: "Combattre", qui: "enemy" }],
  };
  const { game, service, hero, instanceId } = serviceFixture(definition);
  addBattle(game, {
    id: "loss",
    status: "finished",
    finishedAt: 1001,
    winnerTeamId: "opponent",
    teams: [
      { id: "own", heroes: [{ sourceId: hero.id }] },
      { id: "opponent", heroes: [], autonomousGroupId: "enemy" },
    ],
  });
  assert.equal(
    service.command("a", {
      type: "act",
      instanceId,
      actionId: "fight",
      battleId: "loss",
    }).reason,
    "required_victory_missing",
  );
});

test("le journal distingue une branche écartée sans la compter comme objectif obligatoire", () => {
  const element = {};
  renderQuestEngineJournal(element, {
    offers: [],
    instances: [
      {
        title: "Mission",
        status: "completed",
        actions: [
          { status: "completed", label: "Livrer" },
          { status: "skipped", label: "Explorer" },
        ],
      },
    ],
  });
  assert.match(element.innerHTML, /1\/1 actions accomplies/);
  assert.match(element.innerHTML, /Explorer \(chemin écarté\)/);
});

function addBattle(game, data) {
  game.battles.push({ ...data, toJSON: () => structuredClone(data) });
}

test("réaction failQuest sur une sortie : la sauvegarde terminée reste restaurable", () => {
  const definition = branched();
  definition.events = [
    {
      id: "failure",
      on: "ActionCompleted",
      actionId: "choose",
      output: "delivery",
      effects: [{ type: "failQuest" }],
    },
  ];
  const h = harness(definition);
  h.act("choose", "delivery");
  assert.equal(h.state().status, "failed");
  assert.equal(harness(definition, h.engine.toJSON()).state().status, "failed");
});

test("les effets de réaction précèdent la décision et celle-ci ne se rouvre pas", () => {
  const definition = branched();
  definition.links[0].conditions = [
    { type: "flag", path: "allowed", equals: true },
  ];
  definition.events = [
    {
      id: "flag",
      on: "ActionCompleted",
      actionId: "choose",
      output: "delivery",
      effects: [{ type: "flag", path: "allowed", value: true }],
    },
  ];
  const h = harness(definition);
  let allowed = false;
  h.engine.adapter.canAccess = () => allowed;
  h.engine.adapter.applyEffect = () => {
    allowed = true;
  };
  h.act("choose", "delivery");
  assert.equal(h.state().links["delivery-path"], "selected");
  allowed = false;
  h.act("delivery");
  assert.equal(h.state().links["delivery-path"], "selected");
});

test("transaction : erreur de lien restaure progression, récompenses et monde", () => {
  const definition = branched();
  definition.actions[0].rewards = [{ type: "xp", amount: 10 }];
  definition.links[0].conditions = [
    { type: "flag", path: "invalid", equals: true },
  ];
  const h = harness(definition);
  const before = h.engine.toJSON();
  h.engine.adapter.canAccess = () => {
    throw new Error("Erreur de condition");
  };
  h.engine.adapter.transaction = (operation) => {
    const length = h.effects.length;
    try {
      return operation();
    } catch (error) {
      h.effects.length = length;
      throw error;
    }
  };
  assert.throws(() => h.act("choose", "delivery"), /condition/);
  assert.deepEqual(h.engine.toJSON(), before);
  assert.equal(h.effects.length, 0);
});

test("équipe : un seul choix partagé, affectation du prochain objectif respectée", () => {
  const definition = branched();
  definition.participationModes = ["equipe"];
  definition.actions.find(
    (action) => action.id === "delivery",
  ).assignedPlayerId = "b";
  const adapter = {
    transaction: (operation) => operation(),
    canAccess: () => true,
    participants: () => ["a", "b"],
    perform: () => ({ success: true, output: "delivery" }),
    applyEffect() {},
    create() {},
  };
  const engine = new QuestEngine({ definitions: [definition], adapter });
  engine.publish(definition.id, actor);
  const { instance } = engine.accept({
    questId: definition.id,
    mode: "equipe",
    actor,
  });
  engine.act({ instanceId: instance.id, actionId: "choose", actor });
  assert.equal(
    engine.act({ instanceId: instance.id, actionId: "delivery", actor }).reason,
    "action_assigned",
  );
  adapter.perform = () => ({ success: true });
  assert.equal(
    engine.act({
      instanceId: instance.id,
      actionId: "delivery",
      actor: { playerId: "b" },
    }).success,
    true,
  );
  assert.equal(
    engine.toJSON().instances[0].actions.exploration.status,
    "skipped",
  );
});
