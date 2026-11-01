import test from "node:test";
import assert from "node:assert/strict";
import { PartyPreparationView } from "../app/js/ui/party-preparation-view.js";
import { LobbyService } from "../server/lobby/lobby-service.js";

class Element {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.className = "";
    this.value = "";
    this.dataset = {};
    this.attributes = {};
    this.classList = {
      add: (...names) => {
        this.className = [
          ...new Set([...this.className.split(" "), ...names]),
        ].join(" ");
      },
      toggle: (name, enabled) => {
        this.className = this.className
          .split(" ")
          .filter((c) => c !== name)
          .concat(enabled ? [name] : [])
          .join(" ");
      },
    };
  }
  append(...children) {
    for (const child of children) {
      if (child.parent)
        child.parent.children = child.parent.children.filter(
          (c) => c !== child,
        );
      child.parent = this;
      this.children.push(child);
    }
  }
  replaceChildren() {
    this.children = [];
  }
  setAttribute(key, value) {
    this.attributes[key] = value;
  }
  querySelectorAll(selector) {
    const selectors = selector.split(",").map((s) => s.trim());
    return this.children.flatMap((child) => [
      ...(selectors.some((s) =>
        s.startsWith(".")
          ? child.className.split(" ").includes(s.slice(1))
          : child.tagName === s.toUpperCase(),
      )
        ? [child]
        : []),
      ...child.querySelectorAll(selector),
    ]);
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  reportValidity() {
    return this.querySelectorAll("input, select").every(
      (input) => !input.required || Boolean(input.value),
    );
  }
}

function fixture(t, { initialized = false, rejected = false } = {}) {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new Element(tag) };
  t.after(() => {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  });
  const service = new LobbyService();
  const host = service.createLobby({
    playerName: "Organisateur",
    maxPlayers: 1,
  });
  const token = host.session.token;
  service.setPlayArea({
    token,
    playArea: {
      id: "area",
      name: "Terrain",
      polygon: [
        { latitude: 48.84, longitude: 2.32 },
        { latitude: 48.84, longitude: 2.4 },
        { latitude: 48.9, longitude: 2.4 },
        { latitude: 48.9, longitude: 2.32 },
      ],
    },
  });
  if (initialized) service.configurePreparation({ token, change: {} });
  const calls = [];
  const root = new Element("section");
  const view = new PartyPreparationView(
    root,
    {
      async configurePreparation(change) {
        calls.push(change);
        if (rejected) throw new Error("Enregistrement refusé par le serveur.");
        return { lobby: service.configurePreparation({ token, change }) };
      },
    },
    {
      run: async (operation) => {
        try {
          const result = await operation();
          view.render(result.lobby, { isHost: true });
          view.render(view.lobby, { isHost: true });
        } catch {
          /* Le contrôleur affiche aussi l’erreur générale. */
        }
      },
    },
  );
  view.render(service.snapshot(host.lobby.code), { isHost: true });
  return {
    view,
    root,
    calls,
    next: () =>
      root.querySelector(".preparation-navigation").children[1].onclick(),
  };
}

for (const initialized of [false, true]) {
  test(`valider le scénario sans modifier une quête, préparation initialisée : ${initialized}`, async (t) => {
    const f = fixture(t, { initialized });
    await f.next();
    assert.equal(f.view.step, "locations");
    assert.equal(f.view.validatedSteps.has("scenario"), true);
    assert.deepEqual(
      f.view.lobby.configuration.preparation.excludedQuestIds,
      [],
    );
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].excludedQuestIds, undefined);
    await f.next();
    assert.equal(f.view.step, "review");
  });
}
test("un refus d’enregistrement reste sur le scénario et affiche une erreur", async (t) => {
  const f = fixture(t, { initialized: true, rejected: true });
  await f.next();
  assert.equal(f.view.step, "scenario");
  assert.equal(f.view.validatedSteps.has("scenario"), false);
  assert.match(
    f.root.querySelector(".preparation-feedback").textContent,
    /refusé/,
  );
});
