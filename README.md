# RPG GPS

Prototype d'un jeu RPG/stratégie GPS jouable dans le monde réel.

## Wiki du jeu

Le [wiki HTML](wiki/index.html) présente les interactions et les catalogues des
classes et unités. Il est publié avec le jeu sur GitHub Pages, à l’adresse
`<URL GitHub Pages du projet>/wiki/`.

Exécuter `npm run wiki:build` après une modification du guide ou des catalogues.
Voir [la procédure de mise à jour](docs/wiki-maintenance.md).

## Structure

- `app/` : interface web et adaptateurs navigateur.
- `app/js/core/` : moteur de jeu indépendant du DOM.
- `data/` : données de jeu sérialisables.
- `tests/` : tests du moteur, exécutables sans navigateur.

Les types d'unités sont configurés dans `data/units.json`. Les unités possédées
et les armées sont des états distincts du moteur.

`PlayArea` définit les limites d'une partie ; une `Location` est un lieu persistant
configurable, sans dépendance directe au GPS ou aux QR codes du navigateur.

`GameSetup` prépare une partie avant son démarrage : scénario, zone, participants,
équipes, règles, stratégie de création des lieux et politique de participation.
Il accepte aussi une limite de temps facultative et une densité de lieux `low`,
`balanced` ou `high`, calculée à partir de la superficie de la `PlayArea`.

`Game` contient l'état actif : création des joueurs, choix des héros et de leurs
classes configurables (`data/hero-classes.json`), chronomètre et fin de partie.

`Scenario` décrit le contenu narratif réutilisable ; `ScenarioState` conserve la
phase active et les états des objectifs pour une partie donnée.

Les emplacements logiques d'un scénario sont reliés aux `Location` réelles par
`ScenarioLocationBinding`. Les effets d'événements sont appliqués dans le moteur
par `ScenarioEffectResolver`, sans dépendance à l'interface.

Les unités conservent leur `ownerPlayerId` dans une armée ou une garnison. Le
recrutement applique les coûts des définitions d'unités, exige un héros présent
dans un lieu recruteur, et respecte la capacité de son armée.

Le combat par cartes sépare les instantanés persistants (`BattleState`) de
`BattleEngine`, qui orchestre les choix simultanés et leurs échéances. Les règles
se trouvent dans `app/js/core/battle-duel/` et la vue dans `battle-duel-view.js`.

Les batailles produisent aussi un `BattleSite` temporaire : il est toujours visible
pour ses participants et devient visible aux autres joueurs lorsqu'ils passent à
proximité. Le `LootSite` associé reste caché jusqu'à une action `chercher` effectuée
dans la zone. Les champs de bataille expirent après 30 minutes et les LootSites
après 60 minutes par défaut ; les sites épuisés sont supprimés immédiatement.

`GpsTracker` collecte les positions navigateur, tandis que `LocationEngine` émet
les entrées et sorties de zones sans répétition. `InteractionEngine` en déduit une
interaction de lieu, de quête, d'exploration ou un `Encounter`. Le GPS et la carte
ne contiennent aucune règle de scénario.

Les renforts rejoignent une bataille depuis sa zone réelle entre deux décisions,
avant tout choix ou verrouillage. La fuite se choisit dans le duel ; le déplacement
GPS seul ne termine pas le combat.

La résolution persistante d'une bataille produit un rapport de survivants, pertes,
prisonniers, déserteurs et butin. Les groupes non joueurs utilisent le modèle
générique `AutonomousGroup` (`rogue`, armée, messager, convoi ou prospection).
Chaque groupe possède un propriétaire typé — joueur, faction, lieu ou indépendant —
distinct de son alignement de faction. Les déserteurs deviennent des groupes
autonomes `rogue`, séparés des armées des joueurs.

## Démonstration locale

Servir le dossier du projet via un serveur HTTP, puis ouvrir `app/index.html`.
L'interface locale permet de créer une partie solo, choisir une classe, activer le
GPS et conserver les diagnostics terrain dans `localStorage`. Elle est conçue mobile-first :
grandes cibles tactiles, prise en compte des zones sûres et disposition à une colonne.

La Phase 1 de l'interface fournit aussi une carte fictive Leaflet : déplacez le héros
au doigt ou à la souris, sélectionnez des lieux, consultez l'armée et les quêtes, puis
testez les interactions locales sans GPS réel.

## Publication iPhone

Le workflow `.github/workflows/pages.yml` teste puis publie automatiquement la
branche `main` sur GitHub Pages. Ouvrir ensuite l'URL HTTPS dans Safari, choisir
Partager puis « Sur l'écran d'accueil » et autoriser la localisation précise.

Le service worker conserve l'interface et les ressources déjà chargées en cas de
coupure temporaire. Le fond OpenStreetMap nécessite toujours une connexion réseau.

## Tests

Exécuter `npm test` depuis la racine du projet.

## Formatage

- `npm run format` reformate les modules JavaScript et les feuilles CSS.
- `npm run format:check` vérifie le formatage sans modifier les fichiers.

Les conventions de rangement sont documentées dans `app/css/README.md` et
`app/js/README.md`.

## Interactions entre joueurs sur la carte

Un clic sur un héros allié permet de demander une conversation ou un échange à portée d’engagement (8 m par défaut). Le destinataire accepte ou refuse dans son bottomsheet.

- **Parler** ouvre les boutons de partage de la quête courante et d’échange réciproque des renseignements de carte. La conversation se fait de vive voix. La quête partagée est un briefing ; sa progression reste commune à la partie.
- **Échanger** affiche les deux offres synchronisées. Un clic ou un glissé ajoute un élément ; les ressources ont une quantité modifiable. Les bagages et les unités sont transférés entiers, avec leurs caractéristiques. Les équipements portés transférés arrivent dans les bagages du destinataire.
- Les deux joueurs valident la même version de l’offre. Une modification d’offre ou de possessions annule les validations. Le serveur vérifie les stocks, les places de bagages et le commandement avant d’appliquer les deux transferts ensemble.
- Une demande expire après deux minutes, une session après dix minutes. Distance excessive, combat, indisponibilité ou déconnexion annulent l’interaction.
- Les attaques respectent `allowPvP` (actif en compétition et en duel). Les renforts proches sont filtrés par alliance. Le serveur filtre les positions et les renseignements ennemis par destinataire, également dans les réponses et lors d’une reconnexion.

Les règles sont dans `player-social-service.js`, l’interface dans `player-social-view.js` et la projection réseau dans `server/realtime/player-projection.js`. Les tests `player-social`, `player-social-server` et `player-projection` couvrent les accords, les transferts et la confidentialité réseau.

### Quêtes annexes des villages et tavernes

Chaque héros dispose d’une offre par chef de village et d’une offre indépendante par taverne construite. Sur place, utiliser **Parler** ou **Visiter la taverne (missions)**, consulter l’objectif et la récompense, puis accepter ou choisir **Plus tard**.

Le catalogue comprend les vivres, les messages, le bois, la pierre, le fer, la bière, les chevaux et des lots combinés (bois + pierre, vivres + bière, fer + chevaux). Il propose aussi l’installation d’un PNJ spécialiste recruté et transporté par le héros, ou le dépôt d’une unité de miliciens, archers ou lanciers en garnison. Les personnages du scénario principal ne sont pas demandés.

Les nouvelles livraisons utilisent les prix d’achat du marché : pour une valeur engagée V, la récompense vaut `ceil(1,2 × V) + 2` or et `ceil(10 + 3 × V)` XP. Exemple : 10 bois + 5 pierres donnent **11 or et 31 XP**. Les PNJ et unités rapportent uniquement `ceil(25 + 4 × coût de recrutement)` XP : un maître fermier donne **185 XP**, une unité de miliciens **105 XP**. Ces demandes sont définies dans `side-quest-catalog.js`. Les missions historiques restent au catalogue : 2 vivres pour **5 or et 15 XP**, ou un message pour **3 or et 30 XP**.

Les lots et les PNJ sont transférés dans le stock du lieu en une seule fois : ressources manquantes ou stockage insuffisant empêchent tout prélèvement. Les travailleurs installés appliquent leurs bonus de production. Pour une garnison, le joueur choisit explicitement une unité au grade Soldat, avec 6 soldats en pleine santé ; le dépôt respecte les places et permissions habituelles. Une unité ayant déjà rapporté une récompense de garnison ne peut pas en rapporter une autre, même après retrait ou sauvegarde.

Les récompenses ne sont attribuées qu’à la réussite ; l’abandon ne donne rien. Les offres consultées et missions acceptées gardent leurs montants sauvegardés (20 XP pour les anciennes missions sans montant d’expérience). Un message est remis chez son destinataire. Les demandes de garnison ne sont proposées que dans les lieux où le héros a le droit de déposer une unité et où une place est libre.

Une offre consultée reste valable **5 minutes**. Une mission acceptée n’expire pas. Après réussite ou abandon auprès du donneur de quête, son offre suivante devient disponible **5 minutes** plus tard. Les délais utilisent l’horloge du jeu et leurs horodatages sont conservés lors d’une sauvegarde : recharger ne les réinitialise pas. Les missions acceptées, les résultats et les délais apparaissent dans le journal, avec un bouton pour afficher le lieu sur la carte.

Le service `app/js/core/side-quest-service.js` contient les règles et la constante `SIDE_QUEST_RENEWAL_MS`. L’état est sérialisé dans `Hero.sideQuests`, indépendamment du scénario principal. Les tests `tests/side-quest.test.js` couvrent renouvellement, sauvegarde, accès, livraison, messages et récompenses uniques.

### IA des combats

`battle-duel/commands.js` choisit une carte et une technique pour les camps
non contrôlés par un joueur. Les décisions sont déterministes et sans DOM.

### Embuscades

Une embuscade réussie augmente l’attaque des troupes de son camp et réduit la
défense des troupes adverses pendant le premier duel. Les statistiques de base
restent inchangées et les bonus expirent au duel suivant. Une embuscade annulée
n’applique aucun bonus. L’état est conservé en sauvegarde et transmis par le serveur.

## Tableau de bord de supervision

Ouvrir `/dashboard/` sur le même serveur que le jeu. Une clé administrateur protège
les API : elle est affichée au démarrage dans le journal du service (`journalctl
-u rpg-gps -n 30 --no-pager`). Pour une clé stable, définir la variable
`RPG_GPS_DASHBOARD_TOKEN` dans l’environnement du service. Sans cette variable,
une nouvelle clé aléatoire est créée à chaque démarrage. La clé est saisie dans
le formulaire et conservée uniquement dans la session de l’onglet.

Depuis le PC serveur : `http://127.0.0.1:3000/dashboard/`. Depuis un autre PC,
un tunnel SSH permet un accès privé :

```bash
ssh -N -L 3001:127.0.0.1:3000 rpg-gps-server
```

Puis ouvrir `http://127.0.0.1:3001/dashboard/`. Pour un accès distant sans tunnel,
utiliser le domaine HTTPS du jeu.

Chaque partie possède un onglet. La carte présente les joueurs, lieux, héros PNJ,
groupes autonomes et la zone GPS ; les parties fictives utilisent un repère simple.
Le bouton « Effacer » à côté de chaque onglet demande confirmation, puis supprime
la partie et son historique, invalide ses sessions et sort les joueurs connectés.
La suppression est enregistrée avant confirmation du serveur. Les comptes joueurs
et les sauvegardes manuelles indépendantes sont conservés.
En GPS, le cadrage initial et « Recentrer » utilisent exclusivement la PlayArea
lorsqu'elle est disponible. Les lieux hors zone sont masqués sur la carte par
défaut, restent signalés dans les détails et peuvent être affichés avec
« Lieux hors zone ». La supervision ne déplace aucun lieu du jeu.
Les détails montrent les ressources, inventaires, équipement, garnisons, combats,
quêtes, scénario, monde et les 100 derniers événements. Les compteurs montrent
mémoire du processus, mémoire JavaScript, CPU et nombre de parties actives.

L’actualisation se fait toutes les quatre secondes, uniquement tant que l’onglet
est visible. Le tableau ne rejoint aucune partie, ne reprend aucune simulation
et n’exécute aucune règle du moteur dans le navigateur. Les résumés de toutes les
parties sont légers ; seuls les détails de la partie sélectionnée sont sérialisés.

La heatmap représente la densité des mesures de position validées par le serveur
(mêmes cellules et origine que le jeu : 15 mètres en GPS et grille fictive
équivalente), sur les 2 000 dernières mesures par
partie. Cet historique borné est sauvegardé avec la partie et commence avec cette
version : aucune position ancienne n’est inventée. Les trajets affichent les
250 dernières mesures par joueur. Il s’agit d’une heatmap de suivi ; les signaux
de recherche calculés uniquement par l’ancienne interface du joueur ne sont pas
reproduits comme données officielles. Aucun brouillard de guerre n’est appliqué
à cette vue administrateur.

Les graphiques historiques du Dashboard suivent les héros, équipes et lieux avec un relevé du monde toutes les 4 secondes et 2 000 relevés consultables sur disque. Voir [le guide de supervision](docs/dashboard-monitoring.md) pour les pondérations de puissance et les limites du stockage.
