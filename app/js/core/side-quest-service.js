import { CAMP_ACTIVITY_EXPERIENCE } from "./camp-activity-experience.js";
import {
  sideQuestTemplates,
  sideQuestSupplyLabel,
} from "./side-quest-catalog.js";
import { getItemDefinition } from "./item-catalog.js";

export const SIDE_QUEST_RENEWAL_MS = 5 * 60_000;
export const SIDE_QUEST_EXPERIENCE = 20;
export const SIDE_QUEST_REWARDS = Object.freeze({
  food: Object.freeze({ gold: 5, experience: 15 }),
  message: Object.freeze({ gold: 3, experience: 30 }),
});

export function sideQuestExperienceReward(quest) {
  return quest.experienceReward ?? SIDE_QUEST_EXPERIENCE;
}

export function sideQuestRewardLabel(quest) {
  return [
    quest.reward > 0 ? `${quest.reward} or` : null,
    sideQuestExperienceReward(quest) > 0
      ? `${sideQuestExperienceReward(quest)} XP`
      : null,
    quest.locationExperienceReward > 0
      ? `${quest.locationExperienceReward} XP pour le camp`
      : null,
  ]
    .filter(Boolean)
    .join(" et ");
}

/** Missions locales sérialisables, indépendantes des phases de scénario et du DOM. */
export class SideQuestService {
  constructor({
    now = () => Date.now(),
    gainExperience = (hero, amount, source) =>
      hero.addExperience(amount, source),
    getTemplates = () => sideQuestTemplates(),
    garrisonUnit = () => false,
    afterDeposit = () => {},
    afterComplete = () => {},
  } = {}) {
    this.now = now;
    this.gainExperience = gainExperience;
    this.getTemplates = getTemplates;
    this.garrisonUnit = garrisonUnit;
    this.afterDeposit = afterDeposit;
    this.afterComplete = afterComplete;
  }

  board(hero, location, source, locations) {
    const key = JSON.stringify([location.id, source]);
    const saved = hero.sideQuests.find((entry) => entry.key === key);
    if (saved?.status === "active") return saved;
    const now = this.now();
    if (
      saved &&
      now < (saved.status === "offered" ? saved.expiresAt : saved.availableAt)
    )
      return saved;
    const anchor =
      (saved?.status === "offered" ? saved.expiresAt : saved?.availableAt) ?? 0;
    const cycle = Math.floor((now - anchor) / SIDE_QUEST_RENEWAL_MS);
    const targets = locations.filter(
      (entry) =>
        entry.type === "village" &&
        entry.id !== location.id &&
        entry.population > 0,
    );
    const seed = [...key].reduce(
      (sum, letter) => sum + letter.charCodeAt(0),
      cycle,
    );
    const target = targets.length ? targets[seed % targets.length] : null;
    const message = target && seed % 2 === 1;
    const rewards = SIDE_QUEST_REWARDS[message ? "message" : "food"];
    // Keep legacy missions in the rotation alongside the new local requests.
    const templates = [null, ...this.getTemplates(hero, location)];
    const template = templates[Math.floor(seed / 2) % templates.length];
    if (template)
      return {
        ...structuredClone(template),
        key,
        id: JSON.stringify([key, anchor, cycle, template.templateId]),
        source,
        locationId: location.id,
        locationExperienceReward:
          location.type === "camp" ? CAMP_ACTIVITY_EXPERIENCE.sideQuest : 0,
        targetId: location.id,
        status: "offered",
        description:
          template.type === "garrison"
            ? `Déposez une unité de type ${template.unitTypeId}, au grade Soldat, avec ${template.requiredQuantity} soldats en pleine santé. Choisissez l’unité à remettre ; une même unité ne peut rapporter qu’une récompense de garnison.`
            : `Déposez ${sideQuestSupplyLabel(template.requirements)} ${source === "tavern" ? "à la taverne" : "au chef"} de ${location.name}. ${template.type === "npc" ? "Le PNJ doit être recruté et transporté par votre héros." : "Le lot complet est nécessaire."}`,
      };
    return {
      key,
      id: JSON.stringify([
        key,
        anchor,
        cycle,
        message ? target.id : location.id,
        message ? "message" : "food",
      ]),
      source,
      locationId: location.id,
      locationExperienceReward:
        location.type === "camp" ? CAMP_ACTIVITY_EXPERIENCE.sideQuest : 0,
      status: "offered",
      type: message ? "message" : "food",
      targetId: message ? target.id : location.id,
      title: message
        ? `Message pour ${target.name}`
        : `Des vivres pour ${location.name}`,
      description: message
        ? `Portez un message au chef de ${target.name}. La récompense vous sera remise à destination.`
        : `Apportez 2 vivres ${source === "tavern" ? "à la taverne" : "au chef"} de ${location.name}.`,
      reward: rewards.gold,
      experienceReward: rewards.experience,
    };
  }

  options(hero, location, source, locations) {
    const quest = this.board(hero, location, source, locations);
    const options = [];
    const option = (action, entry, label) => ({
      id: `side:${encodeURIComponent(JSON.stringify([action, entry.id]))}`,
      label,
    });
    if (quest.status === "offered")
      options.push(option("view", quest, `Mission : ${quest.title}`));
    else if (quest.status === "active") {
      if (["food", "supplies", "npc", "garrison"].includes(quest.type))
        options.push(
          option(
            "complete",
            quest,
            `${quest.type === "garrison" ? "Choisir l’unité à déposer" : `Déposer ${sideQuestSupplyLabel(quest.requirements ?? { food: 2 })}`} — ${sideQuestRewardLabel(quest)}`,
          ),
        );
      else options.push(option("view", quest, `En cours : ${quest.title}`));
      options.push(option("abandon", quest, `Abandonner : ${quest.title}`));
    } else
      options.push(
        option(
          "wait",
          quest,
          `Nouvelle mission dans ${Math.ceil((quest.availableAt - this.now()) / 60_000)} min`,
        ),
      );
    if (source === "chief")
      for (const entry of hero.sideQuests) {
        if (
          entry.status === "active" &&
          entry.type === "message" &&
          entry.targetId === location.id
        )
          options.push(
            option(
              "complete",
              entry,
              `Remettre le message — recevoir ${sideQuestRewardLabel(entry)}`,
            ),
          );
      }
    return options;
  }

  select(hero, location, source, locations, optionId) {
    let action, id, unitId;
    try {
      [action, id, unitId] = JSON.parse(decodeURIComponent(optionId.slice(5)));
    } catch {
      return { success: false, reason: "invalid_side_quest" };
    }
    const board = this.board(hero, location, source, locations);
    const quest =
      board.id === id
        ? board
        : hero.sideQuests.find(
            (entry) =>
              entry.id === id &&
              entry.status === "active" &&
              entry.type === "message" &&
              entry.targetId === location.id &&
              source === "chief",
          );
    if (!quest) return { success: false, reason: "side_quest_unavailable" };
    const result = (lines, options) => ({
      success: true,
      kind: "side_quest",
      lines,
      ...(options ? { options } : {}),
    });
    if (action === "view") {
      return result(
        [quest.description, `Récompense : ${sideQuestRewardLabel(quest)}.`],
        quest.status === "offered"
          ? [
              {
                id: `side:${encodeURIComponent(JSON.stringify(["accept", quest.id]))}`,
                label: "Accepter la mission",
              },
              {
                id: `side:${encodeURIComponent(JSON.stringify(["back", quest.id]))}`,
                label: "Plus tard",
              },
            ]
          : undefined,
      );
    }
    if (action === "back") return result(["Revenez quand vous le souhaitez."]);
    if (action === "wait")
      return result([
        "Une nouvelle mission sera disponible cinq minutes après la précédente.",
      ]);
    if (action === "accept" && quest.status === "offered") {
      hero.sideQuests = hero.sideQuests.filter(
        (entry) => entry.key !== quest.key,
      );
      hero.sideQuests.push({
        ...quest,
        status: "active",
        acceptedAt: this.now(),
      });
      return result(["Mission acceptée.", quest.description]);
    }
    if (quest.status !== "active")
      return { success: false, reason: "side_quest_unavailable" };
    if (action === "abandon" && quest.key === board.key) {
      quest.status = "abandoned";
      quest.availableAt = this.now() + SIDE_QUEST_RENEWAL_MS;
      return result([
        "Mission abandonnée. Nouvelle proposition dans 5 minutes.",
      ]);
    }
    if (action !== "complete" || quest.targetId !== location.id)
      return { success: false, reason: "side_quest_unavailable" };
    if (quest.type === "garrison") {
      const eligible = hero.army.units.filter(
        (unit) =>
          unit.typeId === quest.unitTypeId &&
          unit.rank === "soldier" &&
          unit.quantity === quest.requiredQuantity &&
          unit.state === "active" &&
          !unit.garrisonQuestRewarded &&
          unit.soldierHealth.every(
            (health) => health === unit.healthPerSoldier,
          ),
      );
      if (!unitId)
        return result(
          [
            eligible.length
              ? "Choisissez l’unité à déposer en garnison."
              : "Aucune unité ne remplit les conditions de cette mission.",
          ],
          eligible.length
            ? eligible.map((unit) => ({
                id: `side:${encodeURIComponent(JSON.stringify(["complete", quest.id, unit.id]))}`,
                label: `${unit.name ?? unit.typeId} (${unit.id}) — ${unit.quantity} soldats`,
              }))
            : undefined,
        );
      const unit = eligible.find((entry) => entry.id === unitId);
      if (!unit || !this.garrisonUnit(hero, location, unit))
        return result([
          "Dépôt impossible : vérifiez l’unité, l’accès au lieu et les places de garnison.",
        ]);
      unit.garrisonQuestRewarded = true;
    }
    if (["food", "supplies", "npc"].includes(quest.type)) {
      const requirements = quest.requirements ?? { food: 2 };
      if (
        Object.entries(requirements).some(
          ([resource, amount]) => hero.getResourceAmount(resource) < amount,
        )
      )
        return result([
          quest.type === "food"
            ? "Il vous faut 2 vivres pour terminer cette mission."
            : `Il vous faut le lot complet : ${sideQuestSupplyLabel(requirements)}.`,
        ]);
      const stock = { ...location.resources.stock };
      for (const [resource, amount] of Object.entries(requirements))
        stock[resource] = (stock[resource] ?? 0) + amount;
      const slots = Object.entries(stock).reduce(
        (total, [id, amount]) =>
          total + Math.ceil(amount / (getItemDefinition(id)?.bundleSize ?? 1)),
        0,
      );
      if (slots > location.storageSlotCapacity)
        return result(["Le lieu manque de place pour recevoir ce dépôt."]);
      for (const [resource, amount] of Object.entries(requirements))
        hero.spendResource(resource, amount);
      Object.assign(location.resources.stock, stock);
      if (quest.type === "npc") this.afterDeposit(location);
    }
    if (quest.reward > 0) hero.addResource("gold", quest.reward);
    if (sideQuestExperienceReward(quest) > 0)
      this.gainExperience(
        hero,
        sideQuestExperienceReward(quest),
        `side_quest:${quest.id}`,
      );
    quest.status = "completed";
    this.afterComplete(hero, location, quest);
    quest.availableAt = this.now() + SIDE_QUEST_RENEWAL_MS;
    return result([
      `Mission accomplie : récompense de ${sideQuestRewardLabel(quest)}.`,
      "Une nouvelle mission sera proposée au lieu de départ dans 5 minutes.",
    ]);
  }
}
