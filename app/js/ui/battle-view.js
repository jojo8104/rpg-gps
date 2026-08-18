const previousPositions = new Map();

/** Vue animée : les unités progressent, les héros restent ancrés à leur camp. */
export function renderBattleView({ element, battle, playerTeamId, message, selectedUnitId = null, onSelectUnit, onAssign, onDragState, onRetreatLine, onActivatePower, onSurrender }) {
  const player = battle.teams.find((team) => team.id === playerTeamId);
  const enemy = battle.teams.find((team) => team.id !== playerTeamId);
  const allEntities = battle.teams.flatMap((team) => [...team.heroes, ...team.units].map((entity) => ({ entity, team })));
  const findEntity = (id) => allEntities.find((item) => item.entity.id === id) ?? null;
  const letter = (entity) => entity.kind === "hero" ? "H" : entity.symbol ?? "U";
  const activeHeroes = (team) => team.heroes.filter((hero) => hero.state === "active").length;
  const latestAttacks = findLatestAttacks(battle);
  const latestAttack = latestAttacks[0] ?? null;
  const commanders = player.heroes.filter((hero) => hero.state === "active");
  const totalCommand = commanders.reduce((sum, hero) => sum + hero.commandPoints, 0);
  const retreatCost = battle.config.retreatCommandCost;

  const positionFor = (entity, team, index = 0) => {
    const allied = team.id === playerTeamId;
    const x = 50;
    if (entity.kind === "hero") return { x: 50, y: allied ? 93 : 7 };
    const baseY = allied ? 87 - entity.progress * 43 : 13 + entity.progress * 43;
    return { x, y: Math.max(10, Math.min(90, baseY + index * (allied ? 4 : -4))) };
  };

  const fieldToken = (entity, team, index) => {
    const allied = team.id === playerTeamId; const position = positionFor(entity, team, index);
    const attacking = latestAttack?.attackerId === entity.id; const targeted = latestAttack?.targetId === entity.id;
    return `<article class="unit-token field-token ${allied ? "is-ally" : "is-enemy"} ${entity.kind === "hero" ? "is-hero" : ""} ${attacking ? "is-attacking" : ""} ${targeted ? "is-targeted" : ""}" style="left:${position.x}%;top:${position.y}%" data-field-entity="${entity.id}" data-x="${position.x}" data-y="${position.y}" title="${entity.kind === "hero" ? "Héros immobile" : `Progression ${Math.round(entity.progress * 100)} %`}"><strong>${letter(entity)}</strong><small>${entity.kind === "hero" ? entity.health : entity.quantity}</small></article>`;
  };

  const lane = (index) => {
    const enemyHero = enemy.heroes.find((hero) => hero.lane === index && hero.state === "active");
    const playerHero = player.heroes.find((hero) => hero.lane === index && hero.state === "active");
    const enemyUnits = enemy.units.filter((unit) => unit.lane === index && unit.state === "active");
    const playerUnits = player.units.filter((unit) => unit.lane === index && unit.state === "active");
    return `<section class="vertical-lane" data-line="${index}" aria-label="Ligne ${index + 1}"><span class="vertical-lane-label">${index + 1}</span><div class="lane-centerline"></div>${enemyHero ? fieldToken(enemyHero, enemy, 0) : ""}${enemyUnits.map((unit, unitIndex) => fieldToken(unit, enemy, unitIndex)).join("")}${playerUnits.map((unit, unitIndex) => fieldToken(unit, player, unitIndex)).join("")}${playerHero ? fieldToken(playerHero, player, 0) : ""}</section>`;
  };

  const hand = player.units.filter((unit) => unit.lane === null && unit.state === "active");
  const handCard = (unit) => `<button type="button" class="unit-token hand-token is-ally ${unit.id === selectedUnitId ? "is-selected" : ""}" draggable="true" data-unit="${unit.id}" aria-label="Sélectionner ${unit.name ?? unit.typeName ?? "une unité"}, quantité ${unit.quantity}" title="${unit.name ?? unit.typeName ?? "Unité"} · comportement : ${unit.behavior}"><strong>${letter(unit)}</strong><small>${unit.quantity}</small></button>`;
  const attackVisual = createAttackVisual(latestAttacks, findEntity, positionFor);

  const commandCards = commanders.map((hero) => `<article class="command-card"><div><strong>${hero.name ?? "Héros"}</strong><span class="command-points">◆ ${hero.commandPoints}/${hero.maxCommandPoints}</span></div><small>Compétences passives : ${hero.skillIds.join(", ") || "aucune"}</small><div class="power-buttons">${hero.specialPowerIds.map((powerId) => powerButton(hero, powerId, 1)).join("") || "<span>Aucun pouvoir de héros</span>"}</div></article>`).join("");
  const unitPowerCards = player.units.filter((unit) => unit.state === "active" && unit.specialPowerIds.length > 0).map((unit) => `<article class="command-card unit-power-card"><small>${unit.name ?? unit.typeName ?? "Unité"}</small><div class="power-buttons">${unit.specialPowerIds.map((powerId) => powerButton(unit, powerId, 1)).join("")}</div></article>`).join("");
  element.innerHTML = `<div class="battle-screen"><header class="enemy-side"><strong>Héros ennemis : ${activeHeroes(enemy)}</strong></header><p class="battle-message">${message}</p><section class="command-panel" aria-label="Commandement"><div class="command-heading"><strong>Commandement</strong><span>◆ ${totalCommand} disponible${totalCommand > 1 ? "s" : ""}</span></div>${commandCards}${unitPowerCards}</section><main class="vertical-battlefield">${[0, 1, 2].map(lane).join("")}${attackVisual.svg}</main>${attackVisual.label}<section class="player-hand"><div><strong>Vos unités</strong><small>Glissez, ou touchez une unité puis une ligne</small></div><div class="hand-cards">${hand.map(handCard).join("") || "<span>Toutes les unités sont engagées</span>"}</div></section><footer class="player-side"><strong>Vos héros : ${activeHeroes(player)}</strong><button type="button" class="surrender-button" data-surrender ${battle.status !== "active" ? "disabled" : ""}>Se rendre</button></footer></div>`;

  const controls = [0, 1, 2].map((index) => {
    const available = player.units.some((unit) => unit.state === "active" && unit.lane === index && !unit.retreating);
    return `<button type="button" data-retreat-line="${index}" ${battle.status !== "active" || !available || totalCommand < retreatCost ? "disabled" : ""}>Retraite ${index + 1} <small>◆ ${retreatCost}</small></button>`;
  }).join("");
  element.querySelector(".vertical-battlefield").insertAdjacentHTML("afterend", `<div class="retreat-controls" aria-label="Ordres de retraite">${controls}</div>`);
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
    target.addEventListener("click", (event) => { if (selectedUnitId && !event.target.closest("[data-unit]")) onAssign(selectedUnitId, Number(target.dataset.line)); });
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
  if (events.length === 0) return { svg: "", label: "" };
  const lines = events.map((event) => {
    const attacker = findEntity(event.attackerId); const target = findEntity(event.targetId);
    if (!attacker || !target) return "";
    const attackerPosition = positionFor(attacker.entity, attacker.team); const targetPosition = positionFor(target.entity, target.team);
    const attackerX = (attacker.entity.lane + attackerPosition.x / 100) * (100 / 3);
    const targetX = (target.entity.lane + targetPosition.x / 100) * (100 / 3);
    return `<line x1="${attackerX}" y1="${attackerPosition.y}" x2="${targetX}" y2="${targetPosition.y}"></line>`;
  }).join("");
  const totalDamage = events.reduce((sum, event) => sum + event.damage, 0);
  return {
    svg: `<svg class="attack-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>`,
    label: `<p class="attack-caption">${events.length} attaque${events.length > 1 ? "s" : ""} simultanée${events.length > 1 ? "s" : ""} · ${totalDamage} dégâts</p>`,
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
