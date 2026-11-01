/** Responsables par défaut ; les personnages de scénario restent prioritaires. */
const PROFILES = {
  village: ["Chef du village", "Je veille sur les habitants et les affaires du village.", "Les habitants comptent sur les voyageurs pour garder le contact avec les villages voisins."],
  town: ["Bourgmestre", "Bienvenue en ville. Je coordonne les affaires de la cité.", "Le développement de la ville repose sur ses habitants, ses réserves et ses infrastructures."],
  capital: ["Bourgmestre", "Bienvenue dans notre capitale. Les affaires de la cité m’incombent.", "La capitale rassemble les habitants et les activités du territoire. Ses réserves doivent soutenir son développement."],
  camp: ["Chef d’expédition", "Bienvenue au camp. Je dirige cette expédition.", "Avant de poursuivre notre installation, nous devons organiser les réserves et les infrastructures du camp."],
  fort: ["Seigneur du fortin", "Vous êtes dans mon fortin. Je veille à sa défense.", "La garnison et les fortifications protègent cette position. Leur entretien dépend des ressources disponibles."],
  mine: ["Chef des mineurs", "Bienvenue à la mine. Je dirige les mineurs.", "Notre travail consiste à extraire les ressources du sous-sol. Il faut dégager les stocks pour que la production puisse continuer."],
  quarry: ["Chef des carriers", "Bienvenue à la carrière. Je dirige les carriers.", "Les carriers extraient la pierre destinée aux constructions et aux fortifications. Les réserves doivent être évacuées régulièrement."],
  "lumber-camp": ["Chef des bûcherons", "Bienvenue au chantier. Je dirige les bûcherons.", "Nous préparons le bois nécessaire aux constructions. Un stockage disponible permet de poursuivre la production."],
};

export function hasDefaultLocationChief(type) {
  return Object.hasOwn(PROFILES, type);
}

export function resolveLocationChief(location) {
  if (!location) return null;
  if (location.chief) return location.chief;
  if (!hasDefaultLocationChief(location.type)) return null;
  const [title, greeting, text] = PROFILES[location.type];
  return {
    name: `${title} · ${location.name}`, title, greeting,
    openingLines: [greeting], portrait: null, isHero: false,
    trade: false, tradeOffers: [], tradeLimitPerCycle: 0,
    secondaryQuestIds: [], contexts: [],
    dialogues: [{ id: "local-affairs", label: "Parler de votre activité",
      text, lines: [text], objectiveId: null, when: "always" }],
  };
}
