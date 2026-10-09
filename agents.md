# AGENTS.md

## Projet

Je développe un jeu RPG/stratégie GPS jouable dans le monde réel.

## Technologies

- HTML5
- CSS
- JavaScript
- Pas de framework pour le moment
- Le prototype utilise un backend qui sert le monde aux joueurs.

## Principes

- Séparer logique du jeu et interface utilisateur.
- Les règles du jeu ne doivent pas dépendre du DOM.
- Utiliser des modules JavaScript.
- Éviter les variables globales.
- Préférer des objets de données simples et sérialisables.
- Chaque fonctionnalité importante doit pouvoir être testée indépendamment.
- Ne pas réécrire une fonctionnalité existante sans nécessité.
- Avant une modification importante, expliquer les fichiers concernés.
- Garder `app/js/main.js` comme point d'assemblage : initialisation, injection des dépendances et raccordement des événements. Toute nouvelle règle, fiche, transition ou fonctionnalité doit aller dans son module dédié.
- Le serveur est l'unique autorité du jeu, en solo comme en multijoueur : il calcule et valide les actions, la production, les déplacements, la progression, les récompenses et les combats.
- Le navigateur transmet les intentions et les mesures GPS, puis affiche l'état officiel reçu. Aucun calcul métier local de secours, cycle de production local ou gain appliqué une seconde fois côté client.
- Les règles restent dans les modules du moteur, exécutés par le serveur ; les contrôleurs et les vues du navigateur assurent uniquement l'interaction et la présentation.
- Le mode de test sur carte fictive doit exécuter les mêmes interactions de lieux, quêtes, combats et gestion du héros que le mode IRL, avec les mêmes commandes serveur. Seuls les distances, placements, mesures et contrôles de position peuvent différer ; les outils de test sont explicites et restent validés par le serveur.

## Architecture

## Documentation du jeu

- À chaque changement du jeu dans une discussion, mettre à jour le wiki en parallèle, sauf indication contraire explicite de l’utilisateur. Actualiser `docs/wiki-content.json` et les documents de règles concernés dans `docs/` dans le même changement ; pour un changement technique, documenter son effet ou son absence d’effet sur les règles dans la rubrique concernée.
- Conserver l’historique de chaque article : une note datée en fin d’article doit donner accès aux versions précédentes archivées. Générer avec `npm run wiki:build -- --note "Description du changement"` et inclure `wiki/history.json` ainsi que les nouveaux fichiers de `wiki/archives/`. Ne jamais supprimer ni réécrire les versions archivées.
- Générer le wiki avec `npm run wiki:build` après modification du contenu, de `data/hero-classes.json` ou de `data/units.json` et inclure `wiki/index.html` généré.
- Vérifier les explications contre le moteur et ses tests ; distinguer les fonctionnalités disponibles de celles prévues. Voir `docs/wiki-maintenance.md`.

## Modules du moteur

Le moteur de jeu contient notamment :
- Player
- Hero
- Unit
- Location
- Quest
- Battle
- Game

Le GPS et les QR codes sont des interfaces avec le moteur et ne doivent pas contenir les règles principales du jeu.
