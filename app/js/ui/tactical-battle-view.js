import {
  tacticalBattleHelp,
  bindTacticalBattleHelp,
} from "./tactical-battle-help.js";
import { TACTICAL_BONUS_TYPES } from "../core/tactical-bonuses.js";
import { renderTacticalCombatEffects } from "./tactical-combat-effects.js";
import {
  captureTacticalActors,
  animateTacticalActors,
} from "./tactical-battle-animation.js";
import { renderUnitTypeIcon } from "./unit-icon.js";
import { renderTacticalTerrain } from "../map/tactical-terrain-renderer.js";

const terrainLabels = {
  grass: "Herbe",
  forest: "Forêt",
  hill: "Colline",
  rock: "Relief rocheux",
  water: "Eau",
};
const structureLabels = {
  bridge: "Pont",
  tower: "Tour",
  barricade: "Barricade",
  village: "Village",
};

const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const labels = {
  DEPLOY: "Déployer",
  MOVE: "Déplacer",
  ATTACK: "Attaquer",
  ATTACK_BASE: "Attaquer le commandant",
  DEFEND: "Défense",
  SPEAR_WALL: "Mur de lances",
  RALLY: "Rallier",
  CHARGE: "Charge",
  HARASS: "Harceler",
};
const actorsForView = (state) => [
  ...state.troops,
  ...state.players.map((player) => ({
    ...player.hero,
    id: `HERO:${player.id}`,
    ownerId: player.id,
    isHero: true,
    type: player.hero.name,
    count: 1,
  })),
];
const sprite = (actor) => {
  const type = actor.typeId;
  const path = actor.isHero
    ? "units/hero-player.png"
    : ["archer", "militia", "light-cavalry"].includes(type)
      ? `oldunits/${type}-walk.png`
      : [
            "spearman",
            "swordsman",
            "heavy-infantry",
            "heavy-cavalry",
            "mounted-archer",
            "chaos-raider",
          ].includes(type)
        ? `units/${type}-walk.png`
        : null;
  return path ? new URL(`../../assets/${path}`, import.meta.url).href : null;
};
const art = (actor) => {
  const url = sprite(actor);
  return url
    ? `<i class="tactics-sprite ${actor.isHero ? "is-hero" : ""}" style="--tactics-sprite:url('${escape(url)}')" aria-hidden="true"></i>`
    : renderUnitTypeIcon({ typeId: actor.typeId, range: actor.range });
};
function base(actor) {
  const maximum = Math.max(1, actor.isHero ? actor.maxHealth : actor.maxCount);
  const fit = Math.min(
    100,
    (100 * (actor.isHero ? actor.health : actor.count)) / maximum,
  );
  const wounded = Math.min(
    100 - fit,
    (100 *
      (actor.isHero
        ? actor.maxHealth - actor.health
        : (actor.woundedCount ?? 0))) /
      maximum,
  );
  return `<span class="tactics-plinth"><b>${escape(actor.isHero ? `${actor.health} PV` : actor.count)}</b><span class="tactics-health" role="img" aria-label="${escape(actor.isHero ? `${actor.health}/${actor.maxHealth} PV` : `${actor.count} aptes, ${actor.woundedCount ?? 0} blessés`)}"><i style="width:${fit}%"></i><i style="width:${wounded}%"></i></span></span>`;
}

/** Affiche l'état et les options officiels ; les clics ne font que créer des intentions. */
export function renderTacticalBattleView({
  element,
  battle,
  teamId,
  selected,
  orders,
  fanOpen,
  specialOpen,
  charge,
  harassing,
  submitting,
  playback,
  onSkipPlayback,
  message,
  onFan,
  onSelect,
  onCell,
  onSpecial,
  onBase,
  onCancel,
  onPriority,
  onLock,
  onFlee,
}) {
  const previousActors = captureTacticalActors(element);
  const state = battle.duel,
    board = state.tactics;
  const player = state.players.find((entry) => entry.id === teamId);
  const enemy = state.players.find((entry) => entry.id !== teamId);
  const locked = player.locked || submitting || Boolean(playback);
  const actors = actorsForView(state);
  const own = actors.filter(
    (actor) =>
      actor.ownerId === teamId &&
      (actor.isHero
        ? actor.health > 0
        : actor.count > 0 &&
          !["ROUTED", "DESTROYED", "INCAPACITATED"].includes(
            actor.tacticalState,
          )),
  );
  const reserves = own.filter((actor) => !board.positions[actor.id]);
  const centralIndex = Math.max(
    0,
    reserves.findIndex((actor) => actor.id === selected),
  );
  const fanOffset = (index) => {
    let offset = (index - centralIndex + reserves.length) % reserves.length;
    if (offset > reserves.length / 2) offset -= reserves.length;
    return offset;
  };
  const flip = state.players[0].id !== teamId;
  const displayY = (y) => (flip ? 4 - y : y);
  const displayX = (x) => (flip ? 2 - x : x);
  const selectedActor = actors.find((actor) => actor.id === selected);
  const options = board.options[selected] ?? {
    move: [],
    charge: [],
    deploy: [],
    attack: [],
    specials: [],
  };
  const destinations = board.positions[selected]
    ? charge
      ? options.charge
      : options.move
    : options.deploy;
  const cellElements = Array.from({ length: 15 }, (_, index) => {
    const p = { x: displayX(index % 3), y: displayY(Math.floor(index / 3)) };
    const pickup = board.bonuses?.pickup;
    const cellBonus =
      pickup?.position.x === p.x && pickup?.position.y === p.y ? pickup : null;
    const bonusInfo = cellBonus && TACTICAL_BONUS_TYPES[cellBonus.type];
    const occupant = actors.find(
      (actor) =>
        board.positions[actor.id]?.x === p.x &&
        board.positions[actor.id]?.y === p.y,
    );
    const planned = orders.find(
      (order) => order.to?.x === p.x && order.to?.y === p.y,
    );
    const orderIndex = occupant
      ? orders.findIndex((order) => order.actorId === occupant.id)
      : -1;
    const allowed = destinations.some(
      (target) => target.x === p.x && target.y === p.y,
    );
    const attackable =
      occupant &&
      (harassing ? (options.harass ?? []) : options.attack).includes(
        occupant.id,
      );
    const ghost =
      planned && !occupant
        ? actors.find((actor) => actor.id === planned.actorId)
        : null;
    const contested = playback?.events.some(
      (event) =>
        event.type === "contest" && event.to?.x === p.x && event.to?.y === p.y,
    );
    const ally = occupant?.ownerId === teamId;
    const terrainCell = board.battlefield?.cells[p.y]?.[p.x];
    const terrainName = terrainCell
      ? ` · ${terrainLabels[terrainCell.terrain]}${terrainCell.structure ? ` · ${structureLabels[terrainCell.structure.kind]}` : ""}`
      : "";
    const accessibleName = `${String.fromCharCode(65 + (index % 3))}${Math.floor(index / 3) + 1}${terrainName}${bonusInfo ? ` · Bonus ${bonusInfo.label}` : ""}${occupant ? ` · ${occupant.type} · ${ally ? "allié" : "ennemi"}` : " · libre"}${attackable ? " · attaquer" : allowed ? " · destination possible" : ""}`;
    return `<button type="button" class="tactics-cell ${contested ? "is-contested" : ""} ${index >= 12 ? "own-camp" : index < 3 ? "enemy-camp" : ""} ${occupant ? (ally ? "ally" : "enemy") : ""} ${selected === occupant?.id ? "selected" : ""} ${attackable ? "attackable" : allowed ? "reachable" : ""}" data-tactics-cell="${index}" aria-label="${escape(accessibleName)}" ${locked ? "disabled" : ""}><small class="tactics-coordinate">${String.fromCharCode(65 + (index % 3))}${Math.floor(index / 3) + 1}</small>${bonusInfo ? `<span class="tactics-pickup" title="${escape(bonusInfo.label)}" aria-hidden="true">${bonusInfo.icon}</span>` : ""}${occupant ? `<span class="tactics-actor" data-tactics-actor="${escape(occupant.id)}">${art(occupant)}${base(occupant)}<span class="tactics-unit-name">${escape(occupant.type)}</span>${orderIndex >= 0 ? `<b class="tactics-priority">${orderIndex + 1}</b>` : ""}</span>` : ghost ? `<span class="tactics-ghost">${art(ghost)}<b>${orders.indexOf(planned) + 1}</b></span>` : allowed ? '<span class="tactics-target">＋</span>' : ""}</button>`;
  }).join("");
  const arrows = orders
    .map((order, index) => {
      const from = board.positions[order.actorId];
      const to = order.to ?? board.positions[order.targetId];
      if (!from || !to) return "";
      const color = order.type === "ATTACK" ? "#ffad87" : "#b2f9e8";
      const start = {
        x: displayX(from.x) * 100 + 50,
        y: displayY(from.y) * 100 + 50,
      };
      const end = {
        x: displayX(to.x) * 100 + 50,
        y: displayY(to.y) * 100 + 50,
      };
      return `<line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" stroke="${color}" stroke-width="3" stroke-dasharray="7 4" marker-end="url(#tactics-arrow)"/><text x="${(start.x + end.x) / 2}" y="${(start.y + end.y) / 2}" fill="${color}" stroke="#14261e" stroke-width="3" paint-order="stroke" font-size="18" text-anchor="middle">${index + 1}</text>`;
    })
    .join("");
  const weather = state.encounter.weather.label;
  element.innerHTML = `<div class="tactics-layout">
    <header class="tactics-header"><div><strong>Tour ${state.round}</strong><small>${escape(weather)}</small></div><span class="duel-clock" data-duel-clock>—</span><div class="tactics-header-actions"><button type="button" data-tactics-info aria-label="Notice du combat">i</button><button type="button" class="tactics-confirm" data-tactics-lock aria-label="${orders.length ? "Valider les ordres" : "Tenir les positions et passer le tour"}" ${locked ? "disabled" : ""}>${submitting ? "…" : player.locked ? "✓" : "✓"} ${orders.length}/${player.orderBudget}</button></div></header>
    ${playback ? `<div class="tactics-playback" role="status"><strong>Tour ${playback.round} · ${playback.priority ? `Ordre ${playback.priority} · ${playback.stage === "move" ? "Déplacements" : playback.stage === "return" ? "Retours et avancées" : "Combats"}` : "Résolution des ordres"}</strong><button type="button" data-tactics-skip>Passer</button></div>` : ""}
    <div class="tactics-camp"><span>${escape(enemy.hero.name)} · ${enemy.hero.health}/${enemy.hero.maxHealth} PV · Moral ${enemy.cohesion}/20</span><button type="button" data-tactics-base ${!options.base || locked ? "disabled hidden" : ""} aria-label="Viser le commandant">🎯</button></div>
    <div class="tactics-map ${playback ? "is-playing" : ""}">${board.battlefield ? '<canvas class="tactics-terrain" data-tactics-terrain aria-hidden="true"></canvas>' : ""}<div class="tactics-grid" aria-label="Champ de bataille, trois colonnes et cinq rangées">${cellElements}</div><svg class="tactics-arrows" viewBox="0 0 300 500" preserveAspectRatio="none" aria-hidden="true"><defs><marker id="tactics-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#b2f9e8"/></marker></defs>${arrows}</svg></div>
    <div class="tactics-own-camp"><span>${escape(player.hero.name)} · ${player.hero.health}/${player.hero.maxHealth} PV · Moral ${player.cohesion}/20</span></div>
    <div class="tactics-selection" role="status">${selectedActor ? `<strong>${escape(selectedActor.type)}</strong> · ${selectedActor.isHero ? `${selectedActor.health} PV` : `${selectedActor.count} aptes · ${selectedActor.woundedCount ?? 0} blessés`}` : ""}</div>
    ${specialOpen && selectedActor ? `<div class="tactics-specials">${options.specials.map((type) => `<button type="button" data-tactics-special="${type}" ${locked ? "disabled" : ""}>${labels[type]}</button>`).join("")}<button type="button" data-tactics-cancel="${escape(selected)}">Annuler son ordre</button></div>` : ""}
    ${selectedActor && orders.some((order) => order.actorId === selected) ? `<div class="tactics-priority-controls"><button type="button" data-tactics-up="${orders.findIndex((order) => order.actorId === selected)}" aria-label="Exécuter l’ordre sélectionné plus tôt" ${locked ? "disabled" : ""}>↑</button><button type="button" data-tactics-down="${orders.findIndex((order) => order.actorId === selected)}" aria-label="Exécuter l’ordre sélectionné plus tard" ${locked ? "disabled" : ""}>↓</button><button type="button" data-tactics-cancel="${escape(selected)}" aria-label="Annuler l’ordre sélectionné" ${locked ? "disabled" : ""}>×</button></div>` : ""}
    ${submitting || player.locked || (message && !message.startsWith("Ordre programmé") && !message.startsWith("Ordres confirmés")) ? `<p class="tactics-message" role="status">${escape(submitting ? "Envoi…" : player.locked ? "Attente de l’adversaire…" : message)}</p>` : ""}
    <button type="button" class="tactics-flee-compact" data-tactics-flee aria-label="Fuir le combat" ${locked ? "disabled" : ""}>↩</button>
    <button type="button" class="tactics-fan-handle" data-tactics-fan aria-expanded="${fanOpen}" ${locked ? "disabled" : ""}>${fanOpen ? "⌄ Fermer" : "⌃ Cartes de réserve"} · ${reserves.length}</button>
    ${tacticalBattleHelp()}
    ${fanOpen ? `<section class="tactics-fan" aria-label="Cartes de réserve"><button type="button" data-tactics-prev aria-label="Carte précédente">‹</button><div class="tactics-fan-cards">${reserves.map((actor, index) => `<button type="button" data-tactics-card="${escape(actor.id)}" data-card-index="${index}" aria-pressed="${selected === actor.id}" style="--offset:${fanOffset(index)};--abs-offset:${Math.abs(fanOffset(index))};--card-layer:${10 - Math.abs(fanOffset(index))};visibility:${Math.abs(fanOffset(index)) > 2 ? "hidden" : "visible"}" class="tactics-reserve-card ${index === centralIndex ? "selected" : ""}">${art(actor)}<strong>${escape(actor.type)}</strong>${base(actor)}<small>${actor.isHero ? "Héros" : `${actor.count} aptes · ${actor.woundedCount ?? 0} blessés`}</small></button>`).join("") || "Toutes vos forces sont déployées."}</div><button type="button" data-tactics-next aria-label="Carte suivante">›</button><button type="button" class="tactics-fan-close" data-tactics-close>Choisir une case ↓</button></section>` : ""}
  </div>`;
  bindTacticalBattleHelp(element);
  animateTacticalActors(element, previousActors, playback, flip);
  renderTacticalCombatEffects(element, playback, flip);
  element
    .querySelector("[data-tactics-skip]")
    ?.addEventListener("click", onSkipPlayback);
  const terrainCanvas = element.querySelector("[data-tactics-terrain]");
  if (terrainCanvas && board.battlefield) {
    renderTacticalTerrain(terrainCanvas, board.battlefield, flip).catch(() => {
      if (terrainCanvas.isConnected)
        terrainCanvas
          .closest(".tactics-map")
          ?.classList.add("terrain-unavailable");
    });
  }
  element.querySelectorAll("[data-tactics-cell]").forEach((button) =>
    button.addEventListener("click", () => {
      const index = Number(button.dataset.tacticsCell);
      const p = { x: displayX(index % 3), y: displayY(Math.floor(index / 3)) };
      onCell(
        p,
        actors.find(
          (actor) =>
            board.positions[actor.id]?.x === p.x &&
            board.positions[actor.id]?.y === p.y,
        ),
      );
    }),
  );
  element
    .querySelectorAll("[data-tactics-special]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        onSpecial(button.dataset.tacticsSpecial),
      ),
    );
  element
    .querySelectorAll("[data-tactics-cancel]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        onCancel(button.dataset.tacticsCancel),
      ),
    );
  element
    .querySelectorAll("[data-tactics-up]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        onPriority(Number(button.dataset.tacticsUp), -1),
      ),
    );
  element
    .querySelectorAll("[data-tactics-down]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        onPriority(Number(button.dataset.tacticsDown), 1),
      ),
    );
  for (const [selector, callback] of [
    ["[data-tactics-base]", onBase],
    ["[data-tactics-lock]", onLock],
    ["[data-tactics-flee]", onFlee],
    ["[data-tactics-close]", onFan],
  ])
    element.querySelector(selector)?.addEventListener("click", callback);
  let suppressFanClick = false,
    fanDragged = false;
  element.querySelectorAll("[data-tactics-card]").forEach((button) =>
    button.addEventListener("click", () => {
      if (!fanDragged) onSelect(button.dataset.tacticsCard);
    }),
  );
  const rotate = (delta) => {
    if (!reserves.length) return;
    const index = Math.max(
      0,
      reserves.findIndex((actor) => actor.id === selected),
    );
    onSelect(reserves[(index + delta + reserves.length) % reserves.length].id);
  };
  element
    .querySelector("[data-tactics-prev]")
    ?.addEventListener("click", () => rotate(-1));
  element
    .querySelector("[data-tactics-next]")
    ?.addEventListener("click", () => rotate(1));

  let pointerStart = null;
  const handle = element.querySelector("[data-tactics-fan]");
  handle?.addEventListener("click", () => {
    if (suppressFanClick) {
      suppressFanClick = false;
      return;
    }
    onFan();
  });
  handle?.addEventListener("pointerdown", (event) => {
    pointerStart = { x: event.clientX, y: event.clientY };
    handle.setPointerCapture(event.pointerId);
  });
  handle?.addEventListener("pointerup", (event) => {
    if (pointerStart && pointerStart.y - event.clientY > 25 && !fanOpen) {
      event.preventDefault();
      suppressFanClick = true;
      onFan();
    }
    pointerStart = null;
  });
  const fan = element.querySelector(".tactics-fan-cards");
  if (fan) {
    let start;
    fan.addEventListener("pointerdown", (event) => {
      start = event.clientX;
      fanDragged = false;
    });
    fan.addEventListener("pointerup", (event) => {
      if (start !== undefined && Math.abs(event.clientX - start) > 40) {
        fanDragged = true;
        rotate(event.clientX < start ? 1 : -1);
      }
      start = undefined;
    });
  }
}
