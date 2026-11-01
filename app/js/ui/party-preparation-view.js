import {
  preparationSteps,
  preparationBlockedStep,
} from "./preparation-progress.js";
import { showPreparationLocations } from "./preparation-map-locations.js";
import { readQrCode, parsePartyQr, measureGps } from "./qr-scanner.js";
import { createMapPreparationControls } from "../map/MapPreparationControls.js";

const labels = {
  scenario: "Placement prévu par le scénario",
  random: "Aléatoire",
  map: "Placer sur la carte",
  qr: "Placer avec QR code",
  "player-walk": "Placé par un joueur après une marche",
  "validated-cell": "Placer dans une case repérée",
  known: "Déjà découvert",
  discoverable: "À découvrir",
  activation: "À l’activation du scénario",
  quest: "À l’activation prévue par la quête",
  "advanced-player": "Joueur avancé — anime et joue avec un héros",
  absent: "Absent — partie autonome",
  "game-master": "Maître du jeu — sans héros",
  "supreme-npc": "PNJ suprême — personnage de scénario",
};
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text != null) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function button(text, action) {
  const element = node("button", text);
  element.type = "button";
  element.onclick = action;
  return element;
}
function select(values, value, onChange) {
  const element = node("select");
  values.forEach((id) => {
    const option = node("option", labels[id] ?? id);
    option.value = id;
    element.append(option);
  });
  element.value = value;
  element.onchange = () => onChange(element.value);
  return element;
}

export class PartyPreparationView {
  constructor(root, client, { run, navigate } = {}) {
    this.root = root;
    this.client = client;
    this.run = run;
    this.navigate = navigate;
    this.step = "scenario";
    this.validatedSteps = new Set();
  }
  render(lobby, player) {
    if (this.lobby?.code !== lobby.code) {
      this.validatedSteps.clear();
      this.step = "scenario";
      this.locationIndex = 0;
    }
    this.lobby = lobby;
    this.root.replaceChildren();
    if (
      !player?.isHost ||
      lobby.configuration.positionMode !== "gps" ||
      lobby.resume
    )
      return;
    const catalog = lobby.preparationCatalog;
    if (!catalog) return;
    const preparation = lobby.configuration.preparation ?? {};
    const editable = lobby.status === "waiting";
    const steps = preparationSteps(preparation);
    if (!steps.includes(this.step)) this.step = "locations";
    const blocked = editable && preparationBlockedStep(lobby, this.step);
    if (blocked) this.step = blocked === "terrain" ? "scenario" : blocked;
    this.settingsForm = null;
    this.root.classList.add("preparation-paged");
    this.root.append(node("h3", "Préparation détaillée IRL"));
    if (preparation.organizerRole === "supreme-npc" && preparation.character)
      this.root.append(node("p", `Vous incarnez ${preparation.character}.`));
    if (!lobby.playArea) {
      this.root.append(
        node("p", "Commencez par tracer et valider votre terrain."),
        button("Créer la playarea", () => this.navigate("terrain")),
      );
      return;
    }
    this.root.classList.add("setup-page");
    const nav = node(
      "nav",
      null,
      "preparation-steps setup-progress setup-progress--interactive",
    );
    nav.setAttribute("aria-label", "Étapes de préparation détaillée");
    const stepNames = {
      scenario: "Scénario et quêtes",
      locations: "Lieux",
      print: "Impression",
      install: "Installation",
      review: "Vérification",
    };
    for (const [index, id] of steps.entries()) {
      const text = `${index + 2}. ${stepNames[id]}`;
      const control = button(text, () => {
        this.step = id;
        this.render(this.lobby, player);
      });
      control.disabled = Boolean(
        editable &&
          (preparationBlockedStep(lobby, id) ||
            steps
              .slice(0, index)
              .some((previous) => !this.validatedSteps.has(previous))),
      );
      control.title = text;
      control.setAttribute("aria-label", text);
      control.dataset.stepName = text;
      control.classList.toggle("is-active", this.step === id);
      if (this.step === id) control.setAttribute("aria-current", "step");
      control.setAttribute("aria-pressed", String(this.step === id));
      nav.append(control);
    }
    this.root.append(nav);
    if (this.step === "scenario") {
      this.root.append(
        node("h2", catalog.name),
        node("p", catalog.intro),
        node("p", catalog.notice, "setup-hint"),
      );
      const settings = node("form", null, "lobby-form");
      const roleLabel = node("label", "Rôle de l’organisateur");
      const role = select(
        ["advanced-player", "absent", "game-master", "supreme-npc"],
        preparation.organizerRole ?? "advanced-player",
        () => {
          characterLabel.hidden = role.value !== "supreme-npc";
          character.required = role.value === "supreme-npc";
        },
      );
      roleLabel.append(role);
      const characterLabel = node("label", "Personnage du PNJ suprême");
      const character = node("input");
      character.maxLength = 200;
      character.value = preparation.character ?? "";
      characterLabel.append(character);
      characterLabel.hidden = role.value !== "supreme-npc";
      character.required = role.value === "supreme-npc";
      const save = node("button", "Enregistrer l’organisation");
      save.type = "submit";
      settings.append(roleLabel, characterLabel, save);
      settings.onsubmit = (event) => {
        event.preventDefault();
        this.change({
          organizerRole: role.value,
          character: character.value,
        });
      };
      settings.querySelectorAll("input, select, button").forEach((c) => {
        c.disabled = !editable;
      });
      this.settingsForm = settings;
      this.organizationInputs = { role, character };
      this.root.append(settings);
      for (const quest of catalog.quests) {
        const card = node("article", null, "preparation-quest");
        const label = node("label", null, "preparation-quest-title");
        const included = node("input");
        included.type = "checkbox";
        included.checked = !preparation.excludedQuestIds?.includes(quest.id);
        included.disabled = !editable || quest.linear;
        included.onchange = () => {
          const ids = new Set(preparation.excludedQuestIds ?? []);
          included.checked ? ids.delete(quest.id) : ids.add(quest.id);
          this.change({ excludedQuestIds: [...ids] });
        };
        label.append(included, node("strong", quest.name));
        card.append(
          label,
          node("p", quest.description),
          node(
            "small",
            quest.linear
              ? "Enchaînement linéaire : quête obligatoire."
              : "Quête indépendante : vous pouvez la retirer.",
          ),
        );
        if (included.checked)
          card.append(
            node(
              "p",
              `${quest.locationIds.length} lieu(x) : configuration à l’étape suivante.`,
            ),
          );
        this.root.append(card);
      }
    } else if (this.step === "locations") {
      this.root.append(node("h2", "Configurer les lieux"));
      const definitions = catalog.locations;
      this.locationIndex = Math.min(
        this.locationIndex ?? 0,
        Math.max(0, definitions.length - 1),
      );
      const definition = definitions[this.locationIndex];
      if (definition) {
        this.root.append(
          node("p", `Lieu ${this.locationIndex + 1} sur ${definitions.length}`),
        );
        this.root.append(
          this.locationCard(
            definition,
            preparation.locations?.[definition.id],
            editable,
          ),
        );
        const pager = node("div", null, "preparation-card-navigation");
        for (const [text, delta] of [
          ["Lieu précédent", -1],
          ["Lieu suivant", 1],
        ]) {
          const control = button(text, () => {
            this.locationIndex += delta;
            this.render(this.lobby, player);
          });
          control.disabled =
            this.locationIndex + delta < 0 ||
            this.locationIndex + delta >= definitions.length ||
            (delta > 0 &&
              preparation.locations?.[definition.id]?.placement === "map" &&
              !preparation.locations[definition.id].position);
          pager.append(control);
        }
        this.root.append(pager);
      }
    } else if (this.step === "print") {
      const dateForm = node("form", null, "lobby-form");
      const dateLabel = node("label", "Date de la partie (sur les fiches QR)");
      const date = node("input");
      date.type = "date";
      date.required = true;
      date.value = preparation.date ?? "";
      dateLabel.append(date);
      const saveDate = node("button", "Enregistrer la date");
      saveDate.type = "submit";
      dateForm.append(dateLabel, saveDate);
      dateForm.onsubmit = (event) => {
        event.preventDefault();
        this.change({ date: date.value });
      };
      this.settingsForm = dateForm;
      this.dateInput = date;
      this.root.append(dateForm);
      this.root.append(
        node("h2", "Fiches de lieux à imprimer"),
        node(
          "p",
          "Plusieurs fiches par feuille A4, avec QR code, nom du lieu, date, nom du jeu, illustration et notice. Imprimez à 100 %, découpez puis protégez chaque fiche contre la pluie.",
        ),
      );
      this.root.append(
        button("Télécharger le document imprimable", () =>
          this.run(async () => {
            if (!dateForm.reportValidity()) return;
            await this.client.configurePreparation({ date: date.value });
            const { html } = await this.client.printPreparation();
            const url = URL.createObjectURL(
              new Blob([html], { type: "text/html;charset=utf-8" }),
            );
            const link = node("a");
            link.href = url;
            link.download = `RPG-GPS-${lobby.code}-QR.html`;
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 10000);
          }),
        ),
        node(
          "p",
          "Ouvrez le fichier téléchargé, puis utilisez « Imprimer / Enregistrer en PDF ».",
        ),
      );
    } else if (this.step === "install") {
      this.root.append(
        node("h2", "Installer les QR codes"),
        node(
          "p",
          "Posez la fiche protégée, restez à côté et enregistrez sa position. Vérifiez le point sur la carte avant de confirmer.",
        ),
      );
      const allowed = editable || preparation.organizerRole !== "absent";
      const scan = button("Scanner une fiche à installer", () =>
        this.run(async () => {
          const id = parsePartyQr(await readQrCode(), lobby.code);
          const entry = Object.entries(preparation.locations ?? {}).find(
            ([, l]) => l.qrId === id,
          );
          if (!entry) throw new Error("QR code inconnu.");
          await this.install(entry[0], id, true);
        }),
      );
      scan.disabled = !allowed;
      this.root.append(scan);
      const qrLocations = Object.entries(preparation.locations ?? {}).filter(
        ([, l]) => l.placement === "qr",
      );
      this.installIndex = Math.min(
        this.installIndex ?? 0,
        Math.max(0, qrLocations.length - 1),
      );
      this.root.append(
        node("p", `QR ${this.installIndex + 1} sur ${qrLocations.length}`),
      );
      for (const [id, entry] of qrLocations.slice(
        this.installIndex,
        this.installIndex + 1,
      )) {
        const card = node("article", null, "preparation-location");
        card.append(
          node(
            "strong",
            catalog.locations.find((l) => l.id === id)?.name ?? id,
          ),
          node("p", entry.position ? "Position enregistrée" : "À installer"),
        );
        const install = button(
          entry.position ? "Déplacer — enregistrer ici" : "Enregistrer ici",
          () => this.install(id, entry.qrId),
        );
        install.disabled = !allowed;
        card.append(install);
        this.root.append(card);
      }
      const pager = node("div", null, "preparation-card-navigation");
      for (const [text, delta] of [
        ["QR précédent", -1],
        ["QR suivant", 1],
      ]) {
        const control = button(text, () => {
          this.installIndex += delta;
          this.render(this.lobby, player);
        });
        control.disabled =
          this.installIndex + delta < 0 ||
          this.installIndex + delta >= qrLocations.length;
        pager.append(control);
      }
      this.root.append(pager);
    } else {
      this.root.append(node("h2", "Vérifier la partie"));
      const problems = lobby.preparationProblems ?? [];
      this.root.append(
        node(
          "p",
          problems.length
            ? "À terminer avant l’ouverture :"
            : "La préparation est complète. Invitez les joueurs et attendez leur confirmation.",
        ),
      );
      problems.forEach((p) => this.root.append(node("p", `• ${p}`)));
    }
    const index = steps.indexOf(this.step);
    const footer = node("div", null, "lobby-footer preparation-navigation");
    const back = button("Retour", () => {
      if (index === 0) return this.navigate("terrain");
      this.step = steps[index - 1];
      this.render(this.lobby, player);
    });
    back.className = "secondary-button";
    footer.append(
      back,
      button(
        index === steps.length - 1
          ? "Voir les joueurs"
          : this.step === "print"
            ? "Continuer sans imprimer"
            : "Valider et continuer",
        async () => {
          if (this.settingsForm && editable) {
            if (!this.settingsForm.reportValidity()) return;
            const change =
              this.step === "print"
                ? { date: this.dateInput.value }
                : {
                    organizerRole: this.organizationInputs.role.value,
                    character: this.organizationInputs.character.value,
                  };
            if (!(await this.change(change))) return;
          }
          const target =
            index === steps.length - 1 ? "players" : steps[index + 1];
          const missing =
            editable && preparationBlockedStep(this.lobby, target);
          if (missing) {
            const feedback = this.root.querySelector(".preparation-feedback");
            feedback.textContent =
              this.lobby.preparationStepProblems[missing].join(" ");
            return;
          }
          this.validatedSteps.add(this.step);
          if (target === "players") return this.navigate("players");
          this.step = target;
          this.render(this.lobby, player);
        },
      ),
    );
    const feedback = node("p", "", "preparation-feedback");
    feedback.setAttribute("role", "status");
    const content = node("div", null, "preparation-content");
    for (const child of [...this.root.children])
      if (child !== nav && child.tagName !== "H3") content.append(child);
    this.root.append(content, feedback);
    this.root.append(footer);
  }
  async change(change) {
    const current = this.lobby.configuration.preparation ?? {};
    const first = change.location
      ? "locations"
      : change.excludedQuestIds
        ? "scenario"
        : change.date !== undefined && change.date !== current.date
          ? "print"
          : (change.organizerRole !== undefined &&
                change.organizerRole !== current.organizerRole) ||
              (change.character !== undefined &&
                change.character !== (current.character ?? ""))
            ? "scenario"
            : null;
    if (first) {
      const steps = preparationSteps(current);
      for (const step of steps.slice(steps.indexOf(first)))
        this.validatedSteps.delete(step);
    }
    let saved = false;
    let failure = null;
    await this.run(async () => {
      try {
        const result = await this.client.configurePreparation(change);
        saved = Boolean(result?.lobby);
        return result;
      } catch (error) {
        failure = error.message;
        throw error;
      }
    });
    if (!saved) {
      const feedback = this.root.querySelector(".preparation-feedback");
      if (feedback)
        feedback.textContent =
          failure ??
          "L’enregistrement n’a pas été confirmé. Patientez puis réessayez.";
    }
    return saved;
  }
  locationCard(definition, entry = {}, editable) {
    const card = node("section", null, "preparation-location");
    card.append(node("strong", definition.name));
    const visibility = node("label", "Visibilité");
    visibility.append(
      select(
        definition.visibilityOptions,
        entry.visibility ?? definition.defaultVisibility,
        (value) =>
          this.change({ location: { id: definition.id, visibility: value } }),
      ),
    );
    const placement = node("label", "Placement");
    placement.append(
      select(
        definition.placementOptions,
        entry.placement ?? "scenario",
        (value) =>
          this.change({ location: { id: definition.id, placement: value } }),
      ),
    );
    visibility.querySelector("select").setAttribute("aria-label", "Visibilité");
    placement.querySelector("select").setAttribute("aria-label", "Placement");
    card.append(visibility, placement);
    card.querySelectorAll("select").forEach((s) => {
      s.disabled = !editable;
    });
    if (entry.placement === "player-walk") {
      const label = node("label", "Distance de marche (mètres)");
      const input = node("input");
      input.type = "number";
      input.min = "10";
      input.max = "10000";
      input.step = "10";
      input.value = entry.walkingDistanceMeters ?? 300;
      input.disabled = !editable;
      input.setAttribute("aria-label", "Distance de marche (mètres)");
      input.onchange = () =>
        this.change({
          location: {
            id: definition.id,
            walkingDistanceMeters: Number(input.value),
          },
        });
      label.append(input);
      card.append(label);
    }
    if (["player-walk", "validated-cell"].includes(entry.placement))
      card.append(
        node(
          "p",
          entry.placement === "player-walk"
            ? "En partie, un joueur lance sa marche puis choisit son emplacement."
            : "En partie, les missions de repérage alimentent le stock de cases de l’équipe. Un joueur choisit ensuite une case disponible.",
        ),
      );
    if (entry.placement === "map") {
      const place = button(
        entry.position
          ? "Modifier le point sur la carte"
          : "Choisir sur la carte",
        () => this.placeOnMap(definition, entry),
      );
      place.disabled = !editable;
      card.append(place);
    }
    if (entry.placement === "qr")
      card.append(
        node(
          "p",
          entry.position
            ? "QR code installé."
            : "QR code à imprimer puis à installer sur le terrain.",
        ),
      );
    return card;
  }
  mapDialog(title, position, onConfirm, { choose = false, currentId } = {}) {
    const dialog = node("dialog", null, "preparation-map-dialog");
    const mapRoot = node("div", null, "preparation-location-map");
    const status = node(
      "p",
      position
        ? `${position.latitude.toFixed(6)}, ${position.longitude.toFixed(6)}${position.accuracy != null ? ` · précision ${Math.round(position.accuracy)} m` : ""}`
        : "Touchez la carte pour placer le lieu.",
    );
    const confirm = button(
      choose ? "Confirmer ce placement" : "Confirmer — enregistrer ici",
      async () => {
        if (!position) return;
        confirm.disabled = true;
        try {
          await onConfirm(position);
          dialog.close();
        } catch (error) {
          status.textContent = error.message;
          confirm.disabled = false;
        }
      },
    );
    confirm.disabled = !position;
    dialog.append(
      node("h2", title),
      mapRoot,
      status,
      confirm,
      button("Annuler", () => dialog.close()),
    );
    document.body.append(dialog);
    dialog.showModal();
    if (!globalThis.L) {
      status.textContent =
        "Carte indisponible : réessayez lorsque Leaflet est chargé.";
      confirm.disabled = true;
      return;
    }
    const map = globalThis.L.map(mapRoot);
    globalThis.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);
    const area = this.lobby.playArea;
    globalThis.L.polygon(
      area.polygon.map((p) => [p.latitude, p.longitude]),
    ).addTo(map);
    area.excludedPolygons?.forEach((polygon) =>
      globalThis.L.polygon(
        polygon.map((p) => [p.latitude, p.longitude]),
        { color: "red" },
      ).addTo(map),
    );
    const cleanupLocations = showPreparationLocations(
      map,
      globalThis.L,
      this.lobby.preparationCatalog,
      this.lobby.configuration.preparation,
      currentId,
    );
    let marker;
    if (position) {
      marker = globalThis.L.marker([
        position.latitude,
        position.longitude,
      ]).addTo(map);
      map.setView([position.latitude, position.longitude], 18);
    } else map.fitBounds(area.polygon.map((p) => [p.latitude, p.longitude]));
    createMapPreparationControls(map);
    if (choose)
      map.on("click", ({ latlng }) => {
        position = { latitude: latlng.lat, longitude: latlng.lng };
        marker?.remove();
        marker = globalThis.L.marker([latlng.lat, latlng.lng]).addTo(map);
        status.textContent = `${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;
        confirm.disabled = false;
      });
    dialog.onclose = () => {
      cleanupLocations();
      map.remove();
      dialog.remove();
    };
    requestAnimationFrame(() => map.invalidateSize());
  }
  placeOnMap(definition, entry) {
    this.mapDialog(
      definition.name,
      entry.position,
      (position) =>
        this.client.configurePreparation({
          location: { id: definition.id, position },
        }),
      { choose: true, currentId: definition.id },
    );
  }
  install(id, qrId, nested = false) {
    const operation = async () => {
      const position = await measureGps();
      this.mapDialog(
        this.lobby.preparationCatalog.locations.find((l) => l.id === id)
          ?.name ?? id,
        position,
        (position) => this.client.installQrLocation(qrId, position),
        { currentId: id },
      );
    };
    return nested ? operation() : this.run(operation);
  }
}
