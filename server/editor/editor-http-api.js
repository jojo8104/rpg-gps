import {
  getEditorCatalog,
  validateEditorProject,
} from "./editor-validation.js";
import { installEditorProject } from "./editor-installation.js";
import { readFile } from "node:fs/promises";
import { questDataDirectory } from "../quests/editor-catalog.js";

export function createEditorHttpApi({
  mediaDirectory = questDataDirectory,
} = {}) {
  return async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname.startsWith("/editor-media/")) {
      const match =
        /^\/editor-media\/(editor-[a-zA-Z0-9-]+)\/([a-zA-Z0-9_-]+\.(png|jpg|webp))$/.exec(
          url.pathname,
        );
      if (!match || !["GET", "HEAD"].includes(request.method)) {
        response.writeHead(404);
        response.end();
        return true;
      }
      try {
        const bytes = await readFile(
          new URL(`${match[1]}/assets/images/${match[2]}`, mediaDirectory),
        );
        response.writeHead(200, {
          "Content-Type": {
            png: "image/png",
            jpg: "image/jpeg",
            webp: "image/webp",
          }[match[3]],
          "Content-Length": bytes.length,
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "public, max-age=31536000, immutable",
        });
        response.end(request.method === "HEAD" ? undefined : bytes);
      } catch {
        response.writeHead(404);
        response.end();
      }
      return true;
    }
    if (!url.pathname.startsWith("/api/editor/")) return false;
    const send = (status, value) => {
      response.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      response.end(JSON.stringify(value));
      return true;
    };
    if (url.pathname === "/api/editor/catalog" && request.method === "GET")
      return send(200, getEditorCatalog());
    if (!["/api/editor/validate", "/api/editor/install"].includes(url.pathname))
      return send(404, { error: "Route d’éditeur inconnue." });
    if (request.method !== "POST")
      return send(405, { error: "Utilisez POST pour valider un projet." });
    const origin = request.headers.origin;
    if (origin) {
      try {
        if (new URL(origin).host !== request.headers.host)
          return send(403, {
            error: "La validation doit provenir de ce serveur.",
          });
      } catch {
        return send(403, { error: "Origine de la requête invalide." });
      }
    }
    if (!request.headers["content-type"]?.startsWith("application/json"))
      return send(415, { error: "Un projet JSON est attendu." });
    try {
      const chunks = [];
      let length = 0;
      for await (const chunk of request) {
        length += chunk.length;
        if (length > 16_777_216)
          return send(413, {
            error:
              "Le projet dépasse 16 Mo (bibliothèque limitée à 8 Mo d’images).",
          });
        chunks.push(chunk);
      }
      const project = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (url.pathname === "/api/editor/install") {
        if (
          !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
            request.socket?.remoteAddress,
          )
        )
          return send(403, {
            error:
              "L’enregistrement des données du jeu est réservé à l’éditeur ouvert sur le PC du serveur.",
          });
        return send(200, await installEditorProject(project));
      }
      return send(200, validateEditorProject(project));
    } catch (issue) {
      return send(400, {
        error: issue instanceof SyntaxError ? "JSON invalide." : issue.message,
      });
    }
  };
}
