import {
  playAreaGeometry,
  planPolygonCoverage,
  geometryArea,
} from "../maps/polygon-coverage.js";
import {
  isMapProviderFailure,
  mapProviderDiagnostic,
  mapErrorPayload,
} from "../maps/map-provider-diagnostic.js";

/** Appelé uniquement après vérification de la clé administrateur du Dashboard. */
export function createDashboardMapApi({
  maps,
  lobbies,
  flush = async () => {},
}) {
  return async (request, response, url) => {
    if (
      ![
        "/api/dashboard/maps",
        "/api/dashboard/maps/unused",
        "/api/dashboard/saved-map",
        "/api/dashboard/saved-map/prepare",
      ].includes(url.pathname)
    )
      return false;
    const send = (status, value) => {
      response.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      response.end(JSON.stringify(value));
      return true;
    };
    try {
      if (!maps.admin)
        return send(503, {
          error: "Gestionnaire cartographique indisponible.",
        });
      if (request.method === "GET" && url.pathname === "/api/dashboard/maps") {
        const bank = await maps.admin({
          action: "inspect",
          polygons: lobbies.retainedMapPolygons(),
        });
        const entries = bank.files.map((file) => ({ ...file, name: file.id }));
        for (const file of bank.files) file.usedBy = [];
        for (const usage of lobbies.dashboardMapUsages())
          for (const source of planPolygonCoverage(
            playAreaGeometry(usage.polygon),
            entries,
          ).sources) {
            const file = bank.files.find((file) => file.id === source.id);
            if (file && !file.usedBy.includes(usage.label))
              file.usedBy.push(usage.label);
          }
        const savedMaps = lobbies.dashboardSavedMaps().map((map) => {
          const target = playAreaGeometry(map.playArea.polygon);
          const plan = planPolygonCoverage(target, entries);
          const total = geometryArea(target),
            missing = geometryArea(plan.missing);
          return {
            ...map,
            complete: !plan.missing.length,
            coveragePercent: total
              ? Math.max(0, Math.min(100, 100 * (1 - missing / total)))
              : 0,
            sourceCount: plan.sources.length,
            sourceIds: plan.sources.map((entry) => entry.id),
            sourceBytes: plan.sources.reduce(
              (sum, entry) => sum + entry.bytes,
              0,
            ),
          };
        });
        return send(200, { bank, savedMaps });
      }
      const id =
        url.pathname === "/api/dashboard/maps/unused"
          ? "unused"
          : url.searchParams.get("id");
      if (!id || request.headers["x-dashboard-confirm"] !== id)
        return send(400, {
          error: "Confirmation de l’action cartographique requise.",
        });
      if (request.method === "DELETE" && url.pathname === "/api/dashboard/maps")
        return send(
          200,
          await maps.admin({
            action: "remove",
            id,
            polygons: lobbies.retainedMapPolygons(),
          }),
        );
      if (
        request.method === "DELETE" &&
        url.pathname === "/api/dashboard/maps/unused"
      )
        return send(
          200,
          await maps.admin({
            action: "purge-unused",
            polygons: lobbies.retainedMapPolygons(),
          }),
        );
      if (
        request.method === "DELETE" &&
        url.pathname === "/api/dashboard/saved-map"
      ) {
        if (!lobbies.dashboardDeleteSavedMap(id))
          return send(404, { error: "Carte sauvegardée introuvable." });
        await flush();
        return send(200, { deleted: id });
      }
      if (
        request.method === "POST" &&
        url.pathname === "/api/dashboard/saved-map/prepare"
      ) {
        const map = lobbies.dashboardSavedMaps().find((map) => map.id === id);
        if (!map) return send(404, { error: "Carte sauvegardée introuvable." });
        const pack = await maps.prepare(map.playArea.polygon);
        return send(200, { prepared: id, features: pack.features.length });
      }
      return send(405, { error: "Méthode non autorisée." });
    } catch (error) {
      if (isMapProviderFailure(error))
        console.warn(
          "[maps] provider failure",
          mapProviderDiagnostic(error, "dashboard-prepare"),
        );
      return send(error.status ?? 502, mapErrorPayload(error));
    }
  };
}
