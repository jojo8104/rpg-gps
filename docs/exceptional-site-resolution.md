# Résoudre un trésor, un artefact ou un donjon

Une expédition préparée peut tenter un site exceptionnel déjà découvert. Avec le héros, rejoignez sa case puis utilisez « Tenter le site avec le héros ». Un groupe envoyé depuis le poste tente automatiquement sa chance à l’arrivée. Le serveur applique un seul tirage et conserve son résultat.

| Site | Exigences | Récompense en cas de réussite |
| --- | --- | --- |
| Artefact 🗝️ | Score d’expédition | Un équipement puissant, sans or ni XP |
| Trésor 💰 | Score d’expédition | 200 / 500 / 1 000 or et 2 items |
| Donjon ⚔️ | Score d’expédition et puissance | 100 / 250 / 500 or, 1 item et 50 / 100 / 200 XP par participant |

Les trois valeurs correspondent respectivement aux difficultés simple (40), intermédiaire (70) et difficile (100). Les pictogrammes distinguent les catégories ; ils ne signalent aucun site caché sur la carte. Les quantités sont le barème initial validé le 1er novembre 2026, configurable côté serveur.

## Difficulté et probabilité

Les nouveaux sites reçoivent au lancement une difficulté stable parmi 40, 70 et 100, dérivée de la graine privée et de leur identifiant. Leur position ne change pas. Les anciens sites actifs sans paramètres sont complétés lors de leur préparation ou de leur tentative ; une difficulté ou une récompense déjà configurée est conservée. Ces valeurs et les résultats sont sauvegardés.

Pour un trésor ou un artefact : probabilité = minimum entre 95 % et 70 % × score d’expédition / cible.

Pour un donjon : probabilité = minimum entre 95 % et 70 % × le plus petit des deux rapports : score d’expédition / cible d’expédition et puissance / cible de puissance. La cible de puissance initiale utilise la même difficulté 40, 70 ou 100, mais elle peut être configurée séparément. Un seul tirage résout le donjon ; une forte logistique ne compense pas une puissance insuffisante.

Le score est recalculé avec les moyens encore réellement présents. Le serveur ne reprend pas aveuglément le score enregistré au départ. La chance affichée est une probabilité, jamais une garantie.

## Puissance des participants

La puissance additionne l’attaque finale, la défense finale et les PV actuels du héros effectivement présent. Chaque soldat apte sélectionné ajoute l’attaque et la défense de son type, les bonus d’attaque et de défense du héros présent, puis ses PV actuels. Les valeurs d’attaque et de défense sont bornées à zéro, comme pour les instantanés de combat. Il s’agit d’un score dérivé des statistiques du moteur, pas d’un combat tactique simulé.

Seuls les soldats sélectionnés, encore présents et aptes au moment de la tentative, comptent. Les blessés, garnisons restées au poste, troupes non engagées et héros distant ne renforcent pas le groupe. Un groupe envoyé reçoit la puissance de ses soldats sans les bonus du héros resté ailleurs.

## Dépenses et issue

À chaque tentative réelle, le bois, la nourriture et la bière engagés et encore présents sont consommés, même en cas d’échec ou au-delà du plafond de points. Les PNJ, montures et outils restent des moyens réutilisables. La recherche extérieure a ses propres dépenses : une ressource déjà utilisée pour chercher ne compte plus ici.

En cas de réussite, le site devient remporté pour tous les joueurs. Les indices actifs associés deviennent obsolètes, sans supprimer les objets. Aucune autre expédition ne peut obtenir une seconde récompense de ce site. En cas d’échec, le site reste actif et une nouvelle expédition peut être préparée après la fin ou le retour de la précédente.

Si le site a été remporté ou a disparu avant la tentative, aucune nouvelle provision n’est consommée, aucun dégât ou effet de moral n’est appliqué et aucun tirage n’est fait. Les groupes envoyés repartent vers leur origine. La vente ou perte d’indices conserve ses règles de disparition globale ; la victoire déclenche immédiatement une annonce distincte indiquant que le site nommé a été remporté, sans position ni identité du vainqueur.

## Conséquences des donjons

| Issue | Dégâts au héros et à chaque soldat engagé | Moral pendant 5 minutes |
| --- | --- | --- |
| Réussite | 10 % des PV maximum, arrondis au supérieur | +5 |
| Échec | 25 % des PV maximum, arrondis au supérieur | −10 |

Les dégâts sont limités aux PV actuels. Les soldats peuvent devenir blessés ou mourir ; le héros devient fantôme si ses PV atteignent zéro. Les dégâts sont appliqués même après une réussite. Les autres troupes et le héros resté au poste ne les subissent pas.

Le moral du héros participant est modifié pendant cinq minutes. Les soldats survivants engagés reçoivent aussi cet effet pour cinq minutes. Le moteur représente le moral à l’échelle d’une troupe : si seule une partie de ses soldats a participé, sa contribution est pondérée par l’effectif concerné. Par exemple, huit participants sur dix survivants donnent une contribution moyenne de −8 pour un effet individuel de −10. Cet effet est utilisé dans les prochains combats et expire côté serveur. Il ne se propage pas aux autres troupes du héros.

L’XP est accordée uniquement en cas de réussite du donjon : au héros présent et à chaque troupe participante survivante. Une troupe est une entité de progression ; le montant n’est pas multiplié par son nombre de soldats. Les PNJ et montures, qui sont des items, ne gagnent pas d’XP. Le héros resté ailleurs n’en reçoit pas.

## Butin, retour et bagages pleins

Avec le héros, l’or est crédité une seule fois. Les items gagnés restent enregistrés comme récompenses à retirer sur la case du site. Utilisez « Retirer les items et décharger le retour ». Si les bagages sont pleins, ils restent disponibles ; un retrait partiel n’efface pas le reste.

Le groupe envoyé revient au poste après réussite, échec ou abandon dû à la fermeture du site. Ses soldats survivants rejoignent la garnison ; les PNJ, chevaux, outils, provisions restantes et l’or sont déposés dans le stock, dans la limite de sa capacité. Le surplus reste dans la cargaison du groupe. Libérez de la place puis réutilisez le bouton de déchargement. Les items de récompense sont retirés dans les bagages d’un héros du propriétaire présent au poste.

Si le poste a été détruit ou appartient à un autre joueur, le retour est suspendu et la cargaison reste conservée : aucun transfert n’est fait au nouveau propriétaire. Le changement de destination d’un retour suspendu n’est pas encore disponible.

Les items proviennent du catalogue et respectent ses limites mondiales d’émission. Un artefact choisit un équipement rare puissant. Les autres récompenses utilisent les équipements communs ou peu communs. Les équipements proposés conviennent à la classe du héros préparateur. Si aucun assortiment admissible n’est disponible, la tentative est refusée sans coût ni dégât ; un groupe envoyé revient sans tentative. Le site reste actif.

## Exemple

Un donjon de difficulté 100 reçoit une expédition de score 80 et de puissance 50. La logistique donne un rapport de 0,8, la puissance un rapport de 0,5 : la chance est 70 % × 0,5 = 35 %. En cas de réussite, le groupe gagne 500 or, un item et 200 XP par entité participante survivante. Un soldat ayant 10 PV maximum perd 1 PV ; en cas d’échec il perd 3 PV, sans récompense.

1er novembre 2026 — résolution serveur des trois catégories, barème validé, puissance, dégâts, moral temporaire, retour et retrait du butin. Les commandes rejouées ou les reprises de sauvegarde ne répètent aucun gain ni conséquence.


## Clôture partagée — 1er novembre 2026

La [clôture partagée et les archives](exceptional-site-closure.md) sont centralisées côté serveur. La première victoire ou disparition est conservée ; les préparations concurrentes sont annulées immédiatement et les groupes en trajet rappelés. Les combats en cours restent en place jusqu’à leur issue. Les indices périmés restent archivables sans nouveau risque ni double paiement. La reprise réconcilie les anciens états sans rejouer de récompense ou de tirage.


1er novembre 2026 — annonce immédiate de victoire pour tous les joueurs, persistante et unique ; la disparition conserve son message différé de cinq minutes.
