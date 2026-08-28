/** Journal borné et sérialisable de la qualité des relevés GPS. */
export class GpsAccuracyLog {
  constructor({ samples = [], maximumSamples = 500 } = {}) {
    if (!Number.isInteger(maximumSamples) || maximumSamples <= 0)
      throw new RangeError("La taille du journal GPS doit être positive.");
    this.maximumSamples = maximumSamples;
    this.samples = samples.map(normalizeSample).slice(-maximumSamples);
  }

  record({ accuracy, updatedAt = new Date().toISOString() }) {
    const sample = normalizeSample({ accuracy, updatedAt });
    this.samples.push(sample);
    if (this.samples.length > this.maximumSamples)
      this.samples.splice(0, this.samples.length - this.maximumSamples);
    return { ...sample };
  }

  getSummary() {
    if (this.samples.length === 0)
      return {
        count: 0,
        latest: null,
        average: null,
        minimum: null,
        maximum: null,
      };
    const values = this.samples.map((sample) => sample.accuracy);
    return {
      count: values.length,
      latest: values.at(-1),
      average: values.reduce((sum, value) => sum + value, 0) / values.length,
      minimum: Math.min(...values),
      maximum: Math.max(...values),
    };
  }

  toJSON() {
    return {
      maximumSamples: this.maximumSamples,
      samples: this.samples.map((sample) => ({ ...sample })),
    };
  }
}

function normalizeSample(sample) {
  if (!Number.isFinite(sample?.accuracy) || sample.accuracy < 0)
    throw new RangeError("La précision GPS doit être positive ou nulle.");
  const updatedAt = new Date(sample.updatedAt);
  if (Number.isNaN(updatedAt.getTime()))
    throw new TypeError("La date du relevé GPS est invalide.");
  return { accuracy: sample.accuracy, updatedAt: updatedAt.toISOString() };
}
