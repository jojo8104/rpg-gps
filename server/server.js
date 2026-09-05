import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readServerConfig } from "./config.js";

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
} = {}) {
  const root = path.resolve(projectRoot);
  const startedAt = now();

  return createHttpServer(async (request, response) => {
    setSecurityHeaders(response);

    if (request.url === "/health" || request.url?.startsWith("/health?")) {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return sendText(response, 405, "Méthode non autorisée.\n", request.method);
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
      return sendText(response, 405, "Méthode non autorisée.\n", request.method);
    }

    const filePath = await resolveStaticFile(root, request.url);
    if (!filePath) return sendText(response, 404, "Ressource introuvable.\n", request.method);

    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": MIME_TYPES.get(extension) ?? "application/octet-stream",
      "Cache-Control": extension === ".html" ? "no-cache" : "public, max-age=300",
    });
    if (request.method === "HEAD") return response.end();
    const stream = createReadStream(filePath);
    stream.on("error", () => response.destroy());
    stream.pipe(response);
  });
}

async function resolveStaticFile(root, requestUrl = "/") {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(requestUrl, "http://localhost").pathname);
  } catch {
    return null;
  }

  const relativePath = pathname.replace(/^\/+/, "");
  let candidate = path.resolve(root, relativePath);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) return null;

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
  response.setHeader("Referrer-Policy", "same-origin");
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
  const server = createRpgGpsServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host, resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : config.port;
  console.log(`RPG GPS écoute sur http://${config.host}:${port}`);
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer().catch((error) => {
    console.error("Impossible de démarrer RPG GPS :", error.message);
    process.exitCode = 1;
  });
}
