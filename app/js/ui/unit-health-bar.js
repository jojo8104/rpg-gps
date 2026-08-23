export function renderUnitHealthBar(unit, { tag = "div" } = {}) {
  const maximumQuantity = Math.max(1, unit.maxQuantity ?? unit.soldierHealth?.length ?? unit.quantity ?? 1);
  const healthPerSoldier = Math.max(1, unit.healthPerSoldier ?? 1);
  const threshold = unit.combatHealthThreshold ?? 0;
  const soldierHealth = Array.isArray(unit.soldierHealth) ? unit.soldierHealth : Array(unit.quantity ?? 0).fill(healthPerSoldier);
  const maximumHealth = maximumQuantity * healthPerSoldier;
  const combatantHealth = soldierHealth.filter((health) => health > threshold).reduce((total, health) => total + health, 0);
  const woundedHealth = soldierHealth.filter((health) => health > 0 && health <= threshold).reduce((total, health) => total + health, 0);
  const missingHealth = Math.max(0, maximumHealth - combatantHealth - woundedHealth);
  const currentHealth = combatantHealth + woundedHealth;
  return `<${tag} class="army-health-bar" role="img" aria-label="${currentHealth} PV sur ${maximumHealth} ; ${unit.combatantCount ?? 0} combattants, ${unit.woundedCount ?? 0} blessés"><i class="is-combatant" style="flex:${combatantHealth}"></i><i class="is-wounded" style="flex:${woundedHealth}"></i><i class="is-dead" style="flex:${missingHealth}"></i></${tag}>`;
}
