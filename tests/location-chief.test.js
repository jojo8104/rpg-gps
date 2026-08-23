import assert from "node:assert/strict";
import test from "node:test";
import { Location } from "../app/js/core/location.js";
import { LocationChiefService } from "../app/js/core/location-chief-service.js";

const location = new Location({ id: "village", name: "Village", type: "village", source: "test", position: { latitude: 0, longitude: 0 }, population: 10, chief: { name: "Mara", trade: true, secondaryQuestIds: ["lost-cart"], dialogues: [{ id: "warning", label: "Parler du danger", text: "La route est dangereuse.", objectiveId: "road-safe", when: "active" }, { id: "thanks", label: "Recevoir les remerciements", text: "La route est sûre.", objectiveId: "road-safe", when: "completed" }] } });

test("un chef expose commerce, quête secondaire et dialogue selon le contexte", () => {
  const service = new LocationChiefService();
  const before = service.getConversation({ location, canTrade: true, isObjectiveCompleted: () => false });
  assert.deepEqual(before.options.map((option) => option.id), ["trade", "quest:lost-cart", "dialogue:warning"]);
  const after = service.getConversation({ location, canTrade: true, isObjectiveCompleted: () => true });
  assert.deepEqual(after.options.map((option) => option.id), ["trade", "quest:lost-cart", "dialogue:thanks"]);
});

test("le choix d'un dialogue renvoie son texte et le chef reste sérialisable", () => {
  const service = new LocationChiefService(); const result = service.select({ location, optionId: "dialogue:warning", isObjectiveCompleted: () => false });
  assert.equal(result.success, true); assert.equal(result.message, "La route est dangereuse.");
  assert.deepEqual(result.lines, ["La route est dangereuse."]);
  assert.equal(location.toJSON().chief.name, "Mara"); assert.doesNotThrow(() => JSON.stringify(location));
});

test("une conversation expose son illustration et ses répliques d'accueil", () => {
  const illustrated = new Location({ id: "fort", name: "Fort", type: "fort", source: "test", position: { latitude: 0, longitude: 0 }, population: 4, chief: { name: "Armand", portrait: "assets/armand.png", greeting: "Entrez.", openingLines: ["Entrez.", "Nous avons peu de temps."] } });
  const conversation = new LocationChiefService().getConversation({ location: illustrated });
  assert.equal(conversation.portrait, "assets/armand.png");
  assert.deepEqual(conversation.openingLines, ["Entrez.", "Nous avons peu de temps."]);
});
