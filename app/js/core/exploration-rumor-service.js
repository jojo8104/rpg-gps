import { TavernRumorService } from "./tavern-rumor-service.js";

/** Les PNJ expliquent les indications officielles, sans inventer de fausse piste. */
export class ExplorationRumorService {
  constructor(game) {
    this.game = game;
    this.listening = new TavernRumorService(game);
  }
  get state() {
    return this.game.explorationState;
  }
  offers(context, source) {
    if (this.game.explorationView)
      return structuredClone(
        this.game.explorationView.rumorOffers?.find(
          (entry) =>
            entry.heroId === context.hero.id &&
            entry.locationId === context.location.id &&
            entry.source === source,
        )?.options ?? [],
      );
    const { hero, location } = context;
    if (
      source === "tavern"
        ? !context.canTavern
        : source !== "chief" || !context.canTalkChief
    )
      return [];
    const held = new Set(
      this.state.clues
        .filter(
          (clue) =>
            clue.kind === "localization" &&
            clue.status === "active" &&
            ((clue.holder?.kind === "hero" && clue.holder.id === hero.id) ||
              (clue.holder?.kind === "player" &&
                clue.holder.id === hero.playerId)),
        )
        .map((clue) => clue.seriesId),
    );
    return [
      ...this.listening.offers(context, source),
      ...this.state.clueSeries
        .filter(
          (series) =>
            held.has(series.id) &&
            series.solution &&
            this.state.sites.some(
              (site) => site.id === series.siteId && site.status === "active",
            ) &&
            !this.state.rumorKnowledge.some(
              (entry) =>
                entry.playerId === hero.playerId &&
                entry.seriesId === series.id,
            ) &&
            (source === "tavern" ||
              series.referenceLocationId === location.id) &&
            this.explanation(series),
        )
        .map((series) => ({
          id: `rumor-action:explain:${series.id}`,
          kind: "rumor",
          label:
            source === "tavern"
              ? `Faire expliquer une carte · ${this.state.sites.find((site) => site.id === series.siteId)?.name ?? "votre carte"}`
              : `Demander au chef d’expliquer une carte · ${this.state.sites.find((site) => site.id === series.siteId)?.name ?? "votre carte"}`,
        })),
    ];
  }
  explanation(series) {
    const reference = this.game.locations.find(
      (location) =>
        location.id === series.referenceLocationId &&
        location.state !== "destroyed",
    );
    if (series.solution?.kind === "location") {
      if (!reference || series.solution.locationId !== reference.id)
        return null;
      return {
        text:
          series.style === "name"
            ? `Votre carte désigne bien ${reference.name}. Cherchez à l’intérieur de ce lieu.`
            : `« ${series.solution.designation} » désigne ${reference.name}. C’est dans ce lieu qu’il faut poursuivre vos recherches.`,
        locationId: reference.id,
      };
    }
    if (series.solution?.kind !== "grid") return null;
    return {
      text: `${reference ? `Le départ de cette carte est la case qui contient ${reference.name}. ` : "Le départ est la case repère indiquée sur la carte. "}Comptez les cases sur la grille : le nord augmente les lignes et l’est augmente les colonnes. Les fragments se lisent dans leur ordre.`,
      locationId: reference?.id ?? null,
    };
  }
  select(context, source, optionId) {
    if (optionId.startsWith("tavern-rumor:"))
      return this.listening.select(context, source, optionId);
    if (!this.offers(context, source).some((offer) => offer.id === optionId))
      return { success: false, reason: "rumor_unavailable" };
    const seriesId = /^rumor-action:(?:listen|explain):(.+)$/.exec(optionId)[1];
    const series = this.state.clueSeries.find((entry) => entry.id === seriesId);
    const explanation = this.explanation(series);
    if (!explanation) return { success: false, reason: "rumor_unavailable" };
    this.state.rumorKnowledge.push({
      id: `rumor-${context.hero.playerId}-${seriesId}`,
      playerId: context.hero.playerId,
      seriesId,
      locationId: explanation.locationId,
      text: explanation.text,
      learnedAt: this.game.now(),
      source,
    });
    if (explanation.locationId)
      this.game
        .getPlayer(context.hero.playerId)
        .discoverLocation(explanation.locationId, 1);
    return {
      success: true,
      lines: [explanation.text],
      message: explanation.text,
    };
  }
}
