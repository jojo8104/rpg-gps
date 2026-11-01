import { readFileSync } from "node:fs";

const types = {
  capital: "capitale",
  city: "ville",
  town: "ville",
  village: "village",
  camp: "camp",
  quarry: "carriere",
  "lumber-camp": "foret",
  fort: "fort",
};
const artworks = new Map(
  [...Object.values(types), "mine-fer", "mine-or"].map((key) => [
    key,
    readFileSync(new URL(`../../app/assets/qr-location-art/${key}.svg`, import.meta.url), "utf8")
      .replace(' aria-labelledby="title"', '')
      .replace('<title id="title">', '<title>')
      .replace('<svg ', '<svg class="art" '),
  ]),
);

/** Métadonnée d'impression, sans effet sur les ressources ni les règles. */
export function qrLocationArtKey(location) {
  if (location?.type === "mine") {
    return location.roles?.includes("gold") || location.resources?.production?.gold > 0
      ? "mine-or"
      : "mine-fer";
  }
  return types[location?.type] ?? null;
}

export function qrLocationArt(location) {
  const key = location?.qrArt ?? qrLocationArtKey(location);
  // Les lieux particuliers conservent un écu neutre sans fausse identité.
  return artworks.get(key) ?? '<svg class="art" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 220" role="img" aria-label="Lieu"><path d="M22 18H178V100Q178 164 100 203Q22 164 22 100Z" fill="white" stroke="black" stroke-width="7"/></svg>';
}
