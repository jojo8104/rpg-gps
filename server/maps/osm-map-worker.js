import { parentPort, workerData } from "node:worker_threads";
import { OsmMapService } from "./osm-map-service.js";

// Le téléchargement, le décodage OSM et le cache ne partagent pas la boucle du jeu.
const service = new OsmMapService(workerData);
parentPort.on("message", async ({ id, operation = "prepare", polygon }) => {
  try {
    const result =
      operation === "admin"
        ? await service.admin(polygon)
        : operation === "retain"
          ? await service.retain(polygon)
          : await service.prepare(polygon);
    parentPort.postMessage({ id, result });
  } catch (error) {
    parentPort.postMessage({
      id,
      error: {
        message: error.message,
        name: error.name,
        status: error.status,
        retryAfter: error.retryAfter,
        providerCode: error.providerCode,
        providerStatus: error.providerStatus,
        provider: error.provider,
        cause: error.cause && {
          code: error.cause.code,
          errors: Array.from(error.cause.errors ?? [], (cause) => ({
            code: cause.code,
            name: cause.name,
          })),
        },
      },
    });
  }
});
