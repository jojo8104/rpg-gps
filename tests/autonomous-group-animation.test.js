import test from "node:test";
import assert from "node:assert/strict";
import { AutonomousGroupAnimator } from "../app/js/map/AutonomousGroupAnimator.js";

function fixture() {
  let at = 0, id = 0;
  const frames = new Map();
  const animator = new AutonomousGroupAnimator({ now: () => at,
    requestFrame: (fn) => { frames.set(++id, fn); return id; }, cancelFrame: (key) => frames.delete(key) });
  const marker = { position: null, writes: 0, setLatLng(value) { this.position = value; this.writes++; } };
  const group = { id: "ga", status: "traveling", position: { latitude: 0, longitude: 0 },
    movement: { destination: { latitude: 10, longitude: 20 }, lastProcessedAt: 1700000000000, arrivesAt: 1700000010000 } };
  return { animator, marker, group, frames, tick(time) {
    at = time;
    const pending = [...frames.values()]; frames.clear(); pending.forEach((fn) => fn(at));
  } };
}

test("visual position advances between packets without touching authoritative data or relying on wall-clock alignment", () => {
  const f = fixture();
  const official = structuredClone(f.group);
  f.animator.update(f.group, f.marker);
  f.tick(1500);
  assert.deepEqual(f.marker.position, [1.5, 3]);
  f.tick(3000);
  assert.deepEqual(f.marker.position, [3, 6]);
  assert.deepEqual(f.group, official);
  assert.equal(f.frames.size, 1);
});

test("unchanged UI renders do not restart the trajectory; arrival stops animation", () => {
  const f = fixture();
  f.animator.update(f.group, f.marker);
  f.tick(3000);
  f.animator.update(structuredClone(f.group), f.marker);
  f.tick(5000);
  assert.deepEqual(f.marker.position, [5, 10]);
  f.tick(12000);
  assert.deepEqual(f.marker.position, [10, 20]);
  assert.equal(f.frames.size, 0);
});

test("new server trajectory corrects smoothly, then follows its new destination", () => {
  const f = fixture();
  f.animator.update(f.group, f.marker);
  f.tick(3000);
  f.group.position = { latitude: 2, longitude: 4 };
  f.group.movement = { destination: { latitude: 2, longitude: 14 }, lastProcessedAt: 3000, arrivesAt: 8000 };
  f.animator.update(f.group, f.marker);
  assert.deepEqual(f.marker.position, [3, 6]);
  f.tick(3400);
  assert.deepEqual(f.marker.position, [2, 4.8]);
  f.tick(8000);
  assert.deepEqual(f.marker.position, [2, 14]);
});

test("an interruption settles on the official position and cancels forward motion", () => {
  const f = fixture();
  f.animator.update(f.group, f.marker);
  f.tick(3000);
  f.group.status = "interrupted";
  f.group.position = [2, 4];
  f.animator.update(f.group, f.marker);
  assert.deepEqual(f.marker.position, [3, 6]);
  f.tick(3400);
  assert.deepEqual(f.marker.position, [2, 4]);
  assert.equal(f.frames.size, 0);
});

test("one animation loop for all moving groups; stationary markers are not rewritten each frame", () => {
  const f = fixture();
  f.animator.update(f.group, f.marker);
  const stationary = { writes: 0, setLatLng() { this.writes++; } };
  f.animator.update({ ...f.group, id: "idle", status: "idle" }, stationary);
  f.animator.update({ ...f.group, id: "second" }, { setLatLng() {} });
  assert.equal(f.frames.size, 1);
  f.tick(500);
  f.tick(1000);
  assert.equal(stationary.writes, 1);
});

test("invisible groups and unloaded maps leave no running frame or stale marker writes", () => {
  const f = fixture();
  f.animator.update(f.group, f.marker);
  f.animator.retain(new Set());
  const writes = f.marker.writes;
  f.tick(1000);
  assert.equal(f.marker.writes, writes);
  assert.equal(f.frames.size, 0);
  f.animator.update(f.group, f.marker);
  f.animator.dispose();
  assert.equal(f.frames.size, 0);
});

test("a convoy reappears at its ongoing trajectory position with a new marker", () => {
  const f = fixture();
  const official = structuredClone(f.group);
  f.animator.update(f.group, f.marker);
  f.tick(3000);
  f.animator.retain(new Set());
  const writes = f.marker.writes;
  f.tick(5000);
  const returning = { setLatLng(value) { this.position = value; } };
  f.animator.update(structuredClone(f.group), returning);
  assert.deepEqual(returning.position, [5, 10]);
  f.tick(7000);
  assert.deepEqual(returning.position, [7, 14]);
  assert.equal(f.marker.writes, writes);
  assert.deepEqual(f.group, official);
});

test("a hidden convoy that reached its destination does not restart on reappearance", () => {
  const f = fixture();
  f.animator.update(f.group, f.marker);
  f.animator.retain(new Set());
  f.tick(12000);
  f.animator.update(f.group, f.marker);
  assert.deepEqual(f.marker.position, [10, 20]);
  assert.equal(f.frames.size, 0);
});

test("a new authoritative trajectory replaces hidden history, and disposal clears it", () => {
  const f = fixture();
  f.animator.update(f.group, f.marker);
  f.tick(3000);
  f.animator.retain(new Set());
  f.group.position = { latitude: 4, longitude: 8 };
  f.group.movement.lastProcessedAt += 4000;
  f.tick(4000);
  f.animator.update(f.group, f.marker);
  assert.deepEqual(f.marker.position, [4, 8]);
  f.tick(7000);
  assert.deepEqual(f.marker.position, [7, 14]);
  f.animator.dispose();
  assert.equal(f.animator.hiddenTrajectories.size, 0);
  assert.equal(f.animator.entries.size, 0);
  assert.equal(f.frames.size, 0);
});
