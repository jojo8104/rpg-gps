import {
  QUEST_SYSTEM_ENABLED,
  QUEST_ENGINE_ENABLED,
} from "../app/js/core/quest-system-policy.js";
import { createReadStream, realpathSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readServerConfig } from "./config.js";
import { attachSocketGateway } from "./realtime/socket-gateway.js";
import { LobbyService } from "./lobby/lobby-service.js";
import { ServerStateStore } from "./persistence/server-state-store.js";
import { OsmMapService } from "./maps/osm-map-service.js";
import {
  equivalentMapPackageKeys,
  mapPackageKey,
} from "../app/js/map/map-package.js";
import { OsmMapWorkerService } from "./maps/osm-map-worker-service.js";
import { createMapHttpApi } from "./maps/map-http-api.js";
import { handleBattlefieldPreview } from "./maps/battlefield-http-api.js";
import { randomBytes } from "node:crypto";
import { createDashboardHttpApi } from "./monitoring/dashboard-http-api.js";
import { createDashboardMapApi } from "./monitoring/dashboard-map-api.js";
import { DashboardHistoryStore } from "./monitoring/dashboard-history-store.js";
import { createEditorHttpApi } from "./editor/editor-http-api.js";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultProjectRoot = path.resolve(moduleDirectory, "..");

const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
]);

export function createRpgGpsServer({
  projectRoot = defaultProjectRoot,
  now = () => Date.now(),
  lobbyService = new LobbyService({
    now,
    questSystemEnabled: QUEST_SYSTEM_ENABLED,
    questEngineEnabled: QUEST_ENGINE_ENABLED,
  }),
  stateStore = null,
  mapService = new OsmMapService(),
  mapFetch = globalThis.fetch,
  historyStore = null,
  dashboardToken = process.env.RPG_GPS_DASHBOARD_TOKEN ??
    randomBytes(24).toString("hex"),
} = {}) {
  const root = path.resolve(projectRoot);
  const startedAt = now();
  let gateway;
  const editorApi = createEditorHttpApi();
  const dashboardApi = createDashboardHttpApi({
    lobbies: lobbyService,
    token: dashboardToken,
    flush: () => stateStore?.flush(),
    now,
    historyStore,
    mapAdministration: createDashboardMapApi({
      maps: mapService,
      lobbies: lobbyService,
      flush: () => stateStore?.flush(),
    }),
    onDeleted: async (code) => {
      gateway.closeDashboardParty(code);
      await stateStore?.flush();
      await historyStore?.delete(code);
    },
  });
  const mapApi = createMapHttpApi({
    maps: mapService,
    fetchImpl: mapFetch,
    now,
    isAllowedPolygon: (polygon) => {
      const keys = new Set(equivalentMapPackageKeys(polygon));
      return lobbyService
        .retainedMapPolygons()
        .some((area) => keys.has(mapPackageKey(area)));
    },
  });

  const server = createHttpServer(async (request, response) => {
    setSecurityHeaders(response);
    if (await editorApi(request, response)) return;
    if (await dashboardApi(request, response)) return;
    if (handleBattlefieldPreview(request, response)) return;
    if (await mapApi(request, response)) return;

    if (request.url === "/health" || request.url?.startsWith("/health?")) {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return sendText(
          response,
          405,
          "Méthode non autorisée.\n",
          request.method,
        );
      }
      const body = JSON.stringify({
        status: "ok",
        uptimeSeconds: Math.max(0, Math.floor((now() - startedAt) / 1_000)),
      });
      response.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      return response.end(request.method === "HEAD" ? undefined : body);
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return sendText(
        response,
        405,
        "Méthode non autorisée.\n",
        request.method,
      );
    }

    const filePath = await resolveStaticFile(root, request.url);
    if (!filePath)
      return sendText(
        response,
        404,
        "Ressource introuvable.\n",
        request.method,
      );

    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": MIME_TYPES.get(extension) ?? "application/octet-stream",
      "Cache-Control": [".html", ".js", ".css", ".webmanifest"].includes(
        extension,
      )
        ? "no-cache"
        : "public, max-age=300",
    });
    if (request.method === "HEAD") return response.end();
    const stream = createReadStream(filePath);
    stream.on("error", () => response.destroy());
    stream.pipe(response);
  });
  gateway = attachSocketGateway(server, { lobbyService });
  server.dashboardToken = dashboardToken;
  server.dashboardHistoryStore = historyStore;
  let retaining = false;
  const retainMaps = async () => {
    if (retaining || !mapService.retain) return;
    retaining = true;
    try {
      await mapService.retain(lobbyService.retainedMapPolygons());
    } catch (error) {
      console.warn("[maps] Nettoyage impossible :", error.code ?? error.name);
    } finally {
      retaining = false;
    }
  };
  const retentionTimer = setInterval(() => {
    void retainMaps();
  }, 10000);
  retentionTimer.unref();
  server.on("listening", () => {
    void retainMaps();
  });
  server.on("close", () => {
    clearInterval(retentionTimer);
    void mapService.close?.();
  });
  if (stateStore) {
    server.on("close", () => {
      void stateStore.flush().catch((error) => {
        console.error(
          "Impossible de finaliser la sauvegarde RPG GPS :",
          error instanceof Error ? error.message : error,
        );
      });
    });
  }
  return server;
}

async function resolveStaticFile(root, requestUrl = "/") {
  let pathname;
  try {
    pathname = decodeURIComponent(
      new URL(requestUrl, "http://localhost").pathname,
    );
  } catch {
    return null;
  }

  const relativePath = pathname.replace(/^\/+/, "");
  let candidate = path.resolve(root, relativePath);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`))
    return null;

  try {
    const details = await stat(candidate);
    if (details.isDirectory()) candidate = path.join(candidate, "index.html");
    const fileDetails = await stat(candidate);
    return fileDetails.isFile() ? candidate : null;
  } catch {
    return null;
  }
}

function setSecurityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("X-Frame-Options", "DENY");
}

function sendText(response, status, body, method) {
  response.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(method === "HEAD" ? undefined : body);
}

export async function startServer(config = readServerConfig()) {
  const historyStore = new DashboardHistoryStore({
    directory: path.join(
      config.dataDirectory ?? readServerConfig().dataDirectory,
      "dashboard-history",
    ),
  });
  const stateStore = new ServerStateStore({
    directory: config.dataDirectory ?? readServerConfig().dataDirectory,
  });
  const lobbyService = new LobbyService({
    now: Date.now,
    questSystemEnabled: QUEST_SYSTEM_ENABLED,
    questEngineEnabled: QUEST_ENGINE_ENABLED,
    initialState: stateStore.loadSync(),
    onStateChanged: (state) => stateStore.schedule(state),
    onWorldSample: (code, sample) => historyStore.append(code, sample),
  });
  const server = createRpgGpsServer({
    lobbyService,
    stateStore,
    historyStore,
    mapService: new OsmMapWorkerService({
      directory: path.join(
        config.dataDirectory ?? readServerConfig().dataDirectory,
        "maps",
      ),
    }),
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host, resolve);
  });
  const address = server.address();
  const port =
    typeof address === "object" && address ? address.port : config.port;
  console.log(`RPG GPS écoute sur http://${config.host}:${port}`);
  console.log(
    `Tableau de bord : /dashboard/ · clé administrateur : ${server.dashboardToken}`,
  );
  if (isMainModule()) installGracefulShutdown(server, stateStore);
  return server;
}

function installGracefulShutdown(server, stateStore) {
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await new Promise((resolve) => server.close(resolve));
    await stateStore.flush();
    await server.dashboardHistoryStore?.flush();
  };
  const requestStop = () => {
    void stop().catch((error) => {
      console.error(
        "Arrêt du serveur incomplet :",
        error instanceof Error ? error.message : error,
      );
      process.exitCode = 1;
    });
  };
  process.once("SIGTERM", requestStop);
  process.once("SIGINT", requestStop);
}

if (isMainModule()) {
  startServer().catch((error) => {
    console.error("Impossible de démarrer RPG GPS :", error.message);
    process.exitCode = 1;
  });
}

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return (
      realpathSync(process.argv[1]) ===
      realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
}
