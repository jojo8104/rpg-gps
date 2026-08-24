/** Transforme des métriques de quête en score normalisé et appréciation. */
export class ResultEvaluationService {
  evaluate({ metrics, thresholds = { gold: .85, silver: .6, bronze: .3 } }) {
    if (!Array.isArray(metrics) || metrics.length === 0) throw new TypeError("Au moins une métrique est requise.");
    let weighted = 0; let weights = 0;
    const details = metrics.map(({ id, value, target, weight = 1 }) => {
      if (typeof id !== "string" || !Number.isFinite(value) || !Number.isFinite(target) || target <= 0 || !Number.isFinite(weight) || weight <= 0) throw new TypeError("Une métrique d'évaluation est invalide.");
      const ratio = Math.max(0, Math.min(1, value / target)); weighted += ratio * weight; weights += weight;
      return { id, value, target, weight, ratio };
    });
    const ratio = weighted / weights; const score = Math.round(ratio * 100);
    const grade = ratio >= thresholds.gold ? "gold" : ratio >= thresholds.silver ? "silver" : ratio >= thresholds.bronze ? "bronze" : "failed";
    return { score, grade, ratio, details };
  }
}
