import { renderUnitTypeIcon } from "./unit-icon.js";

const previousPositions = new Map();

export function battleEntityPosition(entity, team, playerTeamId, opposingUnits = [], index = 0) {
  const allied = team.id === playerTeamId;
  if (entity.kind === "hero") return { x: allied ? 4 : 96, y: 50 };
  const offset = index * (allied ? -4 : 4);
  const rawX = (allied ? 8 + entity.progress * 84 : 92 - entity.progress * 84) + offset;
  const opponent = opposingUnits.find((unit) => unit.id === entity.targetId || unit.targetId === entity.id)
    ?? opposingUnits.filter((unit) => unit.lane === entity.lane && unit.state === "active").sort((first, second) => second.progress - first.progress)[0];
  if (!opponent) return { x: Math.max(6, Math.min(94, rawX)), y: 50 };
  const opponentRawX = allied ? 92 - opponent.progress * 84 : 8 + opponent.progress * 84;
  const crossed = allied ? rawX >= opponentRawX : rawX <= opponentRawX;
  if (!crossed) return { x: Math.max(6, Math.min(94, rawX)), y: 50 };
  const meetingX = (rawX + opponentRawX) / 2;
  return { x: Math.max(6, Math.min(94, meetingX + (allied ? -4 : 4))), y: 50 };
}

function militiaFormation(allied, count) {
  return infantryFormation("militia", allied, count);
}

function infantryFormation(type, allied, count) {
  const direction = allied ? "back" : "front";
  const visibleCount = Math.min(24, Math.max(0, count));
  let soldierIndex = 0;
  const ranks = militiaFormationRows(visibleCount).map((rank) => `<b class="militia-rank" data-rank-size="${rank}">${Array.from({ length: rank }, () => `<i style="--soldier:${soldierIndex++}"></i>`).join("")}</b>`).join("");
  return `<span class="militia-formation ${type}-formation is-${direction}" data-soldiers="${count}" aria-hidden="true">${ranks}</span>`;
}

export function militiaFormationRows(count) {
  const visibleCount = Math.min(24, Math.max(0, Number.isInteger(count) ? count : 0));
  const patterns = {
    0: [], 1: [1], 2: [2], 3: [3], 4: [2, 2], 5: [1, 2, 2], 6: [3, 3],
    7: [1, 3, 3], 8: [4, 4], 9: [3, 3, 3], 10: [1, 3, 3, 3], 11: [1, 5, 5],
    12: [4, 4, 4], 13: [1, 4, 4, 4], 14: [2, 4, 4, 4], 15: [5, 5, 5],
    16: [4, 4, 4, 4], 17: [1, 4, 4, 4, 4], 18: [3, 5, 5, 5],
    19: [4, 5, 5, 5], 20: [5, 5, 5, 5], 21: [1, 5, 5, 5, 5],
    22: [2, 5, 5, 5, 5], 23: [3, 5, 5, 5, 5], 24: [4, 4, 4, 4, 4, 4],
  };
  return [...patterns[visibleCount]];
}

export function formationProjectileOffsets(count) {
  const rows = militiaFormationRows(count);
  return rows.flatMap((rowSize, rowIndex) => Array.from({ length: rowSize }, (_, columnIndex) => ({
    x: (columnIndex - (rowSize - 1) / 2) * .85,
    y: (rowIndex - (rows.length - 1) / 2) * .62,
  })));
}

export function livingSoldierHealth(unit) {
  const fallbackHealth = unit.healthPerSoldier ?? 1;
  const values = Array.isArray(unit.soldierHealth) ? unit.soldierHealth : Array(unit.quantity ?? 0).fill(fallbackHealth);
  return values.filter((health) => health > 0);
}

function soldierFormation(unit, allied) {
  const maximum = Math.max(1, unit.healthPerSoldier ?? 1); const threshold = unit.combatHealthThreshold ?? 0;
  return `<span class="soldier-formation ${allied ? "is-allied" : "is-enemy"}" data-soldiers="${livingSoldierHealth(unit).length}" aria-hidden="true">${livingSoldierHealth(unit).map((health, index) => `<i class="soldier-piece ${health <= threshold ? "is-wounded" : ""}" style="--soldier:${index}"><em style="width:${Math.round(Math.min(1, health / maximum) * 100)}%"></em></i>`).join("")}</span>`;
}

/** Vue animée : les unités progressent, les héros restent ancrés à leur camp. */
export function renderBattleView({ element, battle, playerTeamId, message, selectedUnitId = null, selectedPower = null, onSelectUnit, onAssign, onDragState, onRetreatLine, onSelectPower, onCancelPower, onActivatePower, onFlee, onSurrender }) {
  const player = battle.teams.find((team) => team.id === playerTeamId);
  const enemy = battle.teams.find((team) => team.id !== playerTeamId);
  const allEntities = battle.teams.flatMap((team) => [...team.heroes, ...team.units].map((entity) => ({ entity, team })));
  const findEntity = (id) => allEntities.find((item) => item.entity.id === id) ?? null;
  const entityIcon = (entity) => entity.kind === "hero" ? "<strong>H</strong>" : soldierFormation(entity, battle.teams.find((team) => team.units.includes(entity))?.id === playerTeamId);
  const latestAttacks = findLatestAttacks(battle);
  const latestAttack = latestAttacks[0] ?? null;
  const latestAttackAgeMs = latestAttack ? Math.max(0, battle.state.elapsedMs - latestAttack.elapsedMs) : Infinity;
  const commanders = player.heroes.filter((hero) => hero.state === "active");
  const powerTargetIds = new Set(selectedPower ? battle.getSpecialPowerTargets({ teamId: playerTeamId, userId: selectedPower.userId, powerId: selectedPower.powerId }) : []);
  const totalCommand = commanders.reduce((sum, hero) => sum + hero.commandPoints, 0);
  const retreatCost = battle.config.retreatCommandCost;
  const healthBar = (unit) => {
    const total = Math.max(1, unit.maxQuantity ?? unit.initialQuantity ?? unit.soldierHealth?.length ?? unit.quantity);
    const green = unit.combatantCount ?? unit.quantity;
    const red = unit.woundedCount ?? 0;
    const black = Math.max(0, total - green - red);
    return `<div class="casualty-bar" role="img" aria-label="${green} combattants, ${red} blessés, ${black} morts ou places libres"><i class="is-dead" style="flex:${black}"></i><i class="is-wounded" style="flex:${red}"></i><i class="is-combatant" style="flex:${green}"></i></div>`;
  };

  const positionFor = (entity, team, index = 0) => {
    const opposingUnits = battle.teams.find((item) => item.id !== team.id)?.units ?? [];
    return battleEntityPosition(entity, team, playerTeamId, opposingUnits, index);
  };

  const fieldToken = (entity, team, index) => {
    const allied = team.id === playerTeamId; const position = positionFor(entity, team, index);
    const attacking = latestAttack?.attackerId === entity.id && latestAttackAgeMs < 1_200;
    const reloading = String(entity.typeId).toLowerCase() === "archer" && entity.attackCooldownMs > 0 && !attacking;
    const targeted = latestAttack?.targetId === entity.id;
    const powerTarget = powerTargetIds.has(entity.id); const activeEffects = entity.activeEffects?.length ?? 0;
    return `<article class="unit-token field-token ${allied ? "is-ally" : "is-enemy"} ${entity.kind === "hero" ? "is-hero" : ""} ${entity.range > 1 ? "is-ranged" : "is-melee"} ${attacking ? "is-attacking" : ""} ${reloading ? "is-reloading" : ""} ${targeted ? "is-targeted" : ""} ${powerTarget ? "is-power-target" : ""} ${activeEffects > 0 ? "has-active-effect" : ""}" style="left:${position.x}%;top:${position.y}%" data-field-entity="${entity.id}" ${powerTarget ? `data-power-target="${entity.id}"` : ""} data-x="${position.x}" data-y="${position.y}" title="${entity.kind === "hero" ? "Héros immobile" : `${entity.name ?? entity.typeName ?? "Unité"} · ${entity.combatantCount} combattants · ${entity.woundedCount} blessés · ${Math.max(0, entity.maxQuantity - entity.combatantCount - entity.woundedCount)} morts ou places libres`}${activeEffects ? ` · ${activeEffects} effet(s) actif(s)` : ""}">${entityIcon(entity)}<small>${entity.kind === "hero" ? entity.health : entity.combatantCount}</small>${activeEffects ? `<mark class="effect-marker">✦${activeEffects}</mark>` : ""}${entity.kind === "unit" ? healthBar(entity) : ""}</article>`;
  };

  const lane = (index) => {
    const enemyHero = enemy.heroes.find((hero) => hero.lane === index && hero.state === "active");
    const playerHero = player.heroes.find((hero) => hero.lane === index && hero.state === "active");
    const enemyUnits = enemy.units.filter((unit) => unit.lane === index && unit.state === "active");
    const playerUnits = player.units.filter((unit) => unit.lane === index && unit.state === "active");
    const canRetreat = playerUnits.some((unit) => !unit.retreating) && battle.status === "active" && totalCommand >= retreatCost;
    return `<section class="vertical-lane" style="--lane-row:${index + 1}" data-line="${index}" aria-label="Ligne ${index + 1}"><div class="lane-centerline"></div>${enemyUnits.map((unit, unitIndex) => fieldToken(unit, enemy, unitIndex)).join("")}${playerUnits.map((unit, unitIndex) => fieldToken(unit, player, unitIndex)).join("")}<button type="button" class="lane-retreat" data-retreat-line="${index}" aria-label="Faire retraiter l'unité la plus avancée de la ligne ${index + 1}" title="Retraite ligne ${index + 1} · ◆ ${retreatCost}" ${canRetreat ? "" : "disabled"}><span aria-hidden="true">⚑</span><small>◆${retreatCost}</small></button></section>`;
  };

  const hand = player.units.filter((unit) => unit.lane === null && unit.state === "active");
  const handCard = (unit) => `<button type="button" class="unit-token hand-token is-ally ${unit.id === selectedUnitId ? "is-selected" : ""} ${powerTargetIds.has(unit.id) ? "is-power-target" : ""}" draggable="${selectedPower ? "false" : "true"}" data-unit="${unit.id}" ${powerTargetIds.has(unit.id) ? `data-power-target="${unit.id}"` : ""} aria-label="Sélectionner ${unit.name ?? unit.typeName ?? "une unité"}, ${unit.combatantCount} combattants"><span class="hand-unit-icon">${renderUnitTypeIcon(unit)}</span><strong>${unit.name ?? unit.typeName ?? unit.typeId}</strong><small>${unit.combatantCount} soldats</small>${healthBar(unit)}</button>`;
  const attackVisual = createAttackVisual(latestAttacks, findEntity, positionFor, battle.state.elapsedMs);

  const powers = commanders.flatMap((hero) => hero.specialPowerIds.map((powerId) => powerButton(hero, powerId, 1))).concat(player.units.filter((unit) => unit.state === "active").flatMap((unit) => unit.specialPowerIds.map((powerId) => powerButton(unit, powerId, 1)))).join("");
  const heroHud = (team, side) => `<div class="battle-hero-hud is-${side}">${team.heroes.map((hero) => `<span class="hero-health ${hero.state !== "active" ? "is-out" : ""}"><b>${hero.name ?? "H"}</b><i><em style="width:${Math.round(hero.health / hero.maxHealth * 100)}%"></em></i><small>${hero.health}/${hero.maxHealth}</small></span>`).join("")}</div>`;
  const countdown = battle.status === "countdown" ? `<div class="battle-countdown" role="status"><strong>${Math.max(1, Math.ceil(battle.state.countdownRemainingMs / 1_000))}</strong><span>Préparez vos lignes</span></div>` : "";
  const targeting = selectedPower ? `<div class="power-targeting"><strong>${selectedPower.name}</strong><span>Touchez une cible lumineuse.</span><button type="button" data-cancel-power>Annuler</button></div>` : "";
  element.innerHTML = `<div class="battle-screen"><main class="vertical-battlefield"><aside class="battle-camp is-allied">${heroHud(player, "player")}</aside>${[0, 1, 2].map(lane).join("")}<aside class="battle-camp is-enemy">${heroHud(enemy, "enemy")}</aside>${attackVisual.svg}${attackVisual.effects}${countdown}</main><section class="battle-action-dock">${targeting}<div class="battle-feedback" aria-live="polite">${message}</div><section class="player-hand" aria-label="Unités disponibles"><div class="hand-cards">${hand.map(handCard).join("") || "<span>Toutes les unités sont engagées</span>"}</div><small>${selectedPower ? "Choisissez la cible" : "Glissez une unité vers une ligne"}</small></section><div class="battle-quick-actions"><span class="command-points">◆ ${totalCommand}</span><div class="power-buttons">${powers}</div><button type="button" class="flee-button" data-flee ${battle.status !== "active" ? "disabled" : ""}>Fuir</button><button type="button" class="surrender-button" data-surrender ${battle.status !== "active" ? "disabled" : ""}>Se rendre</button></div></section></div>`;

  player.units.filter((unit) => unit.retreating).forEach((unit) => {
    const token = element.querySelector(`[data-field-entity="${unit.id}"]`);
    token?.classList.add("is-retreating");
    token?.insertAdjacentHTML("beforeend", '<span class="retreat-marker">R</span>');
  });
  animateMovement(element);
  element.querySelectorAll("[data-unit]").forEach((item) => {
    item.classList.toggle("is-selected", item.dataset.unit === selectedUnitId);
    item.addEventListener("dragstart", (event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", item.dataset.unit); onDragState(true); });
    item.addEventListener("dragend", () => onDragState(false));
    item.addEventListener("click", () => { if (!powerTargetIds.has(item.dataset.unit)) onSelectUnit(item.dataset.unit); });
    enablePointerDrag(item, element, onAssign, onDragState);
  });
  element.querySelectorAll("[data-line]").forEach((target) => {
    target.addEventListener("dragenter", (event) => { event.preventDefault(); target.classList.add("is-drop-target"); });
    target.addEventListener("dragleave", () => target.classList.remove("is-drop-target"));
    target.addEventListener("dragover", (event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; });
    target.addEventListener("drop", (event) => { event.preventDefault(); target.classList.remove("is-drop-target"); const unitId = event.dataTransfer.getData("text/plain") || selectedUnitId; onDragState(false); if (unitId) onAssign(unitId, Number(target.dataset.line)); });
    target.addEventListener("click", (event) => { if (selectedUnitId && !event.target.closest("[data-unit], [data-retreat-line], [data-power-target]")) onAssign(selectedUnitId, Number(target.dataset.line)); });
  });
  element.querySelectorAll("[data-retreat-line]").forEach((button) => button.addEventListener("click", () => onRetreatLine(Number(button.dataset.retreatLine))));
  element.querySelectorAll("[data-power-user]").forEach((button) => button.addEventListener("click", () => {
    const definition = battle.getSpecialPowerDefinition(button.dataset.powerId); const target = definition?.activation?.target ?? "none";
    const payload = { userId: button.dataset.powerUser, powerId: button.dataset.powerId, cost: Number(button.dataset.powerCost), name: definition?.name ?? button.dataset.powerId };
    if (target === "none" || target === "self") onActivatePower({ ...payload, targetId: target === "self" ? payload.userId : null }); else onSelectPower(payload);
  }));
  element.querySelectorAll("[data-power-target]").forEach((target) => target.addEventListener("click", (event) => { event.stopPropagation(); onActivatePower({ ...selectedPower, targetId: target.dataset.powerTarget }); }));
  element.querySelector("[data-cancel-power]")?.addEventListener("click", onCancelPower);
  element.querySelector("[data-flee]").addEventListener("click", onFlee);
  element.querySelector("[data-surrender]").addEventListener("click", onSurrender);

  function powerButton(user, powerId, cost) {
    const commander = user.kind === "hero" ? user : commanders.find((hero) => hero.playerId === user.playerId);
    const definition = battle.getSpecialPowerDefinition(powerId); const actualCost = definition?.activation?.cost ?? cost; const rank = user.aptitudeRanks?.[powerId];
    const disabled = battle.status !== "active" || !commander || commander.commandPoints < actualCost;
    return `<button type="button" class="${selectedPower?.userId === user.id && selectedPower.powerId === powerId ? "is-selected" : ""}" data-power-user="${user.id}" data-power-id="${powerId}" data-power-cost="${actualCost}" title="${definition?.description ?? powerId}" ${disabled ? "disabled" : ""}>${definition?.name ?? powerId}${rank ? `<small>${rank}</small>` : ""}<small>◆ ${actualCost}</small></button>`;
  }
}

function enablePointerDrag(item, element, onAssign, onDragState) {
  let active = false; let moved = false; let target = null;
  item.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse") return;
    event.preventDefault(); active = true; moved = false; onDragState(true); item.setPointerCapture?.(event.pointerId); item.classList.add("is-dragging");
  });
  item.addEventListener("pointermove", (event) => {
    if (!active) return;
    event.preventDefault(); moved = true;
    const next = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-line]");
    if (target !== next) { target?.classList.remove("is-drop-target"); target = next; target?.classList.add("is-drop-target"); }
  });
  const finish = (event) => {
    if (!active) return;
    event.preventDefault(); active = false; item.classList.remove("is-dragging"); target?.classList.remove("is-drop-target"); onDragState(false);
    if (moved && target && element.contains(target)) onAssign(item.dataset.unit, Number(target.dataset.line)); else item.click();
    target = null;
  };
  item.addEventListener("pointerup", finish);
  item.addEventListener("pointercancel", finish);
}

function findLatestAttacks(battle) {
  let latestElapsedMs = null; const attacks = [];
  for (let index = battle.eventLog.length - 1; index >= 0; index -= 1) {
    const event = battle.eventLog[index];
    if (!["attack", "breakthrough_attack", "retreat_attack"].includes(event.type)) continue;
    if (battle.state.elapsedMs - event.elapsedMs > 2_300) break;
    if (latestElapsedMs === null) latestElapsedMs = event.elapsedMs;
    if (event.elapsedMs !== latestElapsedMs) break;
    attacks.unshift(event);
  }
  return attacks;
}

function createAttackVisual(events, findEntity, positionFor, elapsedMs) {
  if (events.length === 0) return { svg: "", effects: "" };
  const lines = events.map((event) => {
    const attacker = findEntity(event.attackerId); const target = findEntity(event.targetId);
    if (!attacker || !target) return "";
    const attackerPosition = positionFor(attacker.entity, attacker.team); const targetPosition = positionFor(target.entity, target.team);
    const attackerX = attackerPosition.x; const targetX = targetPosition.x;
    const attackerY = ((attacker.entity.lane ?? 1) + attackerPosition.y / 100) * (100 / 3);
    const targetY = ((target.entity.lane ?? 1) + targetPosition.y / 100) * (100 / 3);
    if (attacker.entity.range <= 1) return "";
    if (String(attacker.entity.typeId).toLowerCase() === "archer") {
      const flightAgeMs = Math.min(1_800, Math.max(0, elapsedMs - event.elapsedMs));
      return formationProjectileOffsets(attacker.entity.combatantCount ?? attacker.entity.quantity ?? 0).map((offset) => {
        const startX = attackerX + offset.x; const startY = attackerY + offset.y;
        const endX = targetX + offset.x; const endY = targetY + offset.y;
        return `<g class="arrow-projectile" style="--flight-age:-${flightAgeMs}ms"><ellipse class="arrow-ground-shadow" cx="${startX}" cy="${startY + 2}" rx="1.25" ry=".32"></ellipse><line class="arrow-shaft" x1="${startX}" y1="${startY - 1.8}" x2="${startX}" y2="${startY + 1.8}"></line><animateTransform attributeName="transform" type="translate" from="0 0" to="${endX - startX} ${endY - startY}" dur="1.8s" begin="-${flightAgeMs / 1_000}s" fill="freeze"></animateTransform></g>`;
      }).join("");
    }
    return `<line class="is-ranged" x1="${attackerX}" y1="${attackerY}" x2="${targetX}" y2="${targetY}"></line>`;
  }).join("");
  const damageByTarget = new Map();
  events.forEach((event) => {
    const total = damageByTarget.get(event.targetId) ?? { damage: 0, losses: 0 };
    total.damage += event.damage ?? 0; total.losses += event.losses ?? 0; damageByTarget.set(event.targetId, total);
  });
  const effects = [...damageByTarget].map(([targetId, total]) => {
    const target = findEntity(targetId); if (!target) return "";
    const position = positionFor(target.entity, target.team); const x = position.x; const y = ((target.entity.lane ?? 1) + position.y / 100) * (100 / 3);
    const value = target.entity.kind === "hero" ? `-${total.damage} PV` : `-${total.damage} PV${total.losses > 0 ? ` · ${total.losses} mort${total.losses > 1 ? "s" : ""}` : ""}`;
    return `<span class="damage-pop ${target.entity.kind === "hero" ? "is-hero-damage" : "is-unit-loss"}" style="left:${x}%;top:${y}%">${value}</span>`;
  }).join("");
  return {
    svg: `<svg class="attack-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>`,
    effects,
  };
}

function animateMovement(element) {
  const present = new Set();
  element.querySelectorAll("[data-field-entity]").forEach((token) => {
    const id = token.dataset.fieldEntity; const current = { x: Number(token.dataset.x), y: Number(token.dataset.y) }; const previous = previousPositions.get(id);
    present.add(id);
    if (previous && (previous.x !== current.x || previous.y !== current.y) && typeof token.animate === "function") token.animate([{ left: `${previous.x}%`, top: `${previous.y}%` }, { left: `${current.x}%`, top: `${current.y}%` }], { duration: 480, easing: "linear" });
    previousPositions.set(id, current);
  });
  for (const id of previousPositions.keys()) if (!present.has(id)) previousPositions.delete(id);
}
