import { timingSafeEqual } from "node:crypto";

export function createDashboardHttpApi({
  lobbies,
  token,
  now = Date.now,
  onDeleted = async () => {},
  historyStore = null,
  mapAdministration = null,
  flush = async () => {},
}) {
  let previousCpu = process.cpuUsage();
  let previousAt = now();
  let cpuPercent = 0;
  return async function handle(request, response) {
    const url = new URL(request.url, "http://localhost");
    if (!url.pathname.startsWith("/api/dashboard/")) return false;
    const send = (status, value) => {
      response.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      response.end(JSON.stringify(value));
      return true;
    };
    const supplied = Buffer.from(request.headers.authorization ?? "");
    const expected = Buffer.from(`Bearer ${token}`);
    if (
      !token ||
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    )
      return send(401, { error: "Clé administrateur requise." });
    if (await mapAdministration?.(request, response, url)) return true;
    if (url.pathname === "/api/dashboard/saves" && request.method === "GET")
      return send(200, { saves: lobbies.savedGameCatalog() });
    if (url.pathname === "/api/dashboard/save" && request.method === "DELETE") {
      const id = url.searchParams.get("id");
      if (!id || request.headers["x-dashboard-confirm"] !== id)
        return send(400, { error: "Confirmation de la sauvegarde requise." });
      if (!lobbies.dashboardDeleteSavedGame(id))
        return send(404, { error: "Sauvegarde introuvable." });
      try {
        await flush();
        return send(200, { deleted: id });
      } catch {
        return send(500, {
          error: "Suppression effectuée, mais persistance non confirmée.",
        });
      }
    }
    if (
      request.method === "DELETE" &&
      url.pathname === "/api/dashboard/party"
    ) {
      const code = url.searchParams.get("code");
      if (!code || request.headers["x-dashboard-confirm"] !== code)
        return send(400, { error: "Confirmation de la partie requise." });
      if (!lobbies.deleteDashboardParty(code))
        return send(404, { error: "Partie introuvable." });
      try {
        await onDeleted(code);
        return send(200, { deleted: code });
      } catch {
        return send(500, {
          error:
            "Partie retirée, mais sauvegarde de la suppression non confirmée.",
        });
      }
    }
    if (request.method !== "GET")
      return send(405, { error: "Méthode non autorisée." });
    if (url.pathname === "/api/dashboard/parties") {
      const at = now();
      if (at - previousAt >= 1000) {
        const current = process.cpuUsage();
        cpuPercent =
          ((current.user -
            previousCpu.user +
            current.system -
            previousCpu.system) /
            ((at - previousAt) * 1000)) *
          100;
        previousCpu = current;
        previousAt = at;
      }
      return send(200, {
        at,
        server: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cpuPercent,
          activeLimit: 2,
        },
        parties: lobbies.dashboardList(),
      });
    }
    if (url.pathname === "/api/dashboard/history") {
      const code = url.searchParams.get("code");
      if (!lobbies.dashboardList().some((party) => party.code === code))
        return send(404, { error: "Partie introuvable." });
      try {
        const since = Math.max(0, Number(url.searchParams.get("since")) || 0);
        const samples = historyStore
          ? await historyStore.read(code, since, {
              all: url.searchParams.get("scope") === "all",
            })
          : [];
        return send(200, {
          samples: samples.filter((sample) => sample.at > since),
          intervalMs: 4000,
          limit: url.searchParams.get("scope") === "all" ? null : 2000,
        });
      } catch {
        return send(500, { error: "Historique temporairement indisponible." });
      }
    }
    if (url.pathname === "/api/dashboard/party") {
      const party = lobbies.dashboardDetail(url.searchParams.get("code"));
      return party
        ? send(200, { at: now(), party })
        : send(404, { error: "Partie introuvable." });
    }
    return send(404, { error: "Ressource introuvable." });
  };
}
