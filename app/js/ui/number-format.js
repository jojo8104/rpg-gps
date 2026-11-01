/** Round display values only; leave unknown labels and game state unchanged. */
export function formatInteger(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? String(Math.round(value) || 0)
    : value;
}
