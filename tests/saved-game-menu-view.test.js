import test from "node:test";
import assert from "node:assert/strict";
import { createSavedGameMenu } from "../app/js/ui/saved-game-menu.js";
import { mountSavedGames } from "../dashboard/saved-games.js";
class Element {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.events = {};
    this.dataset = {};
    this.textContent = "";
  }
  append(...children) {
    this.children.push(...children);
  }
  replaceChildren(...children) {
    this.children = children;
  }
  setAttribute() {}
  addEventListener(name, handler) {
    this.events[name] = handler;
  }
  querySelectorAll(tag) {
    return this.children.flatMap((child) => [
      ...(child.tag === tag ? [child] : []),
      ...child.querySelectorAll(tag),
    ]);
  }
  showModal() {
    this.open = true;
  }
  close() {
    this.open = false;
    this.events.close?.();
  }
}
const save = {
  id: "one",
  name: "Au camp",
  ownerName: "Alice",
  ownerAccountId: "alice",
  savedAt: 1000,
  sizeBytes: 2048,
  playerCount: 1,
  players: [{ name: "Alice" }],
};
function documentFixture() {
  return {
    body: new Element("body"),
    createElement: (tag) => new Element(tag),
  };
}

test("charger depuis l'accueil ne crée rien avant le choix et conserve les erreurs serveur visibles", async () => {
  const document = documentFixture(),
    calls = [];
  let fail = true,
    loaded = false;
  const menu = createSavedGameMenu({
    document,
    client: {
      listSavedGames: async () => {
        calls.push("list");
        return { saves: [save] };
      },
      selectAccount: async (id) => {
        calls.push(id);
      },
      openSavedGame: async (id) => {
        calls.push(id);
        if (fail) throw new Error("Compte occupé");
        return { lobby: { code: "TEST" } };
      },
    },
    onLoaded: () => {
      loaded = true;
    },
  });
  assert.deepEqual(calls, []);
  await menu.open();
  assert.deepEqual(calls, ["list"]);
  const dialog = document.body.children[0];
  const load = dialog
    .querySelectorAll("button")
    .find((button) => button.textContent === "Charger");
  await load.onclick();
  assert.equal(dialog.open, true);
  assert.equal(dialog.children[2].textContent, "Compte occupé");
  assert.equal(load.disabled, false);
  assert.equal(loaded, false);
  fail = false;
  await load.onclick();
  assert.equal(dialog.open, false);
  assert.equal(loaded, true);
  assert.deepEqual(calls, ["list", "alice", "one", "alice", "one"]);
});

test("la suppression d'une sauvegarde Dashboard attend confirmation et actualise la liste serveur", async (t) => {
  const previous = globalThis.document;
  globalThis.document = documentFixture();
  t.after(() => {
    globalThis.document = previous;
  });
  const root = new Element("section"),
    calls = [];
  let saves = [save],
    confirmation = false;
  const panel = mountSavedGames(root, {
    confirmAction: () => confirmation,
    api: async (url, options) => {
      calls.push({ url, options });
      if (options?.method === "DELETE") {
        saves = [];
        return { deleted: save.id };
      }
      return { saves };
    },
  });
  await panel.load();
  assert.equal(calls.length, 0);
  panel.setAuthenticated(true);
  await panel.load();
  assert.equal(root.querySelectorAll("table").length, 1);
  assert.ok(
    root.querySelectorAll("td").some((cell) => cell.textContent === "2 Kio"),
  );
  const remove = root
    .querySelectorAll("button")
    .find((button) => button.textContent === "Supprimer la sauvegarde");
  await remove.onclick();
  assert.equal(calls.length, 1);
  confirmation = true;
  await remove.onclick();
  assert.equal(calls[1].url, "/api/dashboard/save?id=one");
  assert.equal(calls[1].options.headers["X-Dashboard-Confirm"], "one");
  assert.equal(root.children[2].textContent, "Aucune partie sauvegardée.");
  panel.setAuthenticated(false);
  assert.equal(root.children[3].children.length, 0);
});
