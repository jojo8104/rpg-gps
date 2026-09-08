import { LobbyTerrainView } from "./lobby-terrain-view.js";

export class LobbyView {
  constructor(root, client, { onSolo, onStart } = {}) {
    this.root = root;
    this.client = client;
    this.onSolo = onSolo;
    this.onStart = onStart;
    this.playerId = null;
    this.lobby = null;
    this.startedLaunchId = null;
    this.accounts = [];
    this.selectedAccount = null;
    this.terrainView = new LobbyTerrainView(
      this.root.querySelector("#lobby-terrain"),
      { onSave: (playArea) => this.client.setPlayArea(playArea) },
    );
    this.client.onLobbyState((lobby) => this.renderLobby(lobby));
    this.client.onAccounts((accounts) => {
      this.accounts = accounts;
      this.renderAccounts();
    });
  }

  initialize() {
    this.terrainView.initialize();
    this.root
      .querySelector("#choose-solo")
      .addEventListener("click", () => this.onSolo?.());
    this.root
      .querySelector("#choose-multiplayer")
      .addEventListener("click", () => this.showPanel());
    this.root
      .querySelector("#account-create-form")
      .addEventListener("submit", (event) => {
        event.preventDefault();
        this.selectCreatedAccount(this.value("#account-create-name"));
      });
    this.root
      .querySelector("#lobby-back")
      .addEventListener("click", () => this.showChoice());
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
      .addEventListener("submit", (event) => {
        event.preventDefault();
        this.run(() =>
          this.client.updateConfiguration({
            positionMode: this.value("#lobby-position-mode"),
            maxPlayers: Number(this.value("#lobby-max-players")),
            scenarioId: this.value("#lobby-scenario"),
            difficulty: this.value("#lobby-difficulty"),
          }),
        );
      });
    this.root
      .querySelector("#lobby-hero-class")
      .addEventListener("change", (event) => {
        if (!event.target.value) return;
        this.run(() => this.client.selectHeroClass(event.target.value));
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
        button.title = button.disabled ? `${account.name} est déjà connecté` : "";
        button.addEventListener("click", () => this.selectAccount(account.id));
        return button;
      }),
    );
    const hasAccount = Boolean(this.selectedAccount);
    this.root.querySelector("#choose-solo").disabled = !hasAccount;
    this.root.querySelector("#choose-multiplayer").disabled = !hasAccount;
    this.root.querySelector("#account-status").textContent = hasAccount
      ? `Vous jouez en tant que ${this.selectedAccount.name}.`
      : "Choisissez votre nom. Un compte déjà utilisé est temporairement indisponible.";
  }

  async showPanel() {
    this.toggle("#lobby-choice", false);
    this.toggle("#lobby-connect", true);
    this.setStatus("Connexion au serveur…");
    try {
      const result = await this.client.resume();
      if (result) {
        this.playerId = result.session.playerId;
        this.renderLobby(result.lobby);
      } else this.setStatus("");
    } catch {
      this.setStatus("Aucune partie à reprendre.");
    }
  }

  showChoice() {
    this.playerId = null;
    this.lobby = null;
    this.toggle("#lobby-choice", true);
    this.toggle("#lobby-connect", false);
    this.toggle("#lobby-room", false);
    this.setStatus("");
  }

  renderLobby(lobby) {
    if (!lobby) return;
    this.lobby = lobby;
    this.toggle("#lobby-connect", false);
    this.toggle("#lobby-room", true);
    this.root.querySelector("#lobby-room-code").textContent = lobby.code;
    const current = lobby.players.find((player) => player.id === this.playerId);
    const configuration = lobby.configuration ?? {};
    this.setValue("#lobby-position-mode", configuration.positionMode);
    this.setValue("#lobby-max-players", String(lobby.maxPlayers));
    this.setValue("#lobby-scenario", configuration.scenarioId);
    this.setValue("#lobby-difficulty", configuration.difficulty);
    this.setValue("#lobby-hero-class", current?.heroClassId ?? "");
    this.terrainView.render(lobby, current);
    const resumePanel = this.root.querySelector("#lobby-resume-panel");
    resumePanel.hidden = !current?.isHost || Boolean(lobby.resume);
    this.root
      .querySelectorAll("#lobby-configuration select")
      .forEach((control) => {
        control.disabled = !current?.isHost || lobby.status !== "waiting" || Boolean(lobby.resume);
      });
    const saveConfiguration = this.root.querySelector(
      "#lobby-save-configuration",
    );
    saveConfiguration.hidden = !current?.isHost || Boolean(lobby.resume);
    saveConfiguration.disabled = lobby.status !== "waiting" || Boolean(lobby.resume);
    this.root.querySelector("#lobby-configuration-owner").textContent = current
      ?.isHost
      ? "Vous organisez cette partie. Enregistrez vos changements avant le démarrage."
      : "La configuration est contrôlée par l’organisateur.";
    const list = this.root.querySelector("#lobby-players");
    list.replaceChildren(
      ...lobby.players.map((player) => {
        const item = document.createElement("li");
        item.className = player.connected ? "is-connected" : "is-disconnected";
        const state = player.ready ? "Prêt" : "En attente";
        const heroClass = HERO_CLASS_LABELS[player.heroClassId] ?? "classe à choisir";
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
      lobby.status !== "waiting" || !current?.heroClassId || !terrainReady;
    this.root.querySelector("#lobby-hero-class").disabled =
      lobby.status !== "waiting" || Boolean(lobby.resume);
    const start = this.root.querySelector("#lobby-start");
    start.hidden = !current?.isHost;
    start.disabled =
      !terrainReady ||
      lobby.players.length < 2 ||
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
      queueMicrotask(() => this.onStart?.({ lobby, playerId: this.playerId }));
    }
  }

  async run(operation) {
    this.setBusy(true);
    this.setStatus("");
    try {
      const result = await operation();
      if (result?.session) this.playerId = result.session.playerId;
      if (result?.lobby) this.renderLobby(result.lobby);
    } catch (error) {
      this.setStatus(error.message);
    } finally {
      this.setBusy(false);
      if (this.lobby) this.renderLobby(this.lobby);
    }
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
