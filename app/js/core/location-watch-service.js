import { AutonomousGroup } from "./autonomous-group.js";
import { distanceMeters } from "./geo.js";

const inactive = (group) =>
  [
    "destroyed",
    "mission_failed",
    "completed",
    "resolved",
    "confiscated",
    "garrisoned",
  ].includes(group.status);
export const watchDistance = (mode, a, b) =>
  !a || !b
    ? Infinity
    : mode === "simulation"
      ? Math.hypot(a.latitude - b.latitude, a.longitude - b.longitude)
      : distanceMeters(a, b);

export function locationWatchZones(state, playerId) {
  const radius = state.coordinateMode === "simulation" ? 35 : 250;
  const sites = state.locations.filter(
    (location) =>
      location.ownerId === playerId &&
      location.state === "active" &&
      (location.infrastructure.watch_post ?? 0) > 0,
  );
  return [
    ...sites.map((location) => ({
      id: location.id,
      originLocationId: location.id,
      center: location.position,
      radius,
    })),
    ...state.autonomousGroups
      .filter(
        (group) =>
          group.mission?.managedBy === "watch_post" &&
          group.owner.id === playerId &&
          !inactive(group) &&
          sites.some(
            (site) =>
              site.id === group.originLocationId &&
              site.infrastructure.watch_post >= 2,
          ),
      )
      .map((group) => ({
        id: group.id,
        originLocationId: group.originLocationId,
        center: group.position,
        radius,
      })),
  ];
}

export function watchedPosition(state, playerId, position) {
  return locationWatchZones(state, playerId).some(
    (zone) =>
      watchDistance(state.coordinateMode, zone.center, position) <= zone.radius,
  );
}

/** Surveillance et messagers : état persistant dans les missions et les renseignements. */
export class LocationWatchService {
  update(game, now) {
    for (const group of game.autonomousGroups) {
      if (group.mission?.managedBy === "watch_post") {
        const origin = game.getLocation(group.originLocationId);
        if (
          !origin ||
          origin.state !== "active" ||
          origin.ownerId !== group.owner.id ||
          !(origin.infrastructure.watch_post >= 2)
        ) {
          group.status = "completed";
          group.movement = null;
        }
      }
    }
    for (const location of game.locations) {
      const player = game.getPlayer(location.ownerId);
      if (!player || location.state !== "active") continue;
      const scouts = game.autonomousGroups.filter(
        (group) =>
          group.mission?.managedBy === "watch_post" &&
          group.originLocationId === location.id &&
          !inactive(group),
      );
      if ((location.infrastructure.watch_post ?? 0) < 2) {
        scouts.forEach((group) => {
          group.status = "completed";
          group.movement = null;
        });
      } else if (!scouts.length) {
        const radius = game.coordinateMode === "simulation" ? 60 : 450;
        const waypoints = Array.from({ length: 8 }, (_, i) => {
          let reach = radius;
          for (let attempt = 0; attempt < 8; attempt += 1) {
            const point = offset(
              location.position,
              reach,
              (i * Math.PI) / 4,
              game.coordinateMode,
            );
            // Check coordinate bounds before PlayArea.contains, which throws for
            // invalid points. Simulation patrols can exceed them near an edge.
            if (
              Number.isFinite(point.latitude) &&
              Number.isFinite(point.longitude) &&
              point.latitude >= -90 && point.latitude <= 90 &&
              point.longitude >= -180 && point.longitude <= 180 &&
              (!game.setup.playArea || game.setup.playArea.contains(point))
            )
              return point;
            reach /= 2;
          }
          return location.position;
        }).filter(
          (position) =>
            !game.setup.playArea || game.setup.playArea.contains(position),
        );
        if (waypoints.length)
          game.addAutonomousGroup(
            new AutonomousGroup({
              id: game.idGenerator("watch-scout"),
              type: "scout",
              owner: { kind: "player", id: player.id },
              factionId: player.id,
              originLocationId: location.id,
              position: location.position,
              mission: {
                kind: "patrol",
                managedBy: "watch_post",
                waypoints,
                waypointIndex: 0,
                coordinateMode: game.coordinateMode,
                speedMetersPerSecond: 2,
              },
            }),
          );
      }
      const zones = locationWatchZones(game, player.id).filter(
        (zone) => zone.originLocationId === location.id,
      );
      for (const candidate of game.locations) {
        if (candidate.state === "destroyed") continue;
        if (
          zones.some(
            (zone) =>
              watchDistance(
                game.coordinateMode,
                zone.center,
                candidate.position,
              ) <= zone.radius,
          )
        )
          player.discoverLocation(candidate.id, 1);
      }
      if (!(location.infrastructure.messenger_relay > 0)) continue;
      const candidates = [
        ...game.heroes
          .filter(
            (hero) =>
              hero.state === "active" &&
              hero.playerId !== player.id &&
              !allied(game, player.id, hero.playerId),
          )
          .map((hero) => ({
            id: `hero:${hero.id}`,
            name: hero.name,
            position: hero.position,
          })),
        ...game.autonomousGroups
          .filter(
            (group) =>
              !inactive(group) &&
              !(
                group.owner.kind === "player" &&
                allied(game, player.id, group.owner.id)
              ) &&
              (group.owner.kind === "player" ||
                ["hostile", "aggressive"].includes(group.behavior)),
          )
          .map((group) => ({
            id: `group:${group.id}`,
            name: "Groupe ennemi",
            position: group.position,
          })),
      ];
      for (const target of candidates) {
        if (
          !zones.some(
            (zone) =>
              watchDistance(
                game.coordinateMode,
                zone.center,
                target.position,
              ) <= zone.radius,
          )
        )
          continue;
        const key = `watchNotice_${target.id}`;
        if (
          location.statistics[key] != null &&
          now - location.statistics[key] < 60_000
        )
          continue;
        const previous = [...game.autonomousGroups]
          .reverse()
          .find(
            (group) =>
              group.message?.targetId === target.id &&
              group.originLocationId === location.id,
          );
        if (
          previous &&
          watchDistance(
            game.coordinateMode,
            previous.message.position,
            target.position,
          ) < (game.coordinateMode === "simulation" ? 3 : 20)
        )
          continue;
        const result = this.send(game, {
          location,
          recipientPlayerId: player.id,
          text: `${target.name} détecté près de ${location.name}.`,
          kind: "watch_alert",
          targetId: target.id,
          position: target.position,
        });
        if (result.success) location.statistics[key] = now;
      }
    }
  }

  send(
    game,
    {
      location,
      recipientPlayerId,
      text,
      kind = "player_message",
      targetId = null,
      position = null,
    },
  ) {
    if (
      !location ||
      location.state !== "active" ||
      !(location.infrastructure.messenger_relay > 0)
    )
      return { success: false, reason: "relay_unavailable" };
    const target = game.heroes.find(
      (hero) =>
        hero.playerId === recipientPlayerId &&
        hero.position &&
        hero.state === "active",
    );
    if (!target) return { success: false, reason: "recipient_unavailable" };
    if (typeof text !== "string" || !text.trim() || text.length > 500)
      return { success: false, reason: "invalid_message" };
    const group = new AutonomousGroup({
      id: game.idGenerator("relay-messenger"),
      type: "messenger",
      owner: { kind: "player", id: location.ownerId },
      originLocationId: location.id,
      position: location.position,
      mission: {
        kind: "deliver_message",
        managedBy: "messenger_relay",
        targetId: target.id,
        recipientPlayerId,
        coordinateMode: game.coordinateMode,
        speedMetersPerSecond: 5,
      },
      message: {
        text: text.trim(),
        kind,
        senderPlayerId: location.ownerId,
        recipientPlayerId,
        targetId,
        position: position ? { ...position } : null,
        createdAt: game.now(),
      },
    });
    game.addAutonomousGroup(group);
    return { success: true, groupId: group.id };
  }

  attack(game, locationId, attackId) {
    const location = game.getLocation(locationId);
    if (!location || !(location.infrastructure.messenger_relay > 0)) return;
    const key = `attackNotice_${attackId}`;
    if (location.statistics[key] != null) return;
    const result = this.send(game, {
      location,
      recipientPlayerId: location.ownerId,
      text: `${location.name} est attaqué !`,
      kind: "attack_alert",
    });
    if (result.success) location.statistics[key] = game.now();
  }

  deliver(game, groupId, now) {
    const group = game.getAutonomousGroup(groupId);
    if (
      !group ||
      group.mission?.managedBy !== "messenger_relay" ||
      group.status !== "completed"
    )
      return;
    game.getPlayer(group.mission.recipientPlayerId)?.receiveInformation({
      id: `message:${group.id}`,
      ...group.message,
      sourceGroupId: group.id,
      locationId: group.originLocationId,
      receivedAt: now,
    });
  }
}

function allied(game, first, second) {
  if (first === second) return true;
  const participants = game.setup.participants;
  const team = participants.find((entry) => entry.playerId === first)?.teamId;
  return Boolean(
    team &&
      participants.some(
        (entry) => entry.playerId === second && entry.teamId === team,
      ),
  );
}
function offset(center, radius, angle, mode) {
  const dy = Math.cos(angle) * radius,
    dx = Math.sin(angle) * radius;
  return {
    latitude: center.latitude + (mode === "simulation" ? dy : dy / 111_320),
    longitude:
      center.longitude +
      (mode === "simulation"
        ? dx
        : dx /
          (111_320 *
            Math.max(0.01, Math.cos((center.latitude * Math.PI) / 180)))),
  };
}
