# Dashboard : suivi historique du monde

Le Dashboard administrateur reste disponible sur `/dashboard/`, avec sa clé d’accès et un onglet par partie. Il affiche la carte officielle, les positions, la heatmap et les informations actuelles du monde. Les nouveaux graphiques sont sous la carte.

## Relevés

Le serveur enregistre un relevé compact toutes les 4 secondes lorsqu’une partie commencée possède au moins un joueur connecté. Sans joueur, simulation et relevés s’arrêtent ; consulter le Dashboard ne connecte pas un joueur. La limite de deux parties actives est conservée.

Chaque relevé contient les positions des héros, leurs effectifs mobiles et en garnison par type, autorité et score, les totaux par équipe, la population, le niveau, la production et le stock des lieux, ainsi que les résultats des combats terminés depuis le relevé précédent. Il s’agit de données de suivi, pas d’une sauvegarde permettant de restaurer tout le monde à un instant passé.

Les 2 000 derniers relevés sont consultables : environ 2 h 13 min de jeu continu. Les périodes sans joueurs créent des trous dans la chronologie. Le stockage est du NDJSON dans `dashboard-history/` sous le répertoire de données serveur (habituellement `/var/lib/rpg-gps`). La rotation utilise des segments de 200 relevés et garde au plus 11 segments, soit jusqu’à 2 200 lignes physiques ; seuls les 2 000 derniers relevés sont exposés. La taille réelle dépend du nombre de héros, unités et lieux : 20 Mo est une estimation, pas un plafond garanti.

Le serveur conserve seulement les curseurs et une écriture en cours par partie ; un disque trop lent ne crée pas de file illimitée. Les lectures suivantes chargent uniquement les segments nécessaires depuis le dernier relevé reçu. Le navigateur conserve au plus 2 000 relevés de la partie sélectionnée. L’historique survit au redémarrage du serveur ; supprimer une partie depuis le Dashboard supprime aussi son historique. Aucun historique antérieur à cette version n’est reconstitué.

La heatmap et les traces sur la carte restent basées sur les 2 000 dernières mesures de position, tous joueurs confondus, échantillonnées à cette même cadence. Ce tampon de carte est distinct des 2 000 relevés du monde conservés sur disque.

## Graphiques disponibles

- Puissance : toutes les courbes de héros et les sommes par équipe sur le même graphe. Les courbes des équipes sont épaisses, celles des héros pointillées. Cliquer sur la légende masque une série ; ce choix persiste lors des rafraîchissements.
- Armée : sélectionner un héros ; les types d’unités sont empilés avec une barre pour l’armée mobile et une seconde barre translucide pour les garnisons. La ligne jaune indique l’autorité maximale officielle sur l’axe droit. Les marqueurs de combat sont verts pour une victoire, rouges pour une défaite, gris pour une égalité. Pour garder les barres lisibles, les longues séries affichent environ 85 instants ; les valeurs exactes de chaque relevé restent consultables au survol.
- Lieux : sélectionner un lieu pour voir sa population, son niveau et sa production par cycle, séparés pour conserver des échelles lisibles.

## Score de puissance indicatif

Le score du héros est son attaque finale + sa défense finale + ses PV actuels. Les statistiques finales incluent les bonus et l’équipement calculés par le moteur. Les PV des soldats ne sont pas ajoutés dans cette composante.

Pour chaque type, le coefficient initial de qualité est : attaque + défense + PV par soldat / 10 + portée + dégâts moyens par seconde + nombre de capacités, avec un minimum de 1. Les dégâts moyens par seconde utilisent les dégâts moyens et l’intervalle d’attaque de base. Le coefficient est arrondi à deux décimales.

La puissance des troupes vaut effectif × qualité ; les troupes mobiles reçoivent en plus le multiplicateur `1 + 0,05 × vitesse`. Les garnisons n’ont pas ce bonus. Ces pondérations initiales donnent un classement ajustable des types ; elles ne prétendent pas prédire l’issue d’une bataille.

Les garnisons appartiennent actuellement à un joueur, sans lien enregistré avec le héros qui les a déposées. Pour éviter le double comptage, elles sont attribuées à son premier héros par identifiant stable. Le total d’équipe additionne les scores des héros, garnisons incluses une seule fois. Cette convention doit être prise en compte lorsqu’un joueur possède plusieurs héros.

Ces mesures n’ont aucun effet sur les règles : le serveur reste l’unique autorité des actions, de la production, des déplacements et des combats. Le Dashboard ne charge aucun moteur de jeu sur le navigateur et utilise des graphiques Canvas sans bibliothèque de graphiques supplémentaire.
