import { renderUnitTypeIcon } from "./unit-icon.js";

const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const playable = (troop) =>
  troop.count > 0 &&
  !["ROUTED", "DESTROYED", "INCAPACITATED"].includes(troop.tacticalState);
const seenResults = new Map();
const MAX_VISIBLE_SOLDIERS = 24;
const whole = (value) => Math.round(Number(value) || 0);
const spriteAsset = (folder, file) =>
  new URL(`../../assets/${folder}/${file}`, import.meta.url).href;
const sprite = (card) => {
  if (card.isHero) return spriteAsset("units", "hero-player.png");
  const type = String(card.typeId ?? "").toLowerCase();
  const asset = {
    militia: ["oldunits", "militia-walk.png"],
    archer: ["oldunits", "archer-walk.png"],
    "light-cavalry": ["oldunits", "light-cavalry-walk.png"],
    spearman: "spearman-walk.png",
    swordsman: "swordsman-walk.png",
    "heavy-infantry": "heavy-infantry-walk.png",
    "heavy-cavalry": "heavy-cavalry-walk.png",
    "mounted-archer": "mounted-archer-walk.png",
    "chaos-raider": "chaos-raider-walk.png",
  }[type];
  return asset
    ? Array.isArray(asset)
      ? spriteAsset(...asset)
      : spriteAsset("units", asset)
    : null;
};

export function updateDuelCountdown(element, deadlineAt) {
  const clock = element.querySelector("[data-duel-clock]");
  if (!clock) return;
  if (element.querySelector(".duel-replay")) {
    clock.textContent = "0";
    clock.classList.remove("urgent");
    return;
  }
  const seconds = Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000));
  clock.textContent = String(seconds);
  clock.classList.toggle("urgent", seconds <= 5);
}

export function renderBattleDuelView({
  element,
  battle,
  teamId,
  selectedCards,
  order,
  message,
  submitting = false,
  onToggleCard,
  onPlayCard,
  onReplayEnd,
  onOrder,
  onLock,
  onPass,
  onFlee,
}) {
  const state = battle.duel;
  const player = state.players.find((entry) => entry.id === teamId);
  const enemy = state.players.find((entry) => entry.id !== teamId);
  const locked = player.locked || submitting;
  const maxCards = 1 + player.extraCardsNext;
  const ownCards = state.troops.filter((troop) => troop.ownerId === teamId);
  const enemyCards = state.troops.filter(
    (troop) =>
      troop.ownerId === enemy.id && (troop.available ?? playable(troop)),
  );
  const selectedTroops = ownCards.filter((troop) =>
    selectedCards.includes(troop.id),
  );
  const canCharge = selectedTroops.some((troop) =>
    /caval|mounted|horse/i.test(troop.typeId ?? ""),
  );
  const cost =
    (order === "ATTACK" ? 0 : 1) + (selectedCards.includes("HERO") ? 1 : 0);
  const report = state.lastResult;
  const animate = report && seenResults.get(battle.id) !== report.round;
  if (animate) seenResults.set(battle.id, report.round);
  const scene = animate ? report.encounter : state.encounter;
  const replayEntries = (sideId) => {
    const entries = report.combatants[sideId] ?? [];
    if (entries.length) return entries;
    const side = state.players.find((entry) => entry.id === sideId);
    const after = side.hero.health;
    return [
      {
        id: side.hero.id,
        type: side.hero.name,
        isHero: true,
        before: after + (report.heroDamage?.[sideId] ?? 0),
        after,
        maxCount: side.hero.maxHealth,
        woundedCount: 0,
      },
    ];
  };
  const selectedEntries = selectedCards
    .map((id) =>
      id === "HERO"
        ? {
            ...player.hero,
            type: player.hero.name,
            isHero: true,
            count: player.hero.health,
            maxCount: player.hero.maxHealth,
          }
        : ownCards.find((troop) => troop.id === id),
    )
    .filter(Boolean);
  const healthHud = (entries, side, replaying = false) => {
    if (!entries)
      return `<div class="duel-health ${side} secret"><div class="duel-health-track"><i></i></div><small>Carte cachée</small></div>`;
    const maximum = Math.max(
      1,
      entries.reduce(
        (sum, entry) =>
          sum + (entry.maxCount ?? entry.count ?? entry.before ?? 1),
        0,
      ),
    );
    const activeBefore = entries.reduce(
      (sum, entry) =>
        sum + (replaying ? entry.before : (entry.count ?? entry.health ?? 0)),
      0,
    );
    const activeAfter = entries.reduce(
      (sum, entry) => sum + (entry.after ?? entry.count ?? entry.health ?? 0),
      0,
    );
    const wounded = entries.reduce(
      (sum, entry) =>
        sum +
        (entry.isHero
          ? activeAfter > 0
            ? Math.max(
                0,
                (entry.maxCount ?? 1) - (entry.after ?? entry.health ?? 0),
              )
            : 0
          : (entry.woundedCount ?? 0)),
      0,
    );
    const woundedBefore = replaying
      ? entries.reduce(
          (sum, entry) =>
            sum +
            (entry.isHero
              ? Math.max(0, (entry.maxCount ?? entry.before) - entry.before)
              : (entry.woundedBefore ?? entry.woundedCount ?? 0)),
          0,
        )
      : wounded;
    const greenStart = Math.min(
      100,
      Math.round((100 * activeBefore) / maximum),
    );
    const greenEnd = Math.min(100, Math.round((100 * activeAfter) / maximum));
    const red = Math.min(100 - greenEnd, Math.round((100 * wounded) / maximum));
    const redStart = Math.min(
      100 - greenStart,
      Math.round((100 * woundedBefore) / maximum),
    );
    const blackStart = Math.max(0, 100 - greenStart - redStart);
    const blackEnd = Math.max(0, 100 - greenEnd - red);
    return `<div class="duel-health ${side} ${replaying ? "replaying" : ""}" style="--fit-start:${greenStart}%;--fit-end:${greenEnd}%;--red-start:${redStart}%;--red:${red}%;--lost-start:${blackStart}%;--lost-end:${blackEnd}%"><div class="duel-health-track" role="img" aria-label="${greenEnd}% aptes, ${red}% blessés, ${blackEnd}% morts ou absents"><i class="fit"></i><i class="wounded"></i><i class="lost"></i></div><small>${escape(entries.map((entry) => entry.type ?? entry.name).join(" + "))}</small></div>`;
  };
  const modifiers = [
    scene.terrain.id === "FOREST"
      ? "Lieu · cavalerie −25 %"
      : scene.terrain.id === "HILL"
        ? "Lieu · distance +15 %"
        : scene.terrain.id === "RIVER"
          ? "Lieu · cavalerie −20 %"
          : scene.terrain.id === "CAMP"
            ? "Lieu · défenseur +20 % défense"
            : "Lieu · 0 %",
    scene.weather.id === "RAIN"
      ? "Météo · distance −25 %"
      : scene.weather.id === "FOG"
        ? "Météo · distance −20 %"
        : scene.weather.id === "SNOW"
          ? "Météo · attaque −10 %"
          : "Météo · 0 %",
  ];
  const rewardSide =
    animate && report.reward?.ownerId
      ? report.reward.ownerId === teamId
        ? "own"
        : "enemy"
      : "";
  const stats = (entry) =>
    `<span class="duel-card-stats"><span>⚔ ${whole(entry.attack)}</span><span>◆ ${whole(entry.defense)}</span><span>⌖ ${whole(entry.range ?? 1)}</span><span>➜ ${whole(entry.speed ?? 3)}</span></span>`;
  const card = (
    troop,
  ) => `<button type="button" class="duel-card ${selectedCards.includes(troop.id) ? "selected" : ""} ${!playable(troop) ? "inactive" : ""}" aria-pressed="${selectedCards.includes(troop.id)}" data-duel-card="${escape(troop.id)}" ${locked || !playable(troop) ? "disabled" : ""}>
    <span class="duel-card-head"><strong>${escape(troop.type)}</strong><small>♥ ${whole(troop.morale)}</small></span>
    <span class="duel-card-art">${selectedCards.includes(troop.id) ? stats(troop) : renderUnitTypeIcon({ typeId: troop.typeId ?? troop.type, range: troop.range })}</span>
    <span class="duel-card-count">${whole(troop.count)} aptes · ${whole(troop.woundedCount)} blessés</span>
    <small>${troop.tacticalState === "READY" ? "Prête" : escape(troop.tacticalState)}</small>
  </button>`;
  const formation = (entries, side) => {
    if (!entries.length) return "";
    const soldiers = entries.flatMap((entry) => {
      const visible = entry.isHero
        ? 1
        : Math.min(entry.before, MAX_VISIBLE_SOLDIERS);
      const dead = entry.isHero
        ? (entry.after ?? entry.before) <= 0
        : Math.min(
            visible,
            Math.max(
              0,
              entry.deadCount === undefined
                ? entry.before - (entry.after ?? entry.before)
                : entry.deadCount - (entry.deadBefore ?? 0),
            ),
          );
      const wounded = entry.isHero
        ? 0
        : Math.min(
            visible - dead,
            Math.max(0, (entry.woundedCount ?? 0) - (entry.woundedBefore ?? 0)),
          );
      return Array.from({ length: visible }, (_, index) => ({
        entry,
        dead: index >= visible - dead,
        wounded: index >= visible - dead - wounded && index < visible - dead,
      }));
    });
    return `<div class="duel-formation ${side}"><div class="duel-soldiers">${soldiers
      .map(({ entry, dead, wounded }, index) => {
        const art = sprite(entry);
        return `<i class="duel-soldier ${entry.isHero ? "hero" : ""} ${dead ? "dead" : ""} ${wounded ? "wounded" : ""}" style="--duel-sprite:url('${art ?? ""}');--slot:${index};--col:${index % 5};--row:${Math.floor(index / 5)}" aria-hidden="true"></i>`;
      })
      .join("")}</div></div>`;
  };
  element.innerHTML = `<div class="duel-board">
    <section class="duel-opponent"><strong>${escape(enemy.hero.name)} · ${whole(enemy.hero.health)}/${whole(enemy.hero.maxHealth)} PV</strong><div class="duel-opponent-hand">${
      enemyCards
        .slice(0, 7)
        .map(() => '<span class="duel-card-back">✦</span>')
        .join("") || "<small>Le héros est seul</small>"
    }</div><small>${enemy.locked ? "Choix verrouillé" : "Choix en cours"}</small></section>
    <main class="duel-arena terrain-${escape(scene.terrain.id.toLowerCase())} weather-${escape(scene.weather.id.toLowerCase())}" data-duel-dropzone>
      <div class="duel-weather" aria-hidden="true"></div>
      <div class="duel-combat-hud">${healthHud(animate ? replayEntries(enemy.id) : null, "enemy", animate)}<span class="duel-clock" data-duel-clock>15</span>${healthHud(animate ? replayEntries(teamId) : selectedEntries, "own", animate)}</div>
      <div class="duel-reward ${rewardSide ? `falling ${rewardSide}` : ""}">◆ ${escape(scene.reward.label)}</div>
      <div class="duel-conditions"><span>⌖ ${escape(scene.terrain.label)}</span><span>☁ ${escape(scene.weather.label)}</span></div>
      <div class="duel-stakes"><small>Règle · ${escape(scene.twist.label)}</small></div>
      <div class="duel-modifiers">${modifiers.map((modifier) => `<span>${escape(modifier)}</span>`).join("")}</div>
      ${!locked && !animate ? `<button type="button" class="duel-fight" data-duel-lock ${!selectedCards.length || cost > player.commandPointsMax ? "disabled" : ""}>Engager le duel</button>` : ""}
      ${state.phase === "CHOICE" && !locked && !animate ? `<div class="duel-field-actions">${!selectedCards.length ? '<button type="button" data-duel-pass>Passer</button>' : ""}<button type="button" data-duel-flee title="Quitter la bataille et concéder la victoire">Fuir</button></div>` : ""}
      ${locked && !animate ? `<div class="duel-waiting" role="status">${submitting ? "Envoi du choix…" : "Choix confirmé · l’adversaire prépare son action"}</div>` : ""}
      ${state.ambush && state.round <= state.ambush.expiresAfterRound && !animate ? `<div class="duel-feedback" role="status">Embuscade : bonus d’attaque et malus de défense des troupes pendant ce duel.</div>` : ""}
      ${message && message !== "Choix validé." && !animate ? `<div class="duel-feedback" role="status">${escape(message)}</div>` : ""}
      ${animate ? `<div class="duel-replay" aria-live="polite"><div class="duel-replay-fighters">${formation(replayEntries(enemy.id), "enemy")}${formation(replayEntries(teamId), "own")}</div><button type="button" class="duel-skip-replay" data-duel-skip>Continuer</button><div class="duel-replay-result"><strong>${report.winnerId === teamId ? "Duel remporté" : report.winnerId === enemy.id ? "Duel perdu" : "Duel sans vainqueur"}</strong><small>${report.reward ? escape(report.reward.label) : "Aucune récompense"}</small></div></div>` : ""}
    </main>
    <section class="duel-hand"><div class="duel-hand-head"><strong>Manche ${whole(state.round)} · Vos forces</strong><small>◆ ${Math.max(0, player.commandPointsMax - cost)} PC · ${selectedCards.length}/${maxCards} carte${maxCards > 1 ? "s" : ""}</small></div><div class="duel-carousel"><button type="button" class="duel-card hero-card ${selectedCards.includes("HERO") ? "selected" : ""}" aria-pressed="${selectedCards.includes("HERO")}" data-duel-card="HERO" ${locked ? "disabled" : ""}><span class="duel-card-head"><strong>${escape(player.hero.name)}</strong><small>♥ ${whole(player.hero.health)}</small></span><span class="duel-card-art">${selectedCards.includes("HERO") ? stats(player.hero) : '<img src="assets/units/hero-player.png" alt="">'}</span><span class="duel-card-count">Héros · 1 PC</span></button>${ownCards.map(card).join("")}</div></section>
    <details class="duel-rules"><summary>Comment jouer ?</summary><p>Choisissez une force, puis une technique et engagez le duel. Normale répartit la vitesse entre attaque et défense. Défense consacre la vitesse à la protection ; Charge à l’attaque de la première passe. Le serveur résout jusqu’à trois passes simultanées (davantage en Duel à mort). Passer expose votre héros ; fuir concède la victoire. Les blessures persistent.</p></details>
    <section class="duel-orders" aria-label="Technique">${selectedCards.length && !locked ? `<button type="button" data-duel-order="ATTACK" title="Vitesse : moitié attaque, moitié défense" class="${order === "ATTACK" ? "chosen" : ""}">⚔ Normale</button><button type="button" data-duel-order="DEFEND" title="Toute la vitesse en défense" class="${["DEFEND", "SPEAR_WALL"].includes(order) ? "chosen" : ""}">◆ Défense · 1 PC</button>${canCharge ? `<button type="button" data-duel-order="CHARGE" title="Toute la vitesse en attaque à la première passe, puis répartition normale" class="${order === "CHARGE" ? "chosen" : ""}">➜ Charge · 1 PC</button>` : ""}` : ""}</section>
  </div>`;
  updateDuelCountdown(
    element,
    battle.decisionDeadlineAt ?? Date.now() + 15_000,
  );
  if (animate) {
    const replay = element.querySelector(".duel-replay");
    let timer;
    const endReplay = () => {
      clearTimeout(timer);
      // A timer from an old render must never dismiss a newer replay.
      if (element.querySelector(".duel-replay") !== replay) return;
      replay.remove();
      onReplayEnd?.();
    };
    element
      .querySelector("[data-duel-skip]")
      ?.addEventListener("click", endReplay);
    timer = setTimeout(endReplay, 4000);
  }
  element.querySelectorAll("[data-duel-card]").forEach((button) => {
    let start = null;
    let dragged = false;
    let ghost = null;
    button.addEventListener("pointerdown", (event) => {
      if (button.disabled) return;
      start = { x: event.clientX, y: event.clientY };
      dragged = false;
      button.setPointerCapture(event.pointerId);
    });
    button.addEventListener("pointermove", (event) => {
      if (!start) return;
      if (
        !dragged &&
        Math.hypot(event.clientX - start.x, event.clientY - start.y) < 9
      )
        return;
      if (!dragged) {
        dragged = true;
        ghost = button.cloneNode(true);
        ghost.classList.add("duel-drag-ghost");
        document.body.append(ghost);
      }
      ghost.style.left = `${event.clientX}px`;
      ghost.style.top = `${event.clientY}px`;
      element
        .querySelector("[data-duel-dropzone]")
        ?.classList.toggle(
          "drop-ready",
          Boolean(
            document
              .elementFromPoint(event.clientX, event.clientY)
              ?.closest("[data-duel-dropzone]"),
          ),
        );
    });
    button.addEventListener("pointerup", (event) => {
      if (!start) return;
      const overArena = Boolean(
        document
          .elementFromPoint(event.clientX, event.clientY)
          ?.closest("[data-duel-dropzone]"),
      );
      ghost?.remove();
      element
        .querySelector("[data-duel-dropzone]")
        ?.classList.remove("drop-ready");
      if (dragged && overArena) onPlayCard(button.dataset.duelCard);
      start = null;
      setTimeout(() => {
        dragged = false;
      }, 0);
    });
    button.addEventListener("pointercancel", () => {
      ghost?.remove();
      element
        .querySelector("[data-duel-dropzone]")
        ?.classList.remove("drop-ready");
      start = null;
    });
    button.addEventListener("click", () => {
      if (!dragged) onToggleCard(button.dataset.duelCard);
    });
  });
  element
    .querySelectorAll("[data-duel-order]")
    .forEach((button) =>
      button.addEventListener("click", () => onOrder(button.dataset.duelOrder)),
    );
  element
    .querySelector("[data-duel-lock]")
    ?.addEventListener("click", () => onLock(false));
  element.querySelector("[data-duel-pass]")?.addEventListener("click", onPass);
  element.querySelector("[data-duel-flee]")?.addEventListener("click", onFlee);
}
