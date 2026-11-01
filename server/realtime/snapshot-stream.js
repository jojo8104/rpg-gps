import { diffSnapshot } from "../../app/js/core/snapshot-delta.js";

export const NETWORK_INTERVAL_MS = 3_000;
export const SIMULATION_TICK_MS = 500;

/** Per-connection baseline, AFTER visibility projection. No timers or DOM. */
export class SnapshotStream {
  constructor({ intervalMs = NETWORK_INTERVAL_MS, now = () => Date.now() } = {}) {
    this.intervalMs = intervalMs;
    this.now = now;
    this.reset();
  }
  reset() {
    this.previous = null;
    this.sequence = 0;
    this.lastSentAt = -Infinity;
    this.lastCheckedAt = -Infinity;
    this.pending = null;
  }
  queue(snapshot) { this.pending = snapshot; }
  flush(project) {
    if (!this.pending || this.now() - Math.max(this.lastSentAt, this.lastCheckedAt) < this.intervalMs) return null;
    this.lastCheckedAt = this.now();
    const snapshot = this.pending;
    this.pending = null;
    return this.encode(project(snapshot));
  }
  encode(snapshot, { full = false, reply = false } = {}) {
    const baseSequence = this.sequence;
    let packet;
    if (full || !this.previous || this.previous.code !== snapshot.code) {
      packet = { ...snapshot, sync: { kind: "full", sequence: ++this.sequence } };
    } else {
      // A global revision change alone is not a visible change.
      const previous = { ...this.previous, revision: snapshot.revision };
      const delta = diffSnapshot(previous, snapshot);
      if (!delta && !reply) return null;
      packet = { code: snapshot.code, revision: snapshot.revision,
        sync: { kind: "delta", baseSequence, sequence: ++this.sequence }, delta };
    }
    this.previous = structuredClone(snapshot);
    this.lastSentAt = this.now();
    this.pending = null;
    return packet;
  }
}
