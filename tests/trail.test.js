import assert from "node:assert/strict";
import test from "node:test";
import { Trail, TrailState } from "../app/js/core/trail.js";

const trail = () => new Trail({ id: "prospectors", points: ["trace-1", { traceId: "trace-2" }], destinationLocationSlotId: "battlefield" });

test("une piste impose l'ordre des points puis révèle sa destination", () => {
  const definition = trail(); const state = new TrailState(definition);
  assert.deepEqual(state.inspect(definition, "trace-2"), { success: false, reason: "unexpected_trace", expectedTraceId: "trace-1" });
  assert.deepEqual(state.inspect(definition, "trace-1"), { success: true, trailId: "prospectors", traceId: "trace-1", nextTraceId: "trace-2", destinationLocationSlotId: null, completed: false });
  assert.deepEqual(state.inspect(definition, "trace-2"), { success: true, trailId: "prospectors", traceId: "trace-2", nextTraceId: null, destinationLocationSlotId: "battlefield", completed: true });
  assert.equal(state.status, "completed");
});

test("l'état d'une piste est sérialisable et restaurable", () => {
  const definition = trail(); const state = new TrailState(definition);
  state.inspect(definition, "trace-1");
  const restored = new TrailState(definition, state.toJSON());
  assert.deepEqual(restored.toJSON(), state.toJSON());
  assert.equal(restored.getExpectedTraceId(definition), "trace-2");
});

test("une piste refuse les doublons et un état qui saute un point", () => {
  assert.throws(() => new Trail({ id: "bad", points: ["trace-1", "trace-1"], destinationLocationSlotId: "end" }), /uniques/);
  assert.throws(() => new TrailState(trail(), { inspectedTraceIds: ["trace-2"] }), /début ordonné/);
});
