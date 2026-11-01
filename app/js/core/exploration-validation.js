/** Validation des données JSON d’exploration, sans règles de résolution. */
export function record(value, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw new TypeError(`${label} doit être un objet de données.`);
  return value;
}

export function identifier(value, label) {
  if (typeof value !== "string" || !value.trim())
    throw new TypeError(`${label} doit être un texte non vide.`);
  return value;
}

export function nullableIdentifier(value, label) {
  return value == null ? null : identifier(value, label);
}

export function choice(value, values, label) {
  if (!values.includes(value)) throw new RangeError(`${label} est invalide.`);
  return value;
}

export function nonnegative(value, label, integer = false) {
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    (integer && !Number.isSafeInteger(value))
  )
    throw new RangeError(
      `${label} doit être un nombre positif ou nul${integer ? " entier" : ""}.`,
    );
  return value;
}

export function instant(value, label) {
  return value == null ? null : nonnegative(value, label, true);
}

export function list(value, normalize, label) {
  if (!Array.isArray(value))
    throw new TypeError(`${label} doit être une liste.`);
  return value.map((entry, index) => normalize(entry, `${label}[${index}]`));
}

export function unique(entries, key, label) {
  const seen = new Set();
  for (const entry of entries) {
    const value = key(entry);
    if (seen.has(value))
      throw new RangeError(`${label} contient un doublon : ${value}.`);
    seen.add(value);
  }
  return entries;
}

export function identifiers(value, label) {
  return unique(list(value, identifier, label), (id) => id, label);
}

export function position(value, label) {
  record(value, label);
  if (![value.latitude, value.longitude].every(Number.isFinite))
    throw new TypeError(`${label} doit contenir des coordonnées finies.`);
  return { latitude: value.latitude, longitude: value.longitude };
}

export function amounts(value, label) {
  return Object.fromEntries(
    Object.entries(record(value, label)).map(([id, amount]) => [
      identifier(id, label),
      nonnegative(amount, `${label}.${id}`),
    ]),
  );
}

/** Refuse notamment fonctions, dates, Map, NaN et cycles qui perdraient des données. */
export function jsonValue(value, label, ancestors = new Set()) {
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "object" || ancestors.has(value))
    throw new TypeError(`${label} doit être sérialisable en JSON sans perte.`);
  ancestors.add(value);
  try {
    if (Array.isArray(value))
      return Array.from(value, (entry, index) =>
        jsonValue(entry, `${label}[${index}]`, ancestors),
      );
    record(value, label);
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        jsonValue(child, `${label}.${key}`, ancestors),
      ]),
    );
  } finally {
    ancestors.delete(value);
  }
}

export function nullableData(value, label) {
  return value == null ? null : jsonValue(record(value, label), label);
}
