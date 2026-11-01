import { TACTICAL_BONUS_TYPES } from "../core/tactical-bonuses.js";
/** Draws confirmed server attacks, including hits on units removed from the board. */
export function renderTacticalCombatEffects(element, playback, flip) {
  if (playback?.stage !== "impact") return;
  const map = element.querySelector(".tactics-map");
  if (!map) return;
  const bounds = map.getBoundingClientRect();
  const point = (p) => {
    if (!p) return null;
    const x = flip ? 2 - p.x : p.x,
      y = flip ? 4 - p.y : p.y;
    const node = element.querySelector(`[data-tactics-cell="${y * 3 + x}"]`);
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    return {
      x: rect.left - bounds.left + rect.width / 2,
      y: rect.top - bounds.top + rect.height / 2,
    };
  };
  for (const event of playback.events.filter(
    (entry) => entry.type === "attack",
  )) {
    const from = point(event.from),
      to = point(event.to);
    if (!to) continue;
    const hit = document.createElement("span");
    hit.className = "tactics-hit";
    hit.style.left = `${to.x}px`;
    hit.style.top = `${to.y}px`;
    hit.textContent = event.ranged ? "✦" : "⚔";
    map.append(hit);
    if (event.ranged && from) {
      const arrow = document.createElement("span");
      arrow.className = "tactics-projectile";
      arrow.textContent = "➤";
      arrow.style.left = `${from.x}px`;
      arrow.style.top = `${from.y}px`;
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      map.append(arrow);
      arrow.animate?.(
        [
          { transform: `translate(-50%,-50%) rotate(${angle}rad)`, opacity: 1 },
          {
            transform: `translate(${to.x - from.x}px,${to.y - from.y}px) rotate(${angle}rad)`,
            opacity: 1,
          },
        ],
        { duration: 300, fill: "forwards" },
      );
    }
  }
  for (const event of playback.events.filter(
    (entry) => entry.type === "loss",
  )) {
    const to = point(event.to);
    if (!to) continue;
    const labels = [
      ["pv", event.healthLost, "PV"],
      ["wounded", event.wounded, "blessé(s)"],
      ["dead", event.dead, "mort(s)"],
    ].filter(([, amount]) => amount > 0);
    labels.forEach(([kind, amount, title], index) => {
      const label = document.createElement("span");
      label.className = `tactics-loss tactics-loss--${kind}`;
      label.style.left = `${to.x}px`;
      label.style.top = `${to.y - 20 - index * 18}px`;
      label.style.animationDelay = `${index * 80}ms`;
      label.textContent = `${kind === "pv" ? "−" : "+"}${amount} ${title}`;
      element.querySelector(".tactics-map").append(label);
    });
  }
  for (const event of playback.events.filter(
    (entry) => entry.type === "pickup",
  )) {
    const to = point(event.to);
    if (!to) continue;
    const label = document.createElement("span");
    label.className = "tactics-hit tactics-pickup-captured";
    label.style.left = `${to.x}px`;
    label.style.top = `${to.y}px`;
    label.textContent =
      TACTICAL_BONUS_TYPES[event.bonusType]?.label ?? "Bonus capturé";
    map.append(label);
  }
}
