# Connaissances autorisées et secrets de l’exploration

Depuis le 1er novembre 2026, les trésors, artefacts et donjons sont placés uniquement hors de l’influence des lieux normaux. Toute cellule touchant leur portée normale est exclue du placement exceptionnel. Le parcours est unique : cartes de localisation, recherche extérieure avec la jauge, puis expédition de récupération (cette dernière reste à implémenter). Les lieux normaux fournissent toujours des indices, des rumeurs et des repères cartographiques.

Disponible côté serveur depuis le 28 octobre 2026. Le serveur conserve le terrain
complet et fournit une vue distincte à chaque joueur, sans rendre publiques les
ressources inconnues, les cibles des indices ou les tirages aléatoires.

## Deux contrats séparés

`explorationState` est le modèle privé enregistré dans les sauvegardes officielles.
Il ne traverse pas le réseau vers les joueurs. `explorationView` est une vue
fabriquée par le serveur à partir de l’état officiel et du destinataire connecté.
Le contenu d’une vue fournie dans une enveloppe entrante ou recopiée est remplacé
par cette projection autorisée.

| Collection publique | Condition d’accès | Contenu autorisé |
| --- | --- | --- |
| `cells` | Découverte de la cellule enregistrée pour ce joueur | Identifiant, ligne, colonne, ressource effective ; camp seulement si visible |
| `sites` | Découverte du site enregistrée pour ce joueur | Identifiant opaque, type, statut et position extérieure |
| `clues` | Item actif ou obsolète encore détenu avec les droits nécessaires | Identifiant opaque, effet unique, texte lisible ; ordre et nombre des fragments pour une carte |
| `searches` | Recherche du joueur menée par son propre héros | Préparation, position choisie, état et échéances ; résumé du résultat après résolution datée |
| `expeditions` | Mission du joueur avec son héros ou son groupe propre | Préparation, scores, état et dates ; résumé du résultat seulement après fin officielle |

La vue peut aussi indiquer la dimension de grille utilisée, déjà publique dans
la heatmap. Elle ne contient ni liste exhaustive des cellules cachées ni nombres
de sites secrets par région. Avoir découvert un site ne révèle pas automatiquement
la ressource naturelle de sa cellule. Lire une carte ne découvre pas sa cible.

## Droits sur les indices

Les détenteurs admis sont le joueur lui-même, ses héros, ses groupes propres,
ou les réserves d’un lieu pour lesquelles il dispose du droit serveur
`manageReserves`. Ce dernier reprend les permissions du moteur, notamment les
droits explicitement accordés par une mission de fort partagée.

L’alliance, la visibilité d’un héros ou d’un groupe et le rôle d’organisateur ne
donnent aucun droit supplémentaire sur les indices. Les items perdus, vendus et
archivés ne sont plus transmis à l’ancien détenteur. Un item obsolète encore
détenu reste lisible, conformément à sa conservation pour les archives.

Pour une série de localisation, seuls les fragments effectivement détenus sont
lisibles. La vue donne leur texte, leur position dans la série et le nombre de
fragments, sans texte manquant, identifiant de cible, lieu de référence caché,
ou style de l’énigme. Tous les indices sont fiables ; aucun indicateur d’authenticité n’est utilisé.

Les identifiants publics des sites, séries, indices, recherches et expéditions
sont dérivés par HMAC-SHA-256 avec une clé privée et le destinataire. Ils ne
permettent pas de lire une cellule depuis un identifiant interne tel que
`exceptional-cell-4-8`. Ils restent stables pour le même joueur après reprise
lorsqu’une graine d’exploration est sauvegardée. Pour un ancien état sans graine,
la clé de repli ne vaut que pour la session serveur. Un identifiant opaque ne
constitue pas une permission : les futures commandes devront toujours vérifier
les droits et retrouver l’enregistrement officiel côté serveur.

## Résultats et copies secondaires

Les champs transmis sont sélectionnés explicitement dans
`server/realtime/exploration-projection.js`. Les résultats ne reprennent jamais
l’objet privé complet : le résumé public permet le succès, l’or, l’expérience,
les dégâts du héros, la variation de moral et les items effectivement attribués
selon les champs disponibles. Il exclut tirage, graine, probabilités internes,
récompenses futures et marqueurs d’application des gains. Une issue précalculée
n’est pas publiée pendant une mission encore en cours ; une fin datée dans le
futur reste masquée.

La projection filtre aussi les copies d’enregistrements et de résultats dans
les réponses imbriquées, les identifiants internes recopiés, les fragments et
les journaux bruts d’exploration. Les futurs événements d’exploration devront
définir leur propre contrat public ; ils ne sont pas transmis tels quels.

Les groupes associés aux expéditions ne transmettent ni mission privée, ni
route vers la cible, ni historique, message ou cargaison de butin anticipé.
La préparation et le résultat autorisé restent consultables dans la vue de
mission. Les anciens `ResourceZone` sont limités aux gisements découverts par
le destinataire ; la liste des autres découvreurs et les liens vers un lieu
non visible sont retirés.

Ces protections s’appliquent avant l’encodage des snapshots complets et des
deltas, aux événements, aux synchronisations forcées et aux accusés de commande.
Un changement portant uniquement sur un secret ne doit pas produire de delta
visible. Le transfert d’un indice, lui, retire l’item de la prochaine vue de
l’ancien détenteur, sans pouvoir effacer un texte qu’il aurait déjà mémorisé.

## Réception et sauvegarde

`Game.fromJSON()` conserve la vue reçue dans `game.explorationView` pour les
interfaces ; `applyMultiplayerWorldState()` actualise également cette vue. Les
copies sont détachées des données reçues. La vue n’est pas réinjectée dans
`Game.toJSON()` : elle ne remplace jamais le modèle officiel privé. Le bootstrap
navigateur ignore les deux champs fournis et le serveur garde son propre état.

Cette étape fournit le contrat de lecture. Elle ne crée pas encore les actions
de recherche ni les expéditions de récupération. Depuis l’étape suivante, les
indices sont obtenables : leurs offres sont également calculées côté serveur,
avec des identifiants opaques propres au joueur. Les
vues ne révèlent que les connaissances déjà enregistrées par le moteur.

## Vérifications

`exploration-projection.test.js` contrôle les droits individuels, les alliés,
les détenteurs, les fragments manquants, les issues futures, les copies secondaires,
les deltas et les reprises. `exploration-network-privacy.test.js` utilise deux
clients WebSocket réels et contrôle les événements, les synchronisations et les
accusés de commandes avant décodage côté client. Les tests de projection, de
visibilité, de persistance et de synchronisation existants restent applicables.

Voir le [format privé](exploration-persistence.md), la
[génération du terrain](exploration-generation.md) et les
[règles prévues de recherche](hidden-resource-cells.md).

28 octobre 2026 — les offres publiques d’indices, les commandes de retrait,
les bagages, les réserves et le loot utilisent le même filtrage. La preuve
de localisation et les événements de perte restent privés.

28 octobre 2026 — les annonces de disparition restent privées jusqu’à leur échéance de cinq minutes. À échéance, tous les joueurs reçoivent seulement un identifiant opaque, le nom, le message et sa date, sans lien interne ni coordonnées.

28 octobre 2026 — la vue publique comprend les options de PNJ et les rumeurs propres au joueur. Les autres rumeurs et les essais des spécialistes restent privés ; une explication de directions ne donne pas les déplacements des fragments manquants.

29 octobre 2026 — seuls les résultats d’écoute propres au joueur sont publiés : texte, résultat, date et identifiant opaque. Les références internes du message, la chance et le tirage restent privés. Les messages utiles sont lus depuis les items autorisés du joueur.

30 octobre 2026 — les contrôles de recherche, ressources transportées et jauges proposées sont propres au héros du destinataire. Leur disponibilité et la jauge ne dévoilent aucune présence cachée. Les identifiants des tentatives et des indices restent opaques. Le tirage et la chance effective restent privés même après résolution ; le joueur reçoit le résultat public et sa découverte autorisée.


1er novembre 2026 — suppression du placement exceptionnel dans les lieux normaux et sous leur influence ; parcours de recherche extérieur unique.


## Expéditions exceptionnelles — 1er novembre 2026

La [préparation et le départ des expéditions exceptionnelles](exceptional-expeditions.md) sont disponibles : score serveur commun, sélection de moyens réels, groupe envoyé depuis le poste ou déplacement du héros. Les préparations, chargements et départs sont persistants et réservés au joueur propriétaire. La résolution, la puissance des donjons, le retour et les récompenses restent à raccorder.


## Résolution des sites — 1er novembre 2026

La [résolution des sites exceptionnels](exceptional-site-resolution.md) est disponible. Les exigences et récompenses des trois difficultés sont configurées côté serveur et sauvegardées. Un seul tirage applique les provisions, récompenses et, pour les donjons, dégâts et moral des participants. Le site remporté est fermé pour tous. Les groupes reviennent ; les items ou cargaisons sans place restent conservés. Les résultats privés sont projetés sans tirage aléatoire ni données des autres joueurs. Cette mise à jour remplace les mentions antérieures de résolution à implémenter.


1er novembre 2026 — vérification technique : les tests de confidentialité vérifient le champ d’or adverse, sans confondre sa valeur avec des chiffres présents dans un horodatage autorisé. Aucun changement de règle joueur.


## Clôture partagée — 1er novembre 2026

La [clôture partagée et les archives](exceptional-site-closure.md) sont centralisées côté serveur. La première victoire ou disparition est conservée ; les préparations concurrentes sont annulées immédiatement et les groupes en trajet rappelés. Les combats en cours restent en place jusqu’à leur issue. Les indices périmés restent archivables sans nouveau risque ni double paiement. La reprise réconcilie les anciens états sans rejouer de récompense ou de tirage.


## Fondation et terrain — 1er novembre 2026

La [fondation des camps et leurs évolutions selon le terrain](camp-foundation-and-terrain.md) est disponible sur place ou par expédition depuis un poste de prospection. Les positions, coûts, disponibilités et évolutions sont validés par le serveur. La prospection révèle aussi les cases vides. Le camp conserve son gisement d’origine ; son influence neutralise les cellules voisines et ferme les sites exceptionnels encore actifs couverts, sans attribuer leur butin. Les lieux historiques conservent leurs règles. Les possibilités des nouveaux camps sont transmises comme état officiel, sans nouveau calcul de règles dans l’interface.


1er novembre 2026 — la référence de terrain d’un camp n’est transmise qu’à son propriétaire, à son contrôleur ou à un joueur connaissant déjà la cellule. Voir un camp ne révèle donc pas gratuitement son gisement.


## Carte et fiches — 1er novembre 2026

Les marqueurs des cinq gisements connus et les sites exceptionnels actifs ouvrent les préparations. Les positions des seules cellules découvertes sont transmises par le serveur ; les camps évitent un second marqueur de ressource. Voir [Carte et fiches d’exploration](exploration-map-and-sheets.md).
