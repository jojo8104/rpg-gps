import { existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const STATE_VERSION = 1;

export class ServerStateStore {
  constructor({ directory, fileName = "server-state.json", debounceMs = 100 } = {}) {
    if (typeof directory !== "string" || !directory.trim()) {
      throw new TypeError("Le répertoire de persistance est requis.");
    }
    this.directory = path.resolve(directory);
    this.filePath = path.join(this.directory, fileName);
    this.debounceMs = debounceMs;
    this.pendingText = null;
    this.timer = null;
    this.writePromise = null;
  }

  loadSync() {
    if (!existsSync(this.filePath)) return null;
    try {
      const state = JSON.parse(readFileSync(this.filePath, "utf8"));
      if (state?.version !== STATE_VERSION || !Array.isArray(state.lobbies)) {
        throw new TypeError("Version de sauvegarde inconnue.");
      }
      return state;
    } catch (error) {
      mkdirSync(this.directory, { recursive: true, mode: 0o750 });
      const quarantinePath = `${this.filePath}.corrupt-${Date.now()}`;
      renameSync(this.filePath, quarantinePath);
      console.error(
        `Sauvegarde RPG GPS illisible, déplacée vers ${quarantinePath} :`,
        error instanceof Error ? error.message : error,
      );
      return null;
    }
  }

  schedule(state) {
    this.pendingText = `${JSON.stringify({ ...state, version: STATE_VERSION })}\n`;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.#drain().catch((error) => {
        console.error(
          "Impossible d’écrire la sauvegarde RPG GPS :",
          error instanceof Error ? error.message : error,
        );
      });
    }, this.debounceMs);
    this.timer.unref?.();
  }

  async flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.#drain();
  }

  async #drain() {
    if (this.writePromise) {
      await this.writePromise;
      if (this.pendingText !== null) return this.#drain();
      return;
    }
    if (this.pendingText === null) return;
    const text = this.pendingText;
    this.pendingText = null;
    this.writePromise = this.#writeAtomically(text);
    try {
      await this.writePromise;
    } finally {
      this.writePromise = null;
    }
    if (this.pendingText !== null) await this.#drain();
  }

  async #writeAtomically(text) {
    await mkdir(this.directory, { recursive: true, mode: 0o750 });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    try {
      await writeFile(temporaryPath, text, { encoding: "utf8", mode: 0o600 });
      await rename(temporaryPath, this.filePath);
    } catch (error) {
      await unlink(temporaryPath).catch(() => {});
      throw error;
    }
  }
}
