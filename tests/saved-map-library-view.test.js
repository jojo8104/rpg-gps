import test from "node:test";
import assert from "node:assert/strict";
import { mountSavedMapLibrary } from "../app/js/ui/saved-map-library-view.js";

class Element {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.events = {};
    this.attributes = {};
  }
  append(...children) {
    this.children.push(...children);
  }
  insertBefore(child, before) {
    this.children.splice(this.children.indexOf(before), 0, child);
  }
  get lastChild() {
    return this.children.at(-1);
  }
  setAttribute(name, value) {
    this.attributes[name] = value;
  }
  addEventListener(name, handler) {
    this.events[name] = handler;
  }
  replaceChildren(...children) {
    this.children = children;
  }
  focus() {}
}

test("Mes cartes reste fermé, charge à la demande, prévisualise et sauvegarde explicitement", async (t) => {
  const previous = globalThis.document;
  globalThis.document = { createElement: (tag) => new Element(tag) };
  t.after(() => {
    globalThis.document = previous;
  });
  const window = {
    header: new Element("header"),
    dialog: new Element("dialog"),
  };
  window.header.append(new Element("h2"), new Element("button"));
  const area = {
    polygon: [{ latitude: 48, longitude: 2 }],
    excludedPolygons: [[{ latitude: 48, longitude: 2 }]],
  };
  let listed = 0,
    saved = 0,
    prepared = 0,
    selected;
  let entries = [{ id: "one", name: "Mon parc", playArea: area }];
  mountSavedMapLibrary({
    window,
    canEdit: () => true,
    getArea: () => area,
    selectArea: (value) => {
      selected = value;
    },
    client: {
      listMaps: async () => {
        listed++;
        return { maps: entries };
      },
      saveMap: async (name, value) => {
        saved++;
        assert.equal(name, "Nouveau");
        assert.deepEqual(value, area);
      },
      deleteMap: async (id) => {
        assert.equal(id, "one");
        entries = [];
      },
    },
    mapClient: {
      prepare: async (polygon) => {
        prepared++;
        assert.deepEqual(polygon, area.polygon);
      },
    },
  });
  const panel = window.dialog.children[0],
    toggle = window.header.children[1];
  assert.equal(panel.hidden, true);
  assert.equal(listed, 0);
  await toggle.onclick();
  assert.equal(panel.hidden, false);
  assert.equal(listed, 1);
  const [close, form, help, status, list] = panel.children;
  list.children[0].children[0].onclick();
  assert.equal(selected, area);
  assert.equal(panel.hidden, true);
  assert.equal(saved, 0);
  await toggle.onclick();
  form.children[0].children[0].value = "Nouveau";
  await form.onsubmit({ preventDefault() {} });
  assert.equal(saved, 1);
  assert.equal(prepared, 1);
  assert.match(status.textContent, /fond 2D disponible/);
  await list.children[0].children[1].onclick();
  assert.match(list.children[0].textContent, /Aucune carte/);
  close.onclick();
  assert.equal(panel.hidden, true);
});

test("une panne OSM est distinguée de la sauvegarde de zone réussie", async (t) => {
  const previous = globalThis.document;
  globalThis.document = { createElement: (tag) => new Element(tag) };
  t.after(() => {
    globalThis.document = previous;
  });
  const window = {
    header: new Element("header"),
    dialog: new Element("dialog"),
  };
  window.header.append(new Element("button"));
  mountSavedMapLibrary({
    window,
    canEdit: () => true,
    getArea: () => ({ polygon: [] }),
    selectArea() {},
    client: { listMaps: async () => ({ maps: [] }), saveMap: async () => {} },
    mapClient: {
      prepare: async () => {
        throw new Error("OSM occupé");
      },
    },
  });
  const panel = window.dialog.children[0];
  await panel.children[1].onsubmit({ preventDefault() {} });
  assert.match(
    panel.children[3].textContent,
    /Zone conservée.*fond 2D à compléter.*OSM occupé/,
  );
});
