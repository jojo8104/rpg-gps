# Préparation détaillée IRL

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

## Rôles

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
