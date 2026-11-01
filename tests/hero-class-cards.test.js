import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { heroClassCards } from "../app/js/ui/hero-class-cards.js";
const classes = JSON.parse(
  readFileSync(new URL("../data/hero-classes.json", import.meta.url)),
);

test("les fiches partagées présentent portraits, spécialités et caractéristiques du catalogue", () => {
  const cards = heroClassCards(classes);
  assert.equal(
    (cards.match(/class="hero-class-card"/g) ?? []).length,
    classes.length,
  );
  for (const hero of classes) {
    assert.ok(cards.includes(hero.id === "ranger" ? "Éclaireuse" : hero.name));
    assert.ok(cards.includes(hero.advantage));
  }
  assert.match(cards, /hero-ranger-female-anime-v2\.png/);
  assert.match(cards, /Santé/);
  assert.match(cards, /value="warrior" checked/);
});
test("le lobby attend un choix officiel et verrouille les classes à la reprise", () => {
  const pending = heroClassCards(classes, {
    name: "lobby-hero-choice",
    selected: null,
  });
  assert.doesNotMatch(pending, /checked/);
  const resumed = heroClassCards(classes, {
    name: "lobby-hero-choice",
    selected: "mage",
    disabled: true,
  });
  assert.match(resumed, /value="mage" checked disabled/);
  assert.equal((resumed.match(/ disabled/g) ?? []).length, classes.length * 3);
});
test("les textes des fiches sont échappés", () => {
  const cards = heroClassCards([
    {
      ...classes[0],
      name: '<img src=x onerror="alert(1)">',
      advantage: "A & B",
    },
  ]);
  assert.doesNotMatch(cards, /<img src=x/);
  assert.match(cards, /&lt;img/);
  assert.match(cards, /A &amp; B/);
});
