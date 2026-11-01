# Organisation du JavaScript

- `core/` contient les règles et états sérialisables, sans dépendance au DOM ;
- `ui/` transforme un état en interface et transmet les intentions de l'utilisateur ;
- `map/` contient uniquement les renderers et couches Leaflet ;
- `controllers/` possède l'état des interactions et relie les vues au moteur ;
  le contrôleur de combat possède la bataille affichée, ses brouillons et son
  timer. Il reprend les états serveur sans recréer les règles de duel.
- les adaptateurs navigateur (`gps.js`, `orientation.js`, stockage, alertes) restent à
  la racine ;
- `main.js` orchestre ces modules, mais ne doit pas devenir le propriétaire de
  nouvelles règles métier.

## Interface du joueur

`controllers/player-interface-controller.js` possède les sélections de statistiques,
d'aptitudes, d'équipement et d'unités, ainsi que l'ouverture de la progression.
Il traduit équiper, retirer, dissoudre, affecter un officier, promouvoir et choisir
une amélioration en appels à `Game`. Chaque action relit le héros et le moteur
courants, y compris après un remplacement du snapshot serveur.

`ui/equipment-display.js` anticipe uniquement le déplacement visuel d'un objet
entre les bagages et l'équipement. Les statistiques restent celles du serveur ;
les objets officiels ne sont pas modifiés. Le contrôleur garde cette projection
pendant la requête, bloque une seconde commande, puis affiche l'état officiel
sur confirmation, refus ou erreur. L'effet visuel est local et bref, sans annonce
centrale. Les quêtes et dialogues conservent leur son de confirmation sans
message technique d'attente.

`background-assets.js` lance une file unique à l'entrée dans la configuration :
sprites des héros, marqueurs/décors des lieux, objets puis les autres visuels.
Les portraits seuls sont préchargés à l'accueil. La file n'est jamais attendue
par le lancement et continue durant le jeu, avec deux téléchargements simultanés.

`ui/hero-view.js` et `ui/army-view.js` affichent les panneaux et transmettent les
intentions au contrôleur. Ils réutilisent les services du moteur pour les bonus,
les capacités de classe et l'autorité, ainsi que les vues existantes d'équipement
et d'inventaire. `ui/hero-progress-view.js` présente le choix de progression ;
`ui/progress-reward-view.js` possède la file d'animations. Les badges et le retour
du fantôme sont affichés par `ui/player-interface-view.js`.

Une sélection locale actualise seulement les panneaux du joueur. Les mutations
actualisent aussi le reste de l'application. L'inventaire ouvert conserve son
contenu pendant les actualisations générales pour préserver les interactions.
Changer de partie ferme la progression, vide les récompenses et invalide les
callbacks des anciens panneaux. `main.js` raccorde le moteur, les alertes,
les capacités de classe et le rendu global.

## Propriété des dialogues

- Les narrations et choix de quête appartiennent aux événements et phases du
  scénario. Sa propriété `dialogues` définit les portraits, l'accueil et les
  suites de conversation ; elle est conservée par composition et sauvegarde.
- Les conversations de responsables sont attachées à `location.chief`, avec
  un accueil par défaut selon le type du lieu dans `location-chief-catalog.js`.
- Les conversations de bâtiments sont indexées par leur identifiant
  d'infrastructure dans `building-dialogue-catalog.js` (forge, taverne).
- `scenario-dialogue.js` construit la présentation narrative sans DOM ;
  `dialogue-view.js` l'affiche. `controllers/dialogue-controller.js` possède
  la conversation ouverte, la progression et les callbacks de la vue. Sa session
  est relue à chaque action pour suivre les états remplacés par le serveur.
  `main.js` branche les retours de quête, la carte et les combats.

## Capacités du héros

`controllers/hero-ability-controller.js` possède l'embuscade préparée, le ciblage
de divination, les délais d'affichage et les messages de vigie non lus. Il relit
la session avant les actions et délègue les calculs à `HeroClassFeatureService`,
`HeroConcealmentService` et `AmbushService`. Les capacités sont indisponibles
pour un fantôme ou pendant un combat en cours.

`ui/hero-ability-view.js` construit les boutons de carte, présente les recharges
et ouvre la lecture des alertes. `ui/cooldown-format.js` partage le format des
recharges avec la fiche du héros. La position continue d'alimenter le service
de dissimulation détenu par le contrôleur des capacités.

Changer de partie vide les messages, ferme la fenêtre de vigie, annule les délais
et réinitialise l'immobilité. Une alerte d'une ancienne fenêtre ne recentre plus
la carte. `main.js` raccorde le ciblage de carte, les mises à jour GPS, la fiche
du héros et l'ouverture des duels.

## Quêtes et scénario

`controllers/quest-controller.js` possède le journal, l'état du HUD, les annonces
du maréchal, le messager royal, les retours de progression et les raccords narratifs
des victoires ou défaites. Il transmet les décisions au moteur et relit la session
à chaque action. Les anciennes intentions et annonces différées sont invalidées
au changement de partie ; le premier ordre est aussi annulé par un lancement dev.

`controllers/scenario-world-controller.js` gère les traces de quête, la recherche
du camp, la révélation du champ de bataille, le placement des objectifs et leur
projection en coordonnées GPS ou de simulation. Il utilise les services du moteur
pour les positions et transmet les changements aux contrôleurs de carte et de GPS.
Il raccorde aussi les lieux créés par les quêtes d'équipe aux interactions.

`core/scenario-quest-catalog.js` regroupe le catalogue de lancement et le premier
briefing. Les définitions et événements narratifs restent dans les scénarios.
`ui/quest-journal-view.js` réunit campagne, missions annexes et missions d'équipe ;
`ui/quest-notice-view.js` affiche les badges, les annonces et les fiches de
personnages de scénario. `ui/quest-debug-view.js` affiche le sélecteur de test.

`main.js` construit la partie et branche ces modules sur la carte, les dialogues,
les combats, les alertes et les mises à jour de position. Les règles de progression
restent dans `Game`, `QuestRuntime` et les services de scénario, sans dépendre du DOM.

## Gestion des lieux

`controllers/location-controller.js` possède la sélection du lieu, la navigation
dans l'annuaire, les fiches, le marché et la garnison. Il actualise les ressources
sans reconstruire les panneaux ouverts et invalide les échanges en attente lors
du changement de partie.

`controllers/location-action-controller.js` traduit les actions de camp, d'armée,
de ressources et de bâtiments en appels à `Game`, puis transmet les résultats à
l'interface. `controllers/scenario-action-controller.js` traite les choix narratifs,
les interactions de quête et l'engagement de l'avant-garde. Les règles restent
dans le moteur. La divination ignore une réponse serveur d'une partie précédente.

`controllers/location-logistics-controller.js` possède les choix des convois et
de la prospection ; `ui/location-logistics-view.js` affiche ces deux écrans.
`controllers/relay-controller.js` possède l'envoi et la boîte de réception,
affichés par `ui/relay-view.js`. Chaque commande relit la session courante.
Une réponse tardive ne rouvre pas un panneau quitté ; une réponse d'une partie
précédente est ignorée. Les doubles envois sont bloqués pendant la commande.

`main.js` branche les dialogues, les combats, le GPS et les retours de quête.

## GPS et carte

- `controllers/gps-controller.js` possède les capteurs GPS et boussole, le cap,
  le premier relevé et le journal de précision. Il arrête les anciens capteurs
  et ignore leurs callbacks après une réinitialisation.
- `controllers/map-controller.js` possède la vue Leaflet, le recentrage, le suivi,
  l'orientation, les filtres de couches et les redimensionnements différés.
  Une carte remplacée est retirée.
- `controllers/position-controller.js` relie les déplacements aux services du jeu :
  marche, traces, présence, découverte, exploration et position dans une bataille.
  Il possède aussi les coordonnées des lieux utilisées pour leur présentation.
- `controllers/location-map-model.js` et `controllers/map-layer-model.js` préparent
  les données des fiches, marqueurs et couches sans dépendre du DOM ou de Leaflet.
- `controllers/map-interaction-controller.js` possède l'outil actif et traduit
  les clics en déplacements, tracés ou intentions de placement.

`main.js` fournit les services et branche les réactions de scénario, la préparation
du monde et les indications des outils. Les règles spatiales restent dans `core/`.

## Multijoueur

`controllers/multiplayer-controller.js` possède la connexion au lobby, l'état
de session, les snapshots en attente, l'amorçage du moteur serveur, les commandes
et les publications différées. `MultiplayerClient` conserve le transport Socket.IO
et la reconstruction des snapshots. Le proxy de commandes transmet l'intention
sans exécuter la méthode locale. Il attend le résultat et l'état officiels ; les
contrôleurs attendent cette confirmation avant les messages de succès et les
récompenses. Les commandes identiques en cours sont dédupliquées, une erreur
demande une resynchronisation et les réponses d'une ancienne partie sont ignorées.

`controllers/player-interaction-controller.js` prépare les joueurs visibles,
sélectionne les alliés proches et relie parler, échanger et attaquer aux services.
`ui/player-interaction-view.js` affiche leurs fiches. Les sessions sociales restent
affichées par `PlayerSocialView`, qui ignore une commande devenue obsolète.

Changer de partie invalide les commandes et publications en attente. Le solo ne
publie pas via la connexion persistante du lobby. `main.js` fournit les raccords
vers le moteur restauré, la carte, les combats et les écrans de lancement.

## Autorité serveur en solo et en multijoueur

Le solo ouvre une session serveur limitée à un joueur humain via `lobby:solo`.
Ses préférences et son héros sont conservés par `core/solo-launch.js`, avec
l'identité attribuée par le serveur. La préparation GPS reste disponible dans
ses écrans habituels. Le monde préparé est transmis au moteur officiel par le
même amorçage que les parties multijoueurs.

Le navigateur ne lance aucun cycle de production de secours. Le serveur fait
avancer production, soins et duels, et déclenche les attaques de proximité en
GPS comme en simulation via `core/autonomous-hero-attacks.js`. La marche GPS transmet les
mesures au serveur sans appliquer une seconde récompense locale. Le lancement
nécessite donc le backend, même pour une partie solo.

Le test sur carte fictive utilise les mêmes commandes serveur, dialogues, règles
de ressources, progression, quêtes et duels que le jeu IRL. Les adaptations de
distance, de placement et des délais liés au trajet restent propres au mode de
coordonnées. Les lieux de simulation supplémentaires sont des supports de test.

Le sélecteur de quêtes et le test de fort utilisent `Game.prepareTestQuest`, une
commande réservée par le serveur aux sessions solo de simulation. Les quêtes
viennent du catalogue officiel ; le navigateur ne crée pas d'offre locale. Le
test de fort fournit explicitement un effectif fictif et un dépôt de préparation,
puis réutilise le service normal de la quête et ses règles de récompense.

La divination du héros et le voyage astral sont des commandes serveur. Le moteur
utilise les positions officielles pour calculer la portée et applique lui-même
les délais de recharge ; l'interface choisit seulement la cible et affiche le retour.
Le voyage astral utilise `map/AstralTravelRenderer.js` pour son cercle et son double
déplaçable. Le serveur limite l’effet à 10 secondes et une action réussie sur la cible ;
`core/astral-interaction.js` centralise sa portée et sa consommation.

## Interface persistante et navigation

`ui/app-shell-view.js` construit les menus de la carte, les filtres, les supports
des notifications, le courrier, les contrôles des outils et les références DOM
partagées. Il lit les couches de carte courantes via un callback et délègue le
rafraîchissement ; aucune règle du moteur n'y est définie.

`controllers/app-navigation-controller.js` branche l'accueil, les retours des
écrans de préparation et la navigation entre vues. Il respecte le verrouillage
des combats et demande aux contrôleurs concernés de rafraîchir la vue choisie.
`main.js` conserve les raccords entre ces modules et les fonctionnalités du jeu.

## Session active

`session/game-session.js` possède le contexte local de la partie active : moteur,
héros local, joueur, mode de coordonnées, terrain et état du placement initial.
Chaque appel à `createGameSession()` crée un contexte indépendant. Les catalogues
et les services du navigateur restent fournis séparément par `main.js`.

`createSessionContext()` fournit aux contrôleurs des accès vivants à cet état.
Une restauration remplace les références au moteur et à ses héros. La remise à
zéro efface le terrain, les rencontres et les placements
de la partie précédente, en conservant l'objet utilisé par les contrôleurs.
Ce contexte local ne remplace ni les lobbies du serveur ni les sessions d'identité.

## Démarrage et outils

Le serveur possède l'unique horloge du monde, en solo comme en multijoueur.
Le navigateur n'a ni contrôleur de production locale ni minuterie dans sa session.

`controllers/game-start-controller.js` coordonne le préchargement des images,
la construction de la partie, le placement des héros et l'amorçage serveur.
Il conserve la protection contre les lancements simultanés.
`game-data-loader.js` charge et compose les catalogues ; les paramètres propres
au mode simulation sont dans `core/simulation-config.js`.

`controllers/world-setup-controller.js` prépare les placements automatiques ou
manuels, les groupes autonomes, les zones de ressources et la grille du terrain.
Il applique aussi le déplacement des lieux et actualise leurs positions projetées.
Les calculs de placement restent dans `core/setup-placement-service.js`.
`controllers/game-tools-controller.js` branche les outils de terrain, les profils
sauvegardés, la fermeture de session et les formulaires de triche. Les mutations
de triche restent confiées à `core/cheat-service.js`.

`main.js` fournit les dépendances et les accès à la partie courante. Ces accès
restent vivants pour que les contrôleurs utilisent aussi une partie restaurée
par le serveur, sans conserver une ancienne référence au moteur.

## Rencontres, transitions et rendu général

`core/location-interaction-policy.js` fournit les portées et la description des
ennemis à partir de la session courante. Les bonus du héros restent calculés par
ses services, et les commandes de combat restent validées par le serveur.

`controllers/encounter-controller.js` route les événements de proximité, les
groupes détectés et les choix de rencontre. `ui/encounter-view.js` affiche les
fiches et transmet les intentions du joueur.

`core/player-map-visibility.js` synchronise la présence officielle des héros
dans les lieux avec les mêmes portées et bonus que la carte. Les captures et
interactions utilisent cette présence serveur. Le contrôleur de position attend
la confirmation réseau et conserve l'état du détecteur entre deux projections ;
les événements retardés d'un ancien déplacement ne rouvrent pas une fiche.

`controllers/location-flow-controller.js` centralise le retour après les actions
et dialogues, la consommation du lieu révélé et le départ vers un combat.
Après un combat, il attend la progression des quêtes puis actualise les rencontres
et les lieux détruits ou capturés. `controllers/player-interface-controller.js`
affiche les récompenses de marche et déclenche leurs alertes, sans calculer les gains.

Le journal de quête lit uniquement les associations de lieux présentes dans la
projection du joueur. Le serveur garde les associations complètes et expose la
progression d'un placement actif sans révéler l'identité ni les coordonnées du
lieu encore inconnu. Un objectif masqué ne doit jamais empêcher le rendu du journal.

`controllers/application-render-controller.js` coordonne les projections de la
carte, du héros et des quêtes, en respectant les panneaux ouverts et la pause
visuelle. `ui/world-status-view.js` gère les indicateurs GPS, les traces de combat
et la grille. Aucun de ces rendus ne fait avancer le moteur.

`main.js` assemble les contrôleurs, injecte leurs dépendances et raccorde les
événements du navigateur. Les fiches, les politiques et les transitions propres
aux fonctionnalités sont confiées aux modules concernés.

## Méthode de mise en forme et de commentaire

1. Une instruction ou propriété par ligne après `npm run format`.
2. Une ligne vide entre deux responsabilités distinctes.
3. Un commentaire de module explique sa responsabilité et ses frontières.
4. Dans les gros orchestrateurs, des commentaires de section servent de sommaire.
5. Les commentaires expliquent une intention, un invariant ou une contrainte ; ils
   ne paraphrasent pas une instruction évidente.
6. Toute règle ajoutée dans `core/` doit rester testable sans navigateur.

Utiliser `npm run format:check` pour détecter les nouveaux blocs compactés.
