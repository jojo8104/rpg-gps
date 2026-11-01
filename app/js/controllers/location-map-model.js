import { formatInteger } from "../ui/number-format.js";
import { questEngineOptions } from "./quest-engine-presentation.js";
import { locationQuestMarker } from "./location-quest-marker.js";
import { locationTaxState } from "../core/location-tax-service.js";
import { CAMP_IMPROVEMENTS } from "../core/camp-improvement-service.js";

// Projette le moteur vers les fiches et marqueurs, sans accès au DOM ni à Leaflet.
export function createLocationMapModel({
  getSession,
  isLocationEnabled,
  positionFor,
  distance,
  rangesFor,
  descriptions,
}) {
  function unitDefenseSummary(unit, source, hero = null) {
    return {
      id: unit.id,
      name: unit.name ?? unit.typeId,
      type: unit.typeId,
      quantity: unit.quantity,
      ownerPlayerId: unit.ownerPlayerId,
      source,
      heroId: hero?.id ?? null,
      heroName: hero?.name ?? null,
    };
  }
  function locationDefenseSnapshot(location) {
    const { game, hero } = getSession();
    const units = location.garrison.units.map((unit) =>
      unitDefenseSummary(unit, "garrison"),
    );
    const reinforcements = location.heroIds.flatMap((heroId) => {
      const presentHero = game.getHero(heroId);
      if (
        !presentHero ||
        presentHero.id === hero.id ||
        !game.locationAccessPolicy.isDefender(presentHero.playerId, location)
      )
        return [];
      return presentHero.army.units.map((unit) =>
        unitDefenseSummary(unit, "hero", presentHero),
      );
    });
    return {
      slots: location.defenseSlots,
      units,
      reinforcements,
      defenders: [...units, ...reinforcements],
    };
  }

  function recruitmentUnavailableMessage(result) {
    const messages = {
      insufficient_authority: "Autorité insuffisante.",
      hero_not_at_location: "Le héros doit être présent dans ce lieu.",
      recruitment_not_available: "Le recrutement n'est pas disponible ici.",
      unit_not_available: "Ce type d'unité n'est pas disponible.",
      army_full: "L'armée ne peut plus accueillir d'unité.",
      unknown_unit_type: "Ce type d'unité est inconnu.",
      insufficient_recruits: "Aucune recrue disponible.",
      insufficient_resources: `Ressources insuffisantes${result.missingResources?.length ? ` : ${result.missingResources.join(", ")}` : ""}.`,
    };
    return (
      messages[result.reason] ?? `Recrutement impossible : ${result.reason}.`
    );
  }

  function serviceActionDetails(result) {
    return {
      costs: { ...(result.costs ?? {}) },
      unavailableReason: result.success
        ? null
        : recruitmentUnavailableMessage(result),
    };
  }

  function mappedLocations({ includeHiddenLocations = false } = {}) {
    const {
      game,
      hero,
      playerId: localPlayerId,
      position: heroPosition,
    } = getSession();
    const player = game.getPlayer(localPlayerId);
    return game.locations
      .filter((location) =>
        isLocationEnabled(location, { includeHiddenLocations }),
      )
      .map((location) => {
        const position = positionFor(location.id);
        const d = distance(heroPosition, position);
        const ranges = rangesFor(location);
        const nearby = d <= ranges.interactionRadius;
        const relation = game.getLocationRelation(player.id, location.id);
        const can = (action) =>
          hero.state === "active" &&
          game.canPerformLocationAction({
            playerId: player.id,
            locationId: location.id,
            action,
          });
        const actions = [];
        if (can("recruit")) {
          const totalAvailable = Object.values(
            location.recruitment.stock,
          ).reduce((sum, amount) => sum + amount, 0);
          location.recruitment.availableUnitTypeIds.forEach((type) => {
            const definition = game.unitDefinitions.get(type);
            const availability = game.getRecruitmentAvailability({
              playerId: player.id,
              heroId: hero.id,
              locationId: location.id,
              unitTypeId: type,
            });
            actions.push({
              id: `recruit:${type}`,
              label: `Recruter ${definition?.name ?? type}`,
              details: {
                name: definition?.name ?? type,
                available: location.recruitment.stock[type] ?? 0,
                totalAvailable,
                capacity: location.recruitment.capacity,
                stats: definition ? { ...definition.stats } : {},
                costs: definition ? { ...definition.costs } : {},
                unavailableReason: availability.success
                  ? null
                  : recruitmentUnavailableMessage(availability),
              },
            });
          });
        }
        if (
          can("reinforce") &&
          hero.army.units.some(
            (unit) =>
              unit.missingQuantity > 0 &&
              (location.recruitment.stock[unit.typeId] ?? 0) > 0,
          )
        )
          actions.push({
            id: "complete-units",
            label: "Compléter les effectifs",
            details: serviceActionDetails(
              game.getHeroUnitCompletionQuote({
                playerId: player.id,
                heroId: hero.id,
                locationId: location.id,
              }),
            ),
          });
        if (
          can("heal") &&
          hero.army.units.some((unit) =>
            unit.soldierHealth.some((health) => health < unit.healthPerSoldier),
          )
        )
          actions.push({
            id: "heal-units",
            label: "Soigner (1 unité de temps)",
            details: serviceActionDetails(
              game.getHeroUnitHealingQuote({
                playerId: player.id,
                heroId: hero.id,
                locationId: location.id,
                timeUnits: 1,
              }),
            ),
          });
        if (can("manageReserves")) {
          const resourceIds = new Set(
            [
              ...Object.keys(hero.resources),
              ...Object.keys(location.resources.stock),
            ].filter((id) => id !== "population"),
          );
          resourceIds.forEach((id) => {
            const carried = Math.floor(hero.getResourceAmount(id));
            const stored = Math.floor(location.resources.stock[id] ?? 0);
            if (carried + stored > 0)
              actions.push({
                id: `reserve-balance:${id}`,
                label: `Répartir ${id}`,
                details: {
                  resourceName: id,
                  heroAmount: carried,
                  locationAmount: stored,
                  total: carried + stored,
                  heroSlotCapacity: hero.bagSlotCount,
                  locationSlotCapacity: location.storageSlotCapacity,
                },
              });
          });
          Object.entries(location.resources.production)
            .filter(([, amount]) => amount > 0)
            .forEach(([id]) =>
              actions.push({
                id: `production-stock:${id}`,
                label: `Production de ${id}`,
                details: {
                  resourceName: id,
                  productionAmount: Math.floor(
                    location.resources.productionStock[id] ?? 0,
                  ),
                  productionSlotCapacity: 4,
                },
              }),
            );
          if ((location.population ?? 0) > 0)
            actions.push({
              id: "prepare-population",
              label: "Préparer de la population",
              details: {
                population: location.population,
                bundleSize: 5,
                storageSlotCapacity: location.storageSlotCapacity,
              },
            });
          if ((location.resources.stock.population ?? 0) > 0)
            actions.push({
              id: "stored-population",
              label: "Population en réserve",
              details: { quantity: location.resources.stock.population },
            });
          hero.carriedLoot
            .filter((entry) => entry.itemId === "population")
            .forEach((entry) =>
              actions.push({
                id: `settle-population:${entry.id}`,
                label: `Installer ${formatInteger(entry.quantity)} habitant(s)`,
                details: { packageId: entry.id, quantity: entry.quantity },
              }),
            );
        }
        if (can("attack")) {
          const captureRequirement = game.getLocationCaptureRequirement({
            playerId: player.id,
            locationId: location.id,
          });
          actions.push({
            id: "battle",
            label:
              captureRequirement.state === "can_capture"
                ? "Capturer"
                : "Attaquer",
          });
        }
        const questInteractions = game.getQuestInteractionsForLocation(
          location.id,
        );
        if (nearby && hero.state === "active")
          actions.push(
            ...questEngineOptions(game, location.id, { includeOffers: false }),
          );
        const chiefConversation = can("talkChief")
          ? game.getLocationChiefConversation({
              playerId: player.id,
              heroId: hero.id,
              locationId: location.id,
            })
          : null;
        if (chiefConversation) {
          chiefConversation.options.unshift(
            ...questInteractions.map((interaction) => ({
              id: `quest-interaction:${interaction.interactionId}`,
              kind: "quest_interaction",
              label: interaction.label,
              responseLines: interaction.responseLines,
            })),
          );
          const marshalHasQuest =
            location.id === "royal-capital" &&
            game.getAvailableQuests().length > 0;
          actions.push({
            id: "talk-chief",
            label: marshalHasQuest
              ? "Se rendre chez le maréchal (quête)"
              : location.id === "royal-capital"
                ? "Parler au maréchal"
                : `Parler · ${chiefConversation.title}`,
            details: chiefConversation,
          });
        }
        if (can("trade") && location.features.trade)
          actions.push({ id: "trade", label: "Commercer" });
        const tax = locationTaxState(location);
        if (nearby && relation === "owned" && tax.eligible) {
          actions.push({
            id: "collect-taxes",
            label: `collecter impôts : ${tax.available} gold`,
            details: {
              unavailableReason:
                location.state !== "active"
                  ? "Lieu inactif"
                  : tax.available < 1
                    ? "Impôts en cours d'accumulation"
                    : null,
            },
          });
        }
        if (
          nearby &&
          game.getLocationChiefConversation({
            playerId: localPlayerId,
            heroId: hero.id,
            locationId: location.id,
            source: "forge",
          })
        )
          actions.push({ id: "forge", label: "Forge" });
        if (
          nearby &&
          relation === "owned" &&
          (location.infrastructure.trading_post ?? 0) > 0
        )
          actions.push({ id: "manage-convoys", label: "Gérer les convois" });
        if (
          nearby &&
          relation === "owned" &&
          (location.infrastructure.prospecting_post ?? 0) > 0
        )
          actions.push({
            id: "manage-prospecting",
            label: "Explorer les environs",
          });
        if (
          nearby &&
          can("train") &&
          (location.infrastructure.magic_academy ?? 0) > 0
        )
          actions.push({
            id: "academy-divination",
            label: "Divination · 50 or · 1 minute",
          });
        if (
          nearby &&
          relation === "owned" &&
          (location.infrastructure.messenger_relay ?? 0) > 0
        )
          actions.push({ id: "relay-message", label: "Envoyer un messager" });
        if (can("visitTavern")) {
          actions.push({
            id: "visit-tavern",
            label: "Visiter la taverne (missions)",
          });
        }
        if (!chiefConversation)
          questInteractions.forEach((interaction) =>
            actions.push({
              id: `quest-interaction:${interaction.interactionId}`,
              label: interaction.label,
            }),
          );
        if (
          game.questSystemEnabled !== false &&
          location.id === "evacuation-camp" &&
          nearby &&
          game.scenarioState?.currentPhaseId === "defend-evacuation-camp"
        ) {
          const vanguard = game.getAutonomousGroup("chaos-column-vanguard");
          if (
            vanguard &&
            !["destroyed"].includes(vanguard.status) &&
            vanguard.army.units.some((unit) => unit.combatantCount > 0)
          )
            actions.push({
              id: "engage-evacuation-vanguard",
              label: "Sortir affronter l’avant-garde (quête)",
            });
        }
        if (
          game.questSystemEnabled !== false &&
          location.id === "evacuation-camp" &&
          nearby &&
          ["defend-evacuation-camp", "prepare-evacuation"].includes(
            game.scenarioState?.currentPhaseId,
          ) &&
          ((location.population ?? 0) > 0 ||
            (location.resources.stock.population ?? 0) > 0 ||
            Object.keys(location.infrastructure).length >
              location.dismantlings.length)
        )
          actions.push({
            id: "organize-evacuation",
            label: "Évacuer les habitants et démanteler le camp (quête)",
          });
        const campDevelopment = game.getCampDevelopment(location.id, hero.id);
        if (campDevelopment && can("build") && nearby) {
          campDevelopment.improvements
            .filter((entry) => entry.available)
            .forEach((entry) =>
              actions.push({
                id: `build-improvement:${entry.id}`,
                label: `${entry.name} ${entry.nextLevel}`,
                details: {
                  ...entry.next,
                  currentLevel: entry.level,
                  nextLevel: entry.nextLevel,
                  slotType: entry.slotType,
                  reservedSlot: entry.reservedSlot,
                  progressionRequirements: entry.progressionRequirements,
                  unavailableReason: entry.unavailableReason,
                  payment: entry.payment,
                  availableResources: entry.payment.availableResources,
                  missingResources: entry.payment.missingResources,
                },
              }),
            );
          if (campDevelopment.levelUp.eligible)
            actions.push({
              id: "level-up-camp",
              label: `Élever au Camp ${location.level + 1}`,
              details: {
                costs: campDevelopment.levelUp.costs,
                payment: campDevelopment.levelUp.payment,
              },
            });
          if (location.type === "camp" && location.level >= 3)
            campDevelopment.evolutions.forEach((branch) =>
              actions.push({
                id: `evolve-camp:${branch.id}`,
                label: branch.eligible
                  ? branch.name
                  : `${branch.name} (conditions manquantes)`,
                details: {
                  costs: branch.costs,
                  payment: branch.payment,
                  blockers: branch.blockers,
                },
              }),
            );
        }
        if (
          game.questSystemEnabled !== false &&
          location.id === "seditious-village" &&
          game.scenario?.getPhase("repression-prison")
        ) {
          const phase = game.scenarioState.currentPhaseId;
          if (
            [
              "locate-village",
              "village-arrival",
              "arrival",
              "knight-conversation",
              "negotiation",
              "royal-assault",
              "village-defense",
              "village-fall",
            ].includes(phase)
          ) {
            actions.splice(0);
            if (nearby && hero.state === "active") {
              if (phase === "arrival")
                actions.push(
                  ...game.getQuestChoices().map((c) => ({
                    id: `repression-choice:${c.id}`,
                    label: c.label,
                  })),
                );
              else if (
                ["knight-conversation", "negotiation", "village-fall"].includes(
                  phase,
                )
              )
                actions.push({
                  id: "repression-dialogue",
                  label: "Poursuivre la conversation",
                });
              else if (["royal-assault", "village-defense"].includes(phase))
                actions.push({
                  id: "repression-battle",
                  label:
                    phase === "royal-assault"
                      ? "Capturer au nom du prévôt"
                      : "Défendre le Manoir avec le chevalier",
                });
            }
          }
        }
        const defense = locationDefenseSnapshot(location);
        const infrastructureImprovements = Object.entries(
          location.infrastructure,
        ).map(([id, level]) => {
          const task = location.dismantlings.find(
            (entry) => entry.structureId === id,
          );
          return {
            id,
            name: CAMP_IMPROVEMENTS[id]?.name ?? improvementName(id),
            level,
            category: CAMP_IMPROVEMENTS[id]?.category ?? "utility",
            description:
              CAMP_IMPROVEMENTS[id]?.levels[level - 1]?.description ??
              `Infrastructure de niveau ${level}.`,
            dismantling: task ? { completesAt: task.deadline.expiresAt } : null,
            canDismantle: nearby && can("dismantle") && !task,
          };
        });
        const scenarioImprovements = location.improvements
          .filter((entry) => !entry.destroyed)
          .map((entry) => ({
            id: entry.id,
            name: improvementName(entry.id),
            level: 1,
            category: entry.type === "defensive" ? "defense" : entry.type,
            description:
              entry.type === "defensive"
                ? `Structure défensive${entry.defenseBonus ? ` : +${formatInteger(entry.defenseBonus)} défense` : ""}.`
                : "Amélioration spéciale du lieu.",
            dismantling: null,
            canDismantle: false,
          }));
        const allImprovements = [
          ...new Map(
            [...scenarioImprovements, ...infrastructureImprovements].map(
              (entry) => [entry.id, entry],
            ),
          ).values(),
        ];
        const structures = allImprovements.filter(isDefensiveImprovement);
        const improvements = allImprovements.filter(
          (entry) => !isDefensiveImprovement(entry),
        );
        const improvementActionById = new Map(
          actions
            .filter((action) => action.id.startsWith("build-improvement:"))
            .map((action) => [
              action.id.slice("build-improvement:".length),
              action,
            ]),
        );
        allImprovements.forEach((entry) => {
          const branchSuccessors =
            {
              housing: ["habitation", "houses"],
              habitation: ["houses"],
              barricades: ["palisades", "walls", "ramparts"],
              palisades: ["walls", "ramparts"],
              walls: ["ramparts"],
            }[entry.id] ?? [];
          const upgrade =
            improvementActionById.get(entry.id) ??
            branchSuccessors
              .map((id) => improvementActionById.get(id))
              .find(Boolean);
          entry.upgradeActionId = upgrade?.id ?? null;
          entry.upgradeLabel = upgrade
            ? `Améliorer au niveau ${upgrade.details?.nextLevel ?? entry.level + 1}`
            : null;
        });
        defense.structures = structures;
        defense.improvementSlots = campDevelopment?.fortificationSlots ?? null;
        return {
          id: location.id,
          name: location.name,
          ...(location.visual ? { visual: { ...location.visual } } : {}),
          type: location.type,
          roles: [...location.roles],
          position,
          radius: ranges.interactionRadius,
          interactionRadius: ranges.interactionRadius,
          detectionRadius: ranges.detectionRadius,
          distance: d,
          nearby,
          relation,
          questMarker: locationQuestMarker(game, location.id),
          state: "DISCOVERED",
          description:
            descriptions[location.id] ?? "Lieu créé pendant le test terrain.",
          defense,
          structures: improvements,
          improvements,
          improvementSlots: campDevelopment
            ? {
                used: campDevelopment.slots.used,
                maximum: campDevelopment.slots.maximum,
                free: Math.max(
                  0,
                  campDevelopment.slots.maximum - campDevelopment.slots.used,
                ),
              }
            : null,
          canDismantle: nearby && can("dismantle"),
          campDevelopment,
          actions,
        };
      });
  }

  function isDefensiveImprovement(improvement) {
    return [
      "barricade",
      "barricades",
      "palisade",
      "palissade",
      "palisades",
      "wall",
      "walls",
      "tower",
      "towers",
      "tour",
      "tours",
      "watchtower",
      "defense_tower",
      "rampart",
      "ramparts",
    ].includes(improvement.id);
  }

  function improvementName(id) {
    return String(id)
      .replaceAll("_", " ")
      .replaceAll("-", " ")
      .replace(/^./, (letter) => letter.toUpperCase());
  }

  return { locations: mappedLocations };
}
