// Pure payment preview shared by construction, progression and their UI.
export function planLocationPayment(location, costs, hero = null) {
  const fromLocation = {}, fromBag = {}, availableResources = {};
  const missingResources = [];
  for (const [id, required] of Object.entries(costs)) {
    const local = Math.max(0, location.resources.stock[id] ?? 0);
    const bag = Math.max(0, hero?.resources?.[id] ?? 0) +
      (hero?.carriedLoot ?? []).filter(entry => entry.itemId === id)
        .reduce((sum, entry) => sum + entry.quantity, 0);
    availableResources[id] = local + bag;
    fromLocation[id] = Math.min(required, local);
    fromBag[id] = Math.min(required - fromLocation[id], bag);
    if (local + bag < required)
      missingResources.push({ id, required, available: local + bag, missing: required - local - bag });
  }
  return { affordable: missingResources.length === 0, fromLocation, fromBag, availableResources, missingResources };
}

export function spendLocationPayment(location, costs, hero = null) {
  const payment = planLocationPayment(location, costs, hero);
  if (!payment.affordable) return payment;
  for (const id of Object.keys(costs)) {
    if (payment.fromLocation[id] > 0)
      location.resources.stock[id] -= payment.fromLocation[id];
    let remaining = payment.fromBag[id];
    if (remaining === 0) continue;
    const resources = Math.min(remaining, hero.resources?.[id] ?? 0);
    if (resources > 0) hero.resources[id] -= resources;
    remaining -= resources;
    for (const entry of hero.carriedLoot ?? []) {
      if (entry.itemId !== id || remaining === 0) continue;
      const spent = Math.min(remaining, entry.quantity);
      entry.quantity -= spent;
      remaining -= spent;
    }
    hero.carriedLoot = (hero.carriedLoot ?? []).filter(entry => entry.quantity > 0);
  }
  return payment;
}
