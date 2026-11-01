import { PlayAreaGrid } from "./play-area-grid.js";
import { ExplorationState } from "./exploration-state.js";
import {
  placedLocations,
  isSpacedLocation,
} from "./location-spacing-policy.js";

/** Génération serveur, déterministe ; aucun fragment n'accorde une découverte. */
export function generateLocalization(game, state) {
  const grid = new PlayAreaGrid({
    playArea: state.generation.playArea,
    cellSizeMeters: state.grid.cellSizeMeters,
  });
  const cells = new Map(grid.cells.map((cell) => [cell.id, cell]));
  const locations = placedLocations(game)
    .filter(
      (location) =>
        location.state !== "destroyed" &&
        isSpacedLocation(location) &&
        !location.roles?.includes("clue") &&
        location.position &&
        grid.getCellAt(location.position),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  const series = state.sites.map((site) => {
    const target = cells.get(site.cellId);
    const host = game.locations.find(
      (location) => location.id === site.hostLocationId,
    );
    if (site.hostLocationId && !host)
      throw new RangeError("Le lieu principal doit appartenir à la grille.");
    const anchor =
      host ??
      locations.reduce((best, location) => {
        const cell = grid.getCellAt(location.position);
        const distance =
          Math.abs(cell.row - target.row) +
          Math.abs(cell.column - target.column);
        return !best || distance < best.distance
          ? { location, distance }
          : best;
      }, null)?.location;
    const start =
      (anchor ? grid.getCellAt(anchor.position) : null) ?? grid.cells[0];
    const id = `series-${site.id}`;
    let style = "directions",
      texts,
      solution;
    if (host) {
      const styles = ["name", "anagram", "old-name", "legend"];
      style =
        styles[
          stableNumber(`${state.generation.seed}:${host.id}`) % styles.length
        ];
      const name = locationLabel(host, game.locations);
      const designation =
        style === "name"
          ? name
          : style === "anagram"
            ? anagram(name)
            : style === "old-name"
              ? `Ancien relais de ${name}`
              : `le veilleur oublié de ${name}`;
      texts = [
        style === "name"
          ? `Cherchez à l’intérieur de « ${designation} ».`
          : style === "anagram"
            ? `Le nom du lieu est caché dans cette anagramme : « ${designation} ».`
            : style === "old-name"
              ? `Les anciens registres nommaient cet endroit « ${designation} ». Interrogez les habitants.`
              : `La légende de « ${designation} » désigne votre destination. Interrogez les habitants.`,
      ];
      solution = { kind: "location", locationId: host.id, designation };
    } else {
      const dr = target.row - start.row,
        dc = target.column - start.column;
      const steps = [];
      if (dr)
        steps.push({ direction: dr > 0 ? "nord" : "sud", count: Math.abs(dr) });
      if (dc)
        steps.push({
          direction: dc > 0 ? "est" : "ouest",
          count: Math.abs(dc),
        });
      const reference = anchor
        ? `la case qui contient « ${locationLabel(anchor, game.locations)} »`
        : `la case repère de la grille (ligne ${start.row + 1}, colonne ${start.column + 1}, comptées depuis le sud-ouest)`;
      const opening = `Depuis ${reference}, comptez sur la carte`;
      const legs = steps.map((step) => directionText(step));
      const valuable =
        ["artifact", "dungeon"].includes(site.type) ||
        Math.max(
          site.requirements.expedition ?? 0,
          site.requirements.power ?? 0,
        ) >= 70;
      if (!steps.length) texts = [`La destination est dans ${reference}.`];
      else if (steps.length === 2 && valuable)
        texts = [`${opening}…`, `…${legs[0]}, puis…`, `…${legs[1]}.`];
      else if (steps.length === 2)
        texts = [`${opening} ${legs[0]}, puis…`, `…${legs[1]}.`];
      else if (valuable) texts = [`${opening}…`, `…${legs[0]}.`];
      else texts = [`${opening} ${legs[0]}.`];
      solution = { kind: "grid", row: start.row, column: start.column, steps };
    }
    const entry = {
      id,
      siteId: site.id,
      style,
      referenceLocationId: anchor?.id ?? null,
      fragments: texts.map((text, index) => ({
        id: `${id}-fragment-${index + 1}`,
        text,
      })),
      solution,
    };
    if (!verifyLocalization(entry, site, state, game.locations, grid))
      throw new RangeError("Les indications ne conduisent pas au site.");
    return entry;
  });
  return new ExplorationState({ ...state.toJSON(), clueSeries: series });
}

export function verifyLocalization(
  series,
  site,
  state,
  locations,
  preparedGrid = null,
) {
  if (
    series.siteId !== site.id ||
    series.fragments.length < 1 ||
    series.fragments.length > 3
  )
    return false;
  const proof = series.solution;
  if (!proof) return false;
  if (proof.kind === "location") {
    const host = locations.find((location) => location.id === proof.locationId);
    if (!host || proof.locationId !== site.hostLocationId) return false;
    const name = locationLabel(host, locations);
    return (
      series.fragments.length === 1 &&
      (series.style === "anagram"
        ? letters(proof.designation) === letters(name)
        : series.style === "name"
          ? proof.designation === name
          : ["old-name", "legend"].includes(series.style) &&
            proof.designation.includes(name)) &&
      series.fragments[0].text.includes(proof.designation)
    );
  }
  if (proof.kind !== "grid" || site.hostLocationId) return false;
  const grid =
    preparedGrid ??
    new PlayAreaGrid({
      playArea: state.generation.playArea,
      cellSizeMeters: state.grid.cellSizeMeters,
    });
  const anchor = locations.find(
    (location) => location.id === series.referenceLocationId,
  );
  if (series.referenceLocationId && !anchor) return false;
  const start = anchor ? grid.getCellAt(anchor.position) : grid.cells[0];
  if (!start || start.row !== proof.row || start.column !== proof.column)
    return false;
  const text = series.fragments.map((fragment) => fragment.text).join(" ");
  const reference = anchor
    ? `la case qui contient « ${locationLabel(anchor, locations)} »`
    : `la case repère de la grille (ligne ${start.row + 1}, colonne ${start.column + 1}, comptées depuis le sud-ouest)`;
  if (!text.includes(reference)) return false;
  let { row, column } = proof;
  for (const step of proof.steps) {
    if (!Number.isInteger(step.count) || step.count <= 0) return false;
    if (step.direction === "nord") row += step.count;
    else if (step.direction === "sud") row -= step.count;
    else if (step.direction === "est") column += step.count;
    else if (step.direction === "ouest") column -= step.count;
    else return false;
    if (
      !series.fragments
        .map((fragment) => fragment.text)
        .join(" ")
        .includes(directionText(step))
    )
      return false;
  }
  const cell = state.cells.find((cell) => cell.id === site.cellId);
  return cell?.row === row && cell.column === column;
}

function letters(text) {
  return [
    ...text
      .toLocaleLowerCase("fr")
      .normalize("NFD")
      .replace(/[^a-z]/g, ""),
  ]
    .sort()
    .join("");
}
function locationLabel(location, locations) {
  const name = location.name || location.id;
  return locations.some(
    (other) =>
      other.id !== location.id &&
      (other.name || other.id).trim().toLocaleLowerCase("fr") ===
        name.trim().toLocaleLowerCase("fr"),
  )
    ? `${name} (repère ${location.id})`
    : name;
}
function directionText(step) {
  return `${step.count} case${step.count > 1 ? "s" : ""} vers ${["est", "ouest"].includes(step.direction) ? "l’" : "le "}${step.direction}`;
}
function anagram(name) {
  const characters = [...name];
  const reversed = characters.reverse().join("");
  return reversed === name
    ? characters.slice(1).concat(characters[0]).join("")
    : reversed;
}
export function stableNumber(text) {
  return [...text].reduce(
    (hash, character) =>
      Math.imul(hash ^ character.codePointAt(0), 16777619) >>> 0,
    2166136261,
  );
}
