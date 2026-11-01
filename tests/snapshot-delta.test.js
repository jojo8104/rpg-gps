import test from "node:test";
import assert from "node:assert/strict";
import { diffSnapshot, applySnapshotDelta, SnapshotReceiver } from "../app/js/core/snapshot-delta.js";
import { SnapshotStream } from "../server/realtime/snapshot-stream.js";

const wire = (value) => JSON.parse(JSON.stringify(value));
test("a moving group sends no unchanged marker, and only changed fields", () => {
  const before = { locations: [{ id: "mine", name: "Mine", stock: 42 }], autonomousGroups: [{ id: "ga", position: { latitude: 1, longitude: 2 }, army: { soldiers: 40 } }] };
  const after = structuredClone(before);
  after.autonomousGroups[0].position.latitude = 3;
  const delta = wire(diffSnapshot(before, after));
  assert.deepEqual(applySnapshotDelta(before, delta), after);
  assert.equal(JSON.stringify(delta).includes("locations"), false);
  assert.equal(JSON.stringify(delta).includes("army"), false);
  assert.deepEqual(before.autonomousGroups[0].position, { latitude: 1, longitude: 2 });
});

test("additions, disappearance, reorder, empty lists and nested removals round trip", () => {
  const examples = [
    [[{ id: "a", x: 1 }, { id: "b", x: 2 }], [{ id: "b", x: 3 }, { id: "c", x: null }]],
    [[{ id: "a" }, { id: "b" }], [{ id: "b" }, { id: "a" }]],
    [[], [{ id: "a" }]], [[{ id: "a" }], []],
    [[null, "a"], ["b"]], [{ x: { a: 1, b: 2 } }, { x: { b: 3 } }],
    [[{ playerId: "a", x: 1 }, { playerId: "b", x: 2 }], [{ playerId: "b", x: 3 }]],
  ];
  for (const [a, b] of examples) assert.deepEqual(applySnapshotDelta(a, wire(diffSnapshot(a, b))), b);
});

test("automatic stream coalesces updates over 3 seconds; hidden changes send nothing", () => {
  let at = 0;
  const stream = new SnapshotStream({ now: () => at });
  const receiver = new SnapshotReceiver();
  const project = (s) => ({ code: "A", revision: s.revision, state: { groups: s.groups.filter((g) => g.visible) } });
  const state = { revision: 1, groups: [{ id: "a", visible: true, x: 0 }, { id: "b", visible: false, x: 0 }] };
  stream.queue(structuredClone(state));
  receiver.receive("game", wire(stream.flush(project)));
  for (at = 500; at < 3000; at += 500) {
    state.groups[0].x++;
    state.revision++;
    stream.queue(structuredClone(state));
    assert.equal(stream.flush(project), null);
  }
  const packet = wire(stream.flush(project));
  assert.equal(packet.sync.kind, "delta");
  assert.equal(receiver.receive("game", packet).state.groups[0].x, 5);
  at = 6000;
  state.groups[1].x = 999;
  state.revision++;
  stream.queue(structuredClone(state));
  assert.equal(stream.flush(project), null);
  at = 9000;
  state.groups[0].visible = false;
  state.groups[1].visible = true;
  stream.queue(state);
  const switched = receiver.receive("game", wire(stream.flush(project)));
  assert.deepEqual(switched.state.groups.map((g) => g.id), ["b"]);
});

test("lost delta requires resync; full snapshot restores and UI mutation cannot corrupt baseline", () => {
  const stream = new SnapshotStream();
  const receiver = new SnapshotReceiver();
  const snapshot = (x) => ({ code: "A", revision: x, state: { x } });
  const first = receiver.receive("game", wire(stream.encode(snapshot(1))));
  first.state.x = 999;
  stream.encode(snapshot(2));
  assert.throws(() => receiver.receive("game", wire(stream.encode(snapshot(3)))), /resynchronization/);
  assert.equal(receiver.receive("game", wire(stream.encode(snapshot(4), { full: true }))).state.x, 4);
  assert.equal(receiver.receive("game", wire(stream.encode(snapshot(5)))).state.x, 5);
});
