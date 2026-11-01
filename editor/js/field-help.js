const help = {
  modification:
    "Modification automatique lorsque ce bloc devient actif. La cible, la propriété et l’opération sont contrôlées par le serveur ; chaque bloc ne s’applique qu’une seule fois.",
  id: "Identifiant technique unique, utilisé par les autres fiches pour retrouver cet élément. Préférez un nom stable sans espaces, par exemple livrer-vivres.",
  title: "Titre affiché au joueur pour reconnaître la quête.",
  label:
    "Texte lisible affiché dans l’éditeur ou proposé au joueur. Il ne remplace pas l’identifiant technique.",
  description:
    "Explique le contexte et l’objectif au joueur. Ce texte ne déclenche aucune règle à lui seul.",
  lieu: "Lieu où l’action est proposée et vérifiée. Utilisez un lieu du monde ou une création de la quête.",
  origine:
    "Lieu où le joueur récupère le stock réservé à la quête. Prévoyez sa création dans la fiche de quête.",
  destinataire:
    "Lieu où le joueur livre sa cargaison. Le serveur vérifie sa présence et la quantité transportée.",
  quoi: "Identifiant de l’objet ou de la ressource transférée : food, wood ou un objet du catalogue. Ce champ ne crée pas le stock.",
  combien:
    "Nombre d’objets ou quantité de ressource à transférer, entier strictement positif.",
  distance:
    "Distance officielle à parcourir après l’activation de cette action, en mètres. Le serveur mesure la progression.",
  interaction:
    "Libellé du bouton proposé au joueur pour accomplir cette action.",
  qui: "Identifiant du PNJ pour un dialogue, ou de la cible pour un combat. Ce champ référence un élément existant, il ne le fait pas apparaître.",
  goal: "Résultat attendu du dialogue. Avec des sorties nommées, le résultat du choix détermine la branche activée.",
  outputs:
    "Résultats possibles d’une action. Dialogue : noms de résultats des choix. Combat : victory, defeat ou draw. Chaque sortie peut être reliée à une suite différente.",
  join: "OU : un lien sélectionné suffit à activer cette action. ET : tous les liens entrants sont nécessaires. Les dépendances obligatoires s’ajoutent à cette règle.",
  terminalOutcome:
    "Une fin explicite termine immédiatement la quête après cette action et écarte les objectifs restants. Laisser Continuer pour poursuivre les liens.",
  amount:
    "Quantité requise par la condition ou accordée par l’effet. Les effets de récompense utilisent un entier positif.",
  quantity:
    "Quantité créée ou nombre d’éléments. Pour une création de stock, cette quantité appartient à la quête ou au monde selon la portée.",
  resource:
    "Ressource économique concernée : or, bois, pierre, fer ou nourriture, avec son identifiant serveur.",
  itemId:
    "Identifiant d’un objet du catalogue. Une nouvelle fiche d’objet doit être intégrée au serveur avant utilisation en partie.",
  locationId:
    "Lieu concerné par cette condition, création ou effet. L’identifiant doit correspondre à un lieu du projet.",
  locationSlotId:
    "Emplacement logique du lieu qui propose la quête. Il sera relié au lieu réel lors de la préparation du monde.",
  giverNpcId:
    "Identifiant du PNJ qui propose la mission. Utilisez le même identifiant dans sa fiche narrative et ses dialogues.",
  dialogueId:
    "Conversation à ouvrir lors de la proposition de quête. Référence un catalogue de dialogues, sans créer la conversation automatiquement.",
  interactionLabel:
    "Texte du bouton permettant de demander ou d’accepter la mission.",
  when: "Moment de création : accepted à l’acceptation, published à la publication ou un événement serveur. published impose une portée commune au monde pour un stock.",
  scope:
    "Réservé à cette quête : chaque instance dispose de ses créations. Commun au monde : les participants utilisent le même élément.",
  recipient:
    "Acteur : le héros qui accomplit l’action. Chaque participant : chacun reçoit le montant complet, sans partage.",
  path: "Chemin d’une variable de scénario utilisée comme drapeau, par exemple quest.reconnaissance. Réutilisez exactement ce chemin dans les conditions et les effets.",
  equals:
    "Valeur que le drapeau doit avoir pour satisfaire la condition. Choisir son type puis sa valeur : oui/non, nombre ou texte.",
  value:
    "Nouvelle valeur du drapeau, écrite par le serveur. Choisir son type puis sa valeur.",
  minimumRatio:
    "Part minimale de territoire contrôlée : 0.5 correspond à 50 %, 1 à 100 %.",
  questId:
    "Identifiant d’une quête référencée. Les quêtes externes doivent être présentes dans le catalogue serveur.",
  actionId:
    "Action dont la résolution est vérifiée ou déclenche cet événement. Utilisez son identifiant, pas son nom affiché.",
  from: "Action qui produit la sortie à l’origine de cette flèche.",
  to: "Action activée lorsque cette sortie et les conditions de la flèche sont satisfaites.",
  output:
    "Sortie produite par l’action source. Le serveur décide du résultat réel ; le joueur ne peut pas fabriquer cette sortie.",
  initialNodeId:
    "Premier passage de la conversation. Il doit désigner l’un des nœuds existants.",
  nextNodeId:
    "Nœud suivant si cette réponse poursuit la conversation. Pour terminer par un résultat, renseignez plutôt Résultat / sortie.",
  speaker:
    "Nom affiché au-dessus de cette réplique. C’est un texte narratif, différent de l’identifiant technique du PNJ.",
  text: "Texte présenté au joueur. Il ne crée ni récompense ni condition automatiquement.",
  improvementId:
    "Identifiant précis de l’amélioration attendue. Le serveur constate sa construction ; l’action ne lance pas le chantier.",
  level:
    "Niveau minimal à atteindre. Pour une amélioration, 1 exige qu’elle soit construite au moins une fois.",
  targetLocationId:
    "Lieu servant à identifier la cible du combat. La bataille doit être officielle et avoir commencé après l’activation de l’action.",
  latitude:
    "Coordonnée GPS nord/sud en degrés décimaux. La carte permet de la renseigner visuellement.",
  longitude:
    "Coordonnée GPS est/ouest en degrés décimaux. La position est vérifiée contre la play area si elle est définie.",
  interactionRadius:
    "Distance maximale en mètres pour interagir avec ce lieu. Le serveur contrôle la présence du héros.",
  detectionRadius:
    "Rayon de détection du lieu en mètres. La visibilité dépend aussi des règles de découverte.",
  visibility:
    "Connu : visible selon les règles du monde. À découvrir : doit être détecté. Selon la quête : visibilité liée à sa progression.",
  lifetime:
    "Durable : reste dans le monde. Éphémère : disparaît selon la règle de retrait de la quête.",
  appearance:
    "Moment d’apparition du lieu : dès le placement, à l’acceptation de la quête ou après une action donnée.",
  publicationCondition:
    "Condition unique pour publier la mission. null signifie aucune condition ; ce champ ne représente pas les conditions d’acceptation.",
  events:
    "Réactions aux événements officiels du serveur : déclencheur, action éventuelle, conditions et effets. Elles ne sont pas émises librement par le navigateur.",
  transitions:
    "Quêtes à publier après une issue donnée. Cela n’accepte pas automatiquement la quête suivante.",
  attack:
    "Bonus ou malus d’attaque. Une valeur numérique est attendue ; la fiche d’objet doit être intégrée au catalogue actif pour appliquer ce bonus.",
  defense:
    "Bonus ou malus de défense appliqué par le système d’équipement après intégration de l’objet.",
  morale:
    "Bonus ou malus de moral appliqué par le système d’équipement après intégration de l’objet.",
  mobility:
    "Bonus ou malus de mobilité appliqué par le système d’équipement après intégration de l’objet.",
  command:
    "Bonus ou malus de commandement appliqué par le système d’équipement après intégration de l’objet.",
  health:
    "Bonus ou malus de points de vie appliqué par le système d’équipement après intégration de l’objet.",
};
export function fieldHelp(path, label) {
  const key = path.at(-1);
  if (key === "id" && path.includes("dialogue"))
    return "Identifiant de la conversation dans le catalogue de dialogues. Utilisez la même référence pour l’action et la conversation.";
  if (key === "type")
    return path.includes("goal")
      ? "Type de lieu attendu après construction. Choisissez cette forme ou une amélioration précise, selon l’objectif."
      : "Nature de cet élément. Elle détermine les champs utiles et la règle que le serveur applique.";
  if (key === "role")
    return "Rôle dans le monde : point de départ, lieu durable du monde ou élément lié à la quête.";
  return (
    help[key] ??
    (key === "quest"
      ? "Définition complète avancée. Préférez les fiches pour les changements courants et validez après modification du JSON."
      : `Champ « ${label} » de cette fiche. Les réglages avancés sont contrôlés lors de la validation serveur.`)
  );
}

export const FIELD_ROLES = Object.freeze({
  technical: {
    label: "Référence technique",
    explanation:
      "Sert à identifier ou relier des éléments. Ce n’est pas un nom affiché au joueur.",
  },
  gameplay: {
    label: "Règle de jeu",
    explanation:
      "Influence une condition, une action, une création ou le fonctionnement du monde, sous contrôle du serveur.",
  },
  descriptive: {
    label: "Descriptif / présentation",
    explanation:
      "Texte, nom ou visuel de présentation. Ne crée pas de règle ni de récompense à lui seul.",
  },
  editor: {
    label: "Outil de l’éditeur",
    explanation:
      "Sert à concevoir ou organiser le projet ; n’ajoute pas une règle de jeu.",
  },
  integration: {
    label: "Intégration requise",
    explanation:
      "Cette fiche doit être raccordée au catalogue ou au service serveur concerné pour être utilisable en partie.",
  },
  advanced: {
    label: "Structure avancée",
    explanation:
      "Contenu technique composé ou champ importé dont le rôle dépend de son format. Consulter les champs internes et valider le projet.",
  },
});
const technicalKeys = new Set([
  "id",
  "schemaVersion",
  "questId",
  "actionId",
  "itemId",
  "typeId",
  "locationId",
  "locationSlotId",
  "giverNpcId",
  "dialogueId",
  "speakerId",
  "initialNodeId",
  "nextNodeId",
  "from",
  "to",
  "qui",
  "path",
  "originLocationId",
  "ownerPlayerId",
  "improvementId",
  "sourceLocationSlotId",
  "destinationLocationSlotId",
]);
const descriptiveKeys = new Set([
  "name",
  "title",
  "label",
  "description",
  "intro",
  "text",
  "speaker",
  "interaction",
  "interactionLabel",
  "usage",
  "icon",
  "illustration",
  "portrait",
]);
const gameplayKeys = new Set([
  "modification",
  "target",
  "property",
  "operation",
  "key",
  "action",
  "type",
  "kind",
  "lieu",
  "origine",
  "destinataire",
  "quoi",
  "combien",
  "amount",
  "quantity",
  "distance",
  "level",
  "rank",
  "resource",
  "goal",
  "outputs",
  "output",
  "join",
  "requires",
  "dependsOn",
  "conditions",
  "effects",
  "rewards",
  "outcomes",
  "recipient",
  "when",
  "on",
  "scope",
  "equals",
  "value",
  "minimumRatio",
  "terminalOutcome",
  "publicationCondition",
  "initialQuestIds",
  "events",
  "transitions",
  "latitude",
  "longitude",
  "position",
  "interactionRadius",
  "detectionRadius",
  "visibility",
  "lifetime",
  "appearance",
  "role",
  "removal",
  "belongsToLocation",
  "owner",
  "behavior",
  "detectionMultiplier",
  "concealmentMultiplier",
  "army",
  "units",
  "cargo",
  "modifiers",
  "attack",
  "defense",
  "morale",
  "mobility",
  "command",
  "health",
  "equipmentSlot",
  "category",
  "defaultPlacement",
  "strategy",
  "playArea",
  "polygon",
  "excludedPolygons",
  "world",
  "participationModes",
]);
export function fieldRoles(path) {
  const key = path.at(-1);
  let role =
    path[0] === "editor"
      ? "editor"
      : path.includes("visual") || (path.includes("npcs") && key === "role")
        ? "descriptive"
        : technicalKeys.has(key)
          ? "technical"
          : descriptiveKeys.has(key)
            ? "descriptive"
            : gameplayKeys.has(key)
              ? "gameplay"
              : "advanced";
  const result = [role];
  if ((path.includes("assets") && path.includes("items")) || key === "mission")
    result.push("integration");
  return result;
}
export function renderFieldRoles(path) {
  return `<div class="field-roles">${fieldRoles(path)
    .map(
      (role) =>
        `<span class="field-role field-role-${role}" title="${FIELD_ROLES[role].explanation}">${FIELD_ROLES[role].label}</span>`,
    )
    .join("")}</div>`;
}
