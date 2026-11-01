const point = (value) => Array.isArray(value) ? [...value] : [value.latitude, value.longitude];
const mix = (a, b, t) => a.map((value, index) => value + (b[index] - value) * t);

/** Presentation only: never writes into a group or its authoritative position. */
export class AutonomousGroupAnimator {
  constructor({ now = () => performance.now(), requestFrame = (fn) => requestAnimationFrame(fn),
    cancelFrame = (id) => cancelAnimationFrame(id), correctionMs = 400 } = {}) {
    this.now = now;
    this.requestFrame = requestFrame;
    this.cancelFrame = cancelFrame;
    this.correctionMs = correctionMs;
    this.entries = new Map();
    // Keep trajectory clocks across visibility changes, without retaining markers.
    this.hiddenTrajectories = new Map();
    this.frame = null;
  }

  update(group, marker) {
    const signature = JSON.stringify([group.status, group.position, group.movement]);
    const previous = this.entries.get(group.id);
    if (previous?.signature === signature && previous.marker === marker) return;
    const at = this.now();
    const hidden = this.hiddenTrajectories.get(group.id);
    this.hiddenTrajectories.delete(group.id);
    const retained = previous ?? hidden;
    if (retained?.signature === signature) {
      const entry = { ...retained, marker };
      this.entries.set(group.id, entry);
      marker.setLatLng(this.sample(entry, at));
      entry.settled = !this.active(entry, at);
      this.schedule();
      return;
    }
    const position = point(group.position);
    const movement = group.movement;
    const moving = group.status === "traveling" && movement?.destination &&
      Number.isFinite(movement.arrivesAt) && Number.isFinite(movement.lastProcessedAt);
    const duration = moving ? Math.max(0, movement.arrivesAt - movement.lastProcessedAt) : 0;
    const visual = previous ? this.sample(previous, at) : position;
    const entry = { signature, marker, position, destination: moving ? point(movement.destination) : position,
      duration, receivedAt: at, offset: visual.map((value, index) => value - position[index]) };
    this.entries.set(group.id, entry);
    marker.setLatLng(this.sample(entry, at));
    entry.settled = !this.active(entry, at);
    this.schedule();
  }

  sample(entry, at) {
    const elapsed = Math.max(0, at - entry.receivedAt);
    const t = entry.duration > 0 ? Math.min(1, elapsed / entry.duration) : 1;
    const target = mix(entry.position, entry.destination, t);
    const correction = this.correctionMs > 0 ? Math.max(0, 1 - elapsed / this.correctionMs) ** 3 : 0;
    return target.map((value, index) => value + entry.offset[index] * correction);
  }

  active(entry, at) {
    const elapsed = at - entry.receivedAt;
    return elapsed < entry.duration ||
      (elapsed < this.correctionMs && entry.offset.some((value) => Math.abs(value) > 1e-12));
  }

  schedule() {
    if (this.frame !== null || ![...this.entries.values()].some((entry) => this.active(entry, this.now()))) return;
    this.frame = this.requestFrame(() => {
      this.frame = null;
      const at = this.now();
      for (const entry of this.entries.values()) {
        if (entry.settled) continue;
        entry.marker.setLatLng(this.sample(entry, at));
        entry.settled = !this.active(entry, at);
      }
      this.schedule();
    });
  }

  retain(ids) {
    for (const [id, entry] of this.entries) {
      if (ids.has(id)) continue;
      const { marker, ...trajectory } = entry;
      this.hiddenTrajectories.set(id, trajectory);
      this.entries.delete(id);
    }
    // Bound presentation-only history for worlds that create groups indefinitely.
    while (this.hiddenTrajectories.size > 256)
      this.hiddenTrajectories.delete(this.hiddenTrajectories.keys().next().value);
    const at = this.now();
    for (const entry of this.entries.values()) {
      if (!entry.settled && !this.active(entry, at)) {
        entry.marker.setLatLng(this.sample(entry, at));
        entry.settled = true;
      }
    }
    if (![...this.entries.values()].some((entry) => this.active(entry, this.now())) && this.frame !== null) {
      this.cancelFrame(this.frame);
      this.frame = null;
    }
  }

  dispose() {
    this.retain(new Set());
    this.hiddenTrajectories.clear();
  }
}
