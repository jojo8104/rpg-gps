import test from "node:test";
import assert from "node:assert/strict";
import { renderEntityDetails } from "../dashboard/entity-details.js";
class Element {
  constructor(tag) {
    this.tagName = tag;
    this.childNodes = [];
    this.dataset = {};
    this._text = "";
  }
  set textContent(value) {
    this._text = String(value);
    this.childNodes = [];
  }
  get textContent() {
    return (
      this._text +
      this.childNodes.map((child) => child.textContent ?? child).join(" ")
    );
  }
  append(...children) {
    this.childNodes.push(...children);
  }
}
const party = {
  players: [{ id: "p", name: "Aélis" }],
  heroes: [
    {
      id: "h",
      playerId: "p",
      name: "Aélis",
      classId: "warrior",
      commandRank: "soldier",
      level: 3,
      experience: 200,
      health: 20,
      maxHealth: 25,
      army: { units: [{ typeId: "archer", quantity: 6 }] },
      resources: { gold: 12 },
      equipment: { head: "helm" },
      carriedLoot: [{ itemId: "bread", quantity: 3 }],
      travelProgress: { totalDistanceMeters: 850 },
    },
  ],
  locations: [],
  groups: [],
  unitTypes: [{ id: "archer", name: "Archers" }],
  itemTypes: [
    { id: "helm", name: "Heaume" },
    { id: "bread", name: "Pain" },
  ],
  heroClasses: [{ id: "warrior", name: "Guerrier" }],
  playerDetails: {
    p: {
      quests: {
        instances: [
          {
            title: "Ravitailler Rochegarde",
            status: "active",
            actions: [{ status: "active", label: "Livrer les rations" }],
          },
        ],
      },
    },
  },
};
function withDocument(t) {
  const previous = globalThis.document;
  globalThis.document = { createElement: (tag) => new Element(tag) };
  t.after(() => {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  });
}
function walk(root) {
  return [
    root,
    ...root.childNodes
      .filter((child) => child instanceof Element)
      .flatMap(walk),
  ];
}
test("la fiche joueur présente héros, armée, inventaire et quête sans JSON et les objets sont consultables", (t) => {
  withDocument(t);
  const selected = [];
  const root = renderEntityDetails({
    kind: "players",
    entity: party.players[0],
    party,
    onSelect: (kind, item) => selected.push([kind, item.id]),
  });
  const content = root.textContent;
  for (const expected of [
    "Aélis",
    "Guerrier",
    "850 m",
    "6 × Archers",
    "Heaume",
    "Pain",
    "Ravitailler Rochegarde",
    "Livrer les rations",
  ])
    assert.ok(content.includes(expected), expected);
  assert.equal(
    walk(root).some((node) => node.tagName === "pre"),
    false,
  );
  const itemButton = walk(root).find(
    (node) => node.tagName === "button" && node.textContent.includes("Heaume"),
  );
  itemButton.onclick();
  assert.deepEqual(selected, [["items", "helm"]]);
});
test("les textes des noms et des objets restent du texte, et les GA exposent mission et chargement", (t) => {
  withDocument(t);
  const item = renderEntityDetails({
    kind: "items",
    entity: {
      id: "x",
      name: "<img onerror=attack()>",
      description: "Objet de test",
      modifiers: { attack: 3 },
    },
    party,
  });
  assert.ok(item.textContent.includes("<img onerror=attack()>"));
  assert.equal(
    walk(item).some((node) => node.tagName === "img"),
    false,
  );
  const group = renderEntityDetails({
    kind: "groups",
    entity: {
      id: "c",
      name: "Caravane",
      status: "traveling",
      army: { units: [] },
      mission: { destinationLocationId: "fort", phase: "outbound" },
      cargo: [{ itemId: "wood", quantity: 5 }],
    },
    party,
  });
  for (const expected of [
    "Caravane",
    "En déplacement",
    "Mission",
    "Chargement",
    "fort",
  ])
    assert.ok(group.textContent.includes(expected), expected);
});

test("les lieux affichent les PNJ et leurs informations dans une rubrique visible", (t) => {
  withDocument(t);
  const location = { id: "v", name: "Village", type: "village" };
  const root = renderEntityDetails({
    kind: "locations",
    entity: location,
    party: {
      ...party,
      locationNpcs: {
        v: [
          {
            name: "<script>chef</script>",
            title: "Intendante",
            source: "chief",
          },
          {
            name: "Géologue",
            kind: "specialist",
            source: "tavern",
            costs: { gold: 30 },
            remainingCycles: 4,
          },
        ],
      },
    },
  });
  for (const expected of [
    "PNJ du lieu (2)",
    "Intendante",
    "Géologue",
    "Spécialiste",
    "Coût",
    "Cycles de présence restants",
  ])
    assert.ok(root.textContent.includes(expected), expected);
  assert.equal(
    walk(root).some((n) => n.tagName === "script"),
    false,
  );
  const empty = renderEntityDetails({
    kind: "locations",
    entity: location,
    party,
  });
  assert.ok(empty.textContent.includes("Aucun PNJ renseigné"));
});
