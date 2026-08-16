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
      default:
        throw new RangeError(`Le type d'effet "${effect.type}" n'est pas encore pris en charge.`);
    }
  }

  static #requireText(value, label) {
    if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} doit être un texte non vide.`);
    return value.trim();
  }
}
