# État persistant de l’exploration

Socle technique disponible le 26 octobre 2026. Les modèles sont raccordés aux
sauvegardes du jeu. Depuis le 28 octobre 2026, la
[génération au lancement](exploration-generation.md) remplit aussi ces modèles
pour les nouvelles parties. La recherche, les installations et les résolutions
d’expéditions restent à implémenter. Le socle persistant n’accorde
aucune découverte, aucun bonus et aucune récompense en partie.

## Format privé, version 1

`Game.explorationState` est une instance de `ExplorationState`. Son instantané
JSON est conservé dans `Game.toJSON().explorationState`, puis reconstruit par
`Game.fromJSON()`. Les enregistrements sont de simples objets et listes.

| Champ | Données conservées |
| --- | --- |
| `version` | Version du format d’exploration, actuellement 1 |
| `grid` | Identifiant de play area, mode GPS ou simulation, taille de cellule |
| `generation` | Graine et date de génération ; null tant que non généré |
| `cells` | Ligne, colonne, contenu naturel, influences neutralisantes et camp éventuel |
| `sites` | Type exceptionnel, cellule, lieu principal éventuel, position, seuils, récompenses configurées et issue partagée |
| `clueSeries` | Séries de localisation avec un à trois fragments ordonnés et leur désignation |
| `clues` | Instances d’items, effet exclusif, fragment ou texte de recherche, détenteur et statut |
| `discoveries` | Cible découverte, joueur, date et source |
| `searches` | Position, préparation, recharge, échéance de pénalité de discrétion et résultat |
| `expeditions` | Cible, héros ou groupe engagé, préparation, scores, parcours narratif, dates, résultat et événements déjà appliqués |

Le contenu naturel utilise `none`, `wood`, `stone`, `fertile-land`, `iron`, `gold`.
Les sites utilisent `artifact`, `treasure`, `dungeon` et les états partagés
`active`, `won`, `disappeared`. Une découverte individuelle reste séparée de
l’état partagé du site. À la génération, la neutralisation met la ressource à
`none` et conserve les identifiants des influences dans la cellule.

Une série conserve les fragments dans l’ordre de lecture. Un item de localisation
référence une série et un fragment ; un item de recherche contient son texte
sans référence de fragment. Le même modèle conserve les items devenus obsolètes,
perdus, vendus ou archivés : aucun n’est supprimé par le chargement.

Les préparations enregistrent les identifiants des indices et PNJ, les effectifs
volontaires par troupe, et les quantités de montures, matériel et ressources.
Ces données ne réservent ni ne dépensent encore les stocks réels. Les références
aux héros, groupes et lieux restent des identifiants externes, notamment pour
conserver un historique après leur éventuelle disparition.

Les seuils et récompenses non configurés restent null ; aucun chiffre ni butin
n’est inventé. Les résultats, parcours narratifs et paramètres de génération
acceptent des objets JSON pour conserver les détails officiels des futurs
services. La présence d’un résultat dans une sauvegarde ne le rejoue pas.

## Validation et reprise

Les modules `exploration-state.js`, `exploration-records.js` et
`exploration-validation.js` contrôlent notamment les identifiants uniques,
les coordonnées de cellules distinctes, un site exceptionnel par cellule,
les liens internes entre cellules, sites, séries, indices et missions,
l’exclusivité de l’effet d’un indice et les quantités positives ou nulles.

Une série contient de un à trois fragments. Un site remporté ou disparu conserve
un événement de clôture daté, et le vainqueur en cas de victoire. Une expédition
terminée conserve sa date et son résultat. La recharge et la pénalité ne peuvent
pas précéder le début de la recherche. La validation est refaite à la sauvegarde,
y compris après modification des objets par un service.

Les valeurs non sérialisables sans perte (fonctions, cycles, dates, Map et nombres
non finis) sont refusées dans les données JSON libres. Les copies d’entrée et
de sortie ne partagent pas leurs objets imbriqués avec le modèle.

Une ancienne sauvegarde sans `explorationState` reçoit un état vide version 1,
sans nouvelle génération ni migration géométrique des anciens `ResourceZone`.
Ces gisements existants sont conservés dans leur format d’origine. Une version
d’exploration inconnue est refusée plutôt qu’interprétée ou effacée silencieusement.
Les échéances absolues et les événements déjà traités sont conservés à l’identique.

## Autorité serveur et confidentialité

Le bloc complet est réservé aux sauvegardes officielles. Il est retiré des
projections de partie, de monde et des réponses imbriquées destinées aux joueurs,
y compris à l’organisateur. `createMultiplayerWorldState()` ne l’ajoute pas au
monde partagé. Depuis le 28 octobre 2026, une
[vue publique par joueur](exploration-privacy.md) expose séparément les seules
connaissances autorisées, sans remplacer le modèle privé.

L’initialisation historique par instantané navigateur ignore systématiquement
le champ `explorationState`, puis le serveur génère lui-même le terrain neuf.
Un navigateur ne peut donc
injecter des cellules, des découvertes, des scores ou des récompenses. En revanche,
la restauration d’une sauvegarde officielle conserve intégralement le bloc.

Les modèles ne génèrent rien et ne résolvent rien. Les commandes serveur à venir
devront encore appliquer les règles de proximité, de consommation, de recharge,
de score, de clôture, de dégâts et de moral, avec leurs protections contre les
commandes répétées et les missions concurrentes. Conserver les événements traités
prépare cette protection, sans prétendre qu’elle est déjà implémentée.

## Vérifications

Les tests `exploration-state.test.js` contrôlent les reprises, références,
fragments, connaissances individuelles et données invalides. Les tests
`exploration-persistence.test.js` passent par le stockage disque réel et le
parcours de sauvegarde manuelle ; ils vérifient aussi le refus d’injection par
le navigateur. `player-projection.test.js` vérifie l’absence des secrets dans
les envois au joueur et à l’organisateur. Les tests existants de prospection,
de monde multijoueur et de sauvegarde restent applicables.

Les règles de jeu prévues figurent dans la
[spécification des ressources et découvertes](hidden-resource-cells.md).

28 octobre 2026 — ajout compatible des preuves privées de localisation,
provenances et événements de cycle de vie des parchemins, et du journal des
tirages de disparition déjà effectués (`clueEvents`). Une ancienne sauvegarde
reste lisible sans nouveau tirage. Les cartes et items sont créés uniquement
au lancement d’un nouveau terrain ; voir l’article Cartes de localisation et
parchemins de recherche pour les règles disponibles.

28 octobre 2026 — la collection `announcements` conserve les annonces de disparition et leur échéance à cinq minutes. Les reprises ne relancent aucun délai. Le champ historique `authentic` des indices est ignoré : tous les parchemins sont désormais fiables, sans perte d’objets détenus.

28 octobre 2026 — ajout compatible de `rumorKnowledge` (explications apprises) et `discoveryAttempts` (essais de spécialistes déjà effectués). Ces données sont sauvegardées côté serveur. Une reprise ne revend pas une explication et ne relance pas un échec de découverte.

29 octobre 2026 — `rumorPurchases` conserve les écoutes payées, leur résultat et le message remis, avec les tirages privés. Les indices conservent leur support dans `medium`. Les anciennes sauvegardes reçoivent une collection vide sans achat ni tirage rétroactif. Les documents sont recalculés sans encombrement dans les bagages.

30 octobre 2026 — les recherches conservent leur jauge, leur préparation, leur issue et leur consommation officielle. Le héros conserve ses échéances de recharge et de discrétion dans son état de classe. Les anciennes sauvegardes sans jauge restent lisibles ; aucune reprise ne relance un résultat ni un délai.


## Migration du 1er novembre 2026

À la reprise d’une ancienne sauvegarde, les sites encore actifs rattachés à un lieu ou placés dans une cellule neutralisée sont clôturés sans récompense ni nouveau tirage. Leurs indices actifs deviennent obsolètes et restent archivables ; les objets et les historiques sont conservés. Cette migration technique ne produit pas d’annonce de victoire fictive. Les sites déjà remportés ou disparus restent inchangés.


## Expéditions exceptionnelles — 1er novembre 2026

La [préparation et le départ des expéditions exceptionnelles](exceptional-expeditions.md) sont disponibles : score serveur commun, sélection de moyens réels, groupe envoyé depuis le poste ou déplacement du héros. Les préparations, chargements et départs sont persistants et réservés au joueur propriétaire. La résolution, la puissance des donjons, le retour et les récompenses restent à raccorder.


## Résolution des sites — 1er novembre 2026

La [résolution des sites exceptionnels](exceptional-site-resolution.md) est disponible. Les exigences et récompenses des trois difficultés sont configurées côté serveur et sauvegardées. Un seul tirage applique les provisions, récompenses et, pour les donjons, dégâts et moral des participants. Le site remporté est fermé pour tous. Les groupes reviennent ; les items ou cargaisons sans place restent conservés. Les résultats privés sont projetés sans tirage aléatoire ni données des autres joueurs. Cette mise à jour remplace les mentions antérieures de résolution à implémenter.


## Clôture partagée — 1er novembre 2026

La [clôture partagée et les archives](exceptional-site-closure.md) sont centralisées côté serveur. La première victoire ou disparition est conservée ; les préparations concurrentes sont annulées immédiatement et les groupes en trajet rappelés. Les combats en cours restent en place jusqu’à leur issue. Les indices périmés restent archivables sans nouveau risque ni double paiement. La reprise réconcilie les anciens états sans rejouer de récompense ou de tirage.


## Fondation et terrain — 1er novembre 2026

La [fondation des camps et leurs évolutions selon le terrain](camp-foundation-and-terrain.md) est disponible sur place ou par expédition depuis un poste de prospection. Les positions, coûts, disponibilités et évolutions sont validés par le serveur. La prospection révèle aussi les cases vides. Le camp conserve son gisement d’origine ; son influence neutralise les cellules voisines et ferme les sites exceptionnels encore actifs couverts, sans attribuer leur butin. Les lieux historiques conservent leurs règles. Les possibilités des nouveaux camps sont transmises comme état officiel, sans nouveau calcul de règles dans l’interface.
