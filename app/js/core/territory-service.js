import { distanceMeters } from "./geo.js";

const INFLUENCE = {
  capital: 0.5,
  fort: 0.28,
  town: 0.22,
  village: 0.18,
  camp: 0.12,
  mine: 0.1,
  quarry: 0.1,
  "lumber-camp": 0.1,
};

/** Autorité territoriale, appelée uniquement par le serveur. Cellules et état JSON. */
export class TerritoryService {
  teamFor(game, ownerId) {
    if (!ownerId || ownerId === "neutral") return null;
    const participant = game.setup.participants.find(
      (p) => p.playerId === ownerId,
    );
    if (participant) return participant.teamId ?? `player:${ownerId}`;
    const matching = game.setup.teams.filter(
      (team) => team.factionId === ownerId,
    );
    return matching.length === 1 ? matching[0].id : `faction:${ownerId}`;
  }

  recordPosition(game, playerId, position, now, accuracy = null) {
    if (!game.worldState.get("territory.enabled", false)) return;
    this.initialize(game);
    const state = game.territoryState;
    const hero = game.heroes.find((h) => h.playerId === playerId);
    if (
      !hero ||
      hero.state !== "active" ||
      !game.setup.playArea.allowsPlacement(position) ||
      (game.coordinateMode === "gps" && accuracy == null) ||
      (accuracy != null &&
        accuracy > this.config(game, "maximumAccuracyMeters", 30))
    ) {
      if (state.presence[playerId])
        delete state.attempts[state.presence[playerId].cellId];
      delete state.presence[playerId];
      return;
    }
    const cell = state.grid.cells.find((entry) => contains(entry, position));
    if (!cell) {
      delete state.presence[playerId];
      return;
    }
    const previous = state.presence[playerId];
    if (previous && (previous.cellId !== cell.id || now - previous.at > 15000))
      delete state.attempts[previous.cellId];
    state.presence[playerId] = {
      teamId: this.teamFor(game, playerId),
      cellId: cell.id,
      at: now,
      since:
        previous?.cellId === cell.id && now - previous.at <= 15000
          ? previous.since
          : now,
    };
  }

  config(game, name, fallback) {
    const value = game.worldState.get(`territory.${name}`, fallback);
    if (!Number.isFinite(value) || value <= 0)
      throw new RangeError(`Configuration territoriale invalide : ${name}.`);
    return value;
  }

  initialize(game) {
    const signature = JSON.stringify([
      game.coordinateMode,
      game.setup.playArea.toJSON(),
    ]);
    if (
      game.territoryState?.signature === signature &&
      game.territoryState.grid
    )
      return;
    const area = game.setup.playArea;
    const lats = area.polygon.map((p) => p.latitude),
      lons = area.polygon.map((p) => p.longitude);
    const south = Math.min(...lats),
      west = Math.min(...lons);
    const latSpan = Math.max(...lats) - south,
      lonSpan = Math.max(...lons) - west;
    const simulation = game.coordinateMode === "simulation";
    const scaleY = simulation ? 1 : 111320;
    const scaleX = simulation
      ? 1
      : 111320 *
        Math.max(0.01, Math.cos(((south + latSpan / 2) * Math.PI) / 180));
    const size = Math.max(
      Math.max(latSpan * scaleY, lonSpan * scaleX) / 48,
      simulation ? 0 : this.config(game, "cellSizeMeters", 15),
    );
    if (!(size > 0))
      throw new RangeError("La zone territoriale doit avoir une surface.");
    const stepY = size / scaleY,
      stepX = size / scaleX;
    const cells = [];
    for (let row = 0; row < Math.ceil(latSpan / stepY); row++)
      for (let column = 0; column < Math.ceil(lonSpan / stepX); column++) {
        const center = {
          latitude: south + (row + 0.5) * stepY,
          longitude: west + (column + 0.5) * stepX,
        };
        if (!area.allowsPlacement(center)) continue;
        cells.push({
          id: `${row}:${column}`,
          row,
          column,
          center,
          bounds: [
            { latitude: south + row * stepY, longitude: west + column * stepX },
            {
              latitude: south + (row + 1) * stepY,
              longitude: west + (column + 1) * stepX,
            },
          ],
        });
      }
    game.territoryState = {
      version: 1,
      signature,
      grid: { cells, size },
      captures: {},
      presence: {},
      attempts: {},
      view: { edges: [], occupation: {} },
    };
  }

  update(game, now, connectedPlayerIds = null) {
    if (
      !game.worldState.get("territory.enabled", false) ||
      game.status !== "started"
    )
      return;
    this.initialize(game);
    const state = game.territoryState,
      cells = state.grid.cells;
    const distance =
      game.coordinateMode === "simulation"
        ? (a, b) =>
            Math.hypot(a.latitude - b.latitude, a.longitude - b.longitude)
        : distanceMeters;
    const equivalentRadius = Math.sqrt(
      (cells.length * state.grid.size ** 2) / Math.PI,
    );
    const unplaced = new Set(
      Object.values(game.scenarioRuntime?.placements ?? {})
        .filter((p) => p.status !== "placed")
        .map((p) => p.locationId),
    );
    const locations = game.locations
      .filter(
        (location) =>
          INFLUENCE[location.type] &&
          location.state !== "destroyed" &&
          !unplaced.has(location.id) &&
          areaAllows(game, location.position),
      )
      .map((location) => ({
        ...location,
        teamId: this.teamFor(game, location.controllerId ?? location.ownerId),
        radius: Math.max(
          state.grid.size,
          equivalentRadius * INFLUENCE[location.type],
        ),
      }))
      .filter((location) => location.teamId);
    const owners = new Map(),
      base = new Map();
    for (const cell of cells) {
      const claims = locations
        .map((location) => ({
          location,
          distance: distance(cell.center, location.position),
        }))
        .filter((claim) => claim.distance <= claim.location.radius)
        .sort(
          (a, b) =>
            a.distance - b.distance ||
            a.location.id.localeCompare(b.location.id),
        );
      const first = claims[0];
      const tied =
        first &&
        claims.some(
          (claim) =>
            claim.location.teamId !== first.location.teamId &&
            Math.abs(claim.distance - first.distance) < 0.000001,
        );
      base.set(cell.id, first && !tied ? first.location.teamId : null);
      owners.set(cell.id, state.captures[cell.id]?.teamId ?? base.get(cell.id));
    }
    const occupants = new Map();
    for (const [playerId, presence] of Object.entries(state.presence)) {
      const hero = game.heroes.find((h) => h.playerId === playerId);
      if (
        now - presence.at > 15000 ||
        !hero ||
        hero.state !== "active" ||
        (connectedPlayerIds && !connectedPlayerIds.has(playerId))
      ) {
        delete state.presence[playerId];
        continue;
      }
      const teams = occupants.get(presence.cellId) ?? new Set();
      teams.add(presence.teamId);
      occupants.set(presence.cellId, teams);
    }
    for (const cell of cells) {
      const teams = occupants.get(cell.id);
      if (teams?.size !== 1) {
        delete state.attempts[cell.id];
        continue;
      }
      const teamId = [...teams][0];
      if (owners.get(cell.id) === teamId) {
        delete state.attempts[cell.id];
        continue;
      }
      let attempt = state.attempts[cell.id];
      if (!attempt || attempt.teamId !== teamId)
        attempt = state.attempts[cell.id] = { teamId, since: now };
      if (
        now - attempt.since >=
        this.config(game, "captureSeconds", 60) * 1000
      ) {
        state.captures[cell.id] = {
          teamId,
          capturedAt: now,
          disconnectedAt: null,
        };
        owners.set(cell.id, teamId);
        delete state.attempts[cell.id];
        game.eventLog.push({
          type: "territory_captured",
          cellId: cell.id,
          teamId,
          at: now,
        });
      }
    }
    // Un seul lieu principal par équipe : capitale, puis fort, puis village/camp.
    const rank = { capital: 0, fort: 1, town: 2, village: 3, camp: 4 };
    const roots = new Map();
    for (const location of locations
      .filter((l) => rank[l.type] !== undefined)
      .sort((a, b) => rank[a.type] - rank[b.type] || a.id.localeCompare(b.id)))
      if (!roots.has(location.teamId))
        roots.set(
          location.teamId,
          cells.find((cell) => contains(cell, location.position))?.id,
        );
    const connected = new Set();
    for (const [teamId, root] of roots) {
      const queue = root && owners.get(root) === teamId ? [root] : [];
      for (let index = 0; index < queue.length; index++) {
        const id = queue[index];
        if (connected.has(id)) continue;
        connected.add(id);
        for (const neighbor of neighbors(id))
          if (!connected.has(neighbor) && owners.get(neighbor) === teamId)
            queue.push(neighbor);
      }
    }
    for (const [id, capture] of Object.entries(state.captures)) {
      if (connected.has(id)) capture.disconnectedAt = null;
      else {
        capture.disconnectedAt ??= now;
        if (
          now - capture.disconnectedAt >=
          this.config(game, "isolationSeconds", 120) * 1000
        ) {
          delete state.captures[id];
          owners.set(id, base.get(id));
          game.eventLog.push({
            type: "territory_lost",
            cellId: id,
            teamId: capture.teamId,
            at: now,
          });
        }
      }
    }
    const occupation = {},
      edges = [];
    for (const cell of cells) {
      const teamId = owners.get(cell.id);
      if (!teamId) continue;
      occupation[teamId] = (occupation[teamId] ?? 0) + 1 / cells.length;
      const [sw, ne] = cell.bounds;
      const nw = { latitude: ne.latitude, longitude: sw.longitude },
        se = { latitude: sw.latitude, longitude: ne.longitude };
      const points = [
        [sw, nw],
        [se, ne],
        [sw, se],
        [nw, ne],
      ];
      neighbors(cell.id).forEach((id, index) => {
        const otherTeamId = owners.get(id) ?? null;
        if (otherTeamId === teamId || (otherTeamId && teamId > otherTeamId))
          return;
        edges.push({ teamId, otherTeamId, points: points[index] });
      });
    }
    const progress = {};
    for (const [playerId, presence] of Object.entries(state.presence)) {
      const attempt = state.attempts[presence.cellId];
      progress[playerId] = {
        contested: occupants.get(presence.cellId)?.size > 1,
        capturing: Boolean(attempt && attempt.teamId === presence.teamId),
        seconds: attempt
          ? Math.max(0, Math.floor((now - attempt.since) / 1000))
          : 0,
        requiredSeconds: this.config(game, "captureSeconds", 60),
      };
    }
    state.view = {
      edges,
      occupation,
      progress,
      cellSize: state.grid.size,
      cells: cells.map((cell) => ({
        id: cell.id,
        teamId: owners.get(cell.id) ?? null,
      })),
      updatedAt: now,
    };
    const threshold = game.worldState.get(
      "territory.victoryOccupationRatio",
      null,
    );
    if (
      threshold !== null &&
      (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1)
    )
      throw new RangeError(
        "Le taux de victoire territoriale doit être entre zéro et un.",
      );
    if (threshold !== null) {
      const winner = Object.keys(occupation).find(
        (teamId) =>
          occupation[teamId] >= threshold &&
          game.setup.participants.some(
            (p) => (p.teamId ?? `player:${p.playerId}`) === teamId,
          ),
      );
      if (winner) {
        game.worldState.set("territory.winnerTeamId", winner);
        game.finish("territory_occupation");
      }
    }
  }
}

function areaAllows(game, position) {
  return game.setup.playArea.allowsPlacement(position);
}
function contains(cell, p) {
  return (
    p.latitude >= cell.bounds[0].latitude &&
    p.latitude < cell.bounds[1].latitude &&
    p.longitude >= cell.bounds[0].longitude &&
    p.longitude < cell.bounds[1].longitude
  );
}
function neighbors(id) {
  const [r, c] = id.split(":").map(Number);
  return [`${r}:${c - 1}`, `${r}:${c + 1}`, `${r - 1}:${c}`, `${r + 1}:${c}`];
}
