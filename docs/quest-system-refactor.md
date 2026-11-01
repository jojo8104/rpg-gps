# Débranchement temporaire et refonte des quêtes

## État actuel

L'application désactive les quêtes avec `QUEST_SYSTEM_ENABLED = false` dans
`app/js/core/quest-system-policy.js`. Le démarrage du navigateur et les points
d'entrée serveur utilisent cette politique. Le serveur impose sa valeur au
chargement initial, à la reprise et à la restauration : le navigateur ne peut
pas réactiver les quêtes en envoyant un instantané.

Le moteur conserve un paramètre explicite `questSystemEnabled`, sérialisé dans
les sauvegardes, pour permettre les tests de l'ancien système. Les définitions,
les images et les états des quêtes existantes ne sont pas supprimés.

Les commandes de quête sont refusées par le serveur. Les objectifs, effets,
placements, offres et échéances ne progressent plus. Les missions secondaires
et d'équipe ne sont plus proposées ni récompensées. Les règles spécifiques de
La Répression et la mise à jour du scénario de reconquête de la capitale sont
neutralisées. Les conversations ordinaires, échanges, déplacements, production
et combats restent dans leurs modules actuels.

Les annonces, dialogues de scénario, traces de quête, journal et outils de
lancement de quête sont neutralisés dans l'interface. Le démarrage du monde
serveur reste exécuté même en l'absence de quête.

Les groupes déjà créés par une quête sont conservés dans les sauvegardes,
mais leurs déplacements et attaques automatiques sont suspendus. Les fiches
de lieux ne proposent plus les actions spécifiques de ces scénarios.

Validation : 830 tests de la suite complète passent ; après le dernier
ajustement des fiches de lieux, les 11 tests ciblés passent également.

La désactivation conserve les horodatages des anciens délais. Une future
réactivation doit décider comment migrer les délais et les parties en cours ;
elle ne constitue pas une pause avec recalcul automatique des échéances.

## Constats de l'examen initial

- 75 tests ciblés de quêtes, dialogues et assemblage passaient avant les
  modifications. Les bugs rencontrés en partie n'ont pas été reproduits par
  ces tests ; leur cause n'est pas attribuée au nettoyage de main.js.
- `scenario-world-controller.js` contenait encore des mutations de découverte
  et des règles spécifiques à certains scénarios.
- `dialogue-controller.js` sélectionnait directement la définition de dialogue
  de La Répression.
- La progression est répartie entre les phases du scénario, QuestRuntime,
  Game, les services de missions secondaires et d'équipe, et les contrôleurs.

## Architecture proposée, non encore implémentée

1. **Définition de quête** : données versionnées, identité, nature, conditions
   d'accès, objectifs, sous-quêtes, transitions et conséquences.
2. **État de quête** : instance liée au joueur ou à l'équipe, objectifs validés,
   choix, échéances et effets déjà appliqués.
3. **Moteur serveur** : consommation des événements officiels, validation des
   intentions, progression et application unique des conséquences.
4. **Lieux de quête** : rôles logiques associés aux lieux existants ou créés
   selon les contraintes de placement ; création et révélation distinctes.
5. **Présentation narrative** : scènes, décors, portraits, locuteurs, répliques
   et réponses. La lecture locale ne valide pas un objectif de jeu.
6. **Interface** : affichage de la projection officielle, journal, carte et
   lecteur de dialogues. Aucun calcul métier de secours.

`main.js` reste le point d'assemblage. La refonte ne doit pas y réintroduire
les règles propres à chaque quête.

## Nouveau moteur raccordé

Le ravitaillement et Les prospecteurs perdus sont disponibles sous forme de
fiches à actions dans le nouveau moteur, activé séparément. Les prospecteurs
ajoutent une enquête séquentielle, une preuve de victoire officielle et deux
objets transportables. Voir `quest-definition.md` et `missing-prospectors.md`.
Le débranchement décrit plus haut concerne les anciennes phases et missions.

## Migration proposée

Commencer par Le ravitaillement : réception, quatre collectes dans l'ordre
libre, trajet, livraison et récompense. Vérifier les commandes serveur, la
sauvegarde/reprise, les doubles clics et la parité simulation/GPS. Ajouter
ensuite Le Messager pour le délai et l'échec, puis une quête à embranchements.
Migrer les scènes narratives et les autres missions après validation de ces
cas. Le compositeur utilisera ce même format de données.
