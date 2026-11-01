import { applyTroopDamage } from "./battle-duel/health.js";
import { attackValue } from "./battle-duel/resolver.js";
import { generateBattlefield } from "./battlefield-generator.js";
import {
  initializeTacticalBonuses,
  spawnTacticalBonus,
  collectTacticalBonus,
  tacticalBuff,
} from "./tactical-bonuses.js";
import {
  isCavalry,
  isArcher,
  ridingDistance,
  passable,
  flat,
  attackRange,
  combatModifiers,
  harassmentPath,
  terrainSpeed,
  movesDiagonally,
} from "./tactical-terrain-rules.js";

export const TACTICAL_COLUMNS = 3;
export const TACTICAL_ROWS = 5;
const same = (a, b) => a && b && a.x === b.x && a.y === b.y;
const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const cell = (p) =>
  p &&
  Number.isInteger(p.x) &&
  Number.isInteger(p.y) &&
  p.x >= 0 &&
  p.x < 3 &&
  p.y >= 0 &&
  p.y < 5;
const cavalry = isCavalry;
const heroId = (ownerId) => `HERO:${ownerId}`;
export function tacticalActors(state) {
  return [
    ...state.troops,
    ...state.players.map((player) => ({
      ...player.hero,
      id: heroId(player.id),
      ownerId: player.id,
      isHero: true,
      type: player.hero.name,
      count: 1,
      morale: 10,
      range: 1,
    })),
  ];
}
const alive = (actor) =>
  actor.isHero
    ? actor.health > 0
    : actor.count > 0 &&
      !["ROUTED", "DESTROYED", "INCAPACITATED"].includes(actor.tacticalState);
const home = (state, ownerId) => (state.players[0].id === ownerId ? 4 : 0);
const deployed = (state, ownerId) =>
  tacticalActors(state).filter(
    (actor) =>
      actor.ownerId === ownerId &&
      alive(actor) &&
      state.tactics.positions[actor.id],
  );
const actorAt = (state, p) =>
  tacticalActors(state).find(
    (actor) => alive(actor) && same(state.tactics.positions[actor.id], p),
  );
const budget = (player) =>
  Math.max(2, Math.min(5, Math.floor(player.commandPointsMax || 2)));

export function initializeTactics(state, battle) {
  state.tactics = {
    columns: 3,
    rows: 5,
    maxDeployed: 5,
    positions: {},
    options: {},
    turnLimit: 25,
    battlefield: generateBattlefield(battle.config.randomSeed),
  };
  state.encounter.twist = {
    id: "NONE",
    label: "Positions et ordres simultanés",
  };
  state.encounter.reward = { id: "NONE", label: "Contrôlez le camp adverse" };
  for (const player of state.players) {
    player.cohesion = 20;
    player.orderBudget = budget(player);
    const team = battle.teams.find((entry) => entry.id === player.id);
    const troops = state.troops.filter((entry) => entry.ownerId === player.id);
    const automatic = team.heroes.every(
      (entry) => !battle.config.humanPlayerIds?.includes(entry.playerId),
    );
    const used = new Set();
    for (const [index, troop] of troops.entries()) {
      const source = team.units.find((entry) => entry.id === troop.id);
      const slot = source.battleSlot ?? (automatic && index < 3 ? index : null);
      if (Number.isInteger(slot) && slot >= 0 && slot < 3 && !used.has(slot)) {
        used.add(slot);
        state.tactics.positions[troop.id] = {
          x: slot,
          y: home(state, player.id),
        };
      }
    }
  }
  initializeTacticalBonuses(state, battle);
  refreshTacticalOptions(state);
  return state;
}

/** Options calculées par le serveur ; la vue n'infère aucune portée. */
export function refreshTacticalOptions(state) {
  state.tactics.options = {};
  for (const actor of tacticalActors(state).filter(alive)) {
    const position = state.tactics.positions[actor.id];
    const options = {
      move: [],
      charge: [],
      attack: [],
      harass: [],
      deploy: [],
      base: false,
      specials: [],
    };
    const cells = Array.from({ length: 15 }, (_, i) => ({
      x: i % 3,
      y: Math.floor(i / 3),
    }));
    if (!position) {
      if (deployed(state, actor.ownerId).length < 5)
        options.deploy = cells.filter(
          (p) =>
            p.y === home(state, actor.ownerId) &&
            !actorAt(state, p) &&
            passable(state, p, actor),
        );
    } else {
      options.specials = [
        "DEFEND",
        ...(actor.typeId === "spearman" ? ["SPEAR_WALL"] : []),
        ...(actor.isHero ? [] : ["RALLY"]),
        ...(cavalry(actor) ? ["CHARGE"] : []),
      ];
      options.move = cells.filter(
        (p) =>
          (movesDiagonally(actor)
            ? ridingDistance(position, p)
            : distance(position, p)) === 1 && passable(state, p, actor),
      );
      if (cavalry(actor))
        options.charge = cells.filter(
          (p) =>
            ridingDistance(position, p) <= 2 &&
            ridingDistance(position, p) > 0 &&
            (p.x === position.x ||
              p.y === position.y ||
              Math.abs(p.x - position.x) === Math.abs(p.y - position.y)) &&
            flat(state, position) &&
            flat(state, p) &&
            (ridingDistance(position, p) < 2 ||
              flat(state, {
                x: (p.x + position.x) / 2,
                y: (p.y + position.y) / 2,
              })),
        );
      options.attack = tacticalActors(state)
        .filter(
          (target) =>
            target.ownerId !== actor.ownerId &&
            alive(target) &&
            state.tactics.positions[target.id] &&
            (cavalry(actor) && !isArcher(actor)
              ? ridingDistance(position, state.tactics.positions[target.id])
              : distance(position, state.tactics.positions[target.id])) <=
              attackRange(state, actor, position),
        )
        .map((target) => target.id);
      options.harass = tacticalActors(state)
        .filter(
          (target) =>
            target.ownerId !== actor.ownerId &&
            alive(target) &&
            harassmentPath(state, actor, target, (p) => actorAt(state, p)),
        )
        .map((target) => target.id);
      if (options.harass.length) options.specials.push("HARASS");
      options.base =
        !state.tactics.positions[
          heroId(state.players.find((p) => p.id !== actor.ownerId).id)
        ] &&
        Math.abs(
          position.y -
            home(state, state.players.find((p) => p.id !== actor.ownerId).id),
        ) +
          1 <=
          attackRange(state, actor, position);
    }
    state.tactics.options[actor.id] = options;
  }
}

export function submitTacticalChoice(input, ownerId, choice) {
  if (input.phase !== "CHOICE") throw new Error("Tour indisponible.");
  const player = input.players.find((entry) => entry.id === ownerId);
  if (!player || player.locked)
    throw new Error("Ordres déjà verrouillés ou camp invalide.");
  const orders = choice.flee ? [] : (choice.orders ?? []);
  if (
    !Array.isArray(orders) ||
    orders.length > player.orderBudget ||
    new Set(orders.map((order) => order?.actorId)).size !== orders.length
  )
    throw new Error("Un ordre par unité, dans la limite du Commandement.");
  const actors = tacticalActors(input);
  const deploymentCells = new Set();
  let deployments = 0;
  for (const [orderIndex, order] of orders.entries()) {
    const actor = actors.find(
      (entry) => entry.id === order?.actorId && entry.ownerId === ownerId,
    );
    if (!actor || !alive(actor))
      throw new Error("Unité indisponible ou adverse.");
    const options = input.tactics.options[actor.id];
    if (!options) throw new Error("Options indisponibles.");
    if (["MOVE", "CHARGE", "DEPLOY"].includes(order.type)) {
      const targets =
        options[
          { MOVE: "move", CHARGE: "charge", DEPLOY: "deploy" }[order.type]
        ];
      if (!cell(order.to) || !targets.some((p) => same(p, order.to)))
        throw new Error("Destination hors de portée.");
      const occupant = actorAt(input, order.to);
      if (
        occupant?.ownerId === ownerId &&
        occupant.id !== actor.id &&
        !orders
          .slice(0, orderIndex)
          .some(
            (entry) =>
              entry.actorId === occupant.id &&
              ["MOVE", "CHARGE"].includes(entry.type),
          )
      )
        throw new Error(
          "La troupe alliée doit recevoir un déplacement exécuté plus tôt.",
        );
      if (order.type === "DEPLOY") {
        const key = `${order.to.x}:${order.to.y}`;
        if (deploymentCells.has(key))
          throw new Error("Deux déploiements sur la même case.");
        deploymentCells.add(key);
        deployments++;
      }
    } else if (["ATTACK", "HARASS"].includes(order.type)) {
      if (
        !(order.type === "HARASS" ? options.harass : options.attack).includes(
          order.targetId,
        )
      )
        throw new Error("Cible hors de portée.");
    } else if (order.type === "ATTACK_BASE") {
      if (!options.base) throw new Error("Commandant hors de portée.");
    } else if (
      !options.specials.includes(order.type) ||
      ["CHARGE", "HARASS"].includes(order.type)
    )
      throw new Error("Ordre spécial indisponible.");
  }
  if (deployed(input, ownerId).length + deployments > 5)
    throw new Error("Cinq unités au maximum sur le plateau.");
  const state = structuredClone(input);
  state.pendingChoices[ownerId] = {
    orders: structuredClone(orders),
    flee: choice.flee === true,
  };
  return state;
}

export function aiTacticalChoice(state, ownerId) {
  const orders = [];
  const actorList = tacticalActors(state).filter(
    (actor) => actor.ownerId === ownerId && alive(actor),
  );
  const occupiedDeployments = new Set();
  let deployments = deployed(state, ownerId).length;
  for (const actor of actorList.sort(
    (a, b) =>
      Number(Boolean(state.tactics.positions[b.id])) -
      Number(Boolean(state.tactics.positions[a.id])),
  )) {
    if (
      orders.length >=
      state.players.find((player) => player.id === ownerId).orderBudget
    )
      break;
    const options = state.tactics.options[actor.id];
    if (options.base) orders.push({ actorId: actor.id, type: "ATTACK_BASE" });
    else if (options.attack.length)
      orders.push({
        actorId: actor.id,
        type: "ATTACK",
        targetId: options.attack[0],
      });
    else if (state.tactics.positions[actor.id]) {
      const candidates = options.move
        .filter((p) => !actorAt(state, p))
        .sort(
          (a, b) =>
            Math.abs(
              a.y -
                home(
                  state,
                  state.players.find((player) => player.id !== ownerId).id,
                ),
            ) -
            Math.abs(
              b.y -
                home(
                  state,
                  state.players.find((player) => player.id !== ownerId).id,
                ),
            ),
        );
      if (candidates.length)
        orders.push({ actorId: actor.id, type: "MOVE", to: candidates[0] });
      else orders.push({ actorId: actor.id, type: "DEFEND" });
    } else if (deployments < 5) {
      const target = options.deploy.find((p) => !occupiedDeployments.has(p.x));
      if (target) {
        occupiedDeployments.add(target.x);
        deployments++;
        orders.push({ actorId: actor.id, type: "DEPLOY", to: target });
      }
    }
  }
  return { orders };
}

/** Chaque priorité résout ses mouvements, puis ses dégâts simultanés. */
export function resolveTacticalTurn(input) {
  const state = structuredClone(input);
  const snapshot = () =>
    structuredClone({
      troops: state.troops,
      players: state.players,
      positions: state.tactics.positions,
      bonuses: state.tactics.bonuses,
    });
  const before = new Map(
    tacticalActors(state).map((actor) => [actor.id, structuredClone(actor)]),
  );
  const result = {
    round: state.round,
    tactical: true,
    encounter: structuredClone(state.encounter),
    steps: [],
    initial: snapshot(),
    winnerId: null,
    combatants: {},
    heroDamage: {},
    reward: null,
  };
  const actors = () => tacticalActors(state);
  const find = (id) => actors().find((actor) => actor.id === id);
  const stance = new Map(
    actors().map((actor) => [
      actor.id,
      state.pendingChoices[actor.ownerId]?.orders.some(
        (order) => order.actorId === actor.id,
      )
        ? "ATTACK"
        : "DEFEND",
    ]),
  );
  const flee = state.players.filter(
    (player) => state.pendingChoices[player.id]?.flee,
  );
  const cancelledMoves = new Set();
  if (flee.length) {
    state.phase = "FINISHED";
    state.finishReason = "FLEE";
    state.winnerId =
      flee.length === 2
        ? null
        : state.players.find((player) => player.id !== flee[0].id).id;
  } else {
    const steps = Math.max(
      0,
      ...state.players.map(
        (player) => state.pendingChoices[player.id]?.orders.length ?? 0,
      ),
    );
    for (let index = 0; index < steps; index++) {
      const orders = state.players
        .map((player) => state.pendingChoices[player.id]?.orders[index])
        .filter((order) => order && alive(find(order.actorId)));
      const events = [];
      const engagements = [];
      for (const order of orders) {
        if (["DEFEND", "SPEAR_WALL"].includes(order.type)) {
          stance.set(order.actorId, order.type);
          if (order.type === "SPEAR_WALL")
            events.push({ type: "spear-wall", actorId: order.actorId });
        }
        if (order.type === "CHARGE") stance.set(order.actorId, "CHARGE");
        if (order.type === "RALLY") {
          const actor = state.troops.find(
            (troop) => troop.id === order.actorId,
          );
          actor.morale = Math.max(actor.morale, Math.min(10, actor.morale + 2));
          events.push({ type: "rally", actorId: actor.id });
        }
      }
      const moves = orders.filter((order) =>
        ["MOVE", "CHARGE", "DEPLOY"].includes(order.type),
      );
      const blocked = new Set();
      const contests = new Map();
      const viableMoves = moves.filter((move) => {
        const actor = find(move.actorId),
          p = state.tactics.positions[actor.id];
        const dependency = tacticalActors(input).find(
          (ally) =>
            ally.ownerId === actor.ownerId &&
            ally.id !== actor.id &&
            same(input.tactics.positions[ally.id], move.to),
        );
        const middle =
          p && ridingDistance(p, move.to) === 2
            ? { x: (p.x + move.to.x) / 2, y: (p.y + move.to.y) / 2 }
            : null;
        return (
          passable(state, move.to, actor) &&
          stance.get(actor.id) !== "SPEAR_WALL" &&
          !(dependency && cancelledMoves.has(dependency.id)) &&
          !(middle && actorAt(state, middle))
        );
      });
      for (const move of moves) {
        const actor = find(move.actorId);
        if (!viableMoves.includes(move)) {
          blocked.add(actor.id);
          continue;
        }
        if (
          !passable(state, move.to, actor) ||
          stance.get(actor.id) === "SPEAR_WALL"
        ) {
          blocked.add(actor.id);
          continue;
        }
        const dependency = tacticalActors(input).find(
          (ally) =>
            ally.ownerId === actor.ownerId &&
            ally.id !== actor.id &&
            same(input.tactics.positions[ally.id], move.to),
        );
        if (dependency && cancelledMoves.has(dependency.id)) {
          blocked.add(actor.id);
          continue;
        }
        const position = state.tactics.positions[actor.id];
        const occupant = actorAt(state, move.to);
        const other = viableMoves.find(
          (entry) => entry !== move && same(entry.to, move.to),
        );
        const crossing = moves.find(
          (entry) =>
            entry !== move &&
            same(entry.to, position) &&
            same(state.tactics.positions[entry.actorId], move.to),
        );
        // Charge cannot jump over an occupied intermediate square.
        const middle =
          position && ridingDistance(position, move.to) === 2
            ? {
                x: (position.x + move.to.x) / 2,
                y: (position.y + move.to.y) / 2,
              }
            : null;
        if (middle && actorAt(state, middle)) {
          blocked.add(actor.id);
          continue;
        }
        if (other || crossing || occupant) {
          const target = other
            ? find(other.actorId)
            : crossing
              ? find(crossing.actorId)
              : occupant;
          const vacates =
            occupant &&
            moves.some(
              (entry) =>
                entry.actorId === occupant.id && !same(entry.to, move.to),
            );
          if (
            other ||
            crossing ||
            (occupant && (!vacates || occupant.ownerId !== actor.ownerId))
          ) {
            blocked.add(actor.id);
            if (
              target?.ownerId !== actor.ownerId &&
              target &&
              move.type !== "DEPLOY"
            ) {
              engagements.push([actor.id, target.id]);
              if (other && !occupant && other.type !== "DEPLOY") {
                const key = `${move.to.x}:${move.to.y}`;
                if (!contests.has(key)) {
                  contests.set(key, {
                    actors: [actor.id, target.id],
                    position: structuredClone(move.to),
                  });
                  events.push({
                    type: "contest",
                    actorId: actor.id,
                    targetId: target.id,
                    to: structuredClone(move.to),
                  });
                }
              }
            }
          }
        }
      }
      // Propagate blocked destinations along allied chains.
      for (let pass = 0; pass < moves.length; pass++)
        for (const move of moves) {
          const occupant = actorAt(state, move.to);
          if (occupant && blocked.has(occupant.id)) blocked.add(move.actorId);
        }
      for (const move of moves) {
        if (!blocked.has(move.actorId)) {
          const from = state.tactics.positions[move.actorId] ?? null;
          state.tactics.positions[move.actorId] = structuredClone(move.to);
          if (move.type === "CHARGE") stance.set(move.actorId, "CHARGE");
          events.push({
            type: "move",
            actorId: move.actorId,
            from,
            to: move.to,
          });
        } else {
          cancelledMoves.add(move.actorId);
          events.push({ type: "blocked", actorId: move.actorId });
        }
      }
      const excursions = new Map();
      const excursionPaths = new Map();
      for (const order of orders.filter((entry) => entry.type === "HARASS")) {
        const actor = find(order.actorId),
          target = find(order.targetId);
        const path =
          target &&
          alive(target) &&
          harassmentPath(
            state,
            actor,
            target,
            (p) =>
              actorAt(state, p) ||
              [...excursions.values()].some((origin) => same(origin, p)),
          );
        if (!path) {
          events.push({ type: "miss", actorId: actor.id });
          continue;
        }
        const origin = structuredClone(state.tactics.positions[actor.id]);
        excursions.set(actor.id, origin);
        excursionPaths.set(actor.id, path);
        state.tactics.positions[actor.id] = structuredClone(path.at(-1));
        events.push({
          type: "move",
          actorId: actor.id,
          from: origin,
          to: path.at(-1),
          path,
          harassment: true,
        });
      }
      const movement = snapshot();
      const attacks = [];
      const pairs = new Set();
      for (const [a, b] of engagements) {
        const key = [a, b].sort().join("|");
        if (pairs.has(key)) continue;
        pairs.add(key);
        attacks.push([a, b], [b, a]);
      }
      for (const order of orders) {
        const actor = find(order.actorId);
        const p = state.tactics.positions[actor.id];
        if (order.type === "HARASS" && excursions.has(actor.id)) {
          const target = find(order.targetId);
          attacks.push([actor.id, target.id]);
          if (actor.typeId === "light-cavalry")
            attacks.push([target.id, actor.id]);
        } else if (order.type === "ATTACK") {
          const target = find(order.targetId);
          const to = state.tactics.positions[target?.id];
          if (
            p &&
            to &&
            alive(target) &&
            (cavalry(actor) && !isArcher(actor)
              ? ridingDistance(p, to)
              : distance(p, to)) <= attackRange(state, actor, p)
          )
            attacks.push([actor.id, target.id]);
          else events.push({ type: "miss", actorId: actor.id });
        } else if (order.type === "ATTACK_BASE") {
          const opponent = state.players.find(
            (player) => player.id !== actor.ownerId,
          );
          if (
            p &&
            !state.tactics.positions[heroId(opponent.id)] &&
            Math.abs(p.y - home(state, opponent.id)) + 1 <=
              attackRange(state, actor, p)
          )
            attacks.push([actor.id, heroId(opponent.id)]);
          else events.push({ type: "miss", actorId: actor.id });
        }
      }
      const packets = new Map();
      for (const [attackerId, targetId] of [...attacks]) {
        const attacker = find(attackerId),
          target = find(targetId);
        const from = state.tactics.positions[attackerId],
          to = state.tactics.positions[targetId];
        if (
          target?.typeId === "spearman" &&
          stance.get(targetId) === "SPEAR_WALL" &&
          cavalry(attacker) &&
          !isArcher(attacker) &&
          from &&
          to &&
          ridingDistance(from, to) === 1
        )
          attacks.push([targetId, attackerId]);
      }
      const struck = new Set();
      for (const [a, b] of attacks) {
        if (struck.has(a)) continue;
        struck.add(a);
        const attacker = find(a),
          target = find(b);
        if (!alive(attacker) || !alive(target)) continue;
        const contest = [...contests.values()].find(
          (entry) => entry.actors.includes(a) && entry.actors.includes(b),
        );
        const attackingPosition =
          contest?.position ?? state.tactics.positions[a];
        const defendingPosition =
          contest?.position ?? state.tactics.positions[b];
        const ambush =
          state.ambush && state.round <= state.ambush.expiresAfterRound;
        const effectiveAttacker = {
          ...attacker,
          attack:
            attacker.attack *
            (ambush &&
            !attacker.isHero &&
            attacker.ownerId === state.ambush.attackerTeamId
              ? state.ambush.attackerAttackMultiplier
              : 1),
        };
        const effectiveTarget = {
          ...target,
          defense:
            target.defense *
            (ambush &&
            !target.isHero &&
            target.ownerId !== state.ambush.attackerTeamId
              ? state.ambush.defenderDefenseMultiplier
              : 1),
        };
        const modifiers = combatModifiers(
          state,
          attacker,
          target,
          attackingPosition,
          defendingPosition,
          stance.get(a),
          stance.get(b),
        );
        effectiveAttacker.attack *= modifiers.attack;
        effectiveAttacker.attack *= tacticalBuff(state, a, "ATTACK");
        modifiers.defense *= tacticalBuff(state, b, "DEFENSE");
        effectiveAttacker.speed = terrainSpeed(
          state,
          attacker,
          attackingPosition,
          Boolean(contest) ||
            events.some(
              (event) => event.type === "move" && event.actorId === a,
            ),
        );
        effectiveTarget.speed = terrainSpeed(
          state,
          target,
          defendingPosition,
          Boolean(contest) ||
            events.some(
              (event) => event.type === "move" && event.actorId === b,
            ),
        );
        const encounter = state.tactics.battlefield?.terrainEffectsEnabled
          ? {
              ...state.encounter,
              terrain: { id: "PLAIN", label: "Terrain local" },
            }
          : state.encounter;
        const damage = Math.max(
          1,
          Math.floor(
            attackValue(
              effectiveAttacker,
              effectiveTarget,
              stance.get(a),
              stance.get(b),
              encounter,
              0,
              1,
              false,
              modifiers.defense,
            ) * modifiers.damage,
          ),
        );
        packets.set(b, [...(packets.get(b) ?? []), damage]);
        events.push({
          type: "attack",
          actorId: a,
          targetId: b,
          damage,
          from: structuredClone(state.tactics.positions[a] ?? null),
          to: structuredClone(defendingPosition ?? null),
          ranged: isArcher(attacker),
          harassment: excursions.has(a),
        });
      }
      for (const [id, damage] of packets) {
        const target = find(id);
        if (target.isHero) {
          const player = state.players.find(
            (entry) => entry.id === target.ownerId,
          );
          const amount = Math.min(
            player.hero.health,
            damage.reduce((sum, value) => sum + value, 0),
          );
          player.hero.health -= amount;
          events.push({
            type: "loss",
            actorId: id,
            to: structuredClone(state.tactics.positions[id] ?? null),
            healthLost: amount,
            wounded: 0,
            dead: 0,
          });
          result.heroDamage[player.id] =
            (result.heroDamage[player.id] ?? 0) + amount;
        } else {
          const troop = state.troops.find((entry) => entry.id === id);
          const count = troop.count;
          const previousHealth = [...troop.soldierHealth];
          applyTroopDamage(troop, damage);
          const wounded = troop.soldierHealth.filter(
            (health, index) =>
              health > 0 &&
              health <= troop.combatHealthThreshold &&
              previousHealth[index] > troop.combatHealthThreshold,
          ).length;
          const dead = troop.soldierHealth.filter(
            (health, index) => health === 0 && previousHealth[index] > 0,
          ).length;
          const healthLost = previousHealth.reduce(
            (sum, health, index) => sum + health - troop.soldierHealth[index],
            0,
          );
          events.push({
            type: "loss",
            actorId: id,
            to: structuredClone(state.tactics.positions[id] ?? null),
            healthLost,
            wounded,
            dead,
          });
          troop.morale = Math.max(
            0,
            troop.morale -
              Math.ceil((6 * (count - troop.count)) / Math.max(1, count)),
          );
          if (!troop.count)
            troop.tacticalState = troop.woundedCount
              ? "INCAPACITATED"
              : "DESTROYED";
          else if (!troop.morale) troop.tacticalState = "ROUTED";
        }
      }
      const combat = snapshot();
      for (const [id, origin] of excursions) {
        if (alive(find(id))) {
          const from = state.tactics.positions[id];
          state.tactics.positions[id] = origin;
          events.push({
            type: "return",
            actorId: id,
            from,
            to: origin,
            path: [...excursionPaths.get(id).slice(0, -1).reverse(), origin],
          });
        }
      }
      // A surviving melee attacker occupies a defeated defender's square.
      const claims = new Map();
      const contestedActors = new Set(
        [...contests.values()].flatMap((entry) => entry.actors),
      );
      for (const event of events.filter((entry) => entry.type === "attack")) {
        const attacker = find(event.actorId),
          target = find(event.targetId);
        if (
          !alive(attacker) ||
          contestedActors.has(attacker.id) ||
          alive(target) ||
          isArcher(attacker) ||
          excursions.has(attacker.id) ||
          stance.get(attacker.id) === "SPEAR_WALL" ||
          !passable(state, event.to, attacker) ||
          !event.to
        )
          continue;
        const p = state.tactics.positions[attacker.id];
        if (
          !p ||
          (movesDiagonally(attacker)
            ? ridingDistance(p, event.to)
            : distance(p, event.to)) !== 1
        )
          continue;
        const key = `${event.to.x}:${event.to.y}`;
        claims.set(key, [...(claims.get(key) ?? []), event]);
      }
      for (const contest of contests.values()) {
        const survivors = contest.actors.map(find).filter(alive);
        if (survivors.length !== 1) continue;
        const survivor = survivors[0];
        if (
          !passable(state, contest.position, survivor) ||
          actorAt(state, contest.position)
        )
          continue;
        const from = state.tactics.positions[survivor.id];
        state.tactics.positions[survivor.id] = structuredClone(
          contest.position,
        );
        events.push({
          type: "advance",
          actorId: survivor.id,
          from,
          to: contest.position,
          contested: true,
        });
        cancelledMoves.delete(survivor.id);
      }
      for (const contenders of claims.values()) {
        if (contenders.length !== 1) continue;
        const event = contenders[0];
        if (actorAt(state, event.to)) continue;
        const from = state.tactics.positions[event.actorId];
        state.tactics.positions[event.actorId] = structuredClone(event.to);
        events.push({
          type: "advance",
          actorId: event.actorId,
          from,
          to: event.to,
        });
      }
      for (const actor of actors())
        if (!alive(actor)) delete state.tactics.positions[actor.id];
      collectTacticalBonus(state, actors(), events);
      result.steps.push({
        priority: index + 1,
        events,
        movement,
        combat,
        after: snapshot(),
      });
      if (state.players.some((player) => player.hero.health <= 0)) break;
    }
    for (const player of state.players) {
      const invading = actors().filter(
        (actor) =>
          actor.ownerId !== player.id &&
          alive(actor) &&
          state.tactics.positions[actor.id]?.y === home(state, player.id),
      ).length;
      player.cohesion = Math.max(0, player.cohesion - Math.min(2, invading));
    }
    const defeated = state.players.filter(
      (player) => player.hero.health <= 0 || player.cohesion <= 0,
    );
    if (defeated.length) {
      state.phase = "FINISHED";
      state.finishReason = defeated.some((player) => player.hero.health <= 0)
        ? "HERO_DEFEATED"
        : "CAMP_MORALE";
      state.winnerId =
        defeated.length === 2
          ? null
          : state.players.find((player) => player.id !== defeated[0].id).id;
    } else if (state.round >= state.tactics.turnLimit) {
      const score = (player) =>
        player.cohesion + (20 * player.hero.health) / player.hero.maxHealth;
      state.phase = "FINISHED";
      state.finishReason = "TURN_LIMIT";
      const [a, b] = state.players;
      state.winnerId =
        score(a) === score(b) ? null : score(a) > score(b) ? a.id : b.id;
    }
  }
  for (const player of state.players) {
    if (player.hero.health <= 0) player.hero.state = "GHOST";
    player.locked = false;
    result.combatants[player.id] = actors()
      .filter(
        (actor) =>
          actor.ownerId === player.id &&
          result.steps.some((step) =>
            step.events.some(
              (event) =>
                event.actorId === actor.id || event.targetId === actor.id,
            ),
          ),
      )
      .map((actor) => ({
        ...actor,
        before: actor.isHero
          ? before.get(actor.id).health
          : before.get(actor.id).count,
        after: actor.isHero ? actor.health : actor.count,
        maxCount: actor.isHero ? actor.maxHealth : actor.maxCount,
        woundedBefore: before.get(actor.id).woundedCount ?? 0,
        deadBefore: before.get(actor.id).deadCount ?? 0,
      }));
  }
  result.winnerId = state.winnerId;
  state.lastResult = result;
  state.history.push(result);
  state.pendingChoices = {};
  if (state.phase !== "FINISHED") {
    state.round++;
    state.phase = "CHOICE";
    spawnTacticalBonus(state);
  }
  refreshTacticalOptions(state);
  return state;
}

export function lockTacticalChoice(input, ownerId) {
  const state = structuredClone(input);
  const player = state.players.find((entry) => entry.id === ownerId);
  if (state.phase !== "CHOICE" || !player || player.locked)
    throw new Error("Ordres déjà verrouillés ou tour terminé.");
  state.pendingChoices[ownerId] ??= { orders: [], flee: false };
  player.locked = true;
  return state.players.every((entry) => entry.locked)
    ? resolveTacticalTurn(state)
    : state;
}
