import { astralTargetInReach } from "./astral-interaction.js";
import { UNIT_RANKS } from "./rank-system.js";
import { Hero } from "./hero.js";
import { distanceMeters } from "./geo.js";
import { usedAuthority, maximumAuthority } from "./authority-system.js";
import { getItemDefinition } from "./item-catalog.js";

export function alliedPlayers(game, a, b) {
  if (a === b) return true;
  const team = game.setup.participants.find((p) => p.playerId === a)?.teamId;
  return Boolean(
    team &&
      game.setup.participants.some(
        (p) => p.playerId === b && p.teamId === team,
      ),
  );
}

export function tradeInventory(hero, unitDefinitions = new Map()) {
  if (!hero) return [];
  return [
    ...Object.entries(hero.resources)
      .filter(([, n]) => n > 0)
      .map(([id, quantity]) => ({
        kind: "resource",
        id,
        quantity,
        label: getItemDefinition(id)?.name ?? id,
      })),
    ...hero.carriedLoot.map((item) => ({
      kind: "cargo",
      id: item.id,
      quantity: 1,
      label: `${getItemDefinition(item.itemId)?.name ?? item.itemId} × ${item.quantity}`,
    })),
    ...Object.entries(hero.equipment)
      .filter(([, id]) => id)
      .map(([id, itemId]) => ({
        kind: "equipment",
        id,
        quantity: 1,
        label: getItemDefinition(itemId)?.name ?? itemId,
      })),
    ...hero.army.units
      .filter((unit) => unit.state === "active")
      .map((unit) => ({
        kind: "unit",
        id: unit.id,
        quantity: 1,
        label: `${unit.name ?? unitDefinitions.get(unit.typeId)?.name ?? unit.typeId} · ${unit.quantity} soldats · ${UNIT_RANKS.find((rank) => rank.id === unit.rank)?.label ?? unit.rank}`,
      })),
  ];
}

function fingerprint(heroes) {
  return JSON.stringify(
    heroes.map((hero) => [
      hero.resources,
      hero.carriedLoot,
      hero.equipment,
      hero.army.toJSON(),
    ]),
  );
}

/** Sessions sérialisables ; les transferts ne sont appliqués qu'après validation des deux copies. */
export class PlayerSocialService {
  refresh(game, connectedPlayerIds = null) {
    for (const session of game.playerSessions) {
      if (!["pending", "active"].includes(session.status)) continue;
      const heroes = session.playerIds.map((id) =>
        game.heroes.find((h) => h.playerId === id),
      );
      if (
        game.now() >= session.expiresAt ||
        (connectedPlayerIds &&
          session.playerIds.some((id) => !connectedPlayerIds.has(id))) ||
        !this.available(game, heroes, session.astralReachRadius)
      ) {
        session.status = "cancelled";
        session.message =
          "Interaction terminée : distance, disponibilité ou connexion.";
        session.revision++;
      } else if (
        session.status === "active" &&
        session.inventoryFingerprint !== fingerprint(heroes)
      ) {
        session.inventoryFingerprint = fingerprint(heroes);
        session.confirmed = [];
        session.revision++;
        session.message = "Les possessions ont changé. Vérifiez les offres.";
      }
    }
  }

  available(game, heroes, radius = null) {
    radius ??= game.setup.rules.engagementRadiusMeters;
    const [a, b] = heroes;
    if (
      game.status !== "started" ||
      !a ||
      !b ||
      a.id === b.id ||
      !alliedPlayers(game, a.playerId, b.playerId)
    )
      return false;
    if (
      heroes.some(
        (h) =>
          h.state !== "active" ||
          !h.position ||
          game.battles.some(
            (battle) =>
              battle.status !== "finished" &&
              battle.teams.some((t) =>
                t.heroes.some((entry) => entry.sourceId === h.id),
              ),
          ),
      )
    )
      return false;
    const distance =
      game.coordinateMode === "gps"
        ? distanceMeters(a.position, b.position)
        : Math.hypot(
            a.position.latitude - b.position.latitude,
            a.position.longitude - b.position.longitude,
          );
    return (
      distance <= radius ||
      astralTargetInReach(game, a, "hero", b) ||
      astralTargetInReach(game, b, "hero", a)
    );
  }

  execute(
    game,
    { playerId, action, targetPlayerId, kind, sessionId, revision, offer },
  ) {
    this.refresh(game);
    if (action === "request") {
      if (!["talk", "trade"].includes(kind))
        throw new Error("Type de demande invalide.");
      const heroes = [playerId, targetPlayerId].map((id) =>
        game.heroes.find((h) => h.playerId === id),
      );
      if (!this.available(game, heroes))
        throw new Error(
          "Rapprochez-vous d’un allié disponible pour interagir.",
        );
      if (
        game.playerSessions.some(
          (s) =>
            ["pending", "active"].includes(s.status) &&
            s.playerIds.some((id) => [playerId, targetPlayerId].includes(id)),
        )
      )
        throw new Error("Un des joueurs a déjà une interaction en cours.");
      const session = {
        id: game.idGenerator("player-session"),
        playerIds: [playerId, targetPlayerId],
        kind,
        astralReachRadius: astralTargetInReach(
          game,
          heroes[0],
          "hero",
          heroes[1],
        )
          ? game.heroClassFeatureService.activeAstralTravel(heroes[0])
              .reachBonus
          : null,
        status: "pending",
        revision: 0,
        expiresAt: game.now() + 120000,
        offers: { [playerId]: [], [targetPlayerId]: [] },
        confirmed: [],
        inventoryFingerprint: fingerprint(heroes),
        sharedQuests: [],
      };
      game.playerSessions = [...game.playerSessions.slice(-49), session];
      return { success: true, sessionId: session.id };
    }
    const session = game.playerSessions.find(
      (s) => s.id === sessionId && s.playerIds.includes(playerId),
    );
    if (!session || !["pending", "active"].includes(session.status))
      throw new Error("Cette interaction est terminée.");
    if (action === "cancel" || action === "decline") {
      session.status = "cancelled";
      session.message = "Interaction refusée ou annulée.";
      session.revision++;
      return { success: true };
    }
    if (revision !== session.revision)
      throw new Error(
        "L’offre a changé. Vérifiez son contenu avant de confirmer.",
      );
    if (action === "accept") {
      if (session.status !== "pending" || session.playerIds[1] !== playerId)
        throw new Error("Seul le destinataire peut accepter.");
      session.status = "active";
      session.expiresAt = game.now() + 600000;
      session.revision++;
      return { success: true };
    }
    if (session.status !== "active")
      throw new Error("Attendez l’acceptation de l’autre joueur.");
    const heroes = session.playerIds.map((id) =>
      game.heroes.find((h) => h.playerId === id),
    );
    if (action === "share-map" && session.kind === "talk") {
      const players = session.playerIds.map((id) => game.getPlayer(id));
      const knowledge = players.map((p) =>
        structuredClone(p.locationKnowledge),
      );
      const records = players.map((p) => structuredClone(p.informationRecords));
      players.forEach((p, index) => {
        Object.entries(knowledge[1 - index]).forEach(([id, level]) =>
          p.discoverLocation(id, level),
        );
        records[1 - index].forEach((record) => p.receiveInformation(record));
      });
      session.message = "Informations de carte échangées.";
    } else if (action === "share-quest" && session.kind === "talk") {
      const phase = game.scenario?.getPhase(game.scenarioState?.currentPhaseId);
      if (!phase) throw new Error("Aucune quête en cours à partager.");
      const record = {
        id: `shared-quest-${game.scenario.id}-${phase.id}`,
        type: "shared_quest",
        fromPlayerId: playerId,
        title: phase.name ?? phase.title ?? game.scenario.name,
        description: phase.description ?? "",
        objectives: (phase.objectives ?? []).map((o) => ({
          id: o.id,
          description: o.description ?? o.label ?? o.id,
        })),
        sharedAt: game.now(),
      };
      game
        .getPlayer(session.playerIds.find((id) => id !== playerId))
        .receiveInformation(record);
      session.sharedQuests = [record];
      session.message =
        "Quête partagée. La progression reste commune à la partie.";
    } else if (action === "offer" && session.kind === "trade") {
      if (!Array.isArray(offer) || offer.length > 100)
        throw new Error("Offre invalide.");
      const inventory = tradeInventory(
        heroes[session.playerIds.indexOf(playerId)],
        game.unitDefinitions,
      );
      const seen = new Set();
      session.offers[playerId] = offer.map((entry) => {
        const item = inventory.find(
          (i) => i.kind === entry.kind && i.id === entry.id,
        );
        const key = `${entry.kind}:${entry.id}`;
        if (
          !item ||
          seen.has(key) ||
          !Number.isSafeInteger(entry.quantity) ||
          entry.quantity < 1 ||
          entry.quantity > item.quantity
        )
          throw new Error("Possession ou quantité invalide.");
        seen.add(key);
        return {
          kind: item.kind,
          id: item.id,
          quantity: entry.quantity,
          label: item.label,
        };
      });
      session.confirmed = [];
      session.message = "Offre mise à jour. Les deux joueurs doivent valider.";
    } else if (action === "confirm" && session.kind === "trade") {
      if (!Object.values(session.offers).some((items) => items.length))
        throw new Error("Ajoutez au moins un élément à échanger.");
      if (!session.confirmed.includes(playerId))
        session.confirmed.push(playerId);
      if (session.confirmed.length === 2) {
        try {
          this.transfer(game, session, heroes);
        } catch (error) {
          session.confirmed = [];
          session.revision++;
          throw error;
        }
        session.status = "completed";
        session.message = "Échange effectué.";
      }
    } else throw new Error("Action indisponible.");
    session.revision++;
    return { success: true };
  }

  transfer(game, session, heroes) {
    const copies = heroes.map((h) => new Hero(h.toJSON()));
    const incoming = [[], []];
    copies.forEach((source, index) => {
      for (const entry of session.offers[source.playerId]) {
        const item = tradeInventory(source).find(
          (i) => i.kind === entry.kind && i.id === entry.id,
        );
        if (!item || entry.quantity > item.quantity)
          throw new Error("Une possession proposée n’est plus disponible.");
        let value;
        if (entry.kind === "resource") {
          source.resources[entry.id] -= entry.quantity;
          value = entry.quantity;
        }
        if (entry.kind === "cargo") {
          value = source.carriedLoot.splice(
            source.carriedLoot.findIndex((i) => i.id === entry.id),
            1,
          )[0];
        }
        if (entry.kind === "equipment") {
          value = {
            id: game.idGenerator("trade-item"),
            itemId: source.equipment[entry.id],
            quantity: 1,
            valuePerUnit: 1,
          };
          delete source.equipment[entry.id];
        }
        if (entry.kind === "unit") value = source.army.removeUnit(entry.id);
        incoming[1 - index].push({ ...entry, value });
      }
    });
    copies.forEach((target, index) => {
      for (const entry of incoming[index]) {
        if (entry.kind === "resource")
          target.resources[entry.id] =
            (target.resources[entry.id] ?? 0) + entry.value;
        else if (entry.kind === "unit") {
          entry.value.ownerPlayerId = target.playerId;
          if (!target.army.addUnit(entry.value))
            throw new Error("Unité dupliquée.");
        } else {
          if (target.carriedLoot.some((i) => i.id === entry.value.id))
            throw new Error("Bagage dupliqué.");
          target.carriedLoot.push(entry.value);
        }
      }
      game.equipmentService.recalculateModifiers(target);
      const bag = game.inventoryService.getHeroBagState(target);
      if (bag.usedSlots > bag.slotCapacity)
        throw new Error(`Bagages de ${target.name} pleins.`);
      if (
        target.army.units.length > target.maxUnitStacks ||
        usedAuthority(target, game.unitDefinitions) >
          maximumAuthority(target, game.heroClasses.get(target.classId))
      )
        throw new Error(
          `Capacité de commandement de ${target.name} insuffisante.`,
        );
    });
    heroes.forEach((hero, index) => {
      const copy = copies[index];
      for (const key of [
        "resources",
        "carriedLoot",
        "equipment",
        "equipmentModifiers",
        "maxHealth",
        "health",
        "army",
      ])
        hero[key] = copy[key];
    });
  }
}
