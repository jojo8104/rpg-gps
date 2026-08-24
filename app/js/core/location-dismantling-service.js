import { DeadlineService } from "./deadline-service.js";

const DEFAULT_YIELDS = Object.freeze({ wood: 5, stone: 2 });

/** Démantèlement temporisé d'une infrastructure vers les slots du lieu. */
export class LocationDismantlingService {
  constructor({ deadlineService = new DeadlineService(), durationMs = 60_000, yields = DEFAULT_YIELDS } = {}) { this.deadlineService = deadlineService; this.durationMs = durationMs; this.yields = { ...yields }; }

  start(location, structureId, at) {
    const level = location.infrastructure[structureId] ?? 0;
    if (level <= 0) return { success: false, reason: "structure_not_found" };
    if (location.dismantlings.some((entry) => entry.structureId === structureId)) return { success: false, reason: "already_dismantling" };
    const task = { structureId, level, deadline: this.deadlineService.create({ id: `dismantle:${location.id}:${structureId}`, durationMs: this.durationMs * level, startedAt: at }) };
    location.dismantlings.push(task); return { success: true, task: structuredClone(task) };
  }

  completeReady(location, at) {
    const completed = [];
    location.dismantlings = location.dismantlings.filter((task) => {
      if (!this.deadlineService.evaluate(task.deadline, at).expired) return true;
      const current = location.infrastructure[task.structureId] ?? 0; if (current <= 0) return false;
      delete location.infrastructure[task.structureId];
      const recovered = Object.fromEntries(Object.entries(this.yields).map(([resource, amount]) => [resource, location.depositResource(resource, amount * task.level)]));
      completed.push({ structureId: task.structureId, level: task.level, recovered }); return false;
    });
    return completed;
  }
}
