const previousPositions = new Map();

/** Vue animée : les unités progressent, les héros restent ancrés à leur camp. */
export function renderBattleView({ element, battle, playerTeamId, message, selectedUnitId = null, onSelectUnit, onAssign, onDragState, onRetreatLine, onActivatePower, onSurrender }) {
  const player = battle.teams.find((team) => team.id === playerTeamId);
  const enemy = battle.teams.find((team) => team.id !== playerTeamId);
  const allEntities = battle.teams.flatMap((team) => [...team.heroes, ...team.units].map((entity) => ({ entity, team })));
  const findEntity = (id) => allEntities.find((item) => item.entity.id === id) ?? null;
  const letter = (entity) => entity.kind === "hero" ? "H" : entity.symbol ?? "U";
  const latestAttacks = findLatestAttacks(battle);
  const latestAttack = latestAttacks[0] ?? null;
  const commanders = player.heroes.filter((hero) => hero.state === "active");
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
    const allied = team.id === playerTeamId;
    const x = 50;
    if (entity.kind === "hero") return { x: 50, y: allied ? 93 : 7 };
    const baseY = allied ? 87 - entity.progress * 74 : 13 + entity.progress * 74;
    return { x, y: Math.max(10, Math.min(90, baseY + index * (allied ? 4 : -4))) };
  };

  const fieldToken = (entity, team, index) => {
    const allied = team.id === playerTeamId; const position = positionFor(entity, team, index);
    const attacking = latestAttack?.attackerId === entity.id; const targeted = latestAttack?.targetId === entity.id;
    return `<article class="unit-token field-token ${allied ? "is-ally" : "is-enemy"} ${entity.kind === "hero" ? "is-hero" : ""} ${entity.range > 1 ? "is-ranged" : "is-melee"} ${attacking ? "is-attacking" : ""} ${targeted ? "is-targeted" : ""}" style="left:${position.x}%;top:${position.y}%" data-field-entity="${entity.id}" data-x="${position.x}" data-y="${position.y}" title="${entity.kind === "hero" ? "Héros immobile" : `${entity.name ?? entity.typeName ?? "Unité"} · ${entity.combatantCount} combattants · ${entity.woundedCount} blessés · ${Math.max(0, entity.maxQuantity - entity.combatantCount - entity.woundedCount)} morts ou places libres`}"><strong>${letter(entity)}</strong><small>${entity.kind === "hero" ? entity.health : entity.combatantCount}</small>${entity.kind === "unit" ? healthBar(entity) : ""}</article>`;
  };

  const lane = (index) => {
    const enemyHero = enemy.heroes.find((hero) => hero.lane === index && hero.state === "active");
    const playerHero = player.heroes.find((hero) => hero.lane === index && hero.state === "active");
    const enemyUnits = enemy.units.filter((unit) => unit.lane === index && unit.state === "active");
    const playerUnits = player.units.filter((unit) => unit.lane === index && unit.state === "active");
    const canRetreat = playerUnits.some((unit) => !unit.retreating) && battle.status === "active" && totalCommand >= retreatCost;
    return `<section class="vertical-lane" data-line="${index}" aria-label="Ligne ${index + 1}"><div class="lane-centerline"></div>${enemyHero ? fieldToken(enemyHero, enemy, 0) : ""}${enemyUnits.map((unit, unitIndex) => fieldToken(unit, enemy, unitIndex)).join("")}${playerUnits.map((unit, unitIndex) => fieldToken(unit, player, unitIndex)).join("")}${playerHero ? fieldToken(playerHero, player, 0) : ""}<button type="button" class="lane-retreat" data-retreat-line="${index}" aria-label="Faire retraiter l'unité la plus avancée de la colonne ${index + 1}" title="Retraite colonne ${index + 1} · ◆ ${retreatCost}" ${canRetreat ? "" : "disabled"}><span aria-hidden="true">↩</span><small>◆${retreatCost}</small></button></section>`;
  };

  const hand = player.units.filter((unit) => unit.lane === null && unit.state === "active");
  const handCard = (unit) => `<button type="button" class="unit-token hand-token is-ally ${unit.id === selectedUnitId ? "is-selected" : ""}" draggable="true" data-unit="${unit.id}" aria-label="Sélectionner ${unit.name ?? unit.typeName ?? "une unité"}, ${unit.combatantCount} combattants"><strong>${letter(unit)}</strong><small>${unit.combatantCount}</small>${healthBar(unit)}</button>`;
  const attackVisual = createAttackVisual(latestAttacks, findEntity, positionFor);

  const powers = commanders.flatMap((hero) => hero.specialPowerIds.map((powerId) => powerButton(hero, powerId, 1))).concat(player.units.filter((unit) => unit.state === "active").flatMap((unit) => unit.specialPowerIds.map((powerId) => powerButton(unit, powerId, 1)))).join("");
  const heroHud = (team, side) => `<div class="battle-hero-hud is-${side}">${team.heroes.map((hero) => `<span class="hero-health ${hero.state !== "active" ? "is-out" : ""}"><b>${hero.name ?? "H"}</b><i><em style="width:${Math.round(hero.health / hero.maxHealth * 100)}%"></em></i><small>${hero.health}/${hero.maxHealth}</small></span>`).join("")}</div>`;
  const countdown = battle.status === "countdown" ? `<div class="battle-countdown" role="status"><strong>${Math.max(1, Math.ceil(battle.state.countdownRemainingMs / 1_000))}</strong><span>Préparez vos lignes</span></div>` : "";
  element.innerHTML = `<div class="battle-screen"><main class="vertical-battlefield">${heroHud(enemy, "enemy")}${[0, 1, 2].map(lane).join("")}${heroHud(player, "player")}${attackVisual.svg}${attackVisual.effects}${countdown}</main><section class="battle-action-dock"><div class="battle-feedback" aria-live="polite">${message}</div><div class="battle-quick-actions"><span class="command-points">◆ ${totalCommand}</span><div class="power-buttons">${powers}</div><button type="button" class="surrender-button" data-surrender ${battle.status !== "active" ? "disabled" : ""}>Se rendre</button></div><section class="player-hand" aria-label="Unités disponibles"><div class="hand-cards">${hand.map(handCard).join("") || "<span>Toutes les unités sont engagées</span>"}</div><small>Glissez une unité vers une colonne</small></section></section></div>`;

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
    item.addEventListener("click", () => onSelectUnit(item.dataset.unit));
    enablePointerDrag(item, element, onAssign, onDragState);
  });
  element.querySelectorAll("[data-line]").forEach((target) => {
    target.addEventListener("dragenter", (event) => { event.preventDefault(); target.classList.add("is-drop-target"); });
    target.addEventListener("dragleave", () => target.classList.remove("is-drop-target"));
    target.addEventListener("dragover", (event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; });
    target.addEventListener("drop", (event) => { event.preventDefault(); target.classList.remove("is-drop-target"); const unitId = event.dataTransfer.getData("text/plain") || selectedUnitId; onDragState(false); if (unitId) onAssign(unitId, Number(target.dataset.line)); });
    target.addEventListener("click", (event) => { if (selectedUnitId && !event.target.closest("[data-unit], [data-retreat-line]")) onAssign(selectedUnitId, Number(target.dataset.line)); });
  });
  element.querySelectorAll("[data-retreat-line]").forEach((button) => button.addEventListener("click", () => onRetreatLine(Number(button.dataset.retreatLine))));
  element.querySelectorAll("[data-power-user]").forEach((button) => button.addEventListener("click", () => onActivatePower({ userId: button.dataset.powerUser, powerId: button.dataset.powerId, cost: Number(button.dataset.powerCost) })));
  element.querySelector("[data-surrender]").addEventListener("click", onSurrender);

  function powerButton(user, powerId, cost) {
    const commander = user.kind === "hero" ? user : commanders.find((hero) => hero.playerId === user.playerId);
    const disabled = battle.status !== "active" || !commander || commander.commandPoints < cost;
    return `<button type="button" data-power-user="${user.id}" data-power-id="${powerId}" data-power-cost="${cost}" ${disabled ? "disabled" : ""}>${powerId}<small>◆ ${cost}</small></button>`;
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
    if (battle.state.elapsedMs - event.elapsedMs > 1_200) break;
    if (latestElapsedMs === null) latestElapsedMs = event.elapsedMs;
    if (event.elapsedMs !== latestElapsedMs) break;
    attacks.unshift(event);
  }
  return attacks;
}

function createAttackVisual(events, findEntity, positionFor) {
  if (events.length === 0) return { svg: "", effects: "" };
  const lines = events.map((event) => {
    const attacker = findEntity(event.attackerId); const target = findEntity(event.targetId);
    if (!attacker || !target) return "";
    const attackerPosition = positionFor(attacker.entity, attacker.team); const targetPosition = positionFor(target.entity, target.team);
    const attackerX = (attacker.entity.lane + attackerPosition.x / 100) * (100 / 3);
    const targetX = (target.entity.lane + targetPosition.x / 100) * (100 / 3);
    if (attacker.entity.range <= 1) return "";
    return `<line class="is-ranged" x1="${attackerX}" y1="${attackerPosition.y}" x2="${targetX}" y2="${targetPosition.y}"></line>`;
  }).join("");
  const damageByTarget = new Map();
  events.forEach((event) => {
    const total = damageByTarget.get(event.targetId) ?? { damage: 0, losses: 0 };
    total.damage += event.damage ?? 0; total.losses += event.losses ?? 0; damageByTarget.set(event.targetId, total);
  });
  const effects = [...damageByTarget].map(([targetId, total]) => {
    const target = findEntity(targetId); if (!target) return "";
    const position = positionFor(target.entity, target.team); const x = (target.entity.lane + position.x / 100) * (100 / 3);
    const value = target.entity.kind === "hero" ? `-${total.damage} PV` : `-${total.damage} PV${total.losses > 0 ? ` · ${total.losses} mort${total.losses > 1 ? "s" : ""}` : ""}`;
    return `<span class="damage-pop ${target.entity.kind === "hero" ? "is-hero-damage" : "is-unit-loss"}" style="left:${x}%;top:${position.y}%">${value}</span>`;
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
