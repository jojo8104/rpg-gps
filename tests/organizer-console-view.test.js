import test from "node:test";
import assert from "node:assert/strict";
import { createOrganizerConsoleView } from "../app/js/ui/organizer-console-view.js";
function element() {
  const classes = new Set();
  return {
    hidden: false,
    children: [],
    classList: {
      add: (...names) => names.forEach((n) => classes.add(n)),
      remove: (...names) => names.forEach((n) => classes.delete(n)),
      contains: (n) => classes.has(n),
    },
    prepend(child) {
      this.children.unshift(child);
    },
    insertBefore(child) {
      this.children.push(child);
    },
    click() {
      this.onclick?.();
    },
  };
}
function fixture() {
  const menu = element(),
    close = element(),
    setup = element(),
    root = element(),
    room = element(),
    footer = element(),
    page = element();
  let menuCloses = 0,
    opens = 0,
    dialogCloses = 0;
  close.onclick = () => menuCloses++;
  const dialogs = [
    {
      close() {
        dialogCloses++;
      },
    },
    {
      close() {
        dialogCloses++;
      },
    },
  ];
  root.querySelector = () => room;
  root.querySelectorAll = () => [room, footer, page];
  const document = {
    createElement: element,
    querySelector: (id) =>
      ({
        "#landscape-tools": menu,
        "#close-game-menu": close,
        "#setup-screen": setup,
      })[id],
    querySelectorAll: () => dialogs,
  };
  const view = createOrganizerConsoleView({
    document,
    root,
    onOpen: () => opens++,
  });
  return {
    view,
    menu,
    root,
    room,
    footer,
    page,
    setup,
    counts: () => ({ menuCloses, opens, dialogCloses }),
  };
}
test("le bouton organisateur appartient au menu et ouvre une console avec retour explicite", () => {
  const f = fixture();
  assert.deepEqual(f.menu.children, [f.view.menuButton]);
  assert.equal(f.root.children.includes(f.view.menuButton), false);
  assert.equal(f.view.menuButton.hidden, true);
  assert.equal(f.view.returnButton.hidden, true);
  f.root.hidden = true;
  f.room.hidden = true;
  f.view.menuButton.click();
  assert.equal(f.root.hidden, false);
  assert.equal(f.room.hidden, false);
  assert.equal(f.root.classList.contains("is-organizer-console"), true);
  assert.equal(f.view.returnButton.hidden, false);
  assert.equal(f.counts().menuCloses, 1);
  assert.equal(f.counts().opens, 1);
});
test("retour au jeu masque toutes les configurations et ferme les fenêtres encore ouvertes", () => {
  const f = fixture();
  f.view.open();
  f.root.classList.add("is-preparation-editor", "is-terrain-editor");
  f.view.returnButton.click();
  for (const panel of [
    f.root,
    f.room,
    f.footer,
    f.page,
    f.setup,
    f.view.returnButton,
  ])
    assert.equal(panel.hidden, true);
  for (const name of [
    "is-organizer-console",
    "is-preparation-editor",
    "is-terrain-editor",
  ])
    assert.equal(f.root.classList.contains(name), false);
  assert.equal(f.counts().dialogCloses, 2);
  assert.equal(f.counts().menuCloses, 2);
  f.view.open();
  assert.equal(f.root.hidden, false);
  assert.equal(f.room.hidden, false);
});
