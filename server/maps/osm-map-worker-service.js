import { Worker } from "node:worker_threads";
import { mapBounds } from "./osm-map-service.js";

/** Façade asynchrone ; les règles de jeu restent dans leur moteur. */
export class OsmMapWorkerService {
  constructor(options = {}) {
    this.options = options;
    this.worker = null;
    this.requests = new Map();
    this.sequence = 0;
    this.closed = false;
  }
  prepare(polygon) {
    return this.request("prepare", polygon);
  }
  retain(polygons) {
    return this.request("retain", polygons);
  }
  admin(options) {
    return this.request("admin", options);
  }
  request(operation, polygon) {
    if (this.closed)
      return Promise.reject(new Error("Le service cartographique est arrêté."));
    try {
      if (operation === "prepare") mapBounds(polygon);
    } catch (error) {
      return Promise.reject(error);
    }
    if (!this.worker) {
      const worker = new Worker(
        new URL("./osm-map-worker.js", import.meta.url),
        { workerData: this.options },
      );
      this.worker = worker;
      worker.on("message", ({ id, result, error }) => {
        const request = this.requests.get(id);
        if (!request) return;
        this.requests.delete(id);
        if (error)
          request.reject(Object.assign(new Error(error.message), error));
        else request.resolve(result);
      });
      const fail = (error) => {
        if (this.worker !== worker) return;
        this.worker = null;
        for (const request of this.requests.values()) request.reject(error);
        this.requests.clear();
      };
      worker.on("error", fail);
      worker.on("exit", () =>
        fail(
          new Error(
            "La préparation cartographique a été interrompue. Réessayez.",
          ),
        ),
      );
    }
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.requests.set(id, { resolve, reject });
      this.worker.postMessage({ id, operation, polygon });
    });
  }
  async close() {
    this.closed = true;
    for (const request of this.requests.values())
      request.reject(new Error("Le service cartographique est arrêté."));
    this.requests.clear();
    const worker = this.worker;
    this.worker = null;
    if (worker) await worker.terminate();
  }
}
