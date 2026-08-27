/** Données persistantes de scénario, indépendantes de la quête actuellement active. */
export class WorldState {
  constructor({ flags = {}, npcs = [] } = {}) {
    if (flags === null || Array.isArray(flags) || typeof flags !== "object") throw new TypeError("Les drapeaux du monde doivent être un objet.");
    if (!Array.isArray(npcs)) throw new TypeError("Les PNJ du monde doivent être une liste.");
    this.flags = structuredClone(flags);
    this.npcs = Object.fromEntries(npcs.map((definition) => {
      const npc = definition instanceof NpcState ? definition : new NpcState(definition);
      return [npc.id, npc];
    }));
    if (Object.keys(this.npcs).length !== npcs.length) throw new RangeError("Les identifiants de PNJ doivent être uniques.");
  }

  get(path, fallback = null) {
    const parts = pathParts(path); let value = this.flags;
    for (const part of parts) { if (value === null || typeof value !== "object" || !(part in value)) return fallback; value = value[part]; }
    return value;
  }

  set(path, value) {
    const parts = pathParts(path); let target = this.flags;
    parts.slice(0, -1).forEach((part) => { if (target[part] === null || Array.isArray(target[part]) || typeof target[part] !== "object") target[part] = {}; target = target[part]; });
    target[parts.at(-1)] = structuredClone(value); return value;
  }

  getNpc(id) { return this.npcs[id] ?? null; }
  toJSON() { return { flags: structuredClone(this.flags), npcs: Object.values(this.npcs).map((npc) => npc.toJSON()) }; }
}

export class NpcState {
  constructor({ id, role, status = "active", grade = 1, relation = 0, ...data }) {
    this.id = text(id, "L'identifiant du PNJ"); this.role = text(role, "Le rôle du PNJ"); this.status = text(status, "Le statut du PNJ");
    if (!Number.isInteger(grade) || grade < 0) throw new RangeError("Le grade du PNJ doit être un entier positif ou nul.");
    if (!Number.isFinite(relation)) throw new TypeError("La relation du PNJ doit être numérique.");
    this.grade = grade; this.relation = relation; this.data = structuredClone(data);
  }
  setStatus(status) { this.status = text(status, "Le statut du PNJ"); return this.status; }
  adjustRelation(delta) { if (!Number.isFinite(delta)) throw new TypeError("La variation de relation doit être numérique."); this.relation += delta; return this.relation; }
  incrementGrade(amount = 1) { if (!Number.isInteger(amount)) throw new TypeError("La variation de grade doit être entière."); this.grade = Math.max(0, this.grade + amount); return this.grade; }
  toJSON() { return { id: this.id, role: this.role, status: this.status, grade: this.grade, relation: this.relation, ...structuredClone(this.data) }; }
}

function pathParts(path) { const parts = text(path, "Le chemin du drapeau").split("."); if (parts.some((part) => part === "__proto__" || part === "prototype" || part === "constructor")) throw new RangeError("Le chemin du drapeau est interdit."); return parts; }
function text(value, label) { if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} doit être un texte non vide.`); return value.trim(); }
