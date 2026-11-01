import { GpsTracker } from "../gps.js";
import { OrientationTracker } from "../orientation.js";
import { smoothHeading } from "../core/heading.js";

// Possède les capteurs, sans dépendre de Leaflet ni appliquer de règles du jeu.
export function createGpsController({
  accuracyLog,
  onPosition,
  onHeading,
  onFirstFix,
  onSample,
  onStatus,
  onAccuracySummary,
  onLog,
  createTracker = (options) => new GpsTracker(options),
  createOrientation = (options) => new OrientationTracker(options),
  now = () => Date.now(),
}) {
  let tracker = null,
    compass = null,
    epoch = 0,
    watchRevision = 0;
  let heading = 0,
    lastCompassAt = null,
    firstFix = true;
  function start() {
    tracker?.stop();
    const revision = ++watchRevision;
    const sessionEpoch = epoch;
    firstFix = true;
    const current = () => revision === watchRevision && sessionEpoch === epoch;
    onStatus("GPS : recherche de la position…");
    tracker = createTracker({
      onPosition: (position) => {
        if (!current()) return;
        if (
          Number.isFinite(position.heading) &&
          (lastCompassAt === null || now() - lastCompassAt > 3000)
        ) {
          heading = smoothHeading(heading, position.heading);
          onHeading(heading);
        }
        accuracyLog.record(position);
        onSample();
        onPosition(position);
        onStatus(
          `GPS actif · précision ±${Math.round(position.accuracy)} m · cap ${Math.round(heading)}° · ${new Date(position.updatedAt).toLocaleTimeString("fr-FR")}`,
        );
        onAccuracySummary();
        if (accuracyLog.samples.length % 5 === 0)
          onLog(`Précision GPS ±${Math.round(position.accuracy)} m.`);
        if (firstFix) {
          firstFix = false;
          onFirstFix(position);
          onLog("Premier point GPS reçu.");
        }
      },
      onError: (error) => {
        if (current()) {
          onStatus(`Erreur GPS : ${error.message}`);
          onLog(`Erreur GPS (${error.code}).`);
        }
      },
    });
    const started = tracker.start();
    if (!started) onStatus("Géolocalisation indisponible sur cet appareil.");
    return started;
  }
  async function startCompass() {
    compass?.stop();
    const sessionEpoch = epoch;
    const candidate = createOrientation({
      onHeading: ({ heading: value }) => {
        if (sessionEpoch !== epoch || compass !== candidate) return;
        heading = smoothHeading(heading, value);
        lastCompassAt = now();
        onHeading(heading);
      },
      onError: () => {
        if (sessionEpoch === epoch && compass === candidate)
          onLog("Boussole indisponible.");
      },
    });
    compass = candidate;
    const enabled = await candidate.start();
    if (sessionEpoch !== epoch || compass !== candidate) {
      candidate.stop();
      return false;
    }
    onLog(
      enabled
        ? "Boussole activée : le pion indique le nord."
        : "Boussole refusée ou indisponible : utilisation du cap GPS.",
    );
    return enabled;
  }
  function reset() {
    epoch++;
    watchRevision++;
    tracker?.stop();
    compass?.stop();
    tracker = compass = null;
    heading = 0;
    lastCompassAt = null;
    firstFix = true;
  }
  return {
    start,
    resume() {
      return tracker ? start() : false;
    },
    startCompass,
    reset,
    get heading() {
      return heading;
    },
  };
}
