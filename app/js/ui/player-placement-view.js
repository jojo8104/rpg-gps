import { measureGps } from "./qr-scanner.js";

const messages = {
  fresh_position_required:
    "Une position récente, précise à 50 m ou moins, est nécessaire.",
  walking_distance_required: "La distance de marche n’est pas encore atteinte.",
  location_too_close: "Cet emplacement est trop proche d’un autre lieu.",
  outside_play_area: "Revenez dans le terrain de jeu.",
  no_compatible_cell:
    "Aucune case compatible n’est disponible pour les lieux restants.",
  survey_target_not_reached:
    "Rejoignez la case indiquée avant de valider le repérage.",
  cell_unavailable:
    "Cette case n’est plus disponible. Actualisez les emplacements.",
  placement_unavailable:
    "Ce lieu a déjà été placé ou n’est pas encore disponible.",
  active_hero_required: "Un héros actif est nécessaire.",
  survey_not_active: "Cette mission de repérage n’est plus active.",
};
function node(tag, text) {
  const element = document.createElement(tag);
  if (text != null) element.textContent = text;
  return element;
}

/** Présentation de l’état officiel : les commandes ne transmettent aucun point choisi. */
export class PlayerPlacementView {
  constructor(client, getLobby) {
    this.client = client;
    this.getLobby = getLobby;
  }
  initialize() {
    this.menuButton = node("button", "Placement et repérage");
    this.menuButton.type = "button";
    this.menuButton.hidden = true;
    this.menuButton.onclick = () => this.open();
    document.querySelector("#close-game-menu").before(this.menuButton);
  }
  setAvailable(available) {
    this.menuButton.hidden = !available;
    if (!available) this.dialog?.close();
  }
  async open() {
    document.querySelector("#close-game-menu").click();
    if (this.dialog?.open) return;
    const dialog = node("dialog");
    dialog.className = "player-placement-dialog preparation-map-dialog";
    this.dialog = dialog;
    this.content = node("div");
    this.content.className = "player-placement-content";
    this.feedback = node("p");
    this.feedback.setAttribute("role", "status");
    const close = this.button("Retour au jeu", () => dialog.close());
    dialog.append(
      node("h2", "Placement et repérage"),
      this.content,
      this.feedback,
      close,
    );
    dialog.onclose = () => {
      this.map?.remove();
      this.map = null;
      dialog.remove();
    };
    document.body.append(dialog);
    dialog.showModal();
    await this.send("options");
  }
  button(text, action) {
    const button = node("button", text);
    button.type = "button";
    button.onclick = action;
    return button;
  }
  async send(action, fields = {}) {
    const dialog = this.dialog;
    if (this.pending === dialog) return;
    this.pending = dialog;
    dialog
      .querySelectorAll("button, select")
      .forEach((element) => (element.disabled = true));
    this.feedback.textContent = "Actualisation…";
    try {
      if (
        action !== "options" &&
        this.getLobby()?.configuration.positionMode === "gps"
      )
        await this.client.sendPosition(await measureGps());
      const response = await this.client.sendGameCommand(
        "playerPlacementCommand",
        [{ action, ...fields }],
      );
      if (this.dialog !== dialog || !dialog.open) return;
      const result = response.result;
      if (!result.success)
        this.feedback.textContent =
          messages[result.reason] ?? "Cette action n’est pas disponible.";
      else {
        this.render(result);
        this.feedback.textContent = "État enregistré.";
      }
    } catch (error) {
      if (this.dialog === dialog && dialog.open)
        this.feedback.textContent = error.message;
    } finally {
      if (this.pending === dialog) this.pending = null;
      dialog
        .querySelectorAll("button, select")
        .forEach((element) => (element.disabled = false));
    }
  }
  render(state) {
    this.map?.remove();
    this.map = null;
    this.content.replaceChildren();
    this.content.append(this.button("Actualiser", () => this.send("options")));
    if (!state.pendingLocations.length)
      this.content.append(
        node("p", "Tous les lieux disponibles ont été placés."),
      );
    for (const location of state.pendingLocations) {
      const card = node("section");
      card.className = "preparation-location";
      card.append(node("strong", location.name));
      if (location.mode === "player-walk") {
        card.append(
          node(
            "p",
            `${Math.floor(location.walk?.distanceMeters ?? 0)} / ${location.requiredMeters} m parcourus`,
          ),
        );
        card.append(
          location.walk
            ? this.button("Placer ici", () =>
                this.send("place-walk", { slotId: location.id }),
              )
            : this.button("Commencer la marche", () =>
                this.send("start-walk", { slotId: location.id }),
              ),
        );
      } else if (state.cells.length) {
        const label = node("label", "Case de l’équipe");
        const select = node("select");
        for (const cell of state.cells) {
          const option = node("option", `Case ${cell.id}`);
          option.value = cell.id;
          select.append(option);
        }
        select.onchange = () =>
          this.map?.panTo(
            (() => {
              const p = state.cells.find(
                (cell) => cell.id === select.value,
              ).center;
              return [p.latitude, p.longitude];
            })(),
          );
        label.append(select);
        card.append(
          label,
          this.button("Utiliser cette case", () =>
            this.send("place-cell", {
              slotId: location.id,
              cellId: select.value,
            }),
          ),
        );
      } else
        card.append(
          node("p", "Repérez une case pour alimenter le stock de l’équipe."),
        );
      this.content.append(card);
    }
    if (
      state.pendingLocations.some(
        (location) => location.mode === "validated-cell",
      )
    ) {
      const mission = state.mission;
      if (mission?.status === "active") {
        this.content.append(
          node("h3", mission.title),
          node(
            "p",
            `Rejoignez la case ${mission.cell.id} indiquée sur la carte.`,
          ),
          this.button("Valider le repérage ici", () =>
            this.send("complete-survey"),
          ),
          this.button("Abandonner le repérage", () =>
            this.send("abandon-survey"),
          ),
        );
      } else
        this.content.append(
          this.button("Mission secondaire : repérer une case", () =>
            this.send("start-survey"),
          ),
        );
    }
    const cells = [
      ...state.cells,
      ...(state.mission?.status === "active" ? [state.mission.cell] : []),
    ];
    if (cells.length) {
      const root = node("div");
      root.className = "preparation-location-map";
      this.content.append(root);
      if (globalThis.L) {
        this.map = globalThis.L.map(root);
        globalThis.L.tileLayer(
          "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
          { attribution: "© OpenStreetMap contributors", maxZoom: 19 },
        ).addTo(this.map);
        for (const cell of cells)
          globalThis.L.rectangle(
            cell.bounds.map((point) => [point.latitude, point.longitude]),
            { color: cell === state.mission?.cell ? "#b86112" : "#176446" },
          )
            .addTo(this.map)
            .bindTooltip(`Case ${cell.id}`);
        this.map.fitBounds(
          cells.flatMap((cell) =>
            cell.bounds.map((point) => [point.latitude, point.longitude]),
          ),
        );
      } else
        this.content.append(
          node(
            "p",
            cells
              .map(
                (cell) =>
                  `Case ${cell.id} : ${cell.center.latitude.toFixed(6)}, ${cell.center.longitude.toFixed(6)}`,
              )
              .join(" · "),
          ),
        );
    }
  }
}
