# Menu et démarrage

Après la page de titre, le menu propose quatre choix avant la sélection du joueur :

- **Jeu rapide** : création d’une salle avec les réglages par défaut du serveur (1 joueur, GPS réel), puis affichage de la page Joueurs pour choisir le héros et se déclarer prêt. La zone GPS doit être validée avant de se déclarer prêt. Les réglages restent accessibles.
- **Planifier une partie** : création d’une salle, puis ouverture directe de la grande carte de playarea. Après validation, présentation du scénario et des quêtes, préparation des lieux, impression et installation des QR codes, puis vérification avant ouverture. Voir [Préparation détaillée IRL](party-preparation.md).
- **Rejoindre une partie** : ouverture du formulaire de code après le choix du joueur. Le serveur valide l’inscription.
- **Partie test** : préparation existante sur carte fictive.

Le retour depuis le choix du joueur ou le formulaire de connexion ramène au menu des aventures. Le retour depuis ce menu ramène à la page de titre. La reprise enregistrée reste disponible depuis l’accueil.

Identité, création, inscription, configuration et démarrage restent validés par le serveur. La préparation détaillée ajoute la sélection des quêtes indépendantes, les rôles organisateur et les placements QR officiels. Jeu rapide ne choisit pas automatiquement le héros et ne lance pas automatiquement la partie.

Les nouvelles parties utilisent par défaut **1 joueur** et **GPS réel**. L’organisateur peut augmenter la capacité avant d’inviter d’autres joueurs ou choisir la simulation. Le duel exige toujours deux joueurs. Partie test demande explicitement la simulation ; une reprise garde les paramètres enregistrés dans la sauvegarde.

## Menu pendant la partie

Le code de partie reste affiché en haut. Un sous-menu **Développement**, fermé par défaut, regroupe Cheat / Triche, Debug (terrain, quêtes et pause), Heatmap, Brouillard de guerre et les filtres de traces. Il organise les outils existants ; il ne constitue pas une nouvelle permission administrateur.

L’organisateur dispose de deux actions distinctes, en solo serveur comme en multijoueur :

- **Sauvegarder et quitter** demande un nom et conserve la partie dans les sauvegardes serveur, puis ferme la session pour tous les joueurs.
- **Quitter sans sauvegarde — Détruire la partie** demande une confirmation explicite. Le serveur vérifie que le demandeur est l’organisateur, supprime la partie active et invalide toutes ses sessions. Tous les joueurs reviennent au menu ; le code ne permet plus de rejoindre cette partie. Aucune nouvelle sauvegarde n’est créée et les anciennes sauvegardes sont conservées.

Un autre joueur ne peut pas fermer la partie pour tout le groupe. En cas de refus serveur ou d’échec réseau, l’interface affiche l’erreur sans quitter localement la partie.

## Pouvoirs sur la carte

Les boutons des pouvoirs sont placés en haut de l’écran en portrait et en paysage. Le bas reste disponible pour les fiches de lieux. En portrait, le suivi de quête est décalé sous les pouvoirs. Seule la disposition change : effets, recharges et validation serveur restent identiques.
