/** Définition immuable d'une piste reliant des traces à une destination. */
export class Trail {
  constructor({ id, points, destinationLocationSlotId }) {
    this.id = requireText(id, "L'identifiant de piste");
    if (!Array.isArray(points) || points.length === 0) throw new RangeError("Une piste doit contenir au moins un point.");
    const ids = points.map((point) => typeof point === "string" ? requireText(point, "Un point de piste") : requireText(point?.traceId, "L'identifiant d'un point de piste"));
    if (new Set(ids).size !== ids.length) throw new RangeError("Les points d'une piste doivent être uniques.");
    this.points = ids.map((traceId) => ({ traceId }));
    this.destinationLocationSlotId = requireText(destinationLocationSlotId, "La destination de piste");
  }

  toJSON() { return { id: this.id, points: this.points.map(({ traceId }) => ({ traceId })), destinationLocationSlotId: this.destinationLocationSlotId }; }
}

/** Progression sérialisable d'une piste dans une partie. */
export class TrailState {
  constructor(trail, state = {}) {
    if (!(trail instanceof Trail)) throw new TypeError("L'état de piste exige une définition Trail.");
    const inspectedTraceIds = state.inspectedTraceIds ?? [];
    if (!Array.isArray(inspectedTraceIds)) throw new TypeError("Les traces inspectées doivent être une liste.");
    const validIds = new Set(trail.points.map(({ traceId }) => traceId));
    if (inspectedTraceIds.some((id) => !validIds.has(id))) throw new RangeError("L'état contient une trace étrangère à la piste.");
    const expectedPrefix = trail.points.slice(0, inspectedTraceIds.length).map(({ traceId }) => traceId);
    if (expectedPrefix.some((id, index) => id !== inspectedTraceIds[index])) throw new RangeError("Les traces inspectées doivent former le début ordonné de la piste.");
    this.trailId = trail.id;
    this.inspectedTraceIds = [...inspectedTraceIds];
    this.status = this.inspectedTraceIds.length === trail.points.length ? "completed" : this.inspectedTraceIds.length > 0 ? "active" : "not_started";
  }

  getExpectedTraceId(trail) { return this.status === "completed" ? null : trail.points[this.inspectedTraceIds.length].traceId; }

  inspect(trail, traceId) {
    if (!(trail instanceof Trail) || trail.id !== this.trailId) throw new TypeError("La définition ne correspond pas à l'état de piste.");
    if (this.status === "completed") return { success: false, reason: "trail_completed" };
    if (this.getExpectedTraceId(trail) !== traceId) return { success: false, reason: "unexpected_trace", expectedTraceId: this.getExpectedTraceId(trail) };
    this.inspectedTraceIds.push(traceId);
    this.status = this.inspectedTraceIds.length === trail.points.length ? "completed" : "active";
    return { success: true, trailId: trail.id, traceId, nextTraceId: this.getExpectedTraceId(trail), destinationLocationSlotId: this.status === "completed" ? trail.destinationLocationSlotId : null, completed: this.status === "completed" };
  }

  toJSON() { return { trailId: this.trailId, status: this.status, inspectedTraceIds: [...this.inspectedTraceIds] }; }
}

function requireText(value, label) { if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} doit être un texte non vide.`); return value.trim(); }
