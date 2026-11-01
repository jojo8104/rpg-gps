// Catalogue de lancement réservé au sélecteur de quêtes du prototype.
export const QUEST_SEQUENCE = Object.freeze([
  {
    id: "missing-prospectors",
    title: "Les prospecteurs disparus",
    description: "Retrouvez l’équipe royale disparue près de Valgrise.",
    startPhaseId: "reach-royal-camp",
    phaseIds: [
      "reach-royal-camp",
      "speak-to-camp-chief",
      "follow-first-trace",
      "follow-second-trace",
      "prospectors-battlefield",
      "free-gold-mine",
      "rescue-mine-geologist",
      "return-geologist-to-camp",
      "return-to-capital",
    ],
  },
  {
    id: "royal-camp-evacuation",
    title: "Le camp menacé",
    description: "Défendez le camp royal et évacuez ses habitants.",
    startPhaseId: "prologue-complete",
    phaseIds: [
      "prologue-complete",
      "reach-evacuation-camp",
      "defend-evacuation-camp",
      "prepare-evacuation",
      "return-evacuees-to-capital",
      "second-prologue-complete",
      "evacuation-failed",
    ],
  },
  {
    id: "royal-fort-supply",
    title: "Le ravitaillement",
    description:
      "Collectez puis livrez vingt rations au fortin royal de Rochegarde.",
    startPhaseId: "receive-supply-order",
    phaseIds: [
      "receive-supply-order",
      "collect-village-rations",
      "reach-supply-fort",
      "deliver-fort-rations",
    ],
  },
  {
    id: "royal-gold-convoy",
    title: "Le convoi d’or",
    description:
      "Récupérez la production de la mine royale et échappez aux voleurs.",
    startPhaseId: "receive-gold-convoy-order",
    phaseIds: [
      "receive-gold-convoy-order",
      "collect-royal-gold",
      "escape-gold-thieves",
    ],
  },
  {
    id: "royal-messenger",
    title: "Le Messager",
    description:
      "Portez un message urgent de Rochegarde au fortin opposé avant la fin du délai.",
    startPhaseId: "receive-fort-message",
    phaseIds: [
      "receive-fort-message",
      "deliver-fort-message",
      "messenger-failed",
    ],
  },
  {
    id: "repression",
    title: "La Répression",
    description:
      "Rejoignez un village assiégé, décidez de son sort et enquêtez éventuellement sur le convoi attaqué.",
    startPhaseId: "locate-village",
    phaseIds: [
      "locate-village",
      "village-arrival",
      "arrival",
      "negotiation",
      "royal-assault",
      "village-defense",
      "village-fall",
      "return-journey",
      "convoy-trace-one",
      "convoy-trace-two",
      "brigand-camp",
      "brigand-battle",
      "treasure-choice",
      "return-after-investigation",
    ],
  },
  {
    id: "granaries-of-the-king",
    title: "Les greniers du roi",
    description:
      "Résolvez la réquisition de Haut-Pré et enquêtez éventuellement sur le convoi des réserves.",
    startPhaseId: "granaries-reach-village",
    phaseIds: [
      "granaries-reach-village",
      "granaries-arrival",
      "granaries-negotiation",
      "granaries-guard-assault",
      "granaries-village-defense",
      "granaries-village-fall",
      "granaries-return-journey",
      "granaries-secret-route",
      "granaries-return-after-investigation",
    ],
  },
  {
    id: "capital-reconquest",
    title: "La capitale du Chaos",
    description:
      "Coupez les convois du Chaos et reprenez la capitale au maréchal Aldren.",
    startPhaseId: "capital-reconquest",
    phaseIds: ["capital-reconquest"],
  },
]);

export function missingProspectorsOffer() {
  return {
    id: "missing-prospectors",
    title: "Les prospecteurs disparus",
    description:
      "Le maréchal souhaite vous confier la recherche d’une équipe royale disparue près de Valgrise.",
    startPhaseId: "reach-royal-camp",
    briefingLines: [
      "Le maréchal vous reçoit dans la salle des cartes.",
      "Une équipe de six prospecteurs et un jeune géologue n’est pas revenue de Valgrise.",
      "Rejoignez le camp royal, interrogez son chef et retrouvez les disparus.",
    ],
  };
}
