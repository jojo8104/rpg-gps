import { resolveDuel } from "./resolver.js";

const playerFor = (state, id) => {
  const player = state.players.find((entry) => entry.id === id);
  if (!player) throw new RangeError("Joueur absent de la bataille.");
  return player;
};
const playable = (troop) =>
  troop.count > 0 &&
  !["ROUTED", "DESTROYED", "INCAPACITATED"].includes(troop.tacticalState);
const cavalry = (troop) => /caval|mounted|horse/i.test(troop.typeId ?? "");
const spear = (troop) => /spear|lancier/i.test(troop.typeId ?? "");
const costOf = (order) =>
  ({ ATTACK: 0, DEFEND: 1, CHARGE: 1, SPEAR_WALL: 1 })[order];

export function submitDuelChoice(input, playerId, choice) {
  if (input.phase !== "CHOICE") throw new Error("Choix du duel indisponible.");
  const state = structuredClone(input);
  const player = playerFor(state, playerId);
  if (player.locked) throw new Error("Choix déjà verrouillé.");
  const cards = choice.flee ? [] : [...(choice.cards ?? [])];
  if (
    cards.length > 1 + player.extraCardsNext ||
    new Set(cards).size !== cards.length
  )
    throw new RangeError("Nombre de cartes invalide.");
  const order = choice.order ?? "ATTACK";
  const orderCost = costOf(order);
  if (orderCost === undefined) throw new RangeError("Technique inconnue.");
  if (cards.length === 0 && order !== "ATTACK")
    throw new RangeError("Une technique exige une carte.");
  for (const id of cards) {
    if (id === "HERO") {
      if (player.hero.health <= 0) throw new RangeError("Héros indisponible.");
      continue;
    }
    const troop = state.troops.find(
      (entry) => entry.id === id && entry.ownerId === playerId,
    );
    if (!troop || !playable(troop)) throw new RangeError("Carte indisponible.");
  }
  if (
    order === "CHARGE" &&
    !cards.some((id) => {
      const troop = state.troops.find((entry) => entry.id === id);
      return troop && cavalry(troop);
    })
  )
    throw new RangeError("Charge réservée à la cavalerie.");
  if (
    order === "SPEAR_WALL" &&
    !cards.some((id) => {
      const troop = state.troops.find((entry) => entry.id === id);
      return troop && spear(troop);
    })
  )
    throw new RangeError("Mur de lances réservé aux lanciers.");
  const cost = orderCost + (cards.includes("HERO") ? 1 : 0);
  if (cost > player.commandPointsMax) throw new RangeError("PC insuffisants.");
  state.pendingChoices[playerId] = {
    cards,
    order,
    flee: Boolean(choice.flee),
    cost,
  };
  return state;
}

export function lockDuelChoice(input, playerId) {
  if (input.phase !== "CHOICE") throw new Error("Choix du duel indisponible.");
  const state = structuredClone(input);
  const player = playerFor(state, playerId);
  if (!state.pendingChoices[playerId])
    state.pendingChoices[playerId] = {
      cards: [],
      order: "ATTACK",
      flee: false,
      cost: 0,
    };
  player.locked = true;
  if (!state.players.every((entry) => entry.locked)) return state;
  state.phase = "RESOLVING";
  return resolveDuel(state);
}

export function aiDuelChoice(state, playerId) {
  const player = playerFor(state, playerId);
  const troops = state.troops.filter(
    (troop) => troop.ownerId === playerId && playable(troop),
  );
  if (!troops.length) return { cards: ["HERO"], order: "ATTACK" };
  const choice = troops
    .slice()
    .sort(
      (a, b) =>
        b.count * b.attack - a.count * a.attack || a.id.localeCompare(b.id),
    )[0];
  const forbidden =
    (state.encounter.twist.id === "NO_CAVALRY" && cavalry(choice)) ||
    (state.encounter.twist.id === "NO_RANGED" && choice.range > 1);
  return {
    cards: [
      forbidden && troops.length > 1
        ? (troops.find((troop) =>
            state.encounter.twist.id === "NO_CAVALRY"
              ? !cavalry(troop)
              : troop.range <= 1,
          )?.id ?? choice.id)
        : choice.id,
    ],
    order: "ATTACK",
  };
}
