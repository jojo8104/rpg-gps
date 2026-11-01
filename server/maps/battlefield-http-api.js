import { generateBattlefield } from "../../app/js/core/battlefield-generator.js";

/** Banc d'essai graphique explicite ; aucune mutation d'une partie. */
export function handleBattlefieldPreview(request, response) {
  const url = new URL(request.url, "http://localhost");
  if (url.pathname !== "/api/playtest/battlefield") return false;
  const seed = url.searchParams.get("seed") ?? "test-1";
  const status = request.method !== "GET" ? 405 : seed.length > 100 ? 400 : 200;
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(
    JSON.stringify(
      status === 200
        ? generateBattlefield(seed)
        : { error: status === 405 ? "Utilisez GET." : "Graine trop longue." },
    ),
  );
  return true;
}
