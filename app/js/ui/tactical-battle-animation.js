/** Presentation only: animate between two server-provided positions. */
export function captureTacticalActors(element) {
  return new Map(
    [...element.querySelectorAll("[data-tactics-actor]")].map((node) => [
      node.dataset.tacticsActor,
      node.getBoundingClientRect(),
    ]),
  );
}

export function animateTacticalActors(
  element,
  previous,
  playback,
  flip = false,
) {
  if (
    !playback ||
    globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  )
    return;
  for (const node of element.querySelectorAll("[data-tactics-actor]")) {
    if (!node.animate) continue;
    const from = previous.get(node.dataset.tacticsActor);
    const to = node.getBoundingClientRect();
    if (
      ["move", "return"].includes(playback.stage) &&
      from &&
      (Math.abs(from.x - to.x) > 1 || Math.abs(from.y - to.y) > 1)
    ) {
      const route = playback.events.find(
        (event) =>
          event.actorId === node.dataset.tacticsActor &&
          event.path &&
          event.type === (playback.stage === "return" ? "return" : "move"),
      )?.path;
      const intermediate = route
        ? route.slice(0, -1).flatMap((p) => {
            const index = (flip ? 4 - p.y : p.y) * 3 + (flip ? 2 - p.x : p.x);
            const cell = element.querySelector(
              `[data-tactics-cell="${index}"]`,
            );
            if (!cell) return [];
            const rect = cell.getBoundingClientRect();
            return [
              {
                transform: `translate(${rect.x - to.x}px,${rect.y - to.y}px)`,
              },
            ];
          })
        : [];
      node.animate(
        [
          { transform: `translate(${from.x - to.x}px, ${from.y - to.y}px)` },
          ...intermediate,
          { transform: "translate(0, 0)" },
        ],
        { duration: 700, easing: "ease-in-out" },
      );
    } else if (["move", "return"].includes(playback.stage) && !from) {
      node.animate(
        [
          { opacity: 0, transform: "scale(.65)" },
          { opacity: 1, transform: "scale(1)" },
        ],
        { duration: 500 },
      );
    } else if (
      playback.stage === "impact" &&
      playback.events.some(
        (event) =>
          event.type === "attack" &&
          event.targetId === node.dataset.tacticsActor,
      )
    ) {
      node.animate(
        [
          { filter: "brightness(1)" },
          { filter: "brightness(2)" },
          { filter: "brightness(1)" },
        ],
        { duration: 400 },
      );
    }
  }
}
