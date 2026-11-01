# Préparation détaillée IRL

14 octobre 2026 : le scénario des réglages de salle provient du catalogue serveur.
Les scénarios installés depuis l’éditeur apparaissent après redémarrage. Leur
préparation propose uniquement leurs quêtes et lieux, sans ajouter ceux du monde initial.
Changer de scénario réinitialise les placements et exclusions ; le terrain et
les règles de validation restent identiques. Une nouvelle partie est nécessaire
pour utiliser un scénario nouvellement installé.

Le parcours « Planifier une partie » concerne le terrain réel. Le mode intérieur
reste un parcours distinct, non implémenté ici. Le serveur conserve et valide
la préparation ; le navigateur présente les fiches et transmet les intentions.

## Parcours disponible

1. **Playarea** : la carte occupe l’espace disponible, avec recherche d’adresse,
   recentrage volontaire, tracé, annulation et exclusions. La validation reste
   accessible sans défiler. Le terrain doit être validé avant la suite.
2. **Scénario et quêtes** : présentation issue de la fiche « La fuite du royaume ».
   Les deux quêtes du moteur actuel sont présentées depuis leurs fiches :
   Le ravitaillement et Les prospecteurs perdus. Ce sont deux offres indépendantes,
   retirables séparément ; les actions internes de chaque quête restent intactes.
   Le contrat de préparation interdit le retrait d’une quête marquée linéaire et
   vérifie les dépendances entre offres. L’ancien scénario à phases reste désactivé.
3. **Lieux** : chaque fiche de quête affiche ses lieux nécessaires. Un lieu partagé
   garde une seule configuration. Les autres lieux restent accessibles dans une
   rubrique repliable. Les options sont limitées par leur définition : visibilité
   connue, découverte, activation à l’ouverture de la partie, ou apparition selon
   la quête ; placement prévu par le scénario, aléatoire, carte ou QR code.
   Les placements différés imposés par le scénario ne sont pas librement modifiables.
4. **Impression** : télécharger un fichier HTML autonome, puis l’ouvrir pour
   imprimer ou enregistrer en PDF. Deux fiches peuvent tenir sur une feuille A4.
   Chaque fiche contient le QR, le nom du lieu, la date, le nom RPG GPS, une petite
   illustration médiévale vectorielle, des repères de découpe et une notice.
5. **Installation** : découper, protéger contre les intempéries, poser la fiche,
   puis rester à côté avec son smartphone. Scanner dans Installation ou choisir
   le lieu et « Enregistrer ici ». Une carte montre la mesure et sa précision ;
   confirmer pour transmettre la position au serveur. Une précision supérieure
   à 50 m, une position hors playarea ou dans une exclusion sont refusées.
6. **Vérification et ouverture** : date, personnage éventuel et positions manuelles
   doivent être renseignés. Tous les joueurs doivent être prêts. Le serveur crée
   le monde officiel, applique les placements et publie uniquement les quêtes retenues.

## Sélection des lieux et taille du terrain

Retirer une offre de quête retire aussi ses lieux exclusifs du catalogue de
préparation et du monde créé par le serveur, avant tout calcul de placement.
Ces lieux ne sont plus proposés dans « Autres lieux », n’exigent plus d’installation
et leurs réglages et QR sont retirés de la préparation. Les lieux partagés restent
si une autre quête retenue les utilise ; la capitale, point de départ, reste
permanente même sans offre de quête. Les lieux économiques de la capitale restent
aussi permanents : le ravitaillement utilise leurs quatre villages existants,
sans créer quatre villages supplémentaires. Retirer cette offre conserve ces
villages, leurs réglages et leurs QR ; cela retire les objectifs de la quête.
Une ancienne préparation est également
filtrée au lancement. La sélection ne modifie pas les récompenses des quêtes retenues.

Le principe de conception est de générer les lieux du monde puis d’y associer
les besoins des quêtes. Une association doit vérifier la fonction du lieu,
sa faction, ses ressources, son placement et les besoins de distance ou de
lieux distincts. Un même lieu peut servir plusieurs quêtes. Le type seul ne
suffit pas : une mine de fer ne remplace pas une mine d’or. Seuls les éléments
spécifiques tels que les indices temporaires doivent dépendre exclusivement
d’une quête. L’affectation automatique générale reste à développer ; actuellement
les associations sont définies par les catalogues et le fort de ravitaillement
reste spécifique à cette mission.

Le parcours commence déjà par la validation du terrain. Le filtrage des scénarios
compatibles et leurs variantes de taille sont **prévus**, pas encore disponibles.
Les repères proposés pour le périmètre extérieur sont : petit de 500 à moins de
1 300 m, normal de 1 300 à 2 000 m, grand au-delà de 2 000 jusqu’à 5 000 m.
Le grand format serait exceptionnel et destiné à un public pouvant parcourir
de longues distances. Le périmètre n’est pas la longueur totale du parcours.
La compatibilité devra également vérifier la forme, la surface utilisable,
les exclusions, les écarts entre lieux et les dépendances des quêtes côté serveur.
Les variantes devront définir les lieux et distances nécessaires à chaque quête.

L’erreur de placement d’un objectif signifie qu’aucun emplacement **testé**
ne respecte les contraintes : zone autorisée, exclusions et écarts avec les
autres lieux. Le générateur teste un échantillon de points ; cette erreur ne
prouve pas que chaque point de la zone est inutilisable.

## Rôles de l’organisateur

- **Joueur avancé** : héros jouable et console organisateur accessible pendant le jeu.
- **Absent** : aucun héros ; préparation puis partie autonome. Pas de déplacement
  de QR autorisé après l’ouverture.
- **Maître du jeu** : aucun héros ; conserve sa console sur le terrain.
- **PNJ suprême** : aucun héros ; nomme un personnage de scénario à incarner et
  conserve sa console. Le roleplay se déroule sur le terrain.

Un rôle sans héros exige au moins un autre joueur. La capacité inclut actuellement
la place de l’organisateur ; elle passe au minimum à deux pour ces rôles.
La console permet actuellement l’installation et le déplacement des QR codes.
Les outils supplémentaires d’arbitrage, de dialogues incarnés et de déclenchement
libre d’événements restent à définir et ne sont pas ajoutés à cette version.

## Utilisation des QR en jeu

Sur la carte, le bouton caméra « Scanner un QR » se trouve juste au-dessus du
centrage du joueur. Il apparaît uniquement dans les parties avec QR, pour les
joueurs avec héros, et demande l’accès à la caméra au clic. Ce déplacement du
bouton ne modifie pas les règles : la validation temporaire des interactions
pour chaque visite, annulée à la sortie du lieu, reste à développer.

Le QR identifie un lieu dans une partie. Son identifiant reste stable lors d’un
déplacement : la fiche ne doit pas être réimprimée. Le serveur vérifie l’identité
de la partie, l’apparition du lieu et une mesure GPS officielle récente (30 s).
Le rayon est celui de l’interaction du lieu, avec les mêmes modificateurs du héros.
Un scan valide découvre le lieu au niveau 3 et ouvre sa fiche ; il n’attribue
aucune récompense et ne termine pas une quête à lui seul.

Le scan caméra utilise jsQR fourni localement. Si la caméra est indisponible,
le code texte imprimé peut être saisi. La caméra est arrêtée à la fermeture.
En IRL les QR restent localisés ; le retrait de la contrainte GPS appartient au
futur parcours intérieur. Les déplacements en cours de partie sont réservés à
l’organisateur présent, contrôlés et consignés par le serveur.

Récupérer les fiches après la partie. Les précédentes règles de combat, de
production et de récompense restent inchangées.

## Vérification

`tests/party-preparation.test.js` couvre sélection, permissions, rôles sans héros,
installation, persistance et document imprimable. Le document est décodé avec
le même lecteur que le smartphone pour vérifier les QR produits. Les suites
multijoueur, projection et placement couvrent les raccordements existants.

## Validation du parcours et carte de placement (11 octobre 2026)

La préparation détaillée IRL se valide étape par étape : terrain, scénario et quêtes, lieux, puis vérification. Les étapes suivantes restent verrouillées tant que les étapes précédentes ne sont pas validées ; les erreurs officielles du serveur empêchent de continuer. Les lieux se configurent une fiche à la fois et les actions restent visibles en bas ; seul le contenu central défile si la hauteur disponible ne suffit pas. La date, l’impression et l’installation apparaissent uniquement lorsqu’au moins un lieu utilise un QR code. La date est alors obligatoire pour les fiches ; imprimer reste facultatif. Sans QR, aucune date ne bloque le lancement. La carte de placement montre les autres positions déjà enregistrées avec une icône et le cercle du rayon d’interaction. Toucher un repère affiche son nom pendant deux secondes, ou jusqu’à une autre action sur la carte. Les positions restent validées par le serveur ; les placements automatiques futurs ne sont pas affichés avant leur génération.

Les boutons des joueurs ont une largeur uniforme (260 px, limitée à la largeur disponible), une hauteur de 60 px et une suppression compacte. Les fiches, indications et informations du lobby utilisent des textes bruns sur fond clair. Les sélecteurs restent dans leurs contenants. Ces corrections visuelles ne changent aucune règle de jeu.

## Console organisateur et retour au jeu (11 octobre 2026)

Pendant une partie, l’accès Organisateur se trouve dans le menu de la partie, avec les mêmes conditions de rôle qu’auparavant. Il ferme le menu puis ouvre la console. Le bouton Retour au jeu de la console masque le lobby, les pages de configuration et l’écran de préparation, ferme les fenêtres de placement ou de scan encore ouvertes et retire les styles de l’éditeur pour laisser le jeu visible. Le lecteur QR libère aussi la caméra lorsqu’une fenêtre est fermée de cette manière. Ce changement concerne uniquement l’interface et ne modifie aucune permission ni règle serveur.

## Placements par les joueurs et cases repérées (11 octobre 2026)

Les lieux compatibles proposent deux placements différés : par un joueur après une marche, ou dans une case validée. Ils restent absents de la carte jusqu’à leur placement et ne bloquent pas le lancement. Le point de départ et les lieux de l’économie initiale restent préparés avant de jouer. La marche est lancée dans le menu Placement et repérage ; le joueur choisit ensuite Placer ici lorsque la distance configurée est atteinte (300 m par défaut, de 10 à 10 000 m). Le serveur cumule les segments fiables après le départ de la marche et contrôle le terrain et l’écart entre lieux. Une position de moins de 30 secondes avec une précision connue de 50 m ou moins est nécessaire ; les sauts de plus de 250 m et les déplacements GPS dépassant 8 m/s ne sont pas comptés.

Les missions secondaires de repérage du menu Placement et repérage désignent une autre case compatible du terrain. Le joueur la rejoint puis valide sa position pour alimenter le stock de son équipe. Chaque case ne peut être validée qu’une fois et sert à placer un seul lieu, au centre de la case. Le joueur choisit une case du stock ; le serveur recontrôle sa disponibilité et l’espacement avant de la consommer. Les marches, missions et cases sont conservées dans les sauvegardes ; chaque joueur reçoit uniquement sa marche et le stock de son équipe. Ces missions sont disponibles indépendamment de l’ancien système de quêtes. En simulation, les mêmes intentions et contrôles de placement sont exécutés par le serveur ; un pas de coordonnée vaut 10 m de marche et la précision GPS ne s’applique pas.

Les commandes `playerPlacementCommand` ne reçoivent que l’action, le lieu et la case : le serveur injecte l’identité authentifiée et la dernière mesure officielle. Le stock privé `worldState.flags.playerPlacement` est retiré des projections de monde. Les mutations du moteur sont indépendantes du DOM. Aucun gain ou récompense supplémentaire n’est attribué par ces missions.

14 octobre 2026 — correction de l’isolation des scénarios : le catalogue de
conception commun ne détermine plus les lieux de la partie choisie. Les placements
officiels du serveur sont utilisés directement en simulation. Les sauvegardes
existantes ne sont pas migrées ; tester dans une nouvelle partie.

## Parcours guidé et carte agrandie (14 octobre 2026)

La création de partie suit un parcours guidé : Terrain → Réglages → Scénario et préparation → Joueurs. En partie rapide, le scénario reste facultatif et les réglages conduisent directement aux joueurs. Les étapes portent un nom visible et l’écran indique la progression avec une courte consigne. Enregistrer et continuer valide les réglages avant de poursuivre ; Retour remonte à l’étape précédente. Les options de position, de difficulté et de rythme sont regroupées dans Options avancées. Les actions principales restent accessibles sans imposer d’ouvrir ces options.

Le terrain se dessine dans une fenêtre cartographique qui occupe presque tout l’écran, et tout l’écran sur téléphone. La recherche, Ma position, Annuler le dernier point et Valider la zone restent accessibles ; les exclusions et l’effacement se trouvent dans Options du tracé. Fermer conserve le brouillon et permet de rouvrir la carte ; une validation réussie ferme la fenêtre. Les boutons gardent une hauteur tactile minimale de 44 px. Cette réorganisation concerne la présentation : elle ne modifie ni les règles du moteur ni les contrôles serveur, et n’ajoute pas encore le mode intérieur sans GPS.

## Déplacer les points du terrain (14 octobre 2026)

Pendant le tracé, l’organisateur peut faire glisser les points du contour et des exclusions, à la souris ou au doigt. Au relâchement, le brouillon, la surface et le quadrillage sont actualisés. Les poignées ont une zone de saisie de 44 px ; déplacer un point ne crée pas un nouveau sommet. Le changement reste local au brouillon jusqu’à Valider la zone, puis le serveur contrôle le terrain comme auparavant. Les joueurs en consultation ne peuvent pas déplacer ces points.

## Fiches de personnage communes (16 octobre 2026)

Le choix du personnage dans les parties rapides, planifiées et rejointes utilise les mêmes fiches que la partie test : portrait, nom, spécialité et caractéristiques de la classe sélectionnée. Le catalogue et le composant de présentation sont partagés entre les parcours. Chaque joueur sélectionne une fiche ; le serveur confirme le choix et les conditions de disponibilité. Aucune classe n’est choisie automatiquement dans le lobby si le joueur n’en a pas encore choisi. Les fiches sont verrouillées pendant la partie et lors de la reprise d’une sauvegarde ; les rôles organisateurs sans héros restent sans sélection de personnage. Ce changement ne modifie ni les statistiques, ni les règles de création des héros, ni les validations de démarrage.

## Armoiries des fiches QR (17 octobre 2026)

Les fiches QR utilisent des écus SVG en noir et blanc adaptés au lieu : capitale, ville, village, camp, mine de fer, mine d’or, carrière, forêt de bûcherons et fort. La mine d’or porte une pioche et une pelle croisées, lame vers le haut, avec des pépites et un éclat. Les dessins sont inclus dans le document autonome, à 18 mm de haut et séparés du QR de 52 mm et de sa marge blanche. Les lieux particuliers sans illustration dédiée portent un écu neutre. Ce changement visuel ne modifie ni le contenu des codes, ni les contrôles de proximité, ni les règles serveur.

## Validation initiale et zones de sécurité du scénario (19 octobre 2026)

La fenêtre de préparation du scénario respecte les zones de sécurité du téléphone en haut et en bas. Sa hauteur est limitée à l’espace restant, tandis que le contenu central peut défiler et que les actions de validation restent accessibles. Valider et continuer initialise correctement une préparation encore absente : il n’est plus nécessaire de retirer puis remettre une quête. Le passage à l’étape suivante attend la confirmation de l’enregistrement serveur ; en cas de refus ou d’enregistrement non confirmé, l’étape reste affichée avec un message. Cette correction d’interface ne modifie ni la sélection des quêtes, ni leurs règles, ni les validations du moteur.

## Bibliothèque de terrains (22 octobre 2026)

Dans le sélecteur de zone GPS, Mes cartes ouvre un panneau superposé fermé par défaut. L’organisateur peut nommer et sauvegarder le contour courant avec ses exclusions, choisir une carte existante pour la prévisualiser, ou supprimer une entrée. La zone choisie doit encore être validée : les contrôles officiels et les règles de placement ne changent pas. La bibliothèque est privée au compte ou à l’identité joueur. La sauvegarde prépare aussi le fond 2D ; une panne OSM est indiquée séparément sans perdre le tracé. La carte reste la vue principale, et la liste défile dans son propre panneau. Les cartes utilisées par une partie ou une sauvegarde de partie restent disponibles ; les paquets sans usage et sans sauvegarde de carte sont nettoyés automatiquement. Aucun paquet géographique persistant implicite n’est gardé sur le navigateur. Voir l’article Carte de préparation et fond de jeu 2D pour le cycle de conservation.
