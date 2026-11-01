import test from "node:test";
import assert from "node:assert/strict";
import { qrLocationArtKey, qrLocationArt } from "../server/lobby/qr-location-art.js";
import { preparationCatalog } from "../server/lobby/preparation-catalog.js";
import { createQrPrintDocument, qrSvg, qrPayload } from "../server/lobby/qr-print-document.js";

test("les mines du catalogue distinguent l’or du fer", () => {
  for (const resource of ["gold", "iron"]) {
    const location = preparationCatalog.locations.find((l) => l.id === `capital-resource-${resource}`);
    assert.ok(location);
    assert.equal(location.qrArt, resource === "gold" ? "mine-or" : "mine-fer");
  }
  assert.equal(qrLocationArtKey({ type: "mine", resources: { production: { gold: 5 } } }), "mine-or");
});

test("les neuf écus sont inclus sans images externes ni identifiants SVG répétés", () => {
  const keys = ["capitale", "ville", "village", "camp", "mine-fer", "mine-or", "carriere", "foret", "fort"];
  const locations = keys.map((qrArt, i) => ({ id: `lieu-${i}`, name: qrArt, qrArt }));
  const preparation = { date: "2026-10-17", locations: Object.fromEntries(locations.map((l) => [l.id, { placement: "qr", qrId: l.id }])) };
  const document = createQrPrintDocument({ code: "ESSAI", configuration: { preparation } }, { locations, quests: [] });
  assert.equal((document.match(/class="art"/g) ?? []).length, 9);
  assert.doesNotMatch(document, /<img|<image|id="title"|Paysage médiéval/);
  for (const location of locations) {
    assert.ok(document.includes(qrSvg(qrPayload("ESSAI", location.id))));
    assert.match(qrLocationArt(location), /fill="(?:white|black|none)"/);
  }
  assert.match(qrLocationArt({ type: "quest" }), /aria-label="Lieu"/);
});
