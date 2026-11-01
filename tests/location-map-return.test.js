import test from "node:test";
import assert from "node:assert/strict";
import { bindLocationMapReturn } from "../app/js/ui/world-view.js";

function touch(button, type, points, remaining = []) {
  const event = new Event(type, { cancelable: true });
  event.touches = type === "touchstart" ? points : remaining;
  event.changedTouches = points;
  button.dispatchEvent(event);
  return event;
}
const point = (x, y) => ({ clientX: x, clientY: y });

test("retour carte au clic ou par glissement vers le haut sur la poignée", () => {
  const button = new EventTarget();
  let count = 0;
  bindLocationMapReturn(button, () => count++);
  button.dispatchEvent(new Event("click"));
  assert.equal(count, 1);
  touch(button, "touchstart", [point(100, 200)]);
  const end = touch(button, "touchend", [point(105, 100)]);
  assert.equal(count, 2);
  assert.equal(end.defaultPrevented, true);
  touch(button, "touchend", [point(105, 100)]);
  assert.equal(count, 2);
});

test("les gestes courts, horizontaux, descendants, annulés ou multitouch ne ferment pas la fiche", () => {
  const button = new EventTarget();
  let count = 0;
  bindLocationMapReturn(button, () => count++);
  for (const end of [point(100, 180), point(200, 190), point(100, 300)]) {
    touch(button, "touchstart", [point(100, 200)]);
    touch(button, "touchend", [end]);
  }
  touch(button, "touchstart", [point(100, 200)]);
  button.dispatchEvent(new Event("touchcancel"));
  touch(button, "touchend", [point(100, 100)]);
  touch(button, "touchstart", [point(100, 200), point(200, 200)]);
  touch(button, "touchend", [point(100, 100)]);
  assert.equal(count, 0);
});
