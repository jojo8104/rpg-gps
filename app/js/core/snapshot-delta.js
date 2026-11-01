// JSON-only patches. Collections with stable ids send only changed entities.
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const keyedBy = (list, key) =>
  list.every((item) => object(item) && typeof item[key] === "string") &&
  new Set(list.map((item) => item[key])).size === list.length;

export function diffSnapshot(before, after) {
  if (equal(before, after)) return null;
  if (Array.isArray(before) && Array.isArray(after)) {
    const key = ["id", "playerId"].find((candidate) => keyedBy(before, candidate) && keyedBy(after, candidate));
    if (key) {
      const previous = new Map(before.map((item) => [item[key], item]));
      const next = new Map(after.map((item) => [item[key], item]));
      const changes = [];
      for (const [id, value] of next) {
        const patch = diffSnapshot(previous.get(id), value);
        if (patch) changes.push([id, patch]);
      }
      const removed = [...previous.keys()].filter((id) => !next.has(id));
      const defaultOrder = [...previous.keys()].filter((id) => next.has(id))
        .concat([...next.keys()].filter((id) => !previous.has(id)));
      return { kind: "items", key, changes, removed,
        ...(!equal(defaultOrder, [...next.keys()]) ? { order: [...next.keys()] } : {}) };
    }
    const changes = [];
    after.forEach((value, index) => {
      const patch = diffSnapshot(before[index], value);
      if (patch) changes.push([index, patch]);
    });
    return { kind: "array", length: after.length, changes };
  }
  if (object(before) && object(after)) {
    const changes = [];
    for (const key of Object.keys(after)) {
      const patch = diffSnapshot(before[key], after[key]);
      if (patch) changes.push([key, patch]);
    }
    return { kind: "object", changes, removed: Object.keys(before).filter((key) => !Object.hasOwn(after, key)) };
  }
  return { kind: "replace", value: structuredClone(after) };
}

export function applySnapshotDelta(before, patch) {
  if (!patch) return structuredClone(before);
  if (patch.kind === "replace") return structuredClone(patch.value);
  if (patch.kind === "items") {
    const items = new Map(before.map((item) => [item[patch.key], structuredClone(item)]));
    for (const id of patch.removed) items.delete(id);
    for (const [id, change] of patch.changes) items.set(id, applySnapshotDelta(items.get(id), change));
    return patch.order ? patch.order.map((id) => items.get(id)) : [...items.values()];
  }
  if (patch.kind === "array") {
    const result = structuredClone(before);
    result.length = patch.length;
    for (const [index, change] of patch.changes) result[index] = applySnapshotDelta(result[index], change);
    return result;
  }
  if (patch.kind !== "object") throw new Error("Unknown snapshot patch");
  const result = structuredClone(before);
  for (const key of patch.removed) delete result[key];
  for (const [key, change] of patch.changes) {
    Object.defineProperty(result, key, { value: applySnapshotDelta(result[key], change),
      enumerable: true, configurable: true, writable: true });
  }
  return result;
}

// The cache is independent of the mutable game used by the UI.
export class SnapshotReceiver {
  constructor() { this.streams = new Map(); }
  clear() { this.streams.clear(); }
  receive(stream, packet) {
    if (!packet?.sync) return structuredClone(packet);
    const previous = this.streams.get(stream);
    const { sync, ...payload } = packet;
    if (sync.kind === "full") {
      this.streams.set(stream, { sequence: sync.sequence, snapshot: structuredClone(payload) });
      return structuredClone(payload);
    }
    if (!previous || previous.snapshot.code !== packet.code ||
      previous.sequence !== sync.baseSequence) throw new Error("Snapshot resynchronization required");
    const snapshot = { ...previous.snapshot, revision: packet.revision ?? previous.snapshot.revision };
    const result = applySnapshotDelta(snapshot, packet.delta);
    this.streams.set(stream, { sequence: sync.sequence, snapshot: result });
    return structuredClone(result);
  }
}
