// Server rules shared by validation and resolution; no DOM dependencies.
export const isCavalry = (actor) =>
  /caval|mounted|horse/i.test(actor.typeId ?? "");
export const isArcher = (actor) =>
  /archer/i.test(actor.typeId ?? "") || actor.range > 1;
export const movesDiagonally = (actor) =>
  isCavalry(actor) || actor.typeId === "swordsman";
export const gridDistance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const ridingDistance = (a, b) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const terrainAt = (state, position) =>
  position && state.tactics.battlefield?.cells[position.y]?.[position.x];
const enabled = (state) =>
  state.tactics.battlefield?.terrainEffectsEnabled === true;
export function passable(state, position, actor = null) {
  const ground = terrainAt(state, position);
  if (
    actor?.typeId === "heavy-infantry" &&
    ground?.terrain === "water" &&
    ground.structure?.kind !== "bridge"
  )
    return false;
  return Boolean(
    position &&
      position.x >= 0 &&
      position.x < 3 &&
      position.y >= 0 &&
      position.y < 5,
  );
}
export function terrainSpeed(state, actor, position, moving = false) {
  const slowed =
    moving &&
    enabled(state) &&
    ["forest", "hill", "rock"].includes(terrainAt(state, position)?.terrain);
  return Math.max(0.1, Number(actor.speed) || 0.1) * (slowed ? 0.75 : 1);
}
export function flat(state, position) {
  const ground = terrainAt(state, position);
  return (
    !enabled(state) ||
    (ground?.terrain === "grass" &&
      !["tower", "barricade"].includes(ground.structure?.kind))
  );
}
export function attackRange(state, actor, position) {
  return (
    Math.max(1, actor.range ?? 1) +
    (enabled(state) &&
    isArcher(actor) &&
    terrainAt(state, position)?.structure?.kind === "tower"
      ? 1
      : 0)
  );
}
export function combatModifiers(
  state,
  attacker,
  target,
  from,
  to,
  stance,
  targetStance,
) {
  let attack = 1,
    defense = 1,
    damage = 1;
  if (enabled(state)) {
    const source = terrainAt(state, from),
      destination = terrainAt(state, to);
    if (isCavalry(attacker) && source?.terrain === "forest") attack *= 0.75;
    if (isCavalry(attacker) && source?.terrain === "rock") attack *= 0.7;
    if (isArcher(attacker) && source?.terrain === "hill") attack *= 1.15;
    if (
      attacker.typeId === "swordsman" &&
      ["village", "barricade", "tower"].includes(destination?.structure?.kind)
    )
      attack *= 1.25;
    defense *=
      { forest: 1.25, hill: 1.15, rock: 1.3 }[destination?.terrain] ?? 1;
    if (
      destination?.terrain === "water" &&
      destination.structure?.kind !== "bridge"
    )
      defense *= 0.25;
    defense *=
      { tower: 1.2, barricade: 1.25, village: 1.1 }[
        destination?.structure?.kind
      ] ?? 1;
    if (stance === "CHARGE" && flat(state, from) && flat(state, to))
      attack *= attacker.typeId === "heavy-cavalry" ? 1.25 : 1.15;
  }
  if (target.typeId === "spearman" && isCavalry(attacker))
    defense *= targetStance === "SPEAR_WALL" ? 2 : 1.5;
  if (
    attacker.typeId === "spearman" &&
    stance === "SPEAR_WALL" &&
    isCavalry(target)
  )
    damage *= 1.5;
  if (target.typeId === "heavy-infantry" && isArcher(attacker)) defense *= 1.5;
  return { attack, defense, damage };
}

/** A legal outward path of one or two flat squares; origin stays reserved. */
export function harassmentPath(state, actor, target, occupied) {
  if (!["light-cavalry", "mounted-archer"].includes(actor.typeId)) return null;
  const origin = state.tactics.positions[actor.id],
    destination = state.tactics.positions[target.id];
  if (!origin || !destination || !flat(state, origin)) return null;
  const mounted = actor.typeId === "mounted-archer";
  const queue = [{ position: origin, path: [] }],
    visited = new Set([`${origin.x}:${origin.y}`]);
  while (queue.length) {
    const { position, path } = queue.shift();
    const distance = gridDistance(position, destination);
    if (
      path.length &&
      (mounted
        ? distance >= 2 && distance <= attackRange(state, actor, position)
        : ridingDistance(position, destination) === 1)
    )
      return path;
    if (path.length === 2) continue;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const p = { x: position.x + dx, y: position.y + dy },
          key = `${p.x}:${p.y}`;
        if (
          p.x < 0 ||
          p.x >= 3 ||
          p.y < 0 ||
          p.y >= 5 ||
          visited.has(key) ||
          !flat(state, p) ||
          !passable(state, p) ||
          occupied(p)
        )
          continue;
        if (
          dx &&
          dy &&
          (!passable(state, { x: position.x + dx, y: position.y }) ||
            !passable(state, { x: position.x, y: position.y + dy }))
        )
          continue;
        visited.add(key);
        queue.push({ position: p, path: [...path, p] });
      }
  }
  return null;
}
