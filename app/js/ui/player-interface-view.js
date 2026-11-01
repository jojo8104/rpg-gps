export function renderPlayerNotices(buttons, { hero, army }) {
  for (const [view, count] of [
    ["hero", hero],
    ["army", army],
  ]) {
    const button = buttons[view];
    button?.classList.toggle("has-notice", count > 0);
    if (button) button.dataset.notice = count > 9 ? "9+" : String(count);
  }
}

export function renderGhostNotice({ element, hero, base }) {
  if (!element) return;
  element.hidden = hero.state !== "ghost";
  if (hero.state === "ghost")
    element.innerHTML = `<strong>Vous êtes un fantôme</strong><span>Retournez à ${base?.name ?? "votre point de réapparition"} pour reprendre forme avec la moitié de vos PV.</span>`;
}
