import { UNIT_RANKS, requireRank } from "./rank-system.js";

export const BASE_HERO_AUTHORITY = 3;

export function maximumAuthority(hero, classDefinition) {
  const bonus = classDefinition?.authorityBonus ?? 0;
  if (!Number.isInteger(bonus) || bonus < 0) throw new RangeError("Le bonus d'autorite de classe doit etre un entier positif ou nul.");
  return BASE_HERO_AUTHORITY + bonus + hero.level - 1;
}

export function unitAuthorityCost(unit, unitDefinitions, rankId = unit.rank) {
  const definition = unitDefinitions.get(unit.typeId);
  if (definition === undefined) throw new RangeError(`La definition de l'unite ${unit.typeId} n'existe pas.`);
  const typeCost = definition.authorityCost ?? 1;
  if (!Number.isInteger(typeCost) || typeCost <= 0) throw new RangeError("Le cout d'autorite du type doit etre un entier positif.");
  return typeCost + requireRank(UNIT_RANKS, rankId, "Le grade d'unite").authorityCost;
}

export function usedAuthority(hero, unitDefinitions) {
  return hero.army.units.reduce((total, unit) => total + unitAuthorityCost(unit, unitDefinitions), 0);
}
