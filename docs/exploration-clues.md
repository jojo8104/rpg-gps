# Cartes de localisation et parchemins de recherche

Depuis le 1er novembre 2026, les trésors, artefacts et donjons sont placés uniquement hors de l’influence des lieux normaux. Toute cellule touchant leur portée normale est exclue du placement exceptionnel. Le parcours est unique : cartes de localisation, recherche extérieure avec la jauge, puis expédition de récupération (cette dernière reste à implémenter). Les lieux normaux fournissent toujours des indices, des rumeurs et des repères cartographiques.

Depuis le 28 octobre 2026, les nouvelles parties génèrent des cartes pour leurs
sites exceptionnels. Les indices sont des objets réutilisables : les lire ne les
consomme pas et ne donne pas automatiquement la récompense.

| Objet ou action | Règle disponible |
| --- | --- |
| Carte de localisation 🗺️ | Un seul effet : indiquer où aller ; 1 à 3 fragments ordonnés par site |
| Parchemin de recherche 📜 | Un seul effet : aider la recherche sur place ; aucune direction |
| Encombrement | Aucun slot de bagage pour les documents, cartes et fragments compris |
| Taverne | Écouter une rumeur : 5 or, message de recherche ou conversation sans importance ; carte de localisation vendue séparément |
| Académie de magie | Retrait gratuit d’un parchemin du stock fini, depuis le panneau Équipements d’un lieu permettant le commerce |
| Butin | Un indice disponible attribué au premier héros joueur actif de l’équipe victorieuse ; réception même si les bagages sont pleins |
| Vente d’un indice actif | 5 or ; risque de disparition du site : 25 % |
| Annonce de disparition | Après 5 minutes, un message officiel est envoyé à tous les joueurs |
| Archives | Carte seule ou parchemin de recherche : 5 or ; fragment d’une paire : 7 or ; fragment d’un trio : 10 or |

Les pictogrammes du tableau représentent la carte de localisation et le parchemin
de recherche dans les bagages. Le texte d’un fragment détenu est consultable en
ouvrant la fiche de l’objet. Le nombre et le rang des fragments y sont indiqués.

## Lire les cartes

Pour un site extérieur, le point de départ est la case qui contient un lieu
permanent placé, choisi près du site. Le nord augmente le numéro de ligne et
l’est le numéro de colonne. Le déplacement est compté sur la grille de la
heatmap, depuis cette case, sans arrondir une distance en mètres. En l’absence
de lieu de référence, la carte désigne explicitement une case repère de la grille,
avec sa ligne et sa colonne comptées depuis le sud-ouest.

Une direction simple donne une carte ; un changement d’axe donne deux fragments.
Un artefact, un donjon ou un site dont une cible de score configurée atteint 70
utilise deux fragments pour une direction simple et trois pour deux axes. Si la
destination est dans la case de départ, une seule carte suffit. Il s’agit du
critère initial de découpage, sans création de récompenses ou de scores cibles.

Exemple d’un trio : « Depuis la case qui contient Valombre, comptez sur la
carte… », « …3 cases vers le nord, puis… », « …2 cases vers l’est. » Les trois
fragments se complètent. Posséder une carte ne donne pas le texte des autres.
Ces indications sont des décalages cartographiques, pas la garantie d’un chemin
praticable à travers les zones exclues du terrain.

Chaque série est vérifiée avant son enregistrement : les décalages atteignent la
bonne cellule ; les désignations et anagrammes correspondent au bon lieu. Une
reprise conserve les textes, les stocks et les résultats déjà enregistrés. Les
anciennes parties ne reçoivent pas rétroactivement un nouveau tirage.

## Obtention

Les cartes de localisation et les parchemins de recherche sont répartis entre le
loot, les tavernes et les académies existantes. Si un type de bâtiment est absent,
ses indices restent accessibles par le loot. Chaque fragment de localisation dispose
d’un objet obtenable. Un stock retiré ne réapparaît pas après rechargement.

Tous les indices sont fiables : il n’existe plus de faux parchemins ni de tirage d’authenticité. Les anciens objets marqués comme faux sont conservés comme indices normaux lors de la reprise.

Les rumeurs d’ambiance sont désormais raccordées à l’écoute payante en taverne. Elles parlent d’autres sujets et ne remettent aucun faux indice. Un résultat utile donne un vrai message de recherche écrit, hors capacité des bagages.

Le butin réserve un indice fini par bataille victorieuse, s’il en reste. Les documents sont remis même si les bagages sont pleins. Les ressources ne sont débitées qu’après
vérification du stock, des droits et de la place disponible.

## Perte, vente et archives

Les règles existantes de perte des bagages en combat s’appliquent aussi aux
parchemins. Un parchemin perdu peut rejoindre le butin et être récupéré ; cela
ne crée pas une seconde copie. La vente et la perte d’un indice actif
provoquent un risque de disparition de 25 %, une fois par site et événement,
même si plusieurs fragments sont perdus. Le tirage est sauvegardé.

Une disparition concerne **tous les joueurs**. Cinq minutes après cette disparition, tous reçoivent une annonce : « Le trésor « X » a été découvert par un explorateur. » Le nom X identifie le trésor ; le message ne donne ni emplacement ni identité de joueur. Le même principe s’applique aux artefacts et donjons disparus, avec leur désignation adaptée. Le délai part de la disparition, pas de la vente ni de la lecture d’un indice. Une vente sans disparition ne produit aucune annonce. La notification est enregistrée côté serveur ; une reprise conserve son échéance et un joueur déconnecté peut la consulter à son retour. L’affichage figure dans le journal des messages et n’est pas répété à chaque synchronisation. Le site perd son statut
exceptionnel, et les indices encore actifs de ce site deviennent obsolètes.
Une victoire utilise le même mécanisme de clôture mondiale. Le lieu principal,
le terrain et les objets détenus ne sont pas supprimés. Les règles de victoire et
de récompense des expéditions seront raccordées à cette clôture aux étapes dédiées.

Un indice obsolète reste dans les bagages. Le cartographe ou géographe, proposé
dans le panneau Équipements des villages, villes et capitales permettant le
commerce, le rachète pour ses archives. Cette vente n’effectue aucun nouveau
tirage de disparition. Le serveur conserve l’objet archivé ; il ne reste pas
dans les bagages du vendeur et ne peut pas être revendu une seconde fois.

Les parchemins peuvent aussi être déposés puis repris dans les réserves d’un
lieu, selon les droits habituels. Un allié n’obtient aucun droit de lecture
automatique sur les bagages d’un autre joueur.

## Limites et confidentialité

Les offres et les textes détenus sont envoyés par le serveur. Les identifiants
publics sont opaques, propres au joueur ; ni la destination interne, ni les
fragments absents, ni les tirages ne sont envoyés. La même
protection vaut après dépôt, perte et collecte de loot.

Les deux effets sont séparés dans les modèles et le service de sélection des
indices utilisables. La recherche extérieure utilise désormais ces indices sans les consommer. Une découverte par ce parcours rend les indices du joueur pour ce site obsolètes, en les conservant comme objets. Le calcul des expéditions reste à raccorder. Les dialogues de recherche intérieurs sont abandonnés. Lire une carte ne valide pas une découverte.

## Historique

28 octobre 2026 — génération des séries vérifiées, objets et sources finies,
lecture, pertes, ventes, archives et commandes serveur. Les versions précédentes
sont accessibles par l’historique daté de l’article dans le wiki.

28 octobre 2026 — suppression des faux indices ; conversion des anciens parchemins en indices normaux et annonce mondiale cinq minutes après une disparition.

28 octobre 2026 — raccordement des explications de PNJ, des rumeurs à 5 or et de leur mémorisation. Voir l’article Rumeurs, prospection et spécialistes transportés.

29 octobre 2026 — tous les documents sont hors capacité de bagage ; les rumeurs payantes donnent un message de recherche ou une conversation sans importance. Les explications des cartes sont gratuites.

30 octobre 2026 — les indices sont utilisables dans la [jauge de recherche extérieure](exploration-search.md). La validation consomme les ressources choisies, jamais les papiers ni les spécialistes.


1er novembre 2026 — suppression du placement exceptionnel dans les lieux normaux et sous leur influence ; parcours de recherche extérieur unique.


## Clôture partagée — 1er novembre 2026

La [clôture partagée et les archives](exceptional-site-closure.md) sont centralisées côté serveur. La première victoire ou disparition est conservée ; les préparations concurrentes sont annulées immédiatement et les groupes en trajet rappelés. Les combats en cours restent en place jusqu’à leur issue. Les indices périmés restent archivables sans nouveau risque ni double paiement. La reprise réconcilie les anciens états sans rejouer de récompense ou de tirage.
