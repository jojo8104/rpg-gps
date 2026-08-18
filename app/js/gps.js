/** Adaptateur navigateur : transmet seulement des positions au moteur. */
export class GpsTracker {
  constructor({ onPosition, onError = () => {}, options = { enableHighAccuracy: true, maximumAge: 1_000, timeout: 15_000 } }) {
    this.onPosition = onPosition;
    this.onError = onError;
    this.options = options;
    this.watchId = null;
  }

  start() {
    if (!("geolocation" in navigator) || this.watchId !== null) return false;
    this.watchId = navigator.geolocation.watchPosition(
      ({ coords, timestamp }) => this.onPosition({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy, heading: Number.isFinite(coords.heading) ? coords.heading : null, speed: Number.isFinite(coords.speed) ? coords.speed : null, updatedAt: new Date(timestamp).toISOString() }),
      this.onError,
      this.options,
    );
    return true;
  }

  stop() {
    if (this.watchId === null) return false;
    navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
    return true;
  }
}
