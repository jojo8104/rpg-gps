// État d'affichage uniquement ; conservé pendant les rafraîchissements du journal.
const expandedByJournal = new WeakMap();

export function makeQuestCardsCollapsible(element) {
  const cards = element.querySelectorAll?.(".quest-card") ?? [];
  const expanded = expandedByJournal.get(element) ?? new Set();
  expandedByJournal.set(element, expanded);

  for (const card of cards) {
    const title = Array.from(card.children).find((child) =>
      ["STRONG", "H3"].includes(child.tagName),
    );
    if (!title) continue;
    const key = card.dataset.questId ?? title.textContent;
    const container = document.createElement("div");
    container.className = `${card.className} quest-card--collapsible`;
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "quest-card__toggle";
    const heading = Array.from(card.children).find(
      (child) => child.tagName === "SMALL",
    );
    if (heading) toggle.append(heading);
    toggle.append(title);
    const body = document.createElement("div");
    body.className = "quest-card__body";
    body.append(...Array.from(card.childNodes));
    const update = () => {
      const open = expanded.has(key);
      toggle.setAttribute("aria-expanded", String(open));
      body.hidden = !open;
    };
    toggle.addEventListener("click", () => {
      if (expanded.has(key)) expanded.delete(key);
      else expanded.add(key);
      update();
    });
    update();
    container.append(toggle, body);
    card.replaceWith(container);
  }
}
