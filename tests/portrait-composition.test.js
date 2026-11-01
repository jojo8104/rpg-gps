import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import {
  createPortraitAppearance,
  isPortraitAppearance,
  PORTRAIT_BACKGROUNDS,
  PORTRAIT_VARIANTS,
  PORTRAIT_GENDERS,
  MODULAR_PORTRAIT_ASSETS,
  portraitLayerPath,
  portraitProportions,
  portraitLayerBlock,
} from "../app/js/core/portrait-catalog.js";
import {
  portraitLayersMarkup,
  dialoguePortraitMarkup,
} from "../app/js/ui/portrait-view.js";
import { LocationChiefService } from "../app/js/core/location-chief-service.js";
import { buildingConversation } from "../app/js/core/building-dialogue-catalog.js";
import { TavernNpcService } from "../app/js/core/tavern-npc-service.js";
import { heroPortrait } from "../app/js/ui/hero-appearance.js";
import { readPngRgba } from "./helpers/png-rgba.js";

test("la corpulence varie et la barbe conserve une opacité maximale", () => {
  for (const gender of PORTRAIT_GENDERS) {
    const widths = new Set(),
      beardOpacities = new Set();
    for (let i = 0; i < 2000; i++) {
      const input = { identity: `variation:${i}`, gender, role: "worker" };
      const appearance = createPortraitAppearance(input);
      assert.ok(isPortraitAppearance(appearance));
      assert.ok(
        appearance.widthPercent >= 70 && appearance.widthPercent <= 130,
      );
      assert.ok(
        appearance.beardOpacity >= 40 && appearance.beardOpacity <= 100,
      );
      assert.deepEqual(
        createPortraitAppearance({ ...input, locationType: "mine" }),
        { ...appearance, background: "mine" },
      );
      widths.add(appearance.widthPercent);
      if (appearance.accessory === "male-accessory-1")
        beardOpacities.add(appearance.beardOpacity);
    }
    assert.ok(widths.has(70) && widths.has(100) && widths.has(130));
    if (gender === "male") assert.deepEqual([...beardOpacities], [100]);
  }
});

test("la largeur enveloppe tous les calques et la transparence cible uniquement la barbe", () => {
  const base = createPortraitAppearance({
    identity: "width-render",
    gender: "male",
  });
  const html = portraitLayersMarkup({
    ...base,
    widthPercent: 90,
    beardOpacity: 45,
    accessory: "male-accessory-1",
  });
  assert.match(
    html,
    /--portrait-head-width:0\.9667;--portrait-body-width:0\.9;/,
  );
  assert.match(html, /--portrait-beard-opacity:1/);
  assert.match(html, /data-portrait-beard="true"/);
  const figure = html.slice(html.indexOf('class="composed-portrait__figure"'));
  for (const part of [
    "body",
    "face",
    "clothing",
    "clothingBack",
    "hair",
    "eyes",
    "nose",
    "mouth",
    "accessory",
  ])
    assert.match(figure, new RegExp(`data-portrait-layer="${part}"`));
  assert.doesNotMatch(figure, /composed-portrait__background/);
  assert.match(
    portraitLayersMarkup({
      ...base,
      beardOpacity: 0,
      accessory: "male-accessory-3",
    }),
    /data-portrait-beard="false"/,
  );
  const legacy = { ...base };
  delete legacy.widthPercent;
  delete legacy.beardOpacity;
  assert.ok(isPortraitAppearance(legacy));
  assert.match(
    portraitLayersMarkup(legacy),
    /--portrait-head-width:1;--portrait-body-width:1;--portrait-beard-opacity:1/,
  );
  for (const widthPercent of [
    null,
    "100",
    NaN,
    Infinity,
    69,
    131,
    95.5,
    "1;display:none",
  ])
    assert.equal(portraitLayersMarkup({ ...base, widthPercent }), "");
  for (const beardOpacity of [null, "50", NaN, Infinity, -1, 101])
    assert.equal(portraitLayersMarkup({ ...base, beardOpacity }), "");
});

test("la tête et le corps varient ensemble dans leurs plages distinctes", () => {
  assert.deepEqual(portraitProportions({ widthPercent: 70 }), {
    headPercent: 90,
    bodyPercent: 70,
  });
  assert.deepEqual(portraitProportions({ widthPercent: 100 }), {
    headPercent: 100,
    bodyPercent: 100,
  });
  assert.deepEqual(portraitProportions({ widthPercent: 130 }), {
    headPercent: 110,
    bodyPercent: 130,
  });
  let previousHead = 89;
  for (let widthPercent = 70; widthPercent <= 130; widthPercent++) {
    const { headPercent, bodyPercent } = portraitProportions({ widthPercent });
    assert.ok(
      headPercent > previousHead && headPercent >= 90 && headPercent <= 110,
    );
    assert.equal(bodyPercent, widthPercent);
    previousHead = headPercent;
  }
  for (const gender of PORTRAIT_GENDERS) {
    const appearance = createPortraitAppearance({ identity: "blocks", gender });
    for (const part of ["face", "eyes", "nose", "mouth", "hair", "hairBack"])
      assert.equal(portraitLayerBlock(appearance, part), "head");
    for (const part of ["body", "clothing", "clothingBack"])
      assert.equal(portraitLayerBlock(appearance, part), "body");
    const pendant = {
      ...appearance,
      accessory: `${gender}-accessory-${gender === "male" ? 4 : 3}`,
    };
    assert.equal(portraitLayerBlock(pendant, "accessory"), "body");
    const beardOrScar = { ...appearance, accessory: `${gender}-accessory-1` };
    assert.equal(portraitLayerBlock(beardOrScar, "accessory"), "head");
    assert.match(
      portraitLayersMarkup(pendant),
      /data-portrait-block="body"><img data-portrait-layer="accessory"/,
    );
    assert.match(
      portraitLayersMarkup(beardOrScar),
      /data-portrait-block="head"><img data-portrait-layer="accessory"/,
    );
  }
});

test("les tenues conservent des épaules proportionnées aux têtes", () => {
  for (const gender of PORTRAIT_GENDERS)
    for (let index = 0; index < 8; index++) {
      const image = readPngRgba(
        new URL(
          `../app/assets/portraits/modular/v12/${gender}/clothing-${index}.png`,
          import.meta.url,
        ),
      );
      const widths = [];
      for (let y = 440; y <= 520; y++) {
        let left = 512,
          right = -1;
        for (let x = 0; x < 512; x++)
          if (image.pixels[(y * 512 + x) * 4 + 3] > 180) {
            left = Math.min(left, x);
            right = Math.max(right, x);
          }
        widths.push(right - left + 1);
      }
      widths.sort((a, b) => a - b);
      const median = widths[Math.floor(widths.length / 2)];
      assert.ok(
        median >= 340 && median <= 480,
        `${gender}/${index}: buste trop étroit (${median}px)`,
      );
    }
});
test("la première paire d’yeux féminins est déplacée de deux pixels à gauche seulement", () => {
  const bounds = (version) => {
    const { pixels } = readPngRgba(
      new URL(
        `../app/assets/portraits/modular/${version}/female/eyes-0.png`,
        import.meta.url,
      ),
    );
    let left = 512,
      right = 0,
      top = 832,
      bottom = 0;
    for (let y = 0; y < 832; y++)
      for (let x = 0; x < 512; x++)
        if (pixels[(y * 512 + x) * 4 + 3] > 180) {
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
    return { left, right, top, bottom };
  };
  const before = bounds("v5"),
    after = bounds("v8");
  assert.deepEqual(after, {
    ...before,
    left: before.left - 2,
    right: before.right - 2,
  });
});

test("le col arrière est derrière le corps et le devant respecte la zone du cou", () => {
  for (const gender of PORTRAIT_GENDERS)
    for (let index = 0; index < 8; index++) {
      const front = readPngRgba(
        new URL(
          `../app/assets/portraits/modular/v12/${gender}/clothing-${index}.png`,
          import.meta.url,
        ),
      );
      for (let y = 325; y < 345; y++)
        for (let x = 240; x < 273; x++)
          assert.equal(
            front.pixels[(y * 512 + x) * 4 + 3],
            0,
            `${gender}/${index}: le col coupe le cou`,
          );
      const appearance = createPortraitAppearance({
        identity: "collar",
        gender,
        role: "worker",
      });
      const html = portraitLayersMarkup(appearance);
      assert.ok(
        html.indexOf('data-portrait-layer="clothingBack"') <
          html.indexOf('data-portrait-layer="body"'),
      );
      assert.equal(
        isPortraitAppearance({
          ...appearance,
          clothingBack: `${gender}-clothingBack-0`,
        }),
        false,
      );
    }
});
test("la barbe suit la mâchoire du visage masculin et laisse la bouche visible", () => {
  const { pixels } = readPngRgba(
    new URL(
      "../app/assets/portraits/modular/v12/male/accessory-1.png",
      import.meta.url,
    ),
  );
  assert.equal(
    pixels[(300 * 512 + 256) * 4 + 3],
    0,
    "la barbe recouvre la bouche",
  );
  let chin = 0;
  for (let y = 318; y < 338; y++)
    for (let x = 230; x < 282; x++)
      if (pixels[(y * 512 + x) * 4 + 3] > 180) chin++;
  assert.ok(chin > 150, "la barbe est détachée du menton");
  for (let y = 345; y < 832; y++)
    for (let x = 0; x < 512; x++)
      assert.equal(
        pixels[(y * 512 + x) * 4 + 3],
        0,
        "la barbe descend trop bas",
      );
});

test("les cols ouverts ont un dessous de torse et le corps suit sa tenue", () => {
  for (const gender of PORTRAIT_GENDERS) {
    const appearance = createPortraitAppearance({
      identity: "wide-collar",
      gender,
      role: "tavern",
    });
    assert.equal(appearance.body, `${gender}-body-7`);
    assert.equal(
      isPortraitAppearance({ ...appearance, body: `${gender}-body-0` }),
      false,
    );
    const body = readPngRgba(
      new URL(
        `../app/assets/portraits/modular/v12/${gender}/body-7.png`,
        import.meta.url,
      ),
    );
    let skin = 0;
    for (let y = 380; y < 440; y++)
      for (let x = 190; x < 322; x++)
        if (body.pixels[(y * 512 + x) * 4 + 3] > 180) skin++;
    assert.ok(skin > 1000, `${gender}: torse absent sous le col ouvert`);
    const hair = readPngRgba(
      new URL(
        `../app/assets/portraits/modular/v12/${gender}/hair-0.png`,
        import.meta.url,
      ),
    );
    const old = readPngRgba(
      new URL(
        `../app/assets/portraits/modular/v4/${gender}/hair-0.png`,
        import.meta.url,
      ),
    );
    const widthOf = (image) => {
      let min = 512,
        max = 0;
      for (let y = 0; y < 350; y++)
        for (let x = 0; x < 512; x++)
          if (image.pixels[(y * 512 + x) * 4 + 3] > 180) {
            min = Math.min(min, x);
            max = Math.max(max, x);
          }
      return max - min;
    };
    assert.ok(widthOf(hair) > widthOf(old), `${gender}: coiffure trop étroite`);
  }
});

test("les coiffures sont abaissées et chaque œil féminin s'écarte sans déformer le dessin", () => {
  const bounds = (version, gender, part, side) => {
    const { width, height, pixels } = readPngRgba(
      new URL(
        `../app/assets/portraits/modular/${version}/${gender}/${part}.png`,
        import.meta.url,
      ),
    );
    let minX = width,
      maxX = 0,
      minY = height;
    for (let y = 0; y < height; y++)
      for (
        let x = side === "right" ? 256 : 0;
        x < (side === "left" ? 256 : width);
        x++
      ) {
        if (pixels[(y * width + x) * 4 + 3] > 180) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
        }
      }
    return { minX, maxX, minY };
  };
  for (const gender of PORTRAIT_GENDERS)
    for (let index = 0; index < 4; index++) {
      assert.equal(
        bounds("v4", gender, `hair-${index}`).minY -
          bounds("v3", gender, `hair-${index}`).minY,
        12,
      );
    }
  for (let index = 0; index < 2; index++)
    for (const side of ["left", "right"]) {
      const before = bounds("v3", "female", `eyes-${index}`, side),
        after = bounds("v4", "female", `eyes-${index}`, side);
      const shift = side === "left" ? -7 : 7;
      assert.equal(after.minX - before.minX, shift);
      assert.equal(after.maxX - before.maxX, shift);
      assert.equal(after.minY, before.minY);
    }
});

test("les seize bustes gardent leurs marges et les manches courtes ont deux avant-bras", () => {
  for (const gender of PORTRAIT_GENDERS) {
    for (let index = 0; index < 8; index++) {
      const { width, height, pixels } = readPngRgba(
        new URL(
          `../app/assets/portraits/modular/v12/${gender}/clothing-${index}.png`,
          import.meta.url,
        ),
      );
      let leftSkin = 0,
        rightSkin = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const p = (y * width + x) * 4;
          if (x < 12 || x >= width - 12)
            assert.equal(
              pixels[p + 3],
              0,
              `${gender}/${index}: marge ${x},${y}`,
            );
          if (
            y > 600 &&
            pixels[p + 3] > 180 &&
            pixels[p] > 170 &&
            pixels[p] - pixels[p + 1] > 30 &&
            pixels[p + 1] - pixels[p + 2] > 20
          ) {
            if (x < 145) leftSkin++;
            if (x > 367) rightSkin++;
          }
        }
      }
      if ([3, 6].includes(index)) {
        assert.ok(leftSkin > 300, `${gender}/${index}: avant-bras gauche`);
        assert.ok(rightSkin > 300, `${gender}/${index}: avant-bras droit`);
      }
    }
    const appearance = createPortraitAppearance({
      identity: "anatomy",
      gender,
    });
    const html = portraitLayersMarkup(appearance);
    assert.ok(
      html.indexOf('data-portrait-layer="body"') <
        html.indexOf('data-portrait-layer="clothing"'),
    );
    assert.ok(
      html.indexOf('data-portrait-layer="clothingBack"') <
        html.indexOf('data-portrait-layer="body"'),
    );
    assert.doesNotMatch(html, /data-portrait-layer="neck"/);
    assert.equal(appearance.neck, null);
    const face = readPngRgba(
      new URL(
        `../app/assets/portraits/modular/v12/${gender}/face-0.png`,
        import.meta.url,
      ),
    );
    for (let y = 330; y < 832; y++)
      for (let x = 0; x < 512; x++)
        assert.equal(
          face.pixels[(y * 512 + x) * 4 + 3],
          0,
          `${gender}: la tête contient encore un cou`,
        );
    const body = readPngRgba(
      new URL(
        `../app/assets/portraits/modular/v12/${gender}/body-4.png`,
        import.meta.url,
      ),
    );
    for (let y = 320; y < 440; y++)
      assert.ok(
        body.pixels[(y * 512 + 256) * 4 + 3] > 180,
        `${gender}: coupure entre cou et torse à ${y}`,
      );
  }
});

test("une identité garde ses traits après sérialisation et changement de décor", () => {
  const input = {
    identity: "chief:permanent-id",
    locationType: "mine",
    role: "mine",
  };
  const before = createPortraitAppearance(input);
  assert.deepEqual(
    createPortraitAppearance(JSON.parse(JSON.stringify(input))),
    before,
  );
  const moved = createPortraitAppearance({ ...input, locationType: "quarry" });
  assert.equal(moved.background, "quarry");
  assert.deepEqual({ ...moved, background: "mine" }, before);
  const signatures = new Set();
  for (let i = 0; i < 250; i++) {
    const value = createPortraitAppearance({ ...input, identity: `npc:${i}` });
    assert.ok(isPortraitAppearance(value));
    if (value.gender === "female")
      assert.doesNotMatch(value.accessory ?? "", /^male-/);
    signatures.add(JSON.stringify(value));
  }
  assert.ok(signatures.size > 100);
});

test("les métiers choisissent leurs tenues et les bâtiments leur décor", () => {
  for (const [role, clothing] of [
    ["mine", 3],
    ["forge", 6],
    ["tavern", 7],
    ["officer", 0],
    ["trainer", 1],
    ["specialist", 2],
  ]) {
    const value = createPortraitAppearance({
      identity: "npc",
      locationType: "village",
      role,
    });
    assert.equal(value.clothing, `${value.gender}-clothing-${clothing}`);
    if (["forge", "tavern"].includes(role))
      assert.equal(value.background, role);
  }
  assert.equal(
    createPortraitAppearance({ identity: "npc", locationType: "lumber-camp" })
      .background,
    "forest",
  );
});

test("les conversations raccordent les apparences sans remplacer un portrait narratif", () => {
  const location = {
    id: "one",
    type: "mine",
    name: "Mine",
    infrastructure: { forge: 1, tavern: 1 },
  };
  const chief = new LocationChiefService().getConversation({ location });
  assert.ok(isPortraitAppearance(chief.appearance));
  assert.equal(chief.appearance.background, "mine");
  assert.equal(
    buildingConversation({ buildingId: "forge", location }).appearance
      .background,
    "forge",
  );
  const image = dialoguePortraitMarkup(
    { ...chief, portrait: "assets/story.png" },
    (text) => text,
  );
  assert.match(image, /assets\/story.png/);
  assert.doesNotMatch(image, /composed-portrait/);
  const service = new TavernNpcService({
    assignments: { one: ["geologist"] },
    cyclesUntilRotation: 4,
  });
  const offer = service.getOffers(location)[0];
  assert.ok(isPortraitAppearance(offer.appearance));
  const restored = new TavernNpcService(
    JSON.parse(JSON.stringify(service.toJSON())),
  );
  assert.deepEqual(
    restored.getOffers(location)[0].appearance,
    offer.appearance,
  );
  restored.state.assignments = { elsewhere: ["geologist"] };
  assert.deepEqual(
    restored.getOffers({ ...location, id: "elsewhere" })[0].appearance,
    offer.appearance,
  );
});

test("les descripteurs invalides ne deviennent jamais des chemins de fichier ou du HTML", () => {
  const value = {
    ...createPortraitAppearance({ identity: "npc", gender: "male" }),
    headwear: null,
    glasses: null,
    prop: null,
    mask: null,
    forehead: null,
    mouthLines: null,
    eyeWrinkles: null,
  };
  for (const invalid of [
    null,
    {},
    { ...value, version: 99 },
    { ...value, hair: -1 },
    { ...value, nose: 1.5 },
    { ...value, background: '\" onerror=\"alert(1)' },
  ]) {
    assert.equal(portraitLayersMarkup(invalid), "");
  }
  assert.equal(
    (portraitLayersMarkup({ ...value, accessory: null }).match(/<img /g) ?? [])
      .length,
    9,
  );
  assert.equal(
    (
      portraitLayersMarkup({ ...value, accessory: "male-accessory-1" }).match(
        /<img /g,
      ) ?? []
    ).length,
    10,
  );
});

test("toutes les pièces et tous les portraits des héros existent aux dimensions prévues", () => {
  const root = new URL("../app/assets/", import.meta.url);
  for (const path of MODULAR_PORTRAIT_ASSETS) {
    const bytes = readFileSync(new URL(path, root));
    assert.equal(bytes.readUInt32BE(16), 512);
    assert.equal(bytes.readUInt32BE(20), path.includes("/v1/") ? 640 : 832);
    assert.equal(bytes[25], 6, "PNG RGBA requis");
  }
  for (const name of PORTRAIT_BACKGROUNDS)
    assert.ok(
      existsSync(new URL(`portraits/modular/v1/background-${name}.png`, root)),
    );
  for (const classId of ["warrior", "mage", "ranger"]) {
    for (const gender of ["male", "female"])
      assert.ok(
        existsSync(
          new URL(`../app/${heroPortrait(classId, gender)}`, import.meta.url),
        ),
      );
  }
});

test("toutes les pièces sont contraintes à leur bibliothèque, sans assemblage croisé", () => {
  for (const gender of PORTRAIT_GENDERS) {
    const own = createPortraitAppearance({ identity: "same", gender });
    const other = createPortraitAppearance({
      identity: "same",
      gender: gender === "male" ? "female" : "male",
    });
    assert.ok(isPortraitAppearance(own));
    for (const part of [
      "body",
      "clothingBack",
      "face",
      "hair",
      "eyes",
      "nose",
      "mouth",
      "clothing",
    ]) {
      const crossed = { ...own, [part]: other[part] };
      assert.equal(isPortraitAppearance(crossed), false, `${gender}/${part}`);
      assert.equal(portraitLayersMarkup(crossed), "");
      assert.equal(portraitLayerPath(crossed, part), null);
    }
    assert.equal(isPortraitAppearance({ ...own, gender: other.gender }), false);
    const html = portraitLayersMarkup(own);
    assert.match(html, new RegExp(`modular/v12/${gender}/hair-`));
    assert.doesNotMatch(html, new RegExp(`modular/v12/${other.gender}/`));
  }
  assert.throws(
    () => createPortraitAppearance({ identity: "a", gender: "unknown" }),
    /Bibliothèque/,
  );
  const female = createPortraitAppearance({ identity: "a", gender: "female" });
  assert.equal(
    isPortraitAppearance({ ...female, accessory: "male-accessory-1" }),
    false,
  );
});

test("quatre visages compatibles sont actifs sans réactiver les anciens visages larges", () => {
  for (const gender of PORTRAIT_GENDERS) {
    for (let index = 0; index < 250; index++) {
      const appearance = createPortraitAppearance({
        identity: `face-check:${index}`,
        gender,
      });
      assert.ok(
        [
          `${gender}-face-0`,
          `${gender}-face-1`,
          `${gender}-face-2`,
          `${gender}-face-3`,
        ].includes(appearance.face),
      );
      const wide = { ...appearance, face: `${gender}-face-4` };
      assert.equal(isPortraitAppearance(wide), false);
      assert.equal(portraitLayersMarkup(wide), "");
    }
    assert.ok(
      existsSync(
        new URL(
          `../app/assets/portraits/modular/v2/${gender}/face-1.png`,
          import.meta.url,
        ),
      ),
    );
    assert.ok(
      !MODULAR_PORTRAIT_ASSETS.includes(
        `portraits/modular/v2/${gender}/face-1.png`,
      ),
    );
  }
});

test("la coiffure féminine ne contient plus de fragment voisin sous les yeux", () => {
  const { width, pixels } = readPngRgba(
    new URL(
      "../app/assets/portraits/modular/v2/female/hair-0.png",
      import.meta.url,
    ),
  );
  for (let y = 262; y < 280; y++) {
    for (let x = 248; x < 290; x++) {
      assert.equal(
        pixels[(y * width + x) * 4 + 3],
        0,
        `Fragment de coiffure au pixel ${x},${y}`,
      );
    }
  }
});

test("les quatre coupes restent indépendantes de la tête et leurs parties arrière restent assorties", () => {
  for (const gender of PORTRAIT_GENDERS) {
    const base = createPortraitAppearance({ identity: "fixed-face", gender });
    for (let index = 0; index < 4; index++) {
      const changed = {
        ...base,
        hair: `${gender}-hair-${index}`,
        hairBack: gender === "female" ? `${gender}-hairBack-${index}` : null,
      };
      assert.ok(isPortraitAppearance(changed));
      assert.equal(changed.face, base.face);
      assert.match(
        portraitLayersMarkup(changed),
        new RegExp(`${gender}/hair-${index}.png`),
      );
      if (gender === "female") {
        const html = portraitLayersMarkup(changed);
        assert.ok(
          html.indexOf('data-portrait-layer="hairBack"') <
            html.indexOf('data-portrait-layer="face"'),
        );
        assert.equal(
          isPortraitAppearance({
            ...changed,
            hairBack: `female-hairBack-${(index + 1) % 4}`,
          }),
          false,
        );
      }
    }
  }
  const root = new URL("../app/assets/portraits/modular/v12/", import.meta.url);
  for (const part of ["face", "eyes", "nose", "mouth", "clothing", "hair"]) {
    assert.notDeepEqual(
      readFileSync(new URL(`male/${part}-0.png`, root)),
      readFileSync(new URL(`female/${part}-0.png`, root)),
      part,
    );
  }
  assert.equal(PORTRAIT_VARIANTS.male.hairBack, 0);
});
