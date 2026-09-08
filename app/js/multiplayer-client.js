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
    this.socket.on("lobby:state", (lobby) => this.#publish(lobby));
    this.socket.on("game:positions", (snapshot) =>
      this.positionListeners.forEach((listener) => listener(snapshot)),
    );
    this.socket.on("game:world-state", (snapshot) => {
      if (Number.isInteger(snapshot?.revision))
        this.worldRevision = Math.max(this.worldRevision, snapshot.revision);
      this.worldStateListeners.forEach((listener) => listener(snapshot));
    });
    this.socket.on("game:state", (snapshot) => {
      if (Number.isInteger(snapshot?.revision))
        this.gameRevision = Math.max(this.gameRevision, snapshot.revision);
      this.gameStateListeners.forEach((listener) => listener(snapshot));
    });
    this.socket.on("game:saved", (notice) => {
      this.storage?.removeItem(STORAGE_KEY);
      this.savedListeners.forEach((listener) => listener(notice));
    });
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

  async join(code, playerName) {
    return this.#sessionRequest("lobby:join", { code, playerName });
  }

  async resume() {
    const token = this.#storedToken();
    if (!token) return null;
    try {
      return await this.#sessionRequest("lobby:resume", { token });
    } catch (error) {
      this.storage?.removeItem(STORAGE_KEY);
      throw error;
    }
  }

  async setReady(ready) {
    return this.#request("lobby:ready", { ready });
  }

  async updateConfiguration(configuration) {
    return this.#request("lobby:configure", configuration);
  }

  async selectHeroClass(heroClassId) {
    return this.#request("lobby:hero-class", { heroClassId });
  }

  async setPlayArea(playArea) {
    return this.#request("lobby:play-area", playArea);
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

  async listSaves() {
    return this.#request("save:list", {});
  }

  async loadSave(saveId) {
    return this.#sessionRequest("save:load", { saveId });
  }

  async saveAndEnd(name) {
    return this.#request("game:save-and-end", { name });
  }

  async leave() {
    const result = await this.#request("lobby:leave", {});
    this.storage?.removeItem(STORAGE_KEY);
    return result;
  }

  async #sessionRequest(event, payload) {
    const result = await this.#request(event, payload);
    if (result.session?.token)
      this.storage?.setItem(STORAGE_KEY, result.session.token);
    if (result.lobby) this.#publish(result.lobby);
    return result;
  }

  #request(event, payload) {
    return new Promise((resolve, reject) => {
      this.socket
        .timeout(8_000)
        .emit(event, payload, (timeoutError, response) => {
          if (timeoutError)
            return reject(new Error("Le serveur ne répond pas."));
          if (!response?.ok)
            return reject(
              new Error(response?.error?.message ?? "Demande refusée."),
            );
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
