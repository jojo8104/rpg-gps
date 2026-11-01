# Génération du terrain au lancement

Disponible côté serveur depuis le 28 octobre 2026. Chaque nouvelle partie reçoit
un terrain caché de ressources naturelles et de sites exceptionnels, enregistré
dans son état d’exploration. Les cartes et items d’indices sont désormais générés
au même lancement (voir l’article Cartes de localisation et parchemins de recherche).
La recherche, les installations
et les expéditions de récupération restent à raccorder à ces données.

| Contenu naturel | Probabilité avant influence |
| --- | --- |
| Rien | 45 % |
| Bois | 20 % |
| Pierre | 15 % |
| Terre fertile | 12 % |
| Fer | 6 % |
| Or | 2 % |

Un second tirage indépendant détermine le contenu exceptionnel : aucune découverte
94 %, trésor 3 %, artefact 2 %, donjon 1 %. Ces pourcentages sont des probabilités
par cellule, pas des quotas garantis pour chaque partie. Une petite aire peut
ne contenir aucun site exceptionnel. Une cellule sans ressource peut en contenir un.

## Grille commune à la heatmap

`PlayAreaGrid` et `playAreaCellSizeMeters` fournissent le même quadrillage au
générateur, au jeu et à la supervision. La taille de base reste 15 m en GPS et
15 000 m de conversion en simulation. Pour les grands rectangles englobants,
elle augmente afin de rester sous la limite de 20 000 cellules candidates.
La dimension effectivement utilisée est conservée dans l’état d’exploration.

Une cellule est retenue si son centre se trouve dans la play area et hors des
polygones d’exclusion. Les centres hors zone ou exclus ne reçoivent aucun contenu.
Les identifiants, lignes et colonnes sont ceux de la heatmap ; aucun quadrillage
parallèle de ressources n’est calculé dans le navigateur.

## Emprise des lieux et exclusion des sites exceptionnels

L’emprise locale utilise la portée normale des lieux, fournie par
`LocationSpacingPolicy` : politique de portée de la partie en GPS, portées
fictives existantes en simulation. Les bonus d’interaction propres à un héros
ne modifient pas le terrain. Cette emprise sert ici au placement des contenus ;
elle ne recalcule pas les territoires contrôlés par les équipes.

Une cellule dont le carré touche cette portée perd sa ressource exploitable :
son contenu `resource` devient `none`, et `suppressedByLocationIds` conserve les
lieux concernés. Le test porte sur l’intersection avec le carré, pas seulement
sur son centre, afin de traiter également le bord d’un lieu.

Depuis le 1er novembre 2026, les trésors, artefacts et donjons sont placés uniquement hors de l’influence des lieux normaux. Toute cellule touchant leur portée normale est exclue du placement exceptionnel. Le parcours est unique : cartes de localisation, recherche extérieure avec la jauge, puis expédition de récupération (cette dernière reste à implémenter). Les lieux normaux fournissent toujours des indices, des rumeurs et des repères cartographiques.

Le générateur ne crée ni `Location`, ni rayon, ni marqueur supplémentaire. Les
lieux détruits, non encore placés, hors de l’aire autorisée, les marqueurs d’indice
et les lieux d’événement ne neutralisent pas les cellules. Les lieux neutres
permanents participent comme les lieux possédés. Les évolutions d’influence après
le lancement et l’installation de nouveaux camps restent à raccorder.

## Lancement serveur et conservation

`exploration-generation.js` contient la génération sans effet sur les autres
objets de la partie. `server/lobby/initialize-exploration.js` lui fournit une
graine privée aléatoire indépendante de la graine publique du lobby. Le format
enregistre cette graine, la date, l’algorithme `exploration-v2-exterior-only`, le contour de
la play area, les répartitions et la politique d’emprise.

`LobbyService` l’appelle pour les nouvelles parties construites par le serveur,
après leurs placements initiaux, et lors de l’initialisation historique depuis
le navigateur. Dans ce dernier parcours, l’état d’exploration fourni par le
navigateur est ignoré, et la play area validée du lobby prévaut lorsqu’elle existe.

Un état déjà initialisé n’est jamais remplacé par une nouvelle génération.
Les reprises sur disque et les sauvegardes manuelles conservent leurs contenus ;
les anciennes parties sans génération restent dans leur état antérieur. Aucun
tirage ni remplissage rétroactif n’est effectué lors de leur reprise.

Les sites sont créés actifs et inconnus, sans seuil de récupération ni récompense
inventée. Cette phase ne révèle aucun site et ne démarre aucune production.
Les cartes et leurs items sont générés ensuite, dans le même lancement serveur.
L’ancien parcours `ResourceZone` de
prospection conserve ses coûts et déplacements, mais révèle désormais les gisements sans créer de lieu producteur.

Le bloc complet reste privé et retiré des réponses aux joueurs, même pour
l’organisateur. La génération ne rend donc pas ces ressources ou sites visibles.
La [vue de connaissances](exploration-privacy.md) ne transmet que les cellules,
sites et indices autorisés pour le destinataire, sans graine ni destination
cachée encodée dans les identifiants.

## Vérifications

`exploration-generation.test.js` vérifie la reproductibilité, les répartitions,
les exclusions, l’identité avec la heatmap, les grandes aires, les cellules en
bord de portée, l’exclusion des sites sous influence et l’absence de modification des lieux.
`exploration-persistence.test.js` vérifie les deux parcours de lancement,
le refus d’injection d’un terrain navigateur, la reprise et la confidentialité.
`party-preparation.test.js` vérifie aussi la génération dans un monde préparé.

Voir le [format persistant](exploration-persistence.md) et les
[règles complètes prévues](hidden-resource-cells.md).

28 octobre 2026 — le terrain généré est raccordé à la prospection et aux spécialistes transportés. Les découvertes restent individuelles ; aucune exploitation n’est créée automatiquement.


## Simplification du 1er novembre 2026

À la reprise d’une ancienne sauvegarde, les sites encore actifs rattachés à un lieu ou placés dans une cellule neutralisée sont clôturés sans récompense ni nouveau tirage. Leurs indices actifs deviennent obsolètes et restent archivables ; les objets et les historiques sont conservés. Cette migration technique ne produit pas d’annonce de victoire fictive. Les sites déjà remportés ou disparus restent inchangés.


## Résolution des sites — 1er novembre 2026

La [résolution des sites exceptionnels](exceptional-site-resolution.md) est disponible. Les exigences et récompenses des trois difficultés sont configurées côté serveur et sauvegardées. Un seul tirage applique les provisions, récompenses et, pour les donjons, dégâts et moral des participants. Le site remporté est fermé pour tous. Les groupes reviennent ; les items ou cargaisons sans place restent conservés. Les résultats privés sont projetés sans tirage aléatoire ni données des autres joueurs. Cette mise à jour remplace les mentions antérieures de résolution à implémenter.


## Fondation et terrain — 1er novembre 2026

La [fondation des camps et leurs évolutions selon le terrain](camp-foundation-and-terrain.md) est disponible sur place ou par expédition depuis un poste de prospection. Les positions, coûts, disponibilités et évolutions sont validés par le serveur. La prospection révèle aussi les cases vides. Le camp conserve son gisement d’origine ; son influence neutralise les cellules voisines et ferme les sites exceptionnels encore actifs couverts, sans attribuer leur butin. Les lieux historiques conservent leurs règles. Les possibilités des nouveaux camps sont transmises comme état officiel, sans nouveau calcul de règles dans l’interface.
