export const APTITUDE_RANKS = Object.freeze(["novice", "advanced", "master"]);
export const APTITUDE_TYPES = Object.freeze(["passive", "active", "reaction"]);
export const APTITUDE_SCOPES = Object.freeze([
  "battle",
  "map",
  "location",
  "global",
  "stats",
]);

export class HeroAptitudeDefinition {
  constructor({
    id,
    name,
    type,
    scope,
    classIds = [],
    description = "",
    activation = null,
    effects = {},
  }) {
    this.id = text(id, "L'identifiant d'aptitude");
    this.name = text(name, "Le nom d'aptitude");
    if (!APTITUDE_TYPES.includes(type))
      throw new RangeError("Le type d'aptitude est invalide.");
    if (!APTITUDE_SCOPES.includes(scope))
      throw new RangeError("Le domaine d'aptitude est invalide.");
    this.type = type;
    this.scope = scope;
    this.classIds = ids(classIds);
    this.description = typeof description === "string" ? description : "";
    this.activation =
      activation === null ? null : createActivation(activation, type);
    this.effects = createEffects(effects);
  }
  supportsClass(classId) {
    return this.classIds.length === 0 || this.classIds.includes(classId);
  }
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      scope: this.scope,
      classIds: [...this.classIds],
      description: this.description,
      activation: this.activation === null ? null : { ...this.activation },
      effects: structuredClone(this.effects),
    };
  }
}

export function nextAptitudeRank(currentRank = null) {
  const index = currentRank === null ? -1 : APTITUDE_RANKS.indexOf(currentRank);
  return index < 0 ? "novice" : (APTITUDE_RANKS[index + 1] ?? null);
}
function ids(values) {
  if (!Array.isArray(values))
    throw new TypeError("Les restrictions de classe doivent être une liste.");
  return [...new Set(values.map((value) => text(value, "Une classe")))];
}
function text(value, label) {
  if (typeof value !== "string" || value.trim() === "")
    throw new TypeError(`${label} doit être un texte non vide.`);
  return value.trim();
}
function createActivation(value, type) {
  if (type === "passive")
    throw new RangeError(
      "Une aptitude passive ne peut pas avoir d'activation.",
    );
  if (!value || !Number.isInteger(value.cost) || value.cost <= 0)
    throw new RangeError("Le coût d'activation doit être un entier positif.");
  const targets = [
    "none",
    "self",
    "ally_unit",
    "ally_entity",
    "enemy_unit",
    "enemy_entity",
  ];
  if (!targets.includes(value.target))
    throw new RangeError("La cible d'activation est invalide.");
  return { cost: value.cost, target: value.target };
}
function createEffects(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Les effets d'aptitude doivent être un objet.");
  const supported = new Set([
    "stat_modifier",
    "damage_reduction",
    "direct_damage",
    "retreat",
  ]);
  return Object.fromEntries(
    Object.entries(value).map(([rank, effects]) => {
      if (!APTITUDE_RANKS.includes(rank) || !Array.isArray(effects))
        throw new RangeError(
          "Les effets d'aptitude doivent être définis par rang.",
        );
      return [
        rank,
        effects.map((effect) => {
          if (!effect || !supported.has(effect.kind))
            throw new RangeError("Le type d'effet d'aptitude est invalide.");
          if (effect.value !== undefined && !Number.isFinite(effect.value))
            throw new RangeError("La valeur d'effet est invalide.");
          if (
            effect.durationMs !== undefined &&
            (!Number.isInteger(effect.durationMs) || effect.durationMs <= 0)
          )
            throw new RangeError("La durée d'effet est invalide.");
          return structuredClone(effect);
        }),
      ];
    }),
  );
}
