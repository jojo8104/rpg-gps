import {
  heroPortrait as portraitForHero,
  heroClassName,
} from "./hero-appearance.js";
import { formatInteger } from "./number-format.js";
import { HERO_COMMAND_RANKS } from "../core/rank-system.js";
const rankLabel = (ranks, id) =>
  ranks.find((rank) => rank.id === id)?.label ?? id;
import { HeroArmyModifier } from "../core/hero-army-modifier.js";
import { renderEquipmentView, bindEquipmentView } from "./equipment-view.js";
// Présente les données du héros ; les intentions sont transmises au contrôleur.
export function renderHeroView({
  element,
  game,
  hero,
  equipmentHero = hero,
  pendingEquipmentSlot = null,
  data,
  selectedHeroStat,
  selectedHeroTrait,
  selectedEquipmentSlotId,
  divinationCooldown,
  astralCooldown,
  classPowerUnavailable,
  formatCooldown,
}) {
  const heroClass = data.heroClasses.find((item) => item.id === hero.classId);
  const heroModifiers = HeroArmyModifier.calculate({
    hero,
    units: hero.army.units,
    unitDefinitions: game.unitDefinitions,
    moraleMode: game.setup.rules.moraleMode,
  });
  const usedBagSlots = heroModifiers.details.speed.usedSlots;
  const bagSlotCapacity = heroModifiers.details.speed.slotCapacity;
  const signed = (value) => `${value >= 0 ? "+" : ""}${formatInteger(value)}`;
  const healthPercent = Math.max(
    0,
    Math.min(100, (hero.health / hero.maxHealth) * 100),
  );
  const progress = game.getHeroProgress(hero.id);
  const authority = game.getHeroAuthority(hero.id);
  const levelExperience = progress.currentLevelXp;
  const experiencePercent = progress.maximumLevelReached
    ? 100
    : Math.max(
        0,
        Math.min(100, (levelExperience / progress.xpToNextLevel) * 100),
      );
  const statLabels = {
    attack: "Attaque",
    defense: "Défense",
    morale: "Moral",
    mobility: "Mobilité",
    command: "Commandement",
    health: "Points de vie",
    discretion: "Discrétion",
    detection: "Détection",
  };
  const statButton = (stat, value) =>
    `<button type="button" class="hero-stat-button ${selectedHeroStat === stat ? "is-selected" : ""}" data-hero-stat="${stat}" aria-expanded="${selectedHeroStat === stat}"><strong>${formatInteger(value)}</strong><span>${statLabels[stat]}</span></button>`;
  const contextualMorale = heroModifiers.details.morale.reduce(
    (total, factor) => total + factor.value,
    0,
  );
  const mobilityStatFactor = (hero.finalStats.mobility ?? 3) / 3;
  const armySpeedMultiplier =
    mobilityStatFactor === 0
      ? 0
      : heroModifiers.speedMultiplier / mobilityStatFactor;
  const classFeatures = game.heroClassFeatureService.featuresFor(hero);
  const detectionMultiplier =
    game.heroClassFeatureService.detectionMultiplier(hero);
  const classSignatureMultiplier = classFeatures.concealmentMultiplier ?? 1;
  const temporarySignatureMultiplier =
    hero.classFeatureState.gpsConcealmentMultiplier ?? 1;
  const signatureMultiplier =
    game.heroClassFeatureService.signatureMultiplier(hero);
  const discretionPercent = Math.round((1 - signatureMultiplier) * 100);
  const standardStatDetail = (stat) =>
    `<aside class="stat-detail" role="status"><header><strong>${statLabels[stat]}</strong><span>Valeur finale : ${formatInteger(hero.finalStats[stat])}</span></header><div class="stat-detail-grid"><span>Base<strong>${formatInteger(hero.baseStats[stat])}</strong></span><span>Progression<strong>${signed(hero.statGrowth[stat])}</strong></span><span>Équipement<strong>${signed(hero.equipmentModifiers[stat])}</strong></span><span>Temporaire<strong>${signed(hero.temporaryModifiers[stat])}</strong></span></div>${stat === "health" ? `<p>PV actuels : ${formatInteger(hero.health)}/${formatInteger(hero.maxHealth)}</p>` : ""}${stat === "command" ? `<p>Points disponibles : ${formatInteger(hero.commandPoints)}/${formatInteger(hero.maxCommandPoints)}</p>` : ""}${stat === "morale" && contextualMorale !== 0 ? `<p>Contexte actuel : ${signed(contextualMorale)} · bonus effectif ${signed(heroModifiers.moraleBonus)}</p>` : ""}${stat === "mobility" ? `<p>Train de l’armée : ${formatInteger(armySpeedMultiplier * 100)} % · multiplicateur effectif ${formatInteger(heroModifiers.speedMultiplier * 100)} %</p>` : ""}</aside>`;
  const perceptionStatDetail =
    selectedHeroStat === "detection"
      ? `<aside class="stat-detail" role="status"><header><strong>Détection</strong><span>Portée effective : ${formatInteger(detectionMultiplier * 100)} %</span></header><div class="stat-detail-grid"><span>Base<strong>100 %</strong></span><span>Classe<strong>${formatInteger((classFeatures.detectionMultiplier ?? 1) * 100)} %</strong></span></div><p>Multiplie la portée à laquelle le héros repère les lieux et les groupes.</p></aside>`
      : selectedHeroStat === "discretion"
        ? `<aside class="stat-detail" role="status"><header><strong>Discrétion</strong><span>${discretionPercent}% plus difficile à détecter</span></header><div class="stat-detail-grid"><span>Classe<strong>${Math.round((1 - classSignatureMultiplier) * 100)}%</strong></span><span>Dissimulation<strong>${Math.round((1 - temporarySignatureMultiplier) * 100)}%</strong></span><span>Signature finale<strong>${formatInteger(signatureMultiplier * 100)} %</strong></span></div><p>Une discrétion élevée réduit la distance à laquelle les ennemis peuvent intercepter le héros.</p></aside>`
        : "";
  const statDetail = selectedHeroStat
    ? perceptionStatDetail || standardStatDetail(selectedHeroStat)
    : "";
  const mageDivinationRadius =
    game.heroClassFeatureService.divinationRadius(hero);
  const mageAstralReach = game.heroClassFeatureService.astralReachBonus(hero);
  const mageHealingAura = game.heroClassFeatureService.healingAura(hero);
  const activeWatchBeaconCount = game
    .getWatchBeaconsForPlayer(hero.playerId)
    .filter((beacon) => beacon.sourceHeroId === hero.id).length;
  const watchBeaconRadius =
    game.heroClassFeatureService.watchBeaconRadius(hero);
  const innateTraits =
    hero.classId === "mage"
      ? [
          {
            id: "mage_divination",
            type: "innate",
            icon: "◉",
            name: "Divination",
            summary:
              divinationCooldown > 0
                ? `Recharge ${formatCooldown(divinationCooldown)}`
                : `Ø ${Math.round(mageDivinationRadius * 2)} m`,
            description: `Révèle les lieux dans un diamètre de ${Math.round(mageDivinationRadius * 2)} m autour du Mage. Recharge : 5 minutes.`,
            action: "divination",
            disabled: divinationCooldown > 0 || classPowerUnavailable,
          },
          {
            id: "mage_astral_travel",
            type: "innate",
            icon: "✧",
            name: "Voyage astral",
            summary:
              astralCooldown > 0
                ? `Recharge ${formatCooldown(astralCooldown)}`
                : `+${mageAstralReach} m`,
            description: `Projette un fantôme déplaçable dans un rayon de ${mageAstralReach} m vers un lieu connu, un héros visible ou un GA détecté. Durée : 10 secondes, une interaction. Recharge : 10 minutes après une activation réussie.`,
            action: "astral-travel",
            disabled: astralCooldown > 0 || classPowerUnavailable,
          },
          {
            id: "mage_healing_aura",
            type: "innate",
            icon: "✚",
            name: "Aura de soins",
            summary: `${mageHealingAura.radius} m`,
            description: `Soigne automatiquement les autres héros alliés de ${formatInteger(mageHealingAura.healthPerCycle)} PV par cycle dans un rayon de ${mageHealingAura.radius} m.`,
          },
        ]
      : hero.classId === "ranger"
        ? [
            {
              id: "ranger_scout_instinct",
              type: "innate",
              icon: "◉",
              name: "Sens de l’éclaireur",
              summary: `Détection ${formatInteger(detectionMultiplier * 100)} %`,
              description:
                "Augmente la détection et la qualité des renseignements, et annule le malus subi lorsque l’Éclaireur tombe dans une embuscade.",
            },
            {
              id: "ranger_discretion",
              type: "innate",
              icon: "◌",
              name: "Discrétion",
              summary: `${discretionPercent}%`,
              description: `Réduit la signature du héros : il est actuellement ${discretionPercent}% plus difficile à détecter.`,
            },
            {
              id: "ranger_watch_beacon",
              type: "innate",
              icon: "⌖",
              name: "Balise de vigie",
              summary: `${watchBeaconRadius} m · ${activeWatchBeaconCount}/3`,
              description: `Pose une balise qui révèle et signale les joueurs ou groupes autonomes dans un rayon de ${watchBeaconRadius} m. La maîtrise porte ce rayon à 45 m.`,
              action: "watch-beacon",
              disabled: classPowerUnavailable,
            },
          ]
        : [];
  const learnedTraits = [
    ...hero.skillIds.map((id) => ({ id, type: "skill" })),
    ...hero.specialPowerIds.map((id) => ({ id, type: "power" })),
  ].map((trait) => {
    const aptitude = data.heroAptitudes.find((item) => item.id === trait.id);
    return {
      ...trait,
      icon: trait.type === "skill" ? "✦" : "◆",
      name:
        aptitude?.name ?? trait.id.replaceAll("_", " ").replaceAll("-", " "),
      summary: hero.aptitudeRanks[trait.id] ?? "",
      description:
        aptitude?.description ??
        (trait.type === "skill"
          ? "Bonus permanent appliqué automatiquement."
          : "Pouvoir utilisable en combat contre des points de commandement."),
    };
  });
  const heroTraits = [...innateTraits, ...learnedTraits];
  const traitButton = (trait) =>
    `<button type="button" class="trait-chip ${selectedHeroTrait?.id === trait.id && selectedHeroTrait.type === trait.type ? "is-selected" : ""}" data-trait-id="${trait.id}" data-trait-type="${trait.type}" aria-label="${trait.name}${trait.summary ? `, ${trait.summary}` : ""}"><span class="trait-icon" aria-hidden="true">${trait.icon}</span><span>${trait.name}${trait.summary ? `<small>${trait.summary}</small>` : ""}</span></button>`;
  const traitSlots = heroTraits
    .map(traitButton)
    .concat(
      Array.from(
        { length: Math.max(0, 9 - heroTraits.length) },
        () => '<span class="trait-chip is-empty" aria-hidden="true">＋</span>',
      ),
    )
    .join("");
  const selectedTrait = heroTraits.find(
    (trait) =>
      trait.id === selectedHeroTrait?.id &&
      trait.type === selectedHeroTrait?.type,
  );
  const traitDetail = selectedTrait
    ? `<aside class="trait-detail"><span class="trait-icon" aria-hidden="true">${selectedTrait.icon}</span><div><strong>${selectedTrait.name}</strong><small>${selectedTrait.type === "innate" ? "Spécialité innée" : selectedTrait.type === "skill" ? "Compétence passive" : "Pouvoir spécial"}</small><p>${selectedTrait.description}</p>${selectedTrait.action ? `<button type="button" class="trait-detail-action" data-class-action="${selectedTrait.action}" ${selectedTrait.disabled ? "disabled" : ""}>Utiliser</button>` : ""}</div></aside>`
    : "";
  const heroPortrait = portraitForHero(hero.classId, hero.gender);
  element.innerHTML = `<article class="hero-card compact-hero-card"><section class="hero-bars"><button type="button" class="hero-progress health-progress hero-stat-trigger ${selectedHeroStat === "health" ? "is-selected" : ""}" data-hero-stat="health" aria-expanded="${selectedHeroStat === "health"}" aria-label="${formatInteger(hero.health)} PV sur ${formatInteger(hero.maxHealth)}"><span style="width:${healthPercent}%"></span><small>PV ${formatInteger(hero.health)}/${formatInteger(hero.maxHealth)}</small></button><button type="button" class="hero-progress experience-progress ${progress.canLevelUp || hero.pendingLevelUps.length ? "is-level-up-ready" : ""}" data-open-hero-progress aria-label="${progress.canLevelUp ? "Niveau disponible" : `${formatInteger(levelExperience)} XP sur ${formatInteger(progress.xpToNextLevel)}`}"><span style="width:${experiencePercent}%"></span><small>${progress.canLevelUp ? "✦ Niveau disponible" : `XP ${formatInteger(levelExperience)}/${formatInteger(progress.xpToNextLevel || levelExperience)}`}</small></button></section><section class="hero-identity"><img class="hero-portrait" src="assets/portraits/hero-wanderer.png" alt="Portrait de ${hero.name}"><header><div><h3>${hero.name}</h3><span class="eyebrow hero-rank"><span>${heroClassName(hero.classId, hero.gender, heroClass?.name ?? hero.classId)}</span><span>${rankLabel(HERO_COMMAND_RANKS, hero.commandRank)}- LvL ${hero.level}</span></span><div class="hero-distance"><small class="hero-distance__label">Distance parcourue</small><strong class="hero-distance__value">${formatInteger(hero.travelProgress?.totalDistanceMeters ?? 0)} m</strong></div></div><span class="hero-state">${hero.state}</span></header></section><section class="hero-stat-panel" aria-label="Statistiques du héros"><div class="compact-hero-stats">${statButton("attack", signed(heroModifiers.attackBonus))}${statButton("defense", signed(heroModifiers.defenseBonus))}${statButton("morale", signed(heroModifiers.moraleBonus))}${statButton("mobility", `${formatInteger(heroModifiers.speedMultiplier * 100)} %`)}${statButton("command", hero.finalStats.command)}<div><strong>${hero.army.units.length}/${hero.maxUnitStacks}</strong><span>Unités</span></div><div><strong>${usedBagSlots}/${formatInteger(bagSlotCapacity)}</strong><span>Bagages</span></div></div>${statDetail}</section><section class="hero-aptitudes" aria-label="Aptitudes et pouvoirs du héros"><div class="trait-list">${traitSlots}</div>${traitDetail}</section><div class="hero-equipment" aria-label="Équipement du héros"></div></article>`;
  element.querySelector(".hero-portrait").src = heroPortrait;
  element
    .querySelector(".compact-hero-stats")
    .insertAdjacentHTML(
      "beforeend",
      `${statButton("discretion", `${discretionPercent}%`)}${statButton("detection", `${formatInteger(detectionMultiplier * 100)} %`)}`,
    );
  element
    .querySelector(".compact-hero-stats")
    .insertAdjacentHTML(
      "beforeend",
      `<div><strong>${authority.used}/${formatInteger(authority.maximum)}</strong><span>Autorité</span></div>`,
    );
  element.querySelector(".hero-equipment").innerHTML = renderEquipmentView({
    hero: equipmentHero,
    pendingSlotId: pendingEquipmentSlot,
    openSlotId: selectedEquipmentSlotId,
  });
  const pending = hero.pendingLevelUps[0];
  if (pending)
    element.querySelector(".experience-progress small").textContent =
      "✦ Amélioration à choisir";
}
export function bindHeroView(element, actions) {
  element
    .querySelector("[data-open-hero-progress]")
    ?.addEventListener("click", actions.openProgress);
  element
    .querySelectorAll("[data-hero-stat]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        actions.selectStat(button.dataset.heroStat),
      ),
    );
  element.querySelectorAll("[data-trait-id]").forEach((button) =>
    button.addEventListener("click", () =>
      actions.selectTrait({
        id: button.dataset.traitId,
        type: button.dataset.traitType,
      }),
    ),
  );
  element
    .querySelectorAll("[data-class-action]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        actions.classAction(button.dataset.classAction),
      ),
    );
  bindEquipmentView(element, {
    onMenuChange: actions.selectEquipmentSlot,
    onEquip: actions.equip,
    onUnequip: actions.unequip,
  });
  element.onclick = (event) =>
    actions.dismissDetails({
      trait: !event.target.closest("[data-trait-id], .trait-detail"),
      stat: !event.target.closest("[data-hero-stat], .stat-detail"),
    });
}
