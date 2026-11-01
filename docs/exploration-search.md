# Rechercher un site exceptionnel à l’extérieur

Depuis le 1er novembre 2026, les trésors, artefacts et donjons sont placés uniquement hors de l’influence des lieux normaux. Toute cellule touchant leur portée normale est exclue du placement exceptionnel. Le parcours est unique : cartes de localisation, recherche extérieure avec la jauge, puis expédition de récupération (cette dernière reste à implémenter). Les lieux normaux fournissent toujours des indices, des rumeurs et des repères cartographiques.

Depuis le 30 octobre 2026, l’action **Chercher un trésor** permet de rechercher
un trésor, un artefact ou une entrée de donjon sur la case où se trouve le héros.
La jauge prépare la découverte ; elle ne récupère pas encore la récompense.

| Action ou moyen | Valeur disponible |
| --- | --- |
| Ouvrir la recherche | Recharge immédiate de 60 secondes par héros |
| Discrétion | Réduite de 50 % pendant 60 secondes dès l’ouverture |
| Indice de recherche valide | +20 points, plafond 40 |
| Spécialité transportée | +10 points par métier sélectionné, plafond 30 |
| Bois | +1 point par unité sélectionnée |
| Nourriture | +1 point par unité sélectionnée |
| Bière | +2 points par unité sélectionnée |
| Outil d’exploration | +5 points par unité sélectionnée |
| Ensemble des ressources | Plafond 30 points |
| Jauge totale | Plafond 100 points |
| Chance indicative | 90 % multiplié par jauge / 100, avec un site présent et des indices correspondants |
| Dépense | Quantités sélectionnées consommées à la validation, même en cas d’échec |

Le barème est validé le 30 octobre 2026. Les cartes de localisation ne donnent
aucun point de recherche. Les messages et parchemins utiles restent des indices
de recherche réutilisables, hors capacité des bagages.

## Ouvrir sur la bonne case

Le bouton est accessible sur la carte lorsque le serveur autorise l’action.
Le héros doit être actif et disponible dans une partie commencée, sur une case
autorisée du terrain. En GPS, une précision supérieure à 50 mètres empêche
l’ouverture. La recherche utilise la position officielle du héros ; le navigateur
ne transmet pas une destination choisie à distance.

Dans la portée normale d’un lieu permanent, la recherche est indisponible. Aucun site exceptionnel n’y est généré ; il n’existe pas de recherche intérieure.

Dès qu’une ouverture est acceptée, le serveur démarre la recharge et la pénalité
pour 60 secondes. Il ne dépense alors aucune ressource. Un seul formulaire de
recherche peut être en préparation pour un héros. Le bouton permet de reprendre
ce formulaire sans créer une nouvelle tentative ni modifier son échéance.

Fermer la fenêtre conserve la préparation. Annuler la recherche l’abandonne,
sans consommation. Dans les deux cas, la recharge et la pénalité continuent
jusqu’à leur date de fin. Elles ne se cumulent pas et ne sont pas réinitialisées
par une réouverture de la fenêtre.

## Préparer la jauge

Choisir les indices de recherche, les spécialités et les quantités transportées,
puis utiliser **Actualiser la jauge** pour recevoir le calcul officiel du serveur.
Le bouton de validation peut également transmettre directement les choix en cours.
Le navigateur affiche les points reçus ; il ne calcule ni score de secours ni gain.

Les spécialités proposées sont le géologue, le mineur, le bûcheron, le fermier,
le cartographe et l’explorateur. Un métier n’est compté qu’une fois, même si
plusieurs individus de ce métier sont transportés. Les spécialistes ne sont pas
consommés. Les stocks laissés dans un autre lieu ne participent pas.

Les indices doivent être actifs et réellement transportés par le héros. Deux
copies de la même information pour le même site ne donnent pas deux bonus ;
des informations complémentaires peuvent atteindre le plafond de 40 points.
Les cartes de localisation servent à choisir la case, sans augmenter la jauge.

La jauge représente les moyens proposés. Elle ne prouve pas la présence d’un
site. Lors de la résolution, seuls les indices correspondant au site effectivement
présent contribuent à la réussite. Une jauge élevée ne révèle donc jamais un
trésor sur une mauvaise case et ne contourne pas un site disparu.

## Valider et consommer

Le serveur vérifie à nouveau la présence sur la case de départ, la disponibilité
du héros et des moyens choisis. Si les ressources ou les indices ont été déposés,
vendus ou perdus entre-temps, la préparation est refusée sans dépense ni tirage.
Il faut une jauge supérieure à zéro pour valider.

Une validation acceptée consomme toutes les quantités choisies de bois,
nourriture, bière et outils, même si les points de cette catégorie sont plafonnés.
Les indices, spécialistes et cartes ne sont pas consommés. La dépense n’a lieu
qu’une fois ; les consultations et actualisations sont gratuites en ressources.

Sur une mauvaise case, avec de mauvais indices, après une disparition, ou si
le tirage échoue, les ressources engagées restent dépensées. L’échec ne clôture
pas un site existant. Une nouvelle tentative demandera une nouvelle ouverture
après la recharge. Si le site a déjà été découvert par ce joueur entre-temps,
la validation ne prélève pas une seconde préparation pour le redécouvrir.

Exemple : un indice correspondant (+20), deux métiers (+20) et quatre outils
(+20) donnent une jauge de 60. La chance est de 54 % sur la bonne case, si le
site est encore actif. Les quatre outils sont consommés lors de la validation,
que la recherche réussisse ou non ; le message et les deux spécialistes restent.

## Réussite et discrétion

Une réussite ajoute la connaissance du trésor, de l’artefact ou de l’entrée du
donjon pour ce joueur. Elle ne donne ni or, ni item puissant, ni expérience,
et ne crée aucun lieu producteur. Le site reste actif pour les autres joueurs.
Les expéditions et la récupération du butin restent des actions distinctes.

Les indices détenus par ce joueur pour ce site deviennent obsolètes ; ils restent
des objets et peuvent être vendus pour archives selon leurs règles. Une simple
découverte ne déclenche pas l’annonce mondiale réservée à une disparition.

La pénalité de discrétion s’applique à la signature détectable du héros : elle
est doublée avant les plafonds habituels pendant les 60 secondes. Les avantages
de classe et la dissimulation habituelle ne suppriment pas ce multiplicateur.
À l’échéance, la signature revient à son calcul normal. Aucune autre statistique
n’est diminuée et la validation ne prolonge pas la pénalité.

## Sauvegarde et confidentialité

Le serveur conserve la position de départ, la préparation, la jauge, les dates
de recharge et de pénalité, puis le résultat et la consommation appliquée.
Une reprise ne recommence pas les 60 secondes. Rejouer une validation résolue
renvoie son résultat sans second tirage, seconde dépense ou seconde découverte.

Chaque joueur reçoit seulement ses contrôles de recherche et ses tentatives.
Le terrain non découvert, les sites présents mais non trouvés, le tirage et
la chance effective restent privés. Le calcul public de jauge ne dépend pas
de l’existence d’un site caché. Les mêmes commandes sont utilisées en GPS et
en simulation ; seule la position et sa mesure diffèrent.

## Historique

30 octobre 2026 — recherche extérieure disponible pour trésors, artefacts et
donjons, barème validé, consommation à la validation, recharge et discrétion
immédiates, reprise et protection contre le rejeu. Les anciennes versions sont
conservées dans l’historique daté du wiki.


1er novembre 2026 — suppression du placement exceptionnel dans les lieux normaux et sous leur influence ; parcours de recherche extérieur unique.


## Expéditions exceptionnelles — 1er novembre 2026

La [préparation et le départ des expéditions exceptionnelles](exceptional-expeditions.md) sont disponibles : score serveur commun, sélection de moyens réels, groupe envoyé depuis le poste ou déplacement du héros. Les préparations, chargements et départs sont persistants et réservés au joueur propriétaire. La résolution, la puissance des donjons, le retour et les récompenses restent à raccorder.


## Résolution des sites — 1er novembre 2026

La [résolution des sites exceptionnels](exceptional-site-resolution.md) est disponible. Les exigences et récompenses des trois difficultés sont configurées côté serveur et sauvegardées. Un seul tirage applique les provisions, récompenses et, pour les donjons, dégâts et moral des participants. Le site remporté est fermé pour tous. Les groupes reviennent ; les items ou cargaisons sans place restent conservés. Les résultats privés sont projetés sans tirage aléatoire ni données des autres joueurs. Cette mise à jour remplace les mentions antérieures de résolution à implémenter.
