/** Ordre de présentation uniquement : les validations restent dans les contrôleurs et le serveur. */
export function lobbyJourney(lobby, { host = true } = {}) {
  if (!host) return ["players"];
  if (lobby?.resume) return ["saves", "players"];
  return [
    ...(lobby?.configuration?.positionMode === "gps" ? ["terrain"] : []),
    "configuration",
    ...(lobby?.configuration?.preparation?.enabled ? ["preparation"] : []),
    "players",
  ];
}

export const journeyPages = {
  terrain: [
    "Votre terrain",
    "Dessinez la zone où vous allez jouer, ou utilisez le terrain du scénario.",
  ],
  configuration: [
    "Vos réglages",
    "Choisissez les joueurs et le style de partie. Les autres réglages sont facultatifs.",
  ],
  preparation: [
    "Votre aventure",
    "Préparez le scénario et ses lieux, une étape à la fois.",
  ],
  players: [
    "Prêts à jouer ?",
    "Choisissez votre héros, puis indiquez que vous êtes prêt.",
  ],
  saves: [
    "Votre sauvegarde",
    "Chargez la partie à reprendre, puis retrouvez les joueurs.",
  ],
};
