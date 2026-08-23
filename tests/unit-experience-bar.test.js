import test from "node:test";
import assert from "node:assert/strict";
import { renderUnitExperienceBar, unitExperienceProgress } from "../app/js/ui/unit-experience-bar.js";

test("la progression XP d'une unité utilise l'intervalle entre son grade et le suivant", () => {
  const progress = unitExperienceProgress({ rank: "corporal", experience: 175 });
  assert.equal(progress.nextRank.id, "sergeant");
  assert.equal(progress.value, 50);
  assert.match(renderUnitExperienceBar({ rank: "corporal", experience: 175 }, { detailed: true }), /175\/250 XP/);
});

test("la barre XP reste complète au grade maximal", () => {
  const progress = unitExperienceProgress({ rank: "lieutenant", experience: 1200 });
  assert.equal(progress.nextRank, null);
  assert.equal(progress.value, 100);
});
