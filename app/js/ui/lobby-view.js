import {
  mountHeroGenderControl,
  selectedHeroGender,
  syncHeroGenderControl,
} from "./hero-gender-control.js";
import { heroClassSelection } from "./hero-class-cards.js";
import { lobbyJourney, journeyPages } from "./lobby-journey.js";
import { PlayerPlacementView } from "./player-placement-view.js";
import { mountScenarioTerrainChoice } from "./scenario-terrain-choice.js";
import { createOrganizerConsoleView } from "./organizer-console-view.js";
import { preparationBlockedStep } from "./preparation-progress.js";
import { LobbyTerrainView } from "./lobby-terrain-view.js";
import { PartyPreparationView } from "./party-preparation-view.js";
import { readQrCode, parsePartyQr, measureGps } from "./qr-scanner.js";
import {
  mountSetupChoices,
  refreshSetupChoices,
} from "./setup-choice-controls.js";
const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );

export class LobbyView {
  constructor(root, client, { onSolo, onStart, onQrLocation } = {}) {
    this.root = root;
    this.client = client;
    this.onSolo = onSolo;
    this.onStart = onStart;
    this.onQrLocation = onQrLocation;
    this.playerId = null;
    this.lobby = null;
    this.startedLaunchId = null;
    this.accounts = [];
    this.selectedAccount = null;
    this.terrainView = new LobbyTerrainView(
      this.root.querySelector("#lobby-terrain"),
      {
        client,
        onSave: async (playArea) => {
          const result = await this.client.setPlayArea(playArea);
          if (
            this.adventure === "plan" ||
            this.lobby?.configuration.preparation?.enabled
          ) {
            await this.client.configurePreparation({});
            this.showRoomPage("preparation");
          } else if (this.adventure === "quick")
            this.showRoomPage("configuration");
          return result;
        },
      },
    );
    this.preparationView = new PartyPreparationView(
      this.root.querySelector("#party-preparation"),
      client,
      {
        run: (operation) => this.run(operation),
        navigate: (page) => this.showRoomPage(page),
      },
    );
    this.client.onLobbyState((lobby) => this.renderLobby(lobby));
    this.client.onAccounts((accounts) => {
      this.accounts = accounts;
      if (
        this.selectedAccount &&
        !accounts.some((a) => a.id === this.selectedAccount.id)
      )
        this.selectedAccount = null;
      this.renderAccounts();
    });
  }

  setHeroClasses(heroClasses) {
    this.heroClassesReady = heroClasses.length > 0;
    this.root.querySelector("#lobby-hero-options").innerHTML =
      heroClassSelection(heroClasses, {
        name: "lobby-hero-choice",
        selected: this.root.querySelector("#lobby-hero-class").value || null,
      });
    this.root.querySelector("#lobby-hero-class").closest("label").hidden = true;
    mountHeroGenderControl(
      this.root.querySelector("#lobby-hero-options"),
      (classId, gender) => {
        if (!this.root.querySelector("#lobby-hero-class").disabled)
          void this.run(() => this.client.selectHeroClass(classId, gender));
      },
    );
    this.syncHeroCards();
    if (this.lobby) this.renderLobby(this.lobby);
  }
  syncHeroCards() {
    const select = this.root.querySelector("#lobby-hero-class");
    this.root.querySelectorAll("#lobby-hero-options input").forEach((input) => {
      input.checked = input.value === select.value;
      input.disabled = select.disabled;
    });
    const current = this.lobby?.players.find(
      (player) => player.id === this.playerId,
    );
    syncHeroGenderControl(
      this.root.querySelector("#lobby-hero-options"),
      current?.heroGender,
      select.disabled,
    );
  }
  initialize() {
    this.scenarioTerrainChoice = mountScenarioTerrainChoice(this.root, (id) =>
      this.run(async () => {
        const result = await this.client.updateConfiguration({
          scenarioId: id,
        });
        if (result?.lobby) this.renderLobby(result.lobby);
        if (this.lobby?.playArea) this.showRoomPage("configuration");
        return result;
      }),
    );
    this.terrainView.initialize();
    this.root
      .querySelector("#lobby-hero-options")
      .addEventListener("change", (event) => {
        if (event.target.name !== "lobby-hero-choice") return;
        const select = this.root.querySelector("#lobby-hero-class");
        if (select.disabled) return this.syncHeroCards();
        select.value = event.target.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
    this.root
      .querySelector("#lobby-open-saves")
      .addEventListener("click", () => {
        this.showRoomPage("saves");
        void this.refreshSaves();
      });
    mountSetupChoices(this.root, [
      "#lobby-game-type",
      "#lobby-position-mode",
      "#lobby-difficulty",
      "#lobby-travel-pace",
    ]);
    this.root
      .querySelectorAll("[data-room-page]")
      .forEach((page) => page.classList.add("setup-page"));
    this.root
      .querySelector("#lobby-room-next")
      .addEventListener("click", () => {
        if (this.roomPage === "configuration")
          return this.root
            .querySelector("#lobby-configuration")
            .requestSubmit();
        if (this.roomPage === "saves") return this.showRoomPage("players");
        const steps = lobbyJourney(this.lobby, {
          host: this.lobby?.hostPlayerId === this.playerId,
        });
        this.showRoomPage(steps[steps.indexOf(this.roomPage) + 1] ?? "players");
      });
    this.qrButton = document.createElement("button");
    this.qrButton.type = "button";
    this.qrButton.className = "map-control game-qr-scan";
    this.qrButton.textContent = "📷";
    this.qrButton.title = "Scanner un QR";
    this.qrButton.setAttribute("aria-label", "Scanner un QR");
    this.qrButton.hidden = true;
    this.qrButton.onclick = () =>
      this.run(async () => {
        const id = parsePartyQr(await readQrCode(), this.lobby.code);
        await this.client.sendPosition(await measureGps());
        const result = await this.client.scanQrLocation(id);
        this.root.querySelector("#qr-scan-result").textContent =
          `Lieu validé : ${result.name}`;
        this.onQrLocation?.(result.locationId);
        this.showQrMessage(`Lieu validé : ${result.name}`);
      });
    document.querySelector("#recenter-map").before(this.qrButton);
    this.qrFeedback = document.createElement("p");
    this.qrFeedback.className = "game-qr-feedback";
    this.qrFeedback.setAttribute("role", "status");
    this.qrFeedback.hidden = true;
    document.body.append(this.qrFeedback);
    this.organizerConsole = createOrganizerConsoleView({
      document,
      root: this.root,
      onOpen: () => {
        this.preparationView.step = "install";
        this.showRoomPage("preparation");
      },
    });
    this.organizerButton = this.organizerConsole.menuButton;
    this.playerPlacementView = new PlayerPlacementView(
      this.client,
      () => this.lobby,
    );
    this.playerPlacementView.initialize();
    this.root
      .querySelector("#lobby-room-back")
      .addEventListener("click", () => {
        if (this.root.classList.contains("is-organizer-console"))
          return this.organizerConsole.close();
        const steps = lobbyJourney(this.lobby, {
          host: this.lobby?.hostPlayerId === this.playerId,
        });
        const previous =
          this.roomPage === "saves" && !this.lobby?.resume
            ? "configuration"
            : steps[steps.indexOf(this.roomPage) - 1];
        if (previous) this.showRoomPage(previous);
        else this.root.querySelector("#lobby-leave").click();
      });
    this.root
      .querySelector("#lobby-game-type")
      .addEventListener("change", () => this.updateGameTypeControls());
    this.root
      .querySelector("#account-back")
      .addEventListener("click", () => this.showChoice());
    this.root
      .querySelector("#account-continue")
      .addEventListener("click", () => {
        this.continueAdventure();
      });
    this.root.querySelectorAll("[data-connect-choice]").forEach((button) => {
      button.addEventListener("click", () => {
        if (button.dataset.connectChoice === "create")
          this.run(() => this.client.create(this.selectedAccount.name));
        else this.showConnectStep("join");
      });
    });
    this.root.querySelectorAll("[data-room-tab]").forEach((button) => {
      button.title = button.textContent.trim();
      button.dataset.stepName =
        button.dataset.roomTab === "preparation" ? "Scénario" : button.title;
      button.setAttribute("aria-label", button.title);
      button.addEventListener("click", () =>
        this.showRoomPage(button.dataset.roomTab),
      );
    });
    this.root
      .querySelector("#choose-solo")
      .addEventListener("click", () => this.chooseAdventure("test"));
    this.root
      .querySelector("#choose-multiplayer")
      .addEventListener("click", () => this.chooseAdventure("plan"));
    this.root
      .querySelector("#choose-quick")
      .addEventListener("click", () => this.chooseAdventure("quick"));
    this.root
      .querySelector("#choose-join")
      .addEventListener("click", () => this.chooseAdventure("join"));
    this.root
      .querySelector("#account-create-form")
      .addEventListener("submit", (event) => {
        event.preventDefault();
        this.selectCreatedAccount(this.value("#account-create-name"));
      });
    this.root.querySelector("#lobby-back").addEventListener("click", () => {
      this.showChoice();
    });
    this.root
      .querySelector("#lobby-resume-current")
      .addEventListener("click", () => this.resumeCurrent());
    this.root
      .querySelector("#lobby-create-form")
      .addEventListener("submit", (event) => {
        event.preventDefault();
        this.run(() => this.client.create(this.value("#lobby-create-name")));
      });
    this.root
      .querySelector("#lobby-join-form")
      .addEventListener("submit", (event) => {
        event.preventDefault();
        this.run(() =>
          this.client.join(
            this.value("#lobby-code"),
            this.value("#lobby-join-name"),
          ),
        );
      });
    this.root
      .querySelector("#lobby-configuration")
      .addEventListener("submit", async (event) => {
        event.preventDefault();
        let saved = false;
        await this.run(async () => {
          const result = await this.client.updateConfiguration({
            gameType: this.value("#lobby-game-type"),
            positionMode: this.value("#lobby-position-mode"),
            maxPlayers: Number(this.value("#lobby-max-players")),
            scenarioId: this.value("#lobby-scenario"),
            difficulty: this.value("#lobby-difficulty"),
            travelPaceMode: this.value("#lobby-travel-pace"),
          });
          saved = true;
          return result;
        });
        if (saved) {
          this.quickSettingsValidated = true;
          this.showRoomPage(
            this.lobby.configuration.preparation?.enabled
              ? "preparation"
              : "players",
          );
        }
      });
    this.root
      .querySelector("#lobby-configuration")
      .addEventListener("change", () => {
        this.quickSettingsValidated = false;
      });
    this.root
      .querySelector("#lobby-hero-class")
      .addEventListener("change", async (event) => {
        if (!event.target.value) return;
        await this.run(() =>
          this.client.selectHeroClass(
            event.target.value,
            selectedHeroGender(this.root.querySelector("#lobby-hero-options")),
          ),
        );
        const official =
          this.lobby?.players.find((player) => player.id === this.playerId)
            ?.heroClassId ?? "";
        this.setValue("#lobby-hero-class", official);
        this.syncHeroCards();
      });
    this.root.querySelector("#lobby-ready").addEventListener("click", () => {
      const player = this.lobby?.players.find(
        (entry) => entry.id === this.playerId,
      );
      this.run(() => this.client.setReady(!player?.ready));
    });
    this.root
      .querySelector("#lobby-start")
      .addEventListener("click", () => this.run(() => this.client.start()));
    this.root
      .querySelector("#lobby-refresh-saves")
      .addEventListener("click", () => this.refreshSaves());
    this.root
      .querySelector("#lobby-load-save")
      .addEventListener("click", () => {
        const saveId = this.value("#lobby-save-list");
        if (saveId) this.run(() => this.client.loadSave(saveId));
      });
    this.root.querySelector("#lobby-leave").addEventListener("click", () =>
      this.run(async () => {
        await this.client.leave();
        this.playerId = null;
        this.lobby = null;
        this.showChoice();
      }),
    );
    void this.client.listAccounts().then(({ accounts }) => {
      this.accounts = accounts;
      if (
        this.selectedAccount &&
        !accounts.some((a) => a.id === this.selectedAccount.id)
      )
        this.selectedAccount = null;
      this.renderAccounts();
    });
  }

  async selectCreatedAccount(name) {
    try {
      const { account } = await this.client.createAccount(name);
      await this.selectAccount(account.id);
      this.root.querySelector("#account-create-form").reset();
    } catch (error) {
      this.root.querySelector("#account-status").textContent = error.message;
    }
  }

  async selectAccount(accountId) {
    try {
      const { account } = await this.client.selectAccount(accountId);
      this.selectedAccount = account;
      this.setValue("#lobby-create-name", account.name);
      this.setValue("#lobby-join-name", account.name);
      this.renderAccounts();
    } catch (error) {
      this.root.querySelector("#account-status").textContent = error.message;
    }
  }

  renderAccounts() {
    const list = this.root.querySelector("#account-list");
    if (!list) return;
    list.replaceChildren(
      ...this.accounts.map((account) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = account.name;
        const selected = this.selectedAccount?.id === account.id;
        button.disabled = !account.available || selected;
        if (selected) button.classList.add("is-selected");
        button.title = button.disabled
          ? `${account.name} est déjà connecté`
          : "";
        button.addEventListener("click", () => this.selectAccount(account.id));
        const row = document.createElement("div");
        row.className = "account-row";
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "account-remove";
        remove.innerHTML =
          '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7"/></svg>';
        remove.title = `Effacer le joueur ${account.name}`;
        remove.setAttribute("aria-label", `Effacer le joueur ${account.name}`);
        remove.disabled = !account.available && !selected;
        remove.addEventListener("click", async () => {
          if (!window.confirm(`Effacer le joueur « ${account.name} » ?`))
            return;
          remove.disabled = true;
          try {
            await this.client.deleteAccount(account.id);
            if (selected) this.selectedAccount = null;
            this.accounts = this.accounts.filter(
              (entry) => entry.id !== account.id,
            );
            this.renderAccounts();
          } catch (error) {
            this.root.querySelector("#account-status").textContent =
              error.message;
            remove.disabled = false;
          }
        });
        row.append(button, remove);
        return row;
      }),
    );
    const hasAccount = Boolean(this.selectedAccount);
    this.root.querySelector("#account-continue").disabled = !hasAccount;
    this.root.querySelector("#account-status").textContent = hasAccount
      ? `Vous jouez en tant que ${this.selectedAccount.name}.`
      : "Choisissez votre nom. Un compte déjà utilisé est temporairement indisponible.";
  }

  updateGameTypeControls() {
    const type = this.value("#lobby-game-type");
    const duel = type === "duel";
    this.root.querySelector("#lobby-game-type-hint").textContent = {
      cooperation: "Une équipe commune pour accomplir l’aventure ensemble.",
      competition: "Chacun pour soi : les autres joueurs sont des adversaires.",
      duel: "Deux adversaires, sans grand scénario : les missions des villages uniquement.",
    }[type];
    this.root.querySelector("#lobby-scenario").closest("label").hidden = duel;
    this.root.querySelector("#lobby-max-players").closest("label").hidden =
      duel;
    if (duel) this.setValue("#lobby-max-players", "2");
  }

  showConnectStep(step) {
    this.connectStep = step;
    this.toggle("#lobby-connect-choice", !step);
    this.toggle("#lobby-create-form", step === "create");
    this.toggle("#lobby-join-form", step === "join");
    this.toggle("#lobby-create-submit", step === "create");
    this.toggle("#lobby-join-submit", step === "join");
    this.setStatus("");
    if (step === "join") this.root.querySelector("#lobby-code").focus();
  }

  showRoomPage(name) {
    if (
      !this.lobby?.resume &&
      this.adventure === "quick" &&
      this.lobby?.hostPlayerId === this.playerId &&
      this.lobby.status === "waiting"
    ) {
      if (
        this.lobby.configuration.positionMode === "gps" &&
        !this.lobby.playArea &&
        name !== "terrain" &&
        name !== "saves"
      )
        name = "terrain";
      else if (name === "players" && !this.quickSettingsValidated)
        name = "configuration";
    }
    if (
      !this.lobby?.resume &&
      (this.adventure === "plan" ||
        this.lobby?.configuration.preparation?.enabled) &&
      this.lobby?.configuration.positionMode === "gps" &&
      !this.lobby.playArea &&
      ["configuration", "preparation", "players"].includes(name) &&
      this.lobby.hostPlayerId === this.playerId
    )
      name = "terrain";
    if (
      this.lobby?.status === "waiting" &&
      this.lobby?.hostPlayerId === this.playerId &&
      !this.lobby?.resume &&
      ["preparation", "players"].includes(name) &&
      !this.quickSettingsValidated
    )
      name = "configuration";
    if (
      name === "players" &&
      !this.lobby?.resume &&
      this.lobby?.status === "waiting" &&
      this.lobby?.hostPlayerId === this.playerId &&
      this.lobby?.configuration.preparation?.enabled
    ) {
      const missing =
        preparationBlockedStep(this.lobby, "players") ||
        (!this.preparationView.validatedSteps.has("review")
          ? "scenario"
          : null);
      if (missing) {
        name = missing === "terrain" ? "terrain" : "preparation";
        if (missing !== "terrain") {
          this.preparationView.step = missing;
          this.preparationView.render(
            this.lobby,
            this.lobby.players.find((p) => p.id === this.playerId),
          );
        }
      }
    }
    this.root.classList.toggle("is-preparation-editor", name === "preparation");
    const pageChanged = this.roomPage !== name;
    this.roomPage = name;
    this.root.querySelector("#lobby-save-configuration").hidden = true;
    this.root.querySelector("#lobby-room-next").hidden = ![
      "configuration",
      "terrain",
      "saves",
    ].includes(name);
    this.root.querySelector("#lobby-room-next").textContent =
      name === "configuration" ? "Enregistrer et continuer" : "Continuer";
    this.root.querySelector("#lobby-room-next").disabled =
      name === "terrain" && !this.lobby?.playArea;
    this.root.querySelectorAll("[data-room-page]").forEach((page) => {
      page.hidden = page.dataset.roomPage !== name;
    });
    this.root.querySelectorAll("[data-room-tab]").forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.roomTab === name),
      );
      button.classList.toggle("is-active", button.dataset.roomTab === name);
      if (button.dataset.roomTab === name)
        button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    });
    this.root.classList.toggle("is-terrain-editor", name === "terrain");
    const heading = this.root.querySelector("#lobby-step-heading");
    const help = this.root.querySelector("#lobby-step-help");
    const steps = lobbyJourney(this.lobby, {
      host: this.lobby?.hostPlayerId === this.playerId,
    });
    if (heading)
      heading.textContent = `${Math.max(1, steps.indexOf(name) + 1)} / ${steps.length} · ${journeyPages[name]?.[0] ?? "Votre partie"}`;
    if (heading && !steps.includes(name))
      heading.textContent = `Facultatif · ${journeyPages[name]?.[0] ?? "Votre partie"}`;
    if (pageChanged && name !== "terrain")
      heading?.focus?.({ preventScroll: true });
    if (help) help.textContent = journeyPages[name]?.[1] ?? "";
    if (name !== "terrain") this.terrainView.closeMap?.();
    if (pageChanged) this.root.scrollTop = 0;
    if (name === "terrain") this.terrainView.openMap();
  }

  showPanel() {
    this.toggle("#lobby-mode", false);
    this.showConnectStep(null);
    this.toggle("#lobby-choice", false);
    this.toggle("#lobby-connect", true);
    this.toggle("#lobby-room", false);
    this.toggle("#lobby-resume-current", this.client.hasStoredSession());
    this.setStatus("");
  }

  async resumeCurrent() {
    if (this.resumingCurrent) return;
    this.resumingCurrent = true;
    this.setStatus("Reconnexion à la partie…");
    try {
      const result = await this.client.resume();
      if (result) {
        this.playerId = result.session.playerId;
        this.renderLobby(result.lobby);
      } else this.setStatus("Aucune partie en cours à reprendre.");
    } catch (error) {
      this.toggle("#lobby-resume-current", false);
      this.setStatus(error.message);
    } finally {
      this.resumingCurrent = false;
    }
  }

  chooseAdventure(adventure) {
    this.adventure = adventure;
    this.toggle("#lobby-mode", false);
    this.toggle("#lobby-choice", true);
    this.renderAccounts();
  }

  continueAdventure() {
    if (!this.selectedAccount || this.busy) return;
    this.toggle("#lobby-choice", false);
    if (this.adventure === "test") {
      this.onSolo?.();
      return;
    }
    this.showPanel();
    if (this.adventure === "join") {
      this.roomPage = "players";
      this.showConnectStep("join");
    } else {
      this.roomPage = "terrain";
      this.quickSettingsValidated = false;
      return this.run(async () => {
        const result = await this.client.create(this.selectedAccount.name);
        if (this.adventure === "plan") {
          const configured = await this.client.configurePreparation({});
          result.lobby = configured.lobby;
        }
        return result;
      });
    }
  }

  showChoice() {
    this.terrainView?.closeMap?.();
    this.playerPlacementView?.setAvailable(false);
    this.adventure = null;
    this.root.classList.remove("is-preparation-editor");
    this.root.classList.remove("is-organizer-console");
    if (this.organizerConsole) this.organizerConsole.returnButton.hidden = true;
    this.root.classList.remove("is-quick-setup");
    this.toggle("#lobby-mode", true);
    this.roomPage = null;
    this.playerId = null;
    this.lobby = null;
    this.toggle("#lobby-choice", false);
    this.toggle("#lobby-connect", false);
    this.toggle("#lobby-room", false);
    this.setStatus("");
  }

  renderLobby(lobby) {
    if (!lobby) return;
    this.lobby = lobby;
    this.toggle("#lobby-choice", false);
    this.toggle("#lobby-mode", false);
    this.toggle("#lobby-connect", false);
    this.toggle("#lobby-room", true);
    this.root.querySelector("#lobby-room-code").textContent = lobby.code;
    const current = lobby.players.find((player) => player.id === this.playerId);
    const configuration = lobby.configuration ?? {};
    const quick =
      !lobby.resume &&
      (this.adventure === "quick" || !configuration.preparation?.enabled);
    this.root.classList.toggle("is-quick-setup", quick);
    const sport = this.root.querySelector(
      '[data-choice-select="lobby-travel-pace"] input[value="sport"]',
    );
    if (sport)
      sport.closest("label").querySelector("strong").textContent = quick
        ? "Sportif"
        : "Sportif — distances et délais intensifs";
    const tabs = this.root.querySelector(".lobby-tabs");
    const order = [
      "terrain",
      "configuration",
      "preparation",
      "players",
      "saves",
    ];
    for (const id of order)
      tabs.append(this.root.querySelector(`[data-room-tab="${id}"]`));
    const scenarioTab = this.root.querySelector(
      '[data-room-tab="preparation"]',
    );
    scenarioTab.dataset.stepName = quick ? "Scénario (facultatif)" : "Scénario";
    scenarioTab.setAttribute(
      "aria-label",
      quick ? "Scénario (facultatif)" : "Scénario et préparation",
    );
    this.setValue("#lobby-game-type", configuration.gameType ?? "cooperation");
    this.root.querySelector("#lobby-role-title").textContent = current?.isHost
      ? "Espace organisateur"
      : "Rejoindre l’aventure";
    this.root.querySelector('[data-room-tab="configuration"]').hidden =
      !current?.isHost;
    this.root.querySelector("#lobby-configuration-summary").textContent =
      `${{ cooperation: "Coopération", competition: "Compétition", duel: "Duel" }[configuration.gameType ?? "cooperation"]} · ${configuration.positionMode === "gps" ? "GPS réel" : "Simulation"} · ${lobby.players.length}/${lobby.maxPlayers} joueurs`;
    this.setValue("#lobby-position-mode", configuration.positionMode);
    this.scenarioTerrainChoice?.render(lobby, current);
    this.setValue("#lobby-max-players", String(lobby.maxPlayers));
    if (lobby.scenarios?.length) {
      this.root.querySelector("#lobby-scenario").innerHTML = lobby.scenarios
        .map(
          (scenario) =>
            `<option value="${escapeHtml(scenario.id)}">${escapeHtml(scenario.name)}</option>`,
        )
        .join("");
    }
    this.setValue("#lobby-scenario", configuration.scenarioId);
    this.setValue("#lobby-difficulty", configuration.difficulty);
    this.setValue(
      "#lobby-travel-pace",
      configuration.travelPaceMode ??
        (configuration.difficulty === "hard" ? "sport" : "calm"),
    );
    this.setValue("#lobby-hero-class", current?.heroClassId ?? "");
    this.updateGameTypeControls();
    this.terrainView.render(lobby, current);
    this.preparationView.render(lobby, current);
    const preparation = configuration.preparation;
    const observer =
      current?.isHost &&
      preparation?.enabled &&
      preparation.organizerRole !== "advanced-player";
    this.playerPlacementView?.setAvailable(
      lobby.status === "started" &&
        current?.heroClassId &&
        !observer &&
        (configuration.preparation?.hasDeferred ||
          Object.values(configuration.preparation?.locations ?? {}).some(
            (entry) =>
              ["player-walk", "validated-cell"].includes(entry.placement),
          )),
    );
    const hasQr =
      preparation?.hasQr ||
      Object.values(preparation?.locations ?? {}).some(
        (l) => l.placement === "qr",
      );
    this.root.querySelector('[data-room-tab="preparation"]').hidden =
      !current?.isHost ||
      configuration.positionMode !== "gps" ||
      Boolean(lobby.resume);
    this.root.querySelector(".lobby-hero-choice").hidden = Boolean(observer);
    if (this.qrButton)
      this.qrButton.hidden = lobby.status !== "started" || !hasQr || observer;
    if (this.organizerButton) {
      this.organizerButton.hidden =
        lobby.status !== "started" ||
        !current?.isHost ||
        !preparation?.enabled ||
        preparation.organizerRole === "absent" ||
        observer;
      this.organizerButton.textContent = "Organisateur";
    }
    const gps = configuration.positionMode === "gps";
    this.root.querySelector('[data-room-tab="terrain"]').hidden = !gps;
    this.root.querySelector('[data-room-tab="saves"]').hidden = true;
    this.root.querySelector("#lobby-open-saves").hidden =
      !current?.isHost || Boolean(lobby.resume);
    let page =
      this.roomPage ??
      (current?.isHost
        ? configuration.positionMode === "gps"
          ? "terrain"
          : "configuration"
        : "players");
    if (
      (page === "terrain" && !gps) ||
      (page === "saves" && (!current?.isHost || lobby.resume))
    )
      page = "players";
    if (page === "configuration" && !current?.isHost) page = "players";
    if (current) this.showRoomPage(page);
    const resumePanel = this.root.querySelector("#lobby-resume-panel");
    resumePanel.hidden = !current?.isHost || Boolean(lobby.resume);
    this.root
      .querySelectorAll("#lobby-configuration select")
      .forEach((control) => {
        control.disabled =
          !current?.isHost ||
          lobby.status !== "waiting" ||
          Boolean(lobby.resume);
      });
    const saveConfiguration = this.root.querySelector(
      "#lobby-save-configuration",
    );
    saveConfiguration.hidden =
      this.roomPage !== "configuration" ||
      !current?.isHost ||
      Boolean(lobby.resume);
    saveConfiguration.disabled =
      lobby.status !== "waiting" || Boolean(lobby.resume);
    this.root.querySelector("#lobby-configuration-owner").textContent =
      current?.isHost
        ? "Vous organisez cette partie. Enregistrez vos changements avant le démarrage."
        : "La configuration est contrôlée par l’organisateur.";
    const list = this.root.querySelector("#lobby-players");
    list.replaceChildren(
      ...lobby.players.map((player) => {
        const item = document.createElement("li");
        item.className = player.connected ? "is-connected" : "is-disconnected";
        const state = player.ready ? "Prêt" : "En attente";
        const heroClass =
          HERO_CLASS_LABELS[player.heroClassId] ?? "classe à choisir";
        item.textContent = `${player.isHost ? "★ " : ""}${player.name} — ${heroClass} — ${state}${player.connected ? "" : " · hors ligne"}`;
        return item;
      }),
      ...(lobby.resume?.slots ?? [])
        .filter((slot) => !slot.claimed)
        .map((slot) => {
          const item = document.createElement("li");
          item.className = "is-disconnected";
          item.textContent = `${slot.name} — ${HERO_CLASS_LABELS[slot.heroClassId] ?? slot.heroClassId} — héros attendu`;
          return item;
        }),
    );
    const ready = this.root.querySelector("#lobby-ready");
    ready.textContent = current?.ready
      ? "Je ne suis plus prêt"
      : "Je suis prêt";
    const terrainReady =
      configuration.positionMode !== "gps" || Boolean(lobby.playArea);
    ready.disabled =
      lobby.status !== "waiting" ||
      (!observer &&
        (this.heroClassesReady === false || !current?.heroClassId)) ||
      !terrainReady;
    this.root.querySelector("#lobby-hero-class").disabled =
      lobby.status !== "waiting" || Boolean(lobby.resume);
    this.syncHeroCards();
    refreshSetupChoices(this.root);
    const start = this.root.querySelector("#lobby-start");
    start.hidden = !current?.isHost;
    start.disabled =
      !terrainReady ||
      Boolean(lobby.preparationProblems?.length) ||
      (lobby.configuration.gameType === "duel" && lobby.players.length !== 2) ||
      (lobby.resume && lobby.players.length !== lobby.resume.slots.length) ||
      lobby.players.some((player) => !player.ready);
    this.setStatus(
      lobby.status === "started"
        ? "La partie démarre…"
        : lobby.resume
          ? `Reprise de « ${lobby.resume.name} » : tous les anciens héros doivent rejoindre.`
          : "",
    );
    if (
      lobby.status === "started" &&
      lobby.launch?.id &&
      lobby.launch.id !== this.startedLaunchId &&
      this.playerId
    ) {
      this.startedLaunchId = lobby.launch.id;
      if (observer) {
        this.preparationView.step =
          preparation.organizerRole === "absent" ? "review" : "install";
        this.preparationView.render(lobby, current);
        this.showRoomPage("preparation");
        this.setStatus(
          preparation.organizerRole === "absent"
            ? "La partie est ouverte. Les joueurs continuent sans intervention de votre part."
            : "La partie est ouverte. Votre console organisateur reste disponible.",
        );
      } else
        queueMicrotask(() =>
          this.onStart?.({ lobby, playerId: this.playerId }),
        );
    }
  }

  async run(operation) {
    if (this.busy) return;
    let failure = null;
    this.busy = true;
    this.setBusy(true);
    this.setStatus("");
    try {
      const result = await operation();
      if (result?.session) this.playerId = result.session.playerId;
      if (result?.lobby) this.renderLobby(result.lobby);
    } catch (error) {
      failure = error.message;
      this.setStatus(error.message);
      if (this.root.hidden) this.showQrMessage(error.message);
    } finally {
      this.busy = false;
      this.setBusy(false);
      if (this.lobby) this.renderLobby(this.lobby);
      if (failure) this.setStatus(failure);
    }
  }

  showQrMessage(message) {
    if (!this.qrFeedback) return;
    this.qrFeedback.textContent = message;
    this.qrFeedback.hidden = false;
    clearTimeout(this.qrMessageTimer);
    this.qrMessageTimer = setTimeout(() => {
      this.qrFeedback.hidden = true;
    }, 8000);
  }

  async refreshSaves() {
    await this.run(async () => {
      const { saves } = await this.client.listSaves();
      const select = this.root.querySelector("#lobby-save-list");
      select.replaceChildren(
        ...saves.map((save) => {
          const option = document.createElement("option");
          option.value = save.id;
          option.textContent = `${save.name} — ${new Date(save.savedAt).toLocaleString("fr-FR")} — ${save.playerCount} joueur(s)`;
          return option;
        }),
      );
      if (!saves.length) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "Aucune sauvegarde disponible";
        select.append(option);
      }
      return null;
    });
  }

  value(selector) {
    return this.root.querySelector(selector).value.trim();
  }

  setValue(selector, value) {
    if (value === undefined || value === null) return;
    this.root.querySelector(selector).value = value;
  }

  toggle(selector, visible) {
    this.root.querySelector(selector).hidden = !visible;
    if (selector === "#lobby-room") {
      this.root.querySelector("#lobby-room-footer").hidden = !visible;
      if (!visible) this.root.classList.remove("is-terrain-editor");
    }
  }

  setBusy(busy) {
    this.root.querySelectorAll("button").forEach((button) => {
      if (busy) button.dataset.wasDisabled = String(button.disabled);
      if (busy) button.disabled = true;
      else if (button.dataset.wasDisabled !== undefined) {
        button.disabled = button.dataset.wasDisabled === "true";
        delete button.dataset.wasDisabled;
      }
    });
  }

  setStatus(message) {
    this.root.querySelector("#lobby-status").textContent = message;
  }
}

const HERO_CLASS_LABELS = {
  warrior: "Guerrier",
  ranger: "Éclaireur",
  mage: "Mage",
};
