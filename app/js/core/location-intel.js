export function describeHeroStat(stat, value) {
  if (!Number.isFinite(value)) return "inconnu";
  if (stat === "speed")
    return value < 2 ? "lent" : value < 4 ? "normal" : "rapide";
  return value < 4
    ? "incompétent"
    : value < 7
      ? "mauvais"
      : value < 11
        ? "normal"
        : value < 15
          ? "bon"
          : "compétent";
}

export function buildLocationIntel({
  location,
  snapshot,
  knowledgeLevel,
  owner = null,
  description = "",
  heroes = [],
}) {
  const known = (required, value, fallback = "?") =>
    knowledgeLevel >= required ? value : fallback;
  const production = Object.entries(location.resources.production).map(
    ([id, amount]) => ({
      id,
      amount: known(2, amount),
      capacity: known(3, location.resources.storageCapacity),
    }),
  );
  const recruitProduction = Object.entries(location.recruitment.production).map(
    ([id, amount]) => ({
      id: `recrues · ${id}`,
      amount: known(2, amount),
      capacity: known(3, location.recruitment.capacity),
    }),
  );
  const stock = [
    ...Object.entries(location.resources.stock).map(([id, amount]) => ({
      id,
      amount: known(3, amount),
      capacity: known(3, location.resources.storageCapacity),
    })),
    ...location.storedItems.map(({ itemId, quantity }) => ({
      id: itemId,
      amount: known(3, quantity),
      capacity: known(3, location.resources.storageCapacity),
    })),
    ...Object.entries(location.recruitment.stock).map(([id, amount]) => ({
      id: `recrues · ${id}`,
      amount: known(3, amount),
      capacity: known(3, location.recruitment.capacities[id] ?? 0),
    })),
  ];
  const units = location.garrison.units.map((unit) => ({
    id: unit.id,
    ownerPlayerId: unit.ownerPlayerId,
    type: known(3, unit.typeId),
    rank: known(3, unit.rank),
    quantity: known(3, unit.quantity),
    name: known(3, unit.name ?? unit.typeId),
  }));
  const occupiedSlots = Math.min(location.defenseSlots, units.length);
  const presences = heroes.map((hero) => {
    if (knowledgeLevel < 2) return { id: hero.id, label: "?", stats: [] };
    const values = {
      attack: 10 + hero.level * 2,
      defense: 5 + hero.level,
      speed: 2,
      command: 2 + hero.level,
    };
    const stats = Object.entries(values).map(([id, value]) => ({
      id,
      assessment: describeHeroStat(id, value),
      value: knowledgeLevel >= 3 ? value : null,
    }));
    const army =
      knowledgeLevel >= 3
        ? (hero.army?.units ?? []).map((unit) => ({
            type: unit.name ?? unit.typeId,
            quantity: unit.quantity,
          }))
        : [];
    return {
      id: hero.id,
      label:
        knowledgeLevel >= 3
          ? hero.name
          : `Héros ${hero.className ?? hero.classId ?? "inconnu"} présent`,
      className: hero.className ?? hero.classId ?? "inconnu",
      stats,
      army,
    };
  });
  return {
    ...snapshot,
    knowledgeLevel,
    nature: location.type,
    level: known(2, location.level),
    population: known(2, location.population ?? "inconnue", "inconnue"),
    populationCapacity: known(
      2,
      location.populationCapacity ?? "inconnue",
      "inconnue",
    ),
    contentment: known(2, location.contentment ?? "inconnu", "?"),
    owner:
      knowledgeLevel >= 2 && owner
        ? owner
        : { id: null, name: "inconnu", color: "#738078" },
    production: [...production, ...recruitProduction],
    stock,
    storageCapacity: known(3, location.resources.storageCapacity),
    presences,
    defense: {
      slots: known(2, location.defenseSlots),
      occupiedSlots: known(2, occupiedSlots),
      units: knowledgeLevel >= 2 ? units : [],
      reinforcements:
        knowledgeLevel >= 2 ? (snapshot.defense?.reinforcements ?? []) : [],
      defenders:
        knowledgeLevel >= 2
          ? [...units, ...(snapshot.defense?.reinforcements ?? [])]
          : [],
      structures:
        knowledgeLevel >= 2
          ? Object.entries(location.infrastructure).map(([type, level]) => {
              const task = location.dismantlings.find(
                (entry) => entry.structureId === type,
              );
              return {
                id: type,
                type,
                level: known(3, level),
                dismantling: task
                  ? { completesAt: task.deadline.expiresAt }
                  : null,
                canDismantle: snapshot.canDismantle === true && !task,
              };
            })
          : [],
    },
    dismantlings:
      knowledgeLevel >= 2 ? structuredClone(location.dismantlings) : [],
    description,
  };
}
