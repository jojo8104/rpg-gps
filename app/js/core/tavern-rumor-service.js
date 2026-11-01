import { stableNumber } from "./exploration-localization.js";

export const TAVERN_USEFUL_RUMOR_CHANCE = 0.25;
export const TAVERN_RUMOR_PRICE = 5;
const AMBIENT_RUMORS = Object.freeze([
  "Le brasseur prétend que sa nouvelle bière ferait chanter les mulets.",
  "Deux marchands débattent depuis une heure du meilleur fromage de la région.",
  "Le tavernier raconte le concours de tartes de la dernière fête du village.",
  "Un habitué affirme avoir gagné trois parties de dés avec le même gobelet.",
  "On discute d’une querelle entre deux éleveurs au sujet d’une chèvre fugueuse.",
  "Une musicienne cherche un nouveau refrain pour sa chanson de printemps.",
]);

/** Écoute payante : un vrai message de recherche ou une conversation sans piste. */
export class TavernRumorService {
  constructor(
    game,
    { random = Math.random, usefulChance = TAVERN_USEFUL_RUMOR_CHANCE } = {},
  ) {
    if (!Number.isFinite(usefulChance) || usefulChance < 0 || usefulChance > 1)
      throw new RangeError("Chance de rumeur invalide.");
    this.game = game;
    this.random = random;
    this.usefulChance = usefulChance;
  }
  get state() {
    return this.game.explorationState;
  }
  offers(context, source) {
    if (
      source !== "tavern" ||
      !context.canTavern ||
      !(context.location.infrastructure?.tavern >= 1)
    )
      return [];
    const sequence = this.state.rumorPurchases.filter(
      (entry) =>
        entry.playerId === context.hero.playerId &&
        entry.locationId === context.location.id,
    ).length;
    return [
      {
        id: `tavern-rumor:${sequence}`,
        kind: "rumor",
        label: "Écouter une rumeur · 5 or · peut être sans importance",
      },
    ];
  }
  select(context, source, optionId) {
    if (!this.offers(context, source).some((offer) => offer.id === optionId))
      return { success: false, reason: "rumor_unavailable" };
    if (context.hero.getResourceAmount("gold") < TAVERN_RUMOR_PRICE)
      return { success: false, reason: "insufficient_resources" };
    const roll = this.random();
    if (!Number.isFinite(roll) || roll < 0 || roll >= 1)
      throw new RangeError("Tirage de rumeur invalide.");
    const candidates = this.state.clues.filter(
      (clue) =>
        clue.kind === "search" &&
        clue.status === "active" &&
        !clue.holder &&
        clue.origin?.source === "tavern" &&
        clue.origin.locationId === context.location.id &&
        this.state.sites.some(
          (site) => site.id === clue.siteId && site.status === "active",
        ),
    );
    const useful = roll < this.usefulChance && candidates.length > 0;
    const clue = useful
      ? candidates[
          Math.min(
            candidates.length - 1,
            Math.floor((roll / this.usefulChance) * candidates.length),
          )
        ]
      : null;
    const text = clue
      ? "Un habitué vous remet un message de recherche écrit. Vous le conservez parmi vos documents."
      : AMBIENT_RUMORS[Math.floor(roll * AMBIENT_RUMORS.length)];
    context.hero.spendResource("gold", TAVERN_RUMOR_PRICE);
    if (clue) {
      const signs = [
        "une étoile gravée",
        "trois entailles parallèles",
        "un cercle brisé",
        "une spirale",
        "une petite couronne",
        "deux chevrons superposés",
      ];
      const sign = signs[stableNumber(clue.siteId) % signs.length];
      clue.medium = "message";
      clue.text = `Lors de votre recherche, repérez ${sign}. Examinez soigneusement les traces voisines : elles permettent de distinguer l’accès dissimulé. Ce message aide à chercher sur place, sans indiquer la destination.`;
      this.game.explorationClueService.receive(context.hero, clue);
    }
    this.state.rumorPurchases.push({
      id: `rumor-purchase-${context.hero.playerId}-${context.location.id}-${optionId.split(":")[1]}`,
      playerId: context.hero.playerId,
      heroId: context.hero.id,
      locationId: context.location.id,
      at: this.game.now(),
      outcome: clue ? "clue" : "ambient",
      clueId: clue?.id ?? null,
      text,
      roll,
      chance: this.usefulChance,
    });
    return {
      success: true,
      outcome: clue ? "clue" : "ambient",
      message: text,
      lines: [text],
    };
  }
}
