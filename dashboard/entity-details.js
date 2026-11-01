import { HERO_COMMAND_RANKS, UNIT_RANKS } from "../app/js/core/rank-system.js";
const labels = {
  source: "Origine",
  chief: "Responsable du lieu",
  building: "Bâtiment",
  tavern: "Taverne",
  world: "Monde",
  role: "Rôle",
  title: "Fonction",
  greeting: "Accueil",
  openingLines: "Répliques d’accueil",
  dialogues: "Dialogues",
  costs: "Coût",
  effect: "Effet",
  remainingCycles: "Cycles de présence restants",
  minimumLocationRank: "Rang minimal du lieu",
  questId: "Quête requise",
  trade: "Commerce",
  tradeOffers: "Offres de commerce",
  secondaryQuestIds: "Quêtes secondaires",
  specialist: "Spécialiste",
  worker: "Travailleur",
  officer: "Officier",
  trainer: "Formateur",
  kind: "Catégorie",
  grade: "Grade",
  relation: "Relation",
  ...Object.fromEntries(
    [...HERO_COMMAND_RANKS, ...UNIT_RANKS].map((rank) => [rank.id, rank.label]),
  ),
  passive: "Passif",
  aggressive: "Agressif",
  outbound: "Aller",
  inbound: "Retour",
  neutral: "Neutre",
  kingdom: "Royaume",
  chaos: "Chaos",
  attack: "Attaque",
  defense: "Défense",
  health: "PV",
  maxHealth: "PV maximum",
  morale: "Moral",
  speed: "Vitesse",
  command: "Commandement",
  gold: "Or",
  food: "Nourriture",
  wood: "Bois",
  iron: "Fer",
  stone: "Pierre",
  horse: "Chevaux",
  quantity: "Quantité",
  level: "Niveau",
  experience: "Expérience",
  state: "État",
  status: "Statut",
  ownerId: "Propriétaire",
  controllerId: "Contrôle",
  originLocationId: "Départ",
  destinationLocationId: "Destination",
  resourceId: "Ressource",
  phase: "Étape",
  active: "Actif",
  traveling: "En déplacement",
  idle: "En attente",
  active: "Actif",
  completed: "Terminé",
  failed: "Échec",
  pending: "À venir",
  commandRank: "Grade",
  capacitySlots: "Capacité",
  name: "Nom",
  id: "Identifiant",
  type: "Type",
  playerId: "Joueur",
  description: "Description",
  usage: "Utilisation",
  rarity: "Rareté",
  equipmentSlot: "Emplacement",
  modifiers: "Bonus",
  weight: "Poids",
  slotCost: "Encombrement",
  unique: "Unique",
  position: "Position",
  mission: "Mission",
  cargo: "Chargement",
  production: "Production",
  productionStock: "Production disponible",
  stock: "Réserves",
  population: "Population",
  healthPerSoldier: "PV par soldat",
  damageMin: "Dégâts minimum",
  damageMax: "Dégâts maximum",
  range: "Portée",
  createdAt: "Création",
  at: "Date",
  since: "Depuis",
  savedAt: "Sauvegarde",
  startedAt: "Début",
  finishedAt: "Fin",
};
export const displayLabel = (key) =>
  labels[key] ??
  String(key)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]/g, " ");
const node = (tag, value, className) => {
  const n = document.createElement(tag);
  if (value != null) n.textContent = String(value);
  if (className) n.className = className;
  return n;
};
function valueText(value) {
  if (value == null) return "Non renseigné";
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  if (typeof value === "number")
    return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(
      value,
    );
  return labels[value] ?? String(value);
}
/** Présentation récursive des champs complémentaires, jamais de JSON injecté. */
export function renderReadable(value, depth = 0) {
  if (value == null || typeof value !== "object")
    return node("span", valueText(value));
  const entries = Array.isArray(value)
    ? value.map((entry, index) => [String(index + 1), entry])
    : Object.entries(value);
  if (!entries.length) return node("p", "Aucun élément", "empty-state");
  const list = node("dl", null, "field-list");
  for (const [key, entry] of entries) {
    list.append(node("dt", displayLabel(key)));
    const dd = node("dd");
    if (entry && typeof entry === "object") {
      const group = node("details");
      group.append(
        node(
          "summary",
          Array.isArray(entry) ? `${entry.length} élément(s)` : "Détails",
        ),
        renderReadable(entry, depth + 1),
      );
      dd.append(group);
    } else
      dd.append(
        node(
          "span",
          typeof entry === "number" &&
            entry > 100000000000 &&
            /(?:At|Until)$|^(at|since)$/.test(key)
            ? new Date(entry).toLocaleString("fr-FR")
            : valueText(entry),
        ),
      );
    list.append(dd);
  }
  return list;
}
function panel(title, content) {
  const el = node("section", null, "detail-panel");
  el.append(node("h3", title), content);
  return el;
}
function button(label, callback) {
  const el = node("button", label, "entity-link");
  el.type = "button";
  el.onclick = callback;
  return el;
}
function reference(party, id) {
  return (
    [
      ...party.players,
      ...party.heroes,
      ...party.locations,
      ...party.groups,
      ...(party.itemTypes ?? []),
    ].find((e) => e.id === id)?.name ?? displayLabel(id ?? "Non renseigné")
  );
}
function summary(rows) {
  const dl = node("dl", null, "stat-grid");
  for (const [label, value] of rows) {
    dl.append(node("dt", label), node("dd", valueText(value)));
  }
  return dl;
}
function armyView(army, party) {
  const list = node("div", null, "unit-list"),
    units = army?.units ?? [];
  list.append(
    node(
      "p",
      `${units.reduce((sum, u) => sum + (u.quantity ?? 0), 0)} soldats · ${units.length} unité(s)`,
      "detail-caption",
    ),
  );
  for (const unit of units) {
    const definition = party.unitTypes?.find((t) => t.id === unit.typeId),
      card = node("details", null, "unit-card");
    card.append(
      node(
        "summary",
        `${unit.quantity ?? 0} × ${definition?.name ?? unit.typeId} · ${displayLabel(unit.rank ?? "soldier")}`,
      ),
      renderReadable({ ...definition, ...unit }),
    );
    list.append(card);
  }
  return list;
}
function inventoryView(hero, party, onSelect) {
  const inventory = node("div", null, "inventory-list");
  const bag = party.heroDetails?.[hero.id]?.bag;
  if (bag)
    inventory.append(
      node(
        "p",
        bag.usedSlots + " / " + bag.slotCapacity + " emplacements occupés",
        "detail-caption",
      ),
    );
  inventory.append(renderReadable(hero.resources ?? {}));
  const itemLink = (id, amount, context) => {
    const item = party.itemTypes?.find((i) => i.id === id) ?? { id, name: id };
    inventory.append(
      button(
        `${item.name ?? id}${amount ? ` × ${amount}` : ""} · ${context}`,
        () => onSelect("items", item),
      ),
    );
  };
  for (const [slot, id] of Object.entries(hero.equipment ?? {}))
    if (id) itemLink(id, 1, displayLabel(slot));
  for (const loot of hero.carriedLoot ?? []) {
    itemLink(loot.itemId ?? loot.id, loot.quantity ?? 1, "Bagages");
    if (Object.keys(loot).length > 2) inventory.append(renderReadable(loot));
  }
  if (
    !Object.values(hero.equipment ?? {}).some(Boolean) &&
    !hero.carriedLoot?.length
  )
    inventory.append(node("p", "Aucun équipement ni bagage", "empty-state"));
  return inventory;
}
function questView(view, hero) {
  const el = node("div");
  for (const quest of [...(view?.instances ?? [])].sort(
    (a, b) =>
      (a.status === "active" ? -1 : 1) - (b.status === "active" ? -1 : 1),
  )) {
    const card = node("article", null, "quest-card");
    card.append(
      node("h4", quest.title ?? quest.questId),
      node("span", displayLabel(quest.status), "status-pill"),
    );
    const list = node("ol");
    for (const action of quest.actions ?? []) {
      const li = node("li", `${displayLabel(action.status)} · ${action.label}`);
      li.dataset.status = action.status;
      list.append(li);
    }
    card.append(list);
    el.append(card);
  }
  if (!el.childNodes.length)
    el.append(node("p", "Aucune quête à actions en cours", "empty-state"));
  if (hero?.sideQuests && Object.keys(hero.sideQuests).length)
    el.append(panel("Autres missions", renderReadable(hero.sideQuests)));
  return el;
}
function heroView(hero, party, onSelect) {
  const el = node("div"),
    heroClass = party.heroClasses?.find((c) => c.id === hero.classId);
  el.append(
    summary([
      ["Classe", heroClass?.name ?? hero.classId],
      ["Grade", displayLabel(hero.commandRank)],
      ["Niveau", hero.level],
      ["Expérience", hero.experience],
      ["PV", `${hero.health ?? 0} / ${hero.maxHealth ?? 0}`],
      [
        "Commandement",
        `${hero.commandPoints ?? 0} / ${hero.maxCommandPoints ?? 0}`,
      ],
      [
        "Distance",
        `${Math.round(hero.travelProgress?.totalDistanceMeters ?? 0)} m`,
      ],
    ]),
  );
  const progress = party.heroDetails?.[hero.id]?.progress;
  const health = node("progress");
  health.max = hero.maxHealth ?? 1;
  health.value = hero.health ?? 0;
  health.setAttribute?.("aria-label", "Points de vie");
  el.append(health);
  if (progress) {
    const xp = node("progress");
    xp.max = progress.xpToNextLevel || 1;
    xp.value = progress.currentLevelXp ?? 0;
    xp.setAttribute?.("aria-label", "Expérience du niveau");
    el.append(
      node(
        "p",
        progress.maximumLevelReached
          ? "Niveau maximum"
          : progress.currentLevelXp +
              " / " +
              progress.xpToNextLevel +
              " XP pour le prochain niveau",
        "detail-caption",
      ),
      xp,
    );
  }
  el.append(
    panel(
      "Caractéristiques",
      renderReadable(hero.finalStats ?? hero.baseStats),
    ),
    panel("Armée", armyView(hero.army, party)),
    panel("Inventaire et équipement", inventoryView(hero, party, onSelect)),
  );
  const quests = party.playerDetails?.[hero.playerId]?.quests;
  el.append(panel("Quêtes", questView(quests, hero)));
  const rest = node("details", null, "extra-details");
  rest.append(
    node("summary", "Aptitudes, effets et informations complètes"),
    renderReadable(hero),
  );
  el.append(rest);
  return el;
}
export function renderEntityDetails({
  kind,
  entity,
  party,
  onSelect = () => {},
}) {
  const root = node("div", null, "entity-sheet");
  root.append(node("p", "Fiche : état officiel actuel", "detail-caption"));
  root.append(
    node(
      "p",
      {
        players: "JOUEUR",
        heroes: "HÉROS",
        locations: "LIEU",
        groups: "GROUPE AUTONOME",
        items: "OBJET",
        battles: "COMBAT",
        zones: "ZONE",
        loot: "BUTIN",
        sites: "SITE",
      }[kind] ?? "ÉLÉMENT",
      "sheet-eyebrow",
    ),
    node("h2", entity.name ?? entity.id ?? "Détail"),
  );
  if (kind === "players") {
    root.append(
      node("span", entity.connected ? "Connecté" : "Déconnecté", "status-pill"),
    );
    const heroes = party.heroes.filter((h) => h.playerId === entity.id);
    for (const hero of heroes) root.append(heroView(hero, party, onSelect));
    if (!heroes.length) root.append(node("p", "Aucun héros associé"));
    const knowledge = party.playerDetails?.[entity.id]?.knowledge;
    if (knowledge) {
      const info = node("details");
      info.append(
        node(
          "summary",
          `${knowledge.discoveredLocationIds?.length ?? 0} lieux connus · Renseignements`,
        ),
        renderReadable(knowledge),
      );
      root.append(info);
    }
  } else if (kind === "heroes") root.append(heroView(entity, party, onSelect));
  else if (kind === "groups") {
    root.append(
      summary([
        ["État", displayLabel(entity.status)],
        ["Comportement", displayLabel(entity.behavior)],
        ["Faction", reference(party, entity.factionId)],
        ["Départ", reference(party, entity.originLocationId)],
        [
          "Destination",
          reference(party, entity.mission?.destinationLocationId),
        ],
      ]),
      panel("Armée", armyView(entity.army, party)),
      panel("Chargement", renderReadable(entity.cargo ?? [])),
      panel("Mission", renderReadable(entity.mission ?? {})),
    );
    const full = node("details");
    full.append(
      node("summary", "Trajet, événements et détails complets"),
      renderReadable(entity),
    );
    root.append(full);
  } else if (kind === "locations") {
    root.append(
      summary([
        ["Type", displayLabel(entity.type)],
        ["Propriétaire", reference(party, entity.ownerId)],
        ["Contrôle", reference(party, entity.controllerId)],
        ["Niveau", entity.level],
        ["Population", entity.population],
      ]),
      panel("Ressources et production", renderReadable(entity.resources ?? {})),
      panel("Garnison", armyView(entity.garrison, party)),
      panel(
        "Bâtiments et services",
        renderReadable(entity.infrastructure ?? {}),
      ),
    );
    const npcs =
      party.locationNpcs?.[entity.id] ??
      (entity.chief ? [{ ...entity.chief, source: "chief" }] : []);
    const residents = node("div");
    if (!npcs.length)
      residents.append(node("p", "Aucun PNJ renseigné pour ce lieu."));
    for (const npc of npcs) {
      const card = node("article", null, "location-npc");
      card.append(node("h4", npc.name ?? npc.id ?? "PNJ"));
      card.append(
        node(
          "p",
          [
            npc.title ?? displayLabel(npc.kind ?? npc.role ?? ""),
            displayLabel(npc.source),
          ]
            .filter(Boolean)
            .join(" · "),
        ),
      );
      const details = node("details");
      details.append(
        node("summary", "Informations du PNJ"),
        renderReadable(npc),
      );
      card.append(details);
      residents.append(card);
    }
    root.append(panel(`PNJ du lieu (${npcs.length})`, residents));
    const full = node("details");
    full.append(
      node("summary", "Dirigeant, interactions et détails complets"),
      renderReadable(entity),
    );
    root.append(full);
  } else if (kind === "items") {
    if (entity.image && /^(assets\/|\/app\/assets\/)/.test(entity.image)) {
      const image = node("img", null, "item-art");
      image.src = entity.image.startsWith("assets/")
        ? "/app/" + entity.image
        : entity.image;
      image.alt = entity.name ?? "Objet";
      image.loading = "lazy";
      root.append(image);
    }
    if (entity.description) root.append(node("p", entity.description));
    root.append(panel("Caractéristiques et effets", renderReadable(entity)));
  } else root.append(renderReadable(entity));
  return root;
}
