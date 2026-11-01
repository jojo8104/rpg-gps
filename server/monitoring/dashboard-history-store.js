import { mkdir, appendFile, readFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { WORLD_SAMPLE_LIMIT } from "./world-sample.js";
const SEGMENT_SIZE = 200;
/** Historique append-only segmenté. Aucune série complète n'est gardée en mémoire. */
export class DashboardHistoryStore {
  constructor({
    directory,
    segmentSize = SEGMENT_SIZE,
    limit = WORLD_SAMPLE_LIMIT,
    retainAll = limit === WORLD_SAMPLE_LIMIT,
  }) {
    this.segmentSize = segmentSize;
    this.limit = limit;
    this.retainAll = retainAll;
    this.segmentLimit = Math.ceil(limit / segmentSize) + 1;
    this.directory = path.resolve(directory);
    this.cursors = new Map();
    this.pending = new Map();
  }
  code(value) {
    if (!/^[A-Z2-9]{5}$/.test(value ?? ""))
      throw new TypeError("Code de partie invalide.");
    return value;
  }
  async files(code) {
    this.code(code);
    await mkdir(this.directory, { recursive: true });
    return (await readdir(this.directory))
      .filter(
        (name) =>
          name.startsWith(`${code}-`) && /^.{5}-\d{10}\.ndjson$/.test(name),
      )
      .sort();
  }
  append(code, sample) {
    this.code(code);
    if (this.pending.has(code)) return false;
    const task = this.write(code, sample)
      .catch((error) =>
        console.error("[dashboard] relevé non enregistré", error.message),
      )
      .finally(() => this.pending.delete(code));
    this.pending.set(code, task);
    return true;
  }
  async write(code, sample) {
    let cursor = this.cursors.get(code);
    if (!cursor) {
      const files = await this.files(code);
      const last = files.at(-1);
      const count = last
        ? (await readFile(path.join(this.directory, last), "utf8"))
            .trim()
            .split("\n").length
        : 0;
      cursor = { segment: last ? Number(last.slice(6, 16)) : 0, count };
      this.cursors.set(code, cursor);
    }
    if (cursor.count >= this.segmentSize) {
      cursor.segment++;
      cursor.count = 0;
    }
    await mkdir(this.directory, { recursive: true });
    await appendFile(
      path.join(
        this.directory,
        `${code}-${String(cursor.segment).padStart(10, "0")}.ndjson`,
      ),
      JSON.stringify(sample) + "\n",
    );
    cursor.count++;
    if (!this.retainAll && cursor.count === 1) {
      const files = await this.files(code);
      for (const name of files.slice(0, -this.segmentLimit))
        await unlink(path.join(this.directory, name));
    }
  }
  async read(code, since = 0, { all = false } = {}) {
    const limit = all ? Infinity : this.limit;
    await this.pending.get(code);
    let samples = [];
    const files = (await this.files(code))
      .slice(all ? 0 : -this.segmentLimit)
      .reverse();
    for (const name of files) {
      const content = await readFile(path.join(this.directory, name), "utf8");
      const segment = [];
      for (const line of content.split("\n"))
        if (line.trim()) {
          try {
            segment.push(JSON.parse(line));
          } catch {
            /* Ligne interrompue. */
          }
        }
      samples = [...segment, ...samples];
      if (samples.length >= limit || (segment.length && segment[0].at <= since))
        break;
    }
    return samples.slice(-limit).filter((sample) => sample.at > since);
  }
  async delete(code) {
    await this.pending.get(code);
    for (const name of await this.files(code))
      await unlink(path.join(this.directory, name));
    this.cursors.delete(code);
  }
  async flush() {
    await Promise.all(this.pending.values());
  }
}
