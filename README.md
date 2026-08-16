# RPG GPS

Prototype d'un jeu RPG/stratégie GPS jouable dans le monde réel.

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

Le combat temps réel sépare `BattleState`, état sérialisable, de `BattleEngine`,
simulation déterministe pilotée par ticks. Trois lignes abstraites accueillent au
maximum trois héros par équipe. Les unités acquièrent leurs cibles, avancent,
attaquent et retraitent automatiquement selon leur comportement propre. Après une
percée sur une ligne vide, elles restent sur cette ligne et infligent directement
au héros ennemi actif le plus proche des dégâts multipliés (×1,5 par défaut). La
bataille se termine dès qu'une équipe ne possède plus aucun héros actif.

Pendant une bataille active, l'écran Battle est verrouillé. Il ne peut être quitté
que par la fin du combat, une reddition explicite ou une fuite GPS confirmée hors
de la zone réelle de bataille.

La résolution crée éventuellement un `LootSite` persistant au centre GPS du
combat. Les objets transportables sont attribués aux héros victorieux encore
actifs, proportionnellement à leur contribution, mais ne rejoignent leur inventaire
qu'après une collecte physique dans la zone et dans la limite de leur capacité.
Les objets non transportables restent sur le champ de bataille. Les héros éliminés
de l'équipe victorieuse sont exclus du partage ; les objets de quête et liés au
compte ne peuvent pas rejoindre le butin.

Les batailles produisent aussi un `BattleSite` temporaire : il est toujours visible
pour ses participants et devient visible aux autres joueurs lorsqu'ils passent à
proximité. Le `LootSite` associé reste caché jusqu'à une action `chercher` effectuée
dans la zone. Les champs de bataille expirent après 30 minutes et les LootSites
après 60 minutes par défaut ; les sites épuisés sont supprimés immédiatement.

`GpsTracker` collecte les positions navigateur, tandis que `LocationEngine` émet
les entrées et sorties de zones sans répétition. `InteractionEngine` en déduit une
interaction de lieu, de quête, d'exploration ou un `Encounter`. Le GPS et la carte
ne contiennent aucune règle de scénario.

Les renforts rejoignent une bataille active uniquement depuis sa zone réelle ;
leur héros prend automatiquement la première des trois lignes encore libres.

Une fuite nécessite plusieurs actualisations GPS hors de la zone de bataille :
la première sortie est potentielle, puis la fuite est validée selon une règle
configurable (`fleeConfirmations`).

Après une fuite validée, une poursuite simulée applique des pertes selon vitesse,
portée et moral ; le héros fuyant reçoit un cooldown configurable avant tout nouvel
engagement. Les unités engagées restent sur le terrain, perdent le commandement et
ne subissent la poursuite que si elles fuient explicitement.

La résolution persistante d'une bataille produit un rapport de survivants, pertes,
prisonniers, déserteurs et butin. Les déserteurs peuvent devenir une `RogueArmy`
persistante, séparée des armées des joueurs.

## Démonstration locale

Servir le dossier du projet via un serveur HTTP, puis ouvrir `app/index.html`.
L'interface locale permet de créer une partie solo, choisir une classe, activer le
GPS et sauvegarder un instantané dans `localStorage`. Elle est conçue mobile-first :
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
