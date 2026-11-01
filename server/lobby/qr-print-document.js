import { qrLocationArt } from "./qr-location-art.js";
import QRCode from "qrcode";
import { selectedPreparationLocationIds } from "../../app/js/core/preparation-location-selection.js";
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function qrPayload(code, id) {
  return `RPGGPS|${code}|${id}`;
}
export function qrSvg(payload) {
  const { modules } = QRCode.create(payload, { errorCorrectionLevel: "M" });
  const size = modules.size;
  const paths = [];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if (modules.get(y, x)) paths.push(`M${x + 4} ${y + 4}h1v1h-1z`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size + 8} ${size + 8}" role="img" aria-label="QR code du lieu"><rect width="100%" height="100%" fill="white"/><path d="${paths.join("")}" fill="black"/></svg>`;
}
export function createQrPrintDocument(lobby, catalog) {
  const preparation = lobby.configuration.preparation;
  const retained = selectedPreparationLocationIds(preparation, catalog);
  const cards = Object.entries(preparation?.locations ?? {}).filter(
    ([id, l]) => retained.has(id) && l.placement === "qr",
  );
  if (!preparation?.date || !cards.length)
    throw new RangeError(
      "Choisissez la date et au moins un lieu avec QR code.",
    );
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>QR codes — Partie ${escape(lobby.code)}</title><style>
  @page{size:A4;margin:12mm}*{box-sizing:border-box}body{font:14px Georgia,serif;color:#181818;margin:0;background:white}.toolbar{padding:16px;font:16px sans-serif}.cards{display:grid;grid-template-columns:1fr 1fr;gap:8mm}.card{border:1px dashed #555;padding:5mm;text-align:center;break-inside:avoid;min-height:122mm}.qr{width:52mm;height:52mm;margin:auto}.qr svg{width:100%;height:100%}h1{font-size:21px;margin:6px 0}h2{font-size:15px;margin:4px 0}p{margin:7px 0}.art{display:block;height:18mm;width:auto;max-width:100%;margin:0 auto}.notice{font:11px/1.4 sans-serif}.id{font:9px monospace;overflow-wrap:anywhere}@media print{.toolbar{display:none}}
  </style><div class="toolbar"><button onclick="window.print()">Imprimer / Enregistrer en PDF</button><p>Format A4, taille réelle (100 %). Découpez sur les pointillés ; protégez chaque fiche contre les intempéries sans masquer le code. Après la partie, récupérez les fiches.</p></div><main class="cards">${cards
    .map(([id, entry]) => {
      const location = catalog.locations.find((l) => l.id === id);
      const payload = qrPayload(lobby.code, entry.qrId);
      return `<article class="card"><h2>RPG GPS</h2>${qrLocationArt(location)}<h1>${escape(location?.name ?? id)}</h1><p>Partie du ${escape(preparation.date.split("-").reverse().join("/"))} · ${escape(lobby.code)}</p><div class="qr">${qrSvg(payload)}</div><p class="notice"><strong>Joueurs :</strong> dans RPG GPS, ouvrez « Scanner un QR », scannez cette fiche et restez près du lieu. Le serveur vérifie votre proximité et l’accès au lieu.</p><p class="notice"><strong>Organisateur :</strong> découpez et protégez cette fiche contre la pluie. Placez-la avec l’autorisation du responsable du terrain. Restez à côté, scannez-la dans « Installation » puis confirmez « Enregistrer ici ».</p><p class="id">${escape(payload)}</p></article>`;
    })
    .join("")}</main></html>`;
}
