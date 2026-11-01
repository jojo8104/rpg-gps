import test from "node:test";
import assert from "node:assert/strict";
import { Hero } from "../app/js/core/hero.js";
import { Game } from "../app/js/core/game.js";
import { LobbyService } from "../server/lobby/lobby-service.js";
import { createMultiplayerLaunch } from "../app/js/core/multiplayer-launch.js";
import { heroPortrait } from "../app/js/ui/hero-appearance.js";
import {
  heroPoseStyle,
  HERO_FEET_LINE,
} from "../app/js/map/hero-sprite-atlas.js";
import { HERO_GENDER_SHEETS } from "../app/js/map/hero-gender-sheets.js";
import { heroClassCards } from "../app/js/ui/hero-class-cards.js";
import { readFileSync } from "node:fs";

function bootstrap(service, lobby, token) {
  const launch = createMultiplayerLaunch(lobby);
  const game = new Game({
    setup: launch.setup,
    heroClasses: JSON.parse(
      readFileSync(new URL("../data/hero-classes.json", import.meta.url)),
    ),
    unitDefinitions: JSON.parse(
      readFileSync(new URL("../data/units.json", import.meta.url)),
    ),
    locations: [],
  });
  for (const { playerId, choice } of launch.heroChoices)
    game.chooseHero(playerId, choice);
  game.chooseHero("bandits", { name: "Brigand", classId: "warrior" });
  game.start();
  const snapshot = game.toJSON();
  for (const hero of snapshot.heroes) {
    if (hero.playerId !== "bandits")
      hero.gender = hero.gender === "female" ? "male" : "female";
  }
  // Un instantané navigateur divergent ne remplace pas le choix officiel du lobby.
  service.bootstrapGame({ token, snapshot });
}

test("le genre survit à la sérialisation et les anciens héros gardent leur apparence", () => {
  for (const classId of ["warrior", "mage", "ranger"]) {
    const legacy = new Hero({ id: "h", playerId: "p", name: "H", classId });
    assert.equal(legacy.gender, classId === "warrior" ? "male" : "female");
    for (const gender of ["female", "male"]) {
      const hero = new Hero({ ...legacy.toJSON(), gender });
      assert.equal(new Hero(JSON.parse(JSON.stringify(hero))).gender, gender);
      assert.deepEqual(hero.baseStats, legacy.baseStats);
    }
    assert.throws(
      () => new Hero({ ...legacy.toJSON(), gender: "invalid" }),
      /Genre/,
    );
  }
});

test("le lobby valide le choix sans mutation partielle, puis le conserve au lancement et après redémarrage", () => {
  const service = new LobbyService();
  const host = service.createLobby({
    playerName: "Test",
    positionMode: "simulation",
    maxPlayers: 1,
  });
  const token = host.session.token;
  service.selectHeroClass({
    token,
    heroClassId: "warrior",
    heroGender: "female",
  });
  assert.throws(
    () =>
      service.selectHeroClass({
        token,
        heroClassId: "mage",
        heroGender: "invalid",
      }),
    /Genre/,
  );
  assert.equal(
    service.snapshot(host.lobby.code).players[0].heroClassId,
    "warrior",
  );
  const restored = new LobbyService({ initialState: service.exportState() });
  assert.equal(
    restored.snapshot(host.lobby.code).players[0].heroGender,
    "female",
  );
  restored.setReady({ token, ready: true });
  const started = restored.startLobby({ token });
  assert.equal(
    createMultiplayerLaunch(started).heroChoices[0].choice.gender,
    "female",
  );
  bootstrap(restored, started, token);
  assert.equal(
    restored
      .gameSnapshot(host.lobby.code)
      .state.heroes.find((h) => h.playerId === host.session.playerId).gender,
    "female",
  );
});

test("le solo utilise le même choix serveur pour les trois classes", () => {
  for (const [heroClassId, heroGender] of [
    ["warrior", "female"],
    ["mage", "male"],
    ["ranger", "male"],
  ]) {
    const service = new LobbyService();
    const result = service.startSolo({
      playerName: "Test",
      heroClassId,
      heroGender,
      configuration: { positionMode: "simulation" },
    });
    assert.equal(result.lobby.players[0].heroGender, heroGender);
    bootstrap(service, result.lobby, result.session.token);
    const state = service.gameSnapshot(result.lobby.code).state;
    assert.equal(
      state.heroes.find((h) => h.playerId === result.session.playerId).gender,
      heroGender,
    );
  }
});

test("chaque variante utilise son portrait et quinze rectangles valides, alignés et miroirs à l’ouest", () => {
  for (const [id, sheet] of Object.entries(HERO_GENDER_SHEETS)) {
    const [classId, gender] = id.split("-");
    assert.match(heroPortrait(classId, gender), new RegExp(id));
    assert.equal(sheet.poses.length, 5);
    for (let dir = 0; dir < 8; dir++)
      for (let step = 0; step < 3; step++) {
        const p = sheet.poses[dir > 4 ? 8 - dir : dir][step];
        assert.ok(
          p.x >= 0 &&
            p.y >= 0 &&
            p.x + p.width <= sheet.width &&
            p.y + p.height <= sheet.height,
        );
        const style = heroPoseStyle(dir, step, classId, gender);
        assert.match(style.backgroundImage, new RegExp(id));
        assert.ok(
          Math.abs(
            parseFloat(style.top) + parseFloat(style.height) - HERO_FEET_LINE,
          ) < 1e-8,
        );
        assert.ok(
          Math.abs(parseFloat(style.left) + (p.axis - p.x) * sheet.scale - 40) <
            1e-8,
        );
        if (dir > 4)
          assert.equal(
            style.backgroundPosition,
            heroPoseStyle(8 - dir, step, classId, gender).backgroundPosition,
          );
      }
  }
});

test("le sélecteur conserve trois cartes et les variantes affichent le bon portrait", () => {
  const classes = JSON.parse(
    readFileSync(new URL("../data/hero-classes.json", import.meta.url)),
  );
  const html = heroClassCards(classes, {
    selected: "warrior",
    gender: "female",
  });
  assert.equal((html.match(/class="hero-class-card"/g) ?? []).length, 3);
  assert.match(html, /hero-warrior-female-anime-v2.png/);
  assert.match(html, /Guerrière/);
  assert.equal((html.match(/type="radio"/g) ?? []).length, 3);
  assert.match(html, /data-hero-gender="female" aria-pressed="true"/);
});
