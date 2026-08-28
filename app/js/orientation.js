import { headingFromOrientation } from "./core/heading.js";

export class OrientationTracker {
  constructor({ onHeading, onError = () => {} }) {
    this.onHeading = onHeading;
    this.onError = onError;
    this.active = false;
    this.handle = (event) => {
      const heading = headingFromOrientation(
        event,
        screen.orientation?.angle ?? window.orientation ?? 0,
      );
      if (heading !== null)
        this.onHeading({
          heading,
          accuracy: Number.isFinite(event.webkitCompassAccuracy)
            ? event.webkitCompassAccuracy
            : null,
          source: Number.isFinite(event.webkitCompassHeading)
            ? "compass"
            : "orientation",
        });
    };
  }

  async start() {
    if (!("DeviceOrientationEvent" in window) || this.active) return false;
    try {
      if (
        typeof window.DeviceOrientationEvent.requestPermission === "function"
      ) {
        let permission;
        try {
          permission =
            await window.DeviceOrientationEvent.requestPermission(true);
        } catch {
          permission = await window.DeviceOrientationEvent.requestPermission();
        }
        if (permission !== "granted") return false;
      }
      window.addEventListener("deviceorientationabsolute", this.handle, true);
      window.addEventListener("deviceorientation", this.handle, true);
      this.active = true;
      return true;
    } catch (error) {
      this.onError(error);
      return false;
    }
  }

  stop() {
    if (!this.active) return false;
    window.removeEventListener("deviceorientationabsolute", this.handle, true);
    window.removeEventListener("deviceorientation", this.handle, true);
    this.active = false;
    return true;
  }
}
