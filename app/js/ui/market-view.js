import { formatInteger } from "./number-format.js";
import { getItemDefinition } from "../core/item-catalog.js";

const REASONS = {
  insufficient_resources: "Vous manquez d’or ou de marchandises.",
  location_stock_insufficient: "Le marché manque de stock ou d’or.",
  hero_bag_full: "Votre sac manque de place.",
  location_storage_full: "Le stockage du marché est plein.",
  market_unavailable: "Ce marché est inaccessible. Rapprochez-vous du lieu.",
  invalid_trade: "Cet échange est invalide.",
};
export function tradeMessage(result) {
  return result.success
    ? `${result.direction === "buy" ? "Achat" : "Vente"} : ${formatInteger(result.quantity)} ${getItemDefinition(result.itemId)?.name ?? result.itemId} pour ${formatInteger(result.gold)} or.${result.locationExperienceGained > 0 ? ` +${formatInteger(result.locationExperienceGained)} XP pour le camp.` : ""}`
    : (REASONS[result.reason] ?? "Échange impossible.");
}

const sessions = new WeakMap();

export function updateMarketView({
  element,
  location,
  hero,
  service,
  canTrade = true,
  message,
}) {
  const session = sessions.get(element);
  if (
    !session ||
    !element.contains(session.root) ||
    element.hidden ||
    session.locationId !== location.id
  )
    return false;
  session.latest = { element, location, hero, service, canTrade, message };
  session.canTrade = canTrade;
  const goldLabel = `Votre or : ${formatInteger(hero.resources.gold ?? 0)} · Or du marché : ${formatInteger(location.resources.stock.gold ?? 0)}`;
  if (session.gold.textContent !== goldLabel)
    session.gold.textContent = goldLabel;
  if (message !== undefined) session.feedback.textContent = message;
  const offers = service.getAvailableOffers(location, hero);
  const activeIds = new Set(offers.map((offer) => offer.itemId));
  for (const [id, row] of session.rows) {
    if (!activeIds.has(id)) {
      row.element.remove();
      session.rows.delete(id);
    }
  }
  for (const offer of offers) {
    let row = session.rows.get(offer.itemId);
    if (!row) {
      const node = document.createElement("section");
      node.className = "market-row";
      node.dataset.marketResource = offer.itemId;
      const name = document.createElement("strong");
      name.textContent = getItemDefinition(offer.itemId)?.name ?? offer.itemId;
      node.append(name);
      row = { element: node, buttons: {} };
      for (const direction of ["buy", "sell"]) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.tradeDirection = direction;
        button.onclick = async () => {
          if (session.pending || !session.canTrade) return;
          session.pending = true;
          updateMarketView(session.latest);
          try {
            await session.onTrade({ itemId: offer.itemId, direction });
          } finally {
            session.pending = false;
            if (element.contains(session.root))
              updateMarketView(session.latest);
          }
        };
        row.buttons[direction] = button;
        node.append(button);
      }
      session.rows.set(offer.itemId, row);
      session.list.append(node);
    }
    for (const direction of ["buy", "sell"]) {
      const result = canTrade
        ? service.execute({
            hero,
            location,
            itemId: offer.itemId,
            direction,
            preview: true,
          })
        : { success: false, reason: "market_unavailable" };
      const button = row.buttons[direction];
      const label = `${direction === "buy" ? "Acheter" : "Vendre"} ${formatInteger(offer[`${direction}Quantity`] || offer.quantity)} · ${formatInteger(offer[direction])} or${direction === "buy" && offer.imported ? ` · import ×2 (${offer.importRemaining} restants)` : ""}`;
      if (button.textContent !== label) button.textContent = label;
      button.disabled = session.pending || !result.success;
      button.title = result.success ? "" : tradeMessage(result);
      button.setAttribute(
        "aria-label",
        `${label} : ${getItemDefinition(offer.itemId)?.name ?? offer.itemId}${result.success ? "" : ` — ${tradeMessage(result)}`}`,
      );
    }
  }
  session.empty.hidden = offers.length > 0;
  return true;
}

export function renderMarketView({
  element,
  location,
  hero,
  service,
  message = "",
  onTrade,
  onClose,
  canTrade = true,
}) {
  element.hidden = false;
  const root = document.createElement("section");
  root.dataset.marketLocation = location.id;
  const add = (tag, text) => {
    const node = document.createElement(tag);
    node.textContent = text;
    root.append(node);
    return node;
  };
  const close = add("button", "Fermer");
  close.type = "button";
  close.className = "sheet-close";
  close.onclick = onClose;
  add("h2", `Marché · ${location.name}`);
  const gold = add("p", "");
  const feedback = add("p", message);
  feedback.setAttribute("role", "status");
  const list = add("div", "");
  list.className = "market-list";
  const empty = add("p", "Aucune ressource ni aucun objet à échanger.");
  sessions.set(element, {
    root,
    locationId: location.id,
    gold,
    feedback,
    list,
    empty,
    rows: new Map(),
    onTrade,
    pending: false,
  });
  element.replaceChildren(root);
  updateMarketView({ element, location, hero, service, canTrade, message });
}
