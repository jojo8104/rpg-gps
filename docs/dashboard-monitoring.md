# Dashboard : suivi historique du monde

Le Dashboard administrateur reste disponible sur `/dashboard/`, avec sa clé d’accès et un onglet par partie. Il affiche la carte officielle, les positions, la heatmap et les informations actuelles du monde. Les nouveaux graphiques sont sous la carte.

## Diagnostic des nouvelles extractions (24 octobre 2026)

Le jeu et le Dashboard affichent désormais une distinction explicite : les données déjà en banque restent disponibles, mais les surfaces manquantes ne sont pas téléchargées après échec fournisseur. Les rejets HTTP conservent leur statut amont dans le message et le champ providerStatus ; les erreurs et journaux distinguent expiration, accès réseau et rejet HTTP. Le vrai worker transmet ces métadonnées. Les journaux ne contiennent ni polygone, URL, corps de réponse fournisseur ni identifiant joueur. La pause croissante et la limite d’un seul appel restent inchangées : aucun test supplémentaire, découpage ou nouvel essai automatique n’est déclenché par ce diagnostic.

## Gestionnaire de cartes et banque (24 octobre 2026)

Dans /dashboard/, la clé administrateur ouvre désormais Cartes sauvegardées et banque géographique. Le panneau se charge à son ouverture ou avec Actualiser la banque : consulter et prévisualiser ne déclenchent aucune extraction Overpass. Il indique le volume total, le budget, les octets protégés, les fichiers, la couverture de chaque carte nommée et ses sources. L’aperçu montre les couvertures sans charger de nouvelles tuiles géographiques. Les fichiers affichent les cartes, parties ou sauvegardes qui les utilisent. Compléter les données exige une action explicite et utilise le service d’extraction habituel, avec sa réutilisation de couverture et ses limites.

Supprimer une carte nommée retire uniquement sa référence de bibliothèque ; les terrains des parties et leurs sauvegardes restent inchangés, et les fichiers peuvent rester dans la banque selon son budget. Supprimer un fichier ou vider les données inutilisées exige une confirmation ; le serveur refuse les fichiers protégés et suspend ces suppressions pendant une préparation ou un nettoyage. Les fichiers étrangers au format géré ne sont jamais proposés ni supprimés. Toutes ces API utilisent la même clé administrateur ; aucun joueur n’est connecté par leur consultation. Le changement ne modifie ni les règles, ni les gains, ni les positions officielles du jeu.

Les données géographiques peuvent être plus anciennes que le monde actuel : la banque ne lance aucun rafraîchissement implicite. Voir [Carte de préparation et fond de jeu 2D](play-area-map.md) pour le téléchargement différentiel polygonal et la conservation.

API administratives : GET /api/dashboard/maps ; DELETE /api/dashboard/maps?id=… ; DELETE /api/dashboard/maps/unused ; DELETE /api/dashboard/saved-map?id=… ; POST /api/dashboard/saved-map/prepare?id=…. Les mutations demandent X-Dashboard-Confirm correspondant à l’identifiant, ou unused pour la purge. Les noms et contours restent réservés à l’accès administrateur.

## Relevés

Le serveur enregistre un relevé compact toutes les 4 secondes pour chaque partie commencée, même lorsque le dernier joueur se déconnecte. Sans joueur, le monde reste en pause mais les relevés de supervision continuent, marqués comme tels ; consulter le Dashboard ne connecte pas un joueur. Les héros déconnectés n’ajoutent pas de densité à la heatmap. La limite de deux parties actives reste inchangée.

Chaque relevé contient le statut de pause, la connexion et la vision des héros, leurs positions, leurs effectifs mobiles et en garnison par type, autorité et score, les totaux par équipe, la population, le niveau, la production et le stock des lieux, ainsi que les résultats des combats terminés depuis le relevé précédent. Il s’agit de données de suivi, pas d’une sauvegarde permettant de restaurer tout le monde à un instant passé.

Les relevés sont conservés sur disque pendant toute la durée de la partie, sans rotation automatique, dans dashboard-history/ sous le répertoire de données serveur. Les fichiers NDJSON sont segmentés par 200 relevés. La suppression explicite d’une partie supprime son historique ; les anciennes données déjà purgées ne peuvent pas être reconstituées. Les relevés comprennent les positions des héros et des GA : les groupes disparus restent présents dans les parcours historiques.

L’API historique conserve une lecture récente limitée par défaut et propose scope=all pour la chronologie complète, avec un curseur since pour les mises à jour. Le Dashboard conserve cette chronologie en mémoire pendant la consultation : l’utilisation mémoire augmente avec la durée de la partie. Le curseur permet de consulter les positions jusqu’à un instant passé ; à droite, il suit le direct. Les parcours des joueurs sont continus et ceux des GA pointillés. La heatmap cumule les positions des joueurs depuis le premier relevé jusqu’à l’instant sélectionné. Les relevés sont pris toutes les 4 secondes : ils ne constituent pas un enregistrement GPS continu entre ces instants.

Le tampon récent de positions reste disponible dans l’état courant pour compatibilité. Il sert seulement en l’absence de relevés historiques ; la vue historique utilise les données persistantes. Les graphiques de puissance et d’économie restent consultables sous la carte. La présentation regroupe les commandes, met en évidence la partie et adapte les panneaux aux petits écrans. Aucun effet sur les règles du jeu.

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

## Fiches des éléments

Un clic sur un joueur de la liste ou de la carte ouvre une fiche de son état officiel actuel : classe, grade, niveau, XP, PV, commandement, distance, caractéristiques, armée, équipement, bagages et ressources. Les objets de l’inventaire ouvrent leur propre fiche. Les quêtes à actions affichent leur titre, statut et liste d’objectifs, les missions actives en premier. Les renseignements et les champs supplémentaires restent consultables dans des rubriques dépliables.

Les lieux détaillent propriété, contrôle, population, niveau, stocks, production, garnison, bâtiments et services. Les GA détaillent faction, comportement, statut, départ, destination, armée, chargement, mission et historique disponible. Les fiches d’objets présentent description, image disponible, usage, emplacement, rareté et bonus. Le catalogue des objets, les combats, butins, sites et zones de ressources sont également consultables. La recherche filtre les listes par nom, identifiant ou type. Les champs complémentaires utilisent des libellés et des listes structurées, sans blocs JSON. La sélection et les rubriques dépliées restent ouvertes pendant les rafraîchissements.

Les fiches représentent toujours l’état actuel du serveur : déplacer le curseur historique de la carte ne prétend pas reconstituer un ancien inventaire ou une ancienne armée complète.

## Perspective d’un joueur

Sélectionner un joueur ou son héros choisit sa perspective cartographique ; le sélecteur permet de revenir à la vue administrateur. Le trajet affiché est alors celui de ce joueur. Les commandes indépendantes affichent le champ de vision, le brouillard supervisé et les frontières actuelles de chaque camp. Les marqueurs administrateur restent visibles au-dessus du brouillard afin de permettre la supervision du monde ; ce n’est pas une projection filtrée des seules entités connues du joueur.

Le serveur fournit le rayon de vision officiel de la classe et du niveau, les zones de surveillance et la divination actives. L’interface réutilise les géométries visuelles du jeu. Les frontières proviennent directement de la vue territoriale calculée par le moteur : aucune possession n’est déduite localement depuis la proximité d’un lieu. Leur survol indique le camp.

L’exploration supervisée est enregistrée séparément pour chaque joueur à partir de ses positions officielles, avec la date de première révélation des cellules et le même rayon d’exploration que dans le jeu. Elle persiste dans l’état serveur de la partie lors d’un redémarrage. Le précédent brouillard local, conservé dans le navigateur du joueur, ne peut pas être récupéré rétroactivement : la carte indique la date de début des observations disponibles. Les anciennes parties ou les terrains sans grille compatible restent consultables sans inventer de cellules explorées.

Le curseur historique utilise les positions et rayons de vision enregistrés ainsi que les dates de révélation disponibles. Les zones temporaires de surveillance et de divination ne sont affichées qu’au présent ; les frontières et les fiches restent explicitement celles de l’état actuel. Les relevés de supervision ne modifient ni les règles, ni les actions, ni les gains du joueur.

## Échelle du temps et stocks (21 octobre 2026)

Le réglage commun de période propose tout l’historique, 5, 15 ou 30 minutes, ou 1 heure. Le curseur de fin permet de déplacer cette fenêtre dans les relevés conservés. Une position passée reste fixe lors des rafraîchissements ; Revenir au direct suit à nouveau le dernier relevé. La fenêtre concerne tous les graphiques, sans changer la cadence de 4 secondes ni la rétention de 2 000 relevés. Le réglage ne reconstitue aucune donnée manquante.

Le graphique des lieux superpose des courbes de production par cycle (axe gauche) et des colonnes groupées de stocks par ressource (axe droit). Chaque série peut être masquée dans la légende ; le survol donne les valeurs exactes. Les ressources possédées seulement en stock sont aussi proposées. Les longues périodes espacent les colonnes pour conserver leur lisibilité sans sommer les stocks entre instants.

À partir de cette version, le stock du relevé additionne la réserve du lieu (`resources.stock`) et la production accumulée (`resources.productionStock`). Les relevés antérieurs contiennent seulement le stock de production alors enregistré : ils ne sont pas recalculés. Une valeur absente reste indisponible plutôt qu’un faux zéro. Aucun transfert, gain ou calcul de production du jeu n’est modifié.

## Sessions et déploiement

Le service worker contourne son cache et le cache HTTP pour les API et les fichiers du Dashboard (HTML, JavaScript, CSS et modules). Chaque consultation interroge le serveur ; une coupure réseau affiche une erreur, sans réutiliser une ancienne liste de parties. Une mise à jour du cache applicatif retire les anciennes copies après activation du nouveau service worker. Après le premier déploiement de ce correctif, recharger la page pour activer la mise à jour, puis la recharger à nouveau si elle était déjà ouverte.

Sans variable serveur `RPG_GPS_DASHBOARD_TOKEN`, la clé administrateur change à chaque redémarrage, y compris après `npm run deploy`. Ressaisir la clé du dernier démarrage, disponible dans le journal du serveur. La connexion du Dashboard est conservée dans l’onglet avec sessionStorage ; une nouvelle session de navigateur peut demander de nouveau la clé. Une clé refusée affiche explicitement cette procédure.

Le Dashboard et le jeu doivent consulter le même serveur : le serveur Windows local et le serveur Linux distant possèdent des parties distinctes. Le déploiement archive les fichiers locaux, y compris le dossier dashboard, puis active la nouvelle version sur Linux. Ces corrections concernent la fraîcheur de la supervision et ne modifient aucune règle du jeu ni les sauvegardes officielles.

## Onglets et sauvegardes de parties

Le Dashboard comporte quatre onglets : Parties pour la carte et les fiches, Graphiques pour l’historique, Cartes pour la banque géographique et Sauvegardes pour les parties sauvegardées. Les onglets restent accessibles en haut pendant le défilement. La page autorise un défilement vertical lorsque son contenu dépasse la fenêtre ; les fiches longues et tableaux conservent leurs zones de défilement adaptées. Les onglets sont accessibles au clavier (flèches, Début et Fin).

Sauvegardes affiche toutes les sauvegardes du serveur, avec leur nom, date, organisateur et joueurs. Actualiser recharge la liste officielle. Supprimer la sauvegarde demande confirmation, puis le serveur vérifie la clé administrateur et l’identifiant confirmé avant de supprimer et de persister le changement. Une erreur réseau ou de persistance reste affichée. Les comptes, cartes nommées et parties déjà chargées sont conservés ; la copie chargée reste jouable. Les références géographiques encore utilisées restent protégées. Les sauvegardes de cartes et les sauvegardes de parties restent deux rubriques distinctes. Aucun calcul du moteur ni gain n’est modifié.

## Présentation compacte

Les marges, fiches et commandes utilisent des dimensions réduites. Dans Cartes, les cartes nommées sont présentées en vignettes carrées sur la moitié gauche de l’écran, avec leur contour, nom, couverture, volume et actions. L’aperçu OpenStreetMap occupe la moitié droite et se recentre avec Voir. Sur petit écran, les colonnes se superposent. Les fichiers géographiques restent dans leur tableau distinct.

Les parties sauvegardées sont affichées en tableau : partie, organisateur, date, joueurs, taille JSON et suppression. La taille est calculée par le serveur en octets UTF-8 de la sauvegarde sérialisée, présentée en Kio ou Mio. Les entrées restent regroupées dans server-state.json ; il ne s’agit pas de fichiers séparés ni d’un volume mémoire de simulation. Le tableau garde un défilement horizontal sur téléphone. Ces changements de présentation et de mesure ne modifient aucune règle, aucune sauvegarde ni permission de suppression.

## PNJ dans les fiches des lieux

La fiche d’un lieu affiche une rubrique PNJ du lieu avec le nom et la fonction de chaque personnage, puis ses informations dépliables. Elle réunit le responsable explicite ou le responsable par défaut du moteur, les personnages des bâtiments présents (forgeron et tavernier), les offres de PNJ actuellement affectées à sa taverne et les PNJ du monde dont locationId désigne explicitement le lieu. Un personnage de scénario sans rattachement n’est pas attribué à un lieu par supposition.

Les offres de taverne détaillent notamment coût, effet, quête requise et cycles de présence restants. La supervision lit l’affectation actuelle sans initialiser de rotation, recruter un PNJ ni modifier les stocks. Sans affectation de taverne enregistrée, elle n’invente aucune offre. Les informations suivent l’état officiel actuel ; la chronologie de la carte ne reconstitue pas une ancienne liste de PNJ. Aucun changement des règles du jeu.
