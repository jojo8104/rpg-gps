import { SnapshotReceiver } from "./core/snapshot-delta.js";

const STORAGE_KEY = "rpg-gps-multiplayer-session";

export class MultiplayerClient {
  constructor({
    socketFactory = globalThis.io,
    storage = globalThis.localStorage,
  } = {}) {
    if (typeof socketFactory !== "function")
      throw new Error("Le serveur multijoueur est indisponible.");
    this.socket = socketFactory({
      autoConnect: true,
      transports: ["websocket", "polling"],
    });
    this.storage = storage;
    this.listeners = new Set();
    this.positionListeners = new Set();
    this.worldStateListeners = new Set();
    this.gameStateListeners = new Set();
    this.savedListeners = new Set();
    this.accountListeners = new Set();
    this.selectedAccount = null;
    this.lastPositionSentAt = 0;
    this.lastHeroStateSentAt = 0;
    this.worldRevision = 0;
    this.gameRevision = 0;
    this.snapshotReceiver = new SnapshotReceiver();
    this.resyncPending = false;
    this.sessionActive = false;
    this.resumePending = null;
    this.sessionBound = false;
    this.socket.on("disconnect", () => {
      this.sessionBound = false;
      this.snapshotReceiver.clear();
    });
    this.socket.on("connect", () => {
      if (this.sessionActive && this.#storedToken())
        this.resume().catch(() => {});
    });
    this.socket.on("lobby:state", (lobby) => this.#publish(lobby));
    for (const event of ["game:positions", "game:world-state", "game:state"])
      this.socket.on(event, (packet) => this.#receiveSnapshot(event, packet));
    const endSession = (notice) => {
      this.sessionActive = false;
      this.sessionBound = false;
      this.snapshotReceiver.clear();
      this.storage?.removeItem(STORAGE_KEY);
      this.savedListeners.forEach((listener) => listener(notice));
    };
    this.socket.on("game:saved", endSession);
    this.socket.on("game:ended", endSession);
    this.socket.on("account:state", (accounts) =>
      this.accountListeners.forEach((listener) => listener(accounts)),
    );
  }

  onLobbyState(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onPositions(listener) {
    this.positionListeners.add(listener);
    return () => this.positionListeners.delete(listener);
  }

  onWorldState(listener) {
    this.worldStateListeners.add(listener);
    return () => this.worldStateListeners.delete(listener);
  }

  onGameState(listener) {
    this.gameStateListeners.add(listener);
    return () => this.gameStateListeners.delete(listener);
  }

  onGameSaved(listener) {
    this.savedListeners.add(listener);
    return () => this.savedListeners.delete(listener);
  }

  onAccounts(listener) {
    this.accountListeners.add(listener);
    return () => this.accountListeners.delete(listener);
  }

  async createAccount(name) {
    return this.#request("account:create", { name });
  }

  async deleteAccount(accountId) {
    const result = await this.#request("account:delete", { accountId });
    if (this.selectedAccount?.id === accountId) this.selectedAccount = null;
    return result;
  }

  async listAccounts() {
    return this.#request("account:list", {});
  }

  async selectAccount(accountId) {
    const result = await this.#request("account:select", { accountId });
    this.selectedAccount = result.account;
    return result;
  }

  async create(playerName) {
    return this.#sessionRequest("lobby:create", { playerName });
  }

  async createSolo(configuration) {
    return this.#sessionRequest("lobby:solo", configuration);
  }

  async join(code, playerName) {
    return this.#sessionRequest("lobby:join", { code, playerName });
  }

  resume() {
    if (this.resumePending) return this.resumePending;
    this.resumePending = this.#resumeSession().finally(() => {
      this.resumePending = null;
    });
    return this.resumePending;
  }

  async #resumeSession() {
    const token = this.#storedToken();
    if (!token) return null;
    try {
      return await this.#sessionRequest("lobby:resume", { token });
    } catch (error) {
      this.sessionBound = false;
      if (error.code === "session_expired") {
        this.storage?.removeItem(STORAGE_KEY);
        this.sessionActive = false;
      }
      throw error;
    }
  }

  hasStoredSession() {
    return Boolean(this.#storedToken());
  }

  async setReady(ready) {
    return this.#request("lobby:ready", { ready });
  }

  async updateConfiguration(configuration) {
    return this.#request("lobby:configure", configuration);
  }

  async selectHeroClass(heroClassId, heroGender) {
    return this.#request("lobby:hero-class", { heroClassId, heroGender });
  }

  async setPlayArea(playArea) {
    return this.#request("lobby:play-area", playArea);
  }

  configurePreparation(change) {
    return this.#request("lobby:preparation", change);
  }
  installQrLocation(qrId, position) {
    return this.#request("lobby:qr-install", { qrId, position });
  }
  printPreparation() {
    return this.#request("lobby:qr-print", {});
  }
  scanQrLocation(qrId) {
    return this.#request("game:qr-scan", { qrId });
  }

  async sendPosition(position) {
    const now = Date.now();
    if (now - this.lastPositionSentAt < 750) return null;
    this.lastPositionSentAt = now;
    return this.#request("game:position", {
      latitude: position.latitude,
      longitude: position.longitude,
      accuracy: position.accuracy ?? null,
      heading: position.heading ?? null,
      concealmentMultiplier: position.concealmentMultiplier ?? null,
    });
  }

  async sendHeroState(hero) {
    const now = Date.now();
    if (now - this.lastHeroStateSentAt < 1_000) return null;
    this.lastHeroStateSentAt = now;
    return this.#request("game:hero-state", {
      health: hero.health,
      maxHealth: hero.maxHealth,
      level: hero.level,
      state: hero.state,
      commandPoints: hero.commandPoints,
      maxCommandPoints: hero.maxCommandPoints,
      units: hero.army.units.map((unit) => ({
        id: unit.id,
        typeId: unit.typeId,
        quantity: unit.quantity,
        combatantCount: unit.combatantCount,
      })),
    });
  }

  async sendWorldState(state) {
    const result = await this.#request("game:world-state", {
      baseRevision: this.worldRevision,
      state,
    });
    if (Number.isInteger(result.world?.revision))
      this.worldRevision = Math.max(this.worldRevision, result.world.revision);
    return result;
  }

  async bootstrapGame(state) {
    return this.#request("game:bootstrap", { state });
  }

  async sendGameCommand(command, args = []) {
    return this.#request("game:command", { command, args });
  }

  async sendBattleCommand(battleId, command, args = []) {
    return this.#request("battle:command", { battleId, command, args });
  }

  async requestGameState() {
    return this.#request("game:sync", {});
  }

  async start() {
    return this.#request("lobby:start", {});
  }

  async listMaps() {
    return this.#request("map:list", {});
  }
  async saveMap(name, playArea) {
    return this.#request("map:save", { name, playArea });
  }
  async deleteMap(id) {
    return this.#request("map:delete", { id });
  }

  async listSaves() {
    return this.#request("save:list", {});
  }

  listSavedGames() {
    return this.#rawRequest("save:catalog", {});
  }

  openSavedGame(saveId) {
    return this.#sessionRequest("save:open", { saveId });
  }

  async loadSave(saveId) {
    return this.#sessionRequest("save:load", { saveId });
  }

  async saveAndEnd(name) {
    return this.#request("game:save-and-end", { name });
  }

  async destroyGame() {
    return this.#request("game:destroy", {});
  }

  async leave() {
    const result = await this.#request("lobby:leave", {});
    this.storage?.removeItem(STORAGE_KEY);
    this.sessionActive = false;
    this.snapshotReceiver.clear();
    return result;
  }

  #receiveSnapshot(event, packet) {
    let snapshot;
    try {
      snapshot = this.snapshotReceiver.receive(event, packet);
    } catch {
      if (!this.resyncPending) {
        this.resyncPending = true;
        this.requestGameState()
          .catch(() => {})
          .finally(() => {
            this.resyncPending = false;
          });
      }
      return null;
    }
    if (event === "game:state") {
      this.gameRevision = snapshot?.revision ?? 0;
      this.gameStateListeners.forEach((listener) => listener(snapshot));
    } else if (event === "game:world-state") {
      this.worldRevision = snapshot?.revision ?? 0;
      this.worldStateListeners.forEach((listener) => listener(snapshot));
    } else this.positionListeners.forEach((listener) => listener(snapshot));
    return snapshot;
  }

  async #sessionRequest(event, payload) {
    const result = await this.#rawRequest(event, payload);
    this.sessionActive = true;
    this.sessionBound = true;
    if (result.session?.token)
      this.storage?.setItem(STORAGE_KEY, result.session.token);
    if (result.lobby) this.#publish(result.lobby);
    return result;
  }

  async #request(event, payload) {
    if (this.resumePending) await this.resumePending;
    else if (this.sessionActive && !this.sessionBound) await this.resume();
    return this.#rawRequest(event, payload);
  }

  #rawRequest(event, payload) {
    return new Promise((resolve, reject) => {
      this.socket
        .timeout(8_000)
        .emit(event, payload, (timeoutError, response) => {
          if (timeoutError)
            return reject(new Error("Le serveur ne répond pas."));
          if (!response?.ok)
            return reject(
              Object.assign(
                new Error(response?.error?.message ?? "Demande refusée."),
                { code: response?.error?.code },
              ),
            );
          if (response.game?.sync)
            response.game = this.#receiveSnapshot("game:state", response.game);
          resolve(response);
        });
    });
  }

  #publish(lobby) {
    this.listeners.forEach((listener) => listener(lobby));
  }

  #storedToken() {
    try {
      return this.storage?.getItem(STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
  }
}
