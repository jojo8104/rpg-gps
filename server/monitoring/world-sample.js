import { maximumAuthority } from "../../app/js/core/authority-system.js";
export const WORLD_SAMPLE_INTERVAL_MS = 4000;
export const WORLD_SAMPLE_LIMIT = 2000;
const number = (value) => (Number.isFinite(value) ? Math.max(0, value) : 0);
const rounded = (value) => Math.round(value * 100) / 100;
export function unitPowerCoefficient(definition) {
  const s = definition?.stats ?? {};
  return rounded(
    Math.max(
      1,
      number(s.attack) +
        number(s.defense) +
        number(s.healthPerSoldier) / 10 +
        number(s.range) +
        ((number(s.damageMin) + number(s.damageMax)) / 2) *
          (1000 / Math.max(100, number(s.attackIntervalMs) || 1000)) +
        (definition?.abilities?.length ?? 0),
    ),
  );
}
function troops(units, definitions, mobile) {
  const types = {};
  let power = 0;
  for (const unit of units) {
    const quantity = number(unit.quantity);
    types[unit.typeId] = (types[unit.typeId] ?? 0) + quantity;
    const definition = definitions.get(unit.typeId);
    power +=
      quantity *
      unitPowerCoefficient(definition) *
      (mobile ? 1 + number(definition?.stats?.speed) * 0.05 : 1);
  }
  return { types, power: rounded(power) };
}
export function captureWorldSample(lobby, at, previousAt = at - 4000) {
  const game = lobby.game;
  const definitions = game.unitDefinitions;
  const heroes = [...game.heroes].sort((a, b) => a.id.localeCompare(b.id));
  const firstHero = new Map();
  for (const hero of heroes)
    if (!firstHero.has(hero.playerId)) firstHero.set(hero.playerId, hero.id);
  const garrisons = new Map();
  for (const location of game.locations)
    for (const unit of location.garrison.units) {
      if (!garrisons.has(unit.ownerPlayerId))
        garrisons.set(unit.ownerPlayerId, []);
      garrisons.get(unit.ownerPlayerId).push(unit);
    }
  const rows = heroes.map((hero) => {
    const stats = hero.finalStats;
    const mobile = troops(hero.army.units, definitions, true);
    const stationed = troops(
      firstHero.get(hero.playerId) === hero.id
        ? (garrisons.get(hero.playerId) ?? [])
        : [],
      definitions,
      false,
    );
    const heroPower = rounded(
      number(stats.attack) + number(stats.defense) + number(hero.health),
    );
    const participant = game.setup.participants.find(
      (p) => p.playerId === hero.playerId,
    );
    return {
      id: hero.id,
      name: hero.name,
      playerId: hero.playerId,
      connected: (lobby.players?.get(hero.playerId)?.connections.size ?? 0) > 0,
      teamId: participant?.teamId ?? hero.playerId,
      position: hero.position ? { ...hero.position } : null,
      visionRadius: game.heroClassFeatureService?.visionRadius(hero) ?? 45,
      authority: maximumAuthority(hero, game.heroClasses.get(hero.classId)),
      heroPower,
      mobile,
      garrison: stationed,
      power: rounded(heroPower + mobile.power + stationed.power),
    };
  });
  const teams = new Map();
  for (const hero of rows) {
    if (!teams.has(hero.teamId))
      teams.set(hero.teamId, { id: hero.teamId, power: 0 });
    teams.get(hero.teamId).power = rounded(
      teams.get(hero.teamId).power + hero.power,
    );
  }
  const battles = [];
  for (const battle of game.battles) {
    if (
      battle.status !== "finished" ||
      !battle.finishedAt ||
      battle.finishedAt <= previousAt ||
      battle.finishedAt > at
    )
      continue;
    for (const team of battle.teams)
      for (const hero of team.heroes)
        battles.push({
          id: battle.id,
          heroId: hero.id,
          at: battle.finishedAt,
          result:
            battle.winnerTeamId === team.id
              ? "win"
              : battle.winnerTeamId
                ? "loss"
                : "draw",
        });
  }
  return {
    at,
    revision: lobby.gameRevision,
    simulationPaused: ![...(lobby.players?.values() ?? [])].some(
      (player) => player.connections.size,
    ),
    heroes: rows,
    groups: (game.autonomousGroups ?? []).map((group) => ({
      id: group.id,
      name: group.name ?? group.type,
      position: group.position ? { ...group.position } : null,
      status: group.status,
    })),
    teams: [...teams.values()],
    locations: game.locations.map((location) => ({
      id: location.id,
      name: location.name,
      population: location.population,
      level: location.level,
      production: { ...location.resources.production },
      stock: Object.fromEntries(
        [
          ...new Set([
            ...Object.keys(location.resources.stock ?? {}),
            ...Object.keys(location.resources.productionStock ?? {}),
          ]),
        ].map((id) => [
          id,
          (location.resources.stock?.[id] ?? 0) +
            (location.resources.productionStock?.[id] ?? 0),
        ]),
      ),
    })),
    battles,
  };
}
