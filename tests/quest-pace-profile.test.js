import assert from "node:assert/strict";
import test from "node:test";
import { distanceForPace, questPaceProfile } from "../app/js/core/quest-pace-profile.js";
import { QuestDeadlineService } from "../app/js/core/quest-deadline-service.js";

test("le profil sportif allonge les distances IRL de la première quête", () => {
  const calm = questPaceProfile("calm"); const sport = questPaceProfile("sport");
  assert.ok(sport.royalCampMeters > calm.royalCampMeters);
  assert.ok(sport.firstTraceMeters > calm.firstTraceMeters);
  assert.ok(sport.secondTraceMeters > calm.secondTraceMeters);
  assert.ok(sport.battlefieldMeters > calm.battlefieldMeters);
});

test("une distance déclarative choisit la valeur du rythme du setup", () => {
  assert.equal(distanceForPace({ calm: 150, sport: 300 }, "calm", 200), 150);
  assert.equal(distanceForPace({ calm: 150, sport: 300 }, "sport", 200), 300);
});

test("le délai IRL réserve le trajet et deux minutes pour évacuer puis démanteler", () => {
  const service = new QuestDeadlineService(); const input = { origin: { latitude: 0, longitude: 0 }, destination: { latitude: 0, longitude: .002694 }, baseMinutes: 2, minimumMinutes: 3, maximumMinutes: 12, calmMetersPerMinute: 60, sportMetersPerMinute: 100 };
  const calm = service.calculateMinutes({ ...input, paceMode: "calm" }); const sport = service.calculateMinutes({ ...input, paceMode: "sport" });
  assert.equal(calm.minutes, 7); assert.equal(sport.minutes, 5);
});
