/** Applique les effets déclaratifs d'événements sans dépendre de l'interface. */
export class ScenarioEffectResolver {
  apply(event, game) {
    return event.effects.map((effect) => this.#applyEffect(effect, game));
  }

  #applyEffect(effect, game) {
    switch (effect.type) {
      case "showNarration": {
        const text = ScenarioEffectResolver.#requireText(effect.text, "Le texte de narration");
        const entry = { type: "narration", text, eventId: game.activeScenarioEventId };
        game.eventLog.push(entry);
        return entry;
      }
      case "revealLocation": {
        const location = game.getLocationForScenarioSlot(effect.locationSlotId);
        location.visibility = "discovered";
        const entry = { type: "location_revealed", locationId: location.id, eventId: game.activeScenarioEventId };
        game.eventLog.push(entry);
        return entry;
      }
      case "setLocationState": {
        const location = game.getLocationForScenarioSlot(effect.locationSlotId);
        location.state = ScenarioEffectResolver.#requireText(effect.state, "L'état du lieu");
        const entry = { type: "location_state_changed", locationId: location.id, state: location.state, eventId: game.activeScenarioEventId };
        game.eventLog.push(entry);
        return entry;
      }
      case "awardHeroExperience": {
        const hero = ScenarioEffectResolver.#heroFor(effect, game);
        const amount = ScenarioEffectResolver.#positiveInteger(effect.amount, "La récompense d'expérience");
        game.gainHeroExperience({ heroId: hero.id, amount, source: `quest:${game.activeScenarioEventId}` });
        const entry = { type: "hero_experience_awarded", heroId: hero.id, amount, eventId: game.activeScenarioEventId };
        game.eventLog.push(entry); return entry;
      }
      case "grantCarriedItem": {
        const hero = ScenarioEffectResolver.#heroFor(effect, game); const itemId = ScenarioEffectResolver.#requireText(effect.itemId, "L'objet de quête");
        if (!hero.carriedLoot.some((entry) => entry.itemId === itemId)) hero.addCarriedLoot([{ id: `${itemId}-${game.activeScenarioEventId}`, itemId, quantity: 1, valuePerUnit: 1 }]);
        const entry = { type: "quest_item_granted", heroId: hero.id, itemId, eventId: game.activeScenarioEventId };
        game.eventLog.push(entry); return entry;
      }
      case "removeCarriedItem": {
        const hero = ScenarioEffectResolver.#heroFor(effect, game); const itemId = ScenarioEffectResolver.#requireText(effect.itemId, "L'objet de quête");
        const index = hero.carriedLoot.findIndex((entry) => entry.itemId === itemId); if (index >= 0) hero.carriedLoot.splice(index, 1);
        const entry = { type: "quest_item_removed", heroId: hero.id, itemId, eventId: game.activeScenarioEventId };
        game.eventLog.push(entry); return entry;
      }
      case "grantHeroResource": {
        const hero = ScenarioEffectResolver.#heroFor(effect, game); const resource = ScenarioEffectResolver.#requireText(effect.resource, "La ressource"); const amount = ScenarioEffectResolver.#positiveInteger(effect.amount, "La récompense");
        hero.addResource(resource, amount); const entry = { type: "hero_resource_granted", heroId: hero.id, resource, amount, eventId: game.activeScenarioEventId };
        game.eventLog.push(entry); return entry;
      }
      default:
        throw new RangeError(`Le type d'effet "${effect.type}" n'est pas encore pris en charge.`);
    }
  }

  static #requireText(value, label) {
    if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} doit être un texte non vide.`);
    return value.trim();
  }

  static #positiveInteger(value, label) { if (!Number.isInteger(value) || value <= 0) throw new RangeError(`${label} doit être un entier positif.`); return value; }
  static #heroFor(effect, game) {
    const playerId = ScenarioEffectResolver.#requireText(effect.playerId ?? "local", "Le joueur récompensé"); const player = game.getPlayer(playerId); const hero = player?.heroIds.map((id) => game.getHero(id)).find((candidate) => candidate !== null) ?? null;
    if (hero === null) throw new RangeError("Le héros récompensé n'existe pas."); return hero;
  }
}
