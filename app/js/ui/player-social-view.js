import { formatInteger } from "./number-format.js";
import { tradeInventory } from "../core/player-social-service.js";

const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const categories = {
  resource: "Ressources",
  cargo: "Bagages",
  equipment: "Équipements portés",
  unit: "Troupes",
};

export class PlayerSocialView {
  constructor({ sheet, getGame, getPlayerId, send, isCurrent = () => true }) {
    Object.assign(this, { sheet, getGame, getPlayerId, send, isCurrent });
    this.dismissed = new Set();
    this.lastKey = "";
    this.pending = false;
    this.message = "";
  }

  async request(targetPlayerId, kind) {
    if (!this.isCurrent()) return;
    this.sheet.hidden = false;
    this.sheet.innerHTML = '<p role="status">Envoi de la demande…</p>';
    await this.command({ action: "request", targetPlayerId, kind });
  }

  async command(input) {
    if (this.pending || !this.isCurrent()) return;
    this.pending = true;
    this.sheet
      .querySelectorAll("button")
      .forEach((button) => (button.disabled = true));
    try {
      await this.send({ ...input, playerId: this.getPlayerId() });
      this.message = "";
    } catch (error) {
      this.message = error.message ?? "Action refusée.";
    } finally {
      this.pending = false;
      if (!this.isCurrent()) return;
      this.lastKey = "";
      this.sync();
      if (
        (!this.session || this.dismissed.has(this.session.id)) &&
        this.message
      ) {
        this.sheet.innerHTML = `<button type="button" data-close>Fermer</button><p role="alert">${escape(this.message)}</p>`;
        this.sheet.querySelector("[data-close]").onclick = () =>
          (this.sheet.hidden = true);
      }
    }
  }

  sync() {
    if (!this.isCurrent()) return;
    const game = this.getGame();
    const playerId = this.getPlayerId();
    const session = [...(game?.playerSessions ?? [])]
      .reverse()
      .find((s) => s.playerIds.includes(playerId));
    this.session = session;
    if (!session || this.pending || this.dismissed.has(session.id)) return;
    const key = JSON.stringify([session, this.message]);
    if (
      key === this.lastKey &&
      !this.sheet.hidden &&
      this.sheet.querySelector("[data-player-social-root]")
    )
      return;
    this.lastKey = key;
    this.sheet.hidden = false;
    this.sheet.classList.remove("garrison-sheet", "location-tab");
    this.sheet.classList.toggle(
      "player-trade-sheet",
      session.kind === "trade" && session.status === "active",
    );
    const otherId = session.playerIds.find((id) => id !== playerId);
    const other = game.getPlayer(otherId)?.name ?? "Autre joueur";
    const action = (id, label) =>
      `<button type="button" data-social="${id}">${label}</button>`;
    let content = "";
    if (session.status === "pending") {
      content =
        session.playerIds[1] === playerId
          ? `<p>${escape(other)} souhaite ${session.kind === "talk" ? "parler avec vous" : "faire un échange avec vous"}.</p><div class="sheet-actions">${action("accept", "Accepter")}${action("decline", "Refuser")}</div>`
          : `<p>Demande envoyée à ${escape(other)}. En attente de son accord…</p>${action("cancel", "Annuler la demande")}`;
    } else if (session.status === "active" && session.kind === "talk") {
      content = `<p>Vous pouvez parler de vive voix et partager vos découvertes.</p><div class="sheet-actions">${action("share-quest", "Partager la quête en cours")}${action("share-map", "Échanger les informations de la carte")}${action("cancel", "Terminer")}</div>`;
      content += (session.sharedQuests ?? [])
        .map(
          (q) =>
            `<article><h3>${escape(q.title)}</h3><p>${escape(q.description)}</p><ul>${q.objectives.map((o) => `<li>${escape(o.description)}</li>`).join("")}</ul></article>`,
        )
        .join("");
    } else if (session.status === "active") {
      const mine = game.heroes.find((h) => h.playerId === playerId);
      content = `<p>Cliquez ou glissez pour proposer. Modifiez les quantités, puis validez à deux.</p><div class="player-trade-offers">${this.offerColumn(session, playerId, "Votre offre", true)}${this.offerColumn(session, otherId, `Offre de ${other}`, false)}</div><div class="sheet-actions">${action("confirm", session.confirmed.includes(playerId) ? "Vous avez validé" : "Valider cet échange")}${action("cancel", "Annuler")}</div><h3>Vos possessions</h3><p>Bagages et troupes : lots entiers. Équipements reçus : dans les bagages.</p><div class="player-trade-inventory">${Object.entries(
        categories,
      )
        .map(
          ([kind, title]) =>
            `<section><h4>${title}</h4>${
              tradeInventory(mine, game.unitDefinitions)
                .filter((i) => i.kind === kind)
                .map(
                  (item) =>
                    `<button type="button" draggable="true" data-item="${escape(item.id)}" data-kind="${kind}" class="trade-item">${escape(item.label)}${kind === "resource" ? ` · ${formatInteger(item.quantity)} disponibles` : ""}</button>`,
                )
                .join("") || "<p>Aucun élément</p>"
            }</section>`,
        )
        .join("")}</div>`;
    } else content = '<button type="button" data-dismiss>Fermer</button>';
    const scroll = this.sheet.scrollTop;
    this.sheet.innerHTML = `<span class="sheet-state" data-player-social-root>${session.kind === "talk" ? "Conversation" : "Échange"}</span><h2>Avec ${escape(other)}</h2><p role="status">${escape(this.message || session.message || "")}</p>${content}`;
    this.sheet.scrollTop = scroll;
    this.sheet
      .querySelector("[data-dismiss]")
      ?.addEventListener("click", () => {
        this.dismissed.add(session.id);
        this.sheet.hidden = true;
        this.sheet.classList.remove("player-trade-sheet");
      });
    this.sheet.querySelectorAll("[data-social]").forEach((button) => {
      button.disabled =
        button.dataset.social === "confirm" &&
        session.confirmed.includes(playerId);
      button.onclick = () =>
        this.command({
          action: button.dataset.social,
          sessionId: session.id,
          revision: session.revision,
        });
    });
    this.sheet
      .querySelectorAll("[data-remove]")
      .forEach(
        (button) =>
          (button.onclick = () =>
            this.setOffer(
              session.offers[playerId].filter(
                (_, index) => index !== Number(button.dataset.remove),
              ),
            )),
      );
    this.sheet.querySelectorAll("[data-quantity]").forEach(
      (input) =>
        (input.onchange = () => {
          const offer = structuredClone(session.offers[playerId]);
          offer[Number(input.dataset.quantity)].quantity = Number(input.value);
          this.setOffer(offer);
        }),
    );
    this.sheet.querySelectorAll("[data-item]").forEach((button) => {
      const item = { kind: button.dataset.kind, id: button.dataset.item };
      let start = null;
      let suppressClick = false;
      const dropZone = this.sheet.querySelector("[data-offer-drop]");
      button.onclick = () => {
        if (suppressClick) {
          suppressClick = false;
          return;
        }
        this.addItem(item);
      };
      // Un seul chemin Pointer Events pour la souris, le stylet et le tactile.
      button.ondragstart = (event) => event.preventDefault();
      button.onpointerdown = (event) => {
        if (event.button !== 0) return;
        suppressClick = false;
        start = { x: event.clientX, y: event.clientY };
        button.setPointerCapture(event.pointerId);
      };
      button.onpointermove = (event) => {
        if (!start) return;
        if (Math.hypot(start.x - event.clientX, start.y - event.clientY) > 12) {
          button.classList.add("is-dragging");
          dropZone?.classList.add("is-drop-target");
        }
      };
      const clearDrag = () => {
        start = null;
        button.classList.remove("is-dragging");
        dropZone?.classList.remove("is-drop-target");
      };
      button.onpointercancel = clearDrag;
      button.onpointerup = (event) => {
        if (!start) return;
        const moved =
          Math.hypot(start.x - event.clientX, start.y - event.clientY) > 12;
        clearDrag();
        suppressClick = moved;
        if (
          moved &&
          document
            .elementFromPoint(event.clientX, event.clientY)
            ?.closest("[data-offer-drop]") === dropZone
        ) {
          event.preventDefault();
          this.addItem(item);
        }
      };
    });
    const drop = this.sheet.querySelector("[data-offer-drop]");
    if (drop) {
      drop.ondragover = (event) => event.preventDefault();
      drop.ondrop = (event) => {
        event.preventDefault();
        try {
          this.addItem(
            JSON.parse(event.dataTransfer.getData("application/x-rpg-trade")),
          );
        } catch {}
      };
    }
  }

  offerColumn(session, id, label, editable) {
    return `<section class="trade-offer" ${editable ? "data-offer-drop" : ""}><h3>${escape(label)}</h3><p>${session.confirmed.includes(id) ? "✓ Validée" : "À valider"}</p>${session.offers[id].map((item, index) => `<div class="trade-offer-item"><span>${escape(item.label)}${item.kind === "resource" && !editable ? ` × ${formatInteger(item.quantity)}` : ""}</span>${editable && item.kind === "resource" ? `<label>Quantité <input type="number" min="1" step="1" value="${item.quantity}" data-quantity="${index}" aria-label="Quantité de ${escape(item.label)}"></label>` : ""}${editable ? `<button type="button" data-remove="${index}" aria-label="Retirer ${escape(item.label)}">Retirer</button>` : ""}</div>`).join("") || "<p>Offre vide</p>"}</section>`;
  }

  addItem(item) {
    const offer = structuredClone(this.session.offers[this.getPlayerId()]);
    if (offer.some((i) => i.kind === item.kind && i.id === item.id)) return;
    this.setOffer([...offer, { ...item, quantity: 1 }]);
  }

  setOffer(offer) {
    return this.command({
      action: "offer",
      sessionId: this.session.id,
      revision: this.session.revision,
      offer,
    });
  }
}
