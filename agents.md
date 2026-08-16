# AGENTS.md

## Projet

Je développe un jeu RPG/stratégie GPS jouable dans le monde réel.

## Technologies

- HTML5
- CSS
- JavaScript
- Pas de framework pour le moment
- Pas de backend pour le prototype

## Principes

- Séparer logique du jeu et interface utilisateur.
- Les règles du jeu ne doivent pas dépendre du DOM.
- Utiliser des modules JavaScript.
- Éviter les variables globales.
- Préférer des objets de données simples et sérialisables.
- Chaque fonctionnalité importante doit pouvoir être testée indépendamment.
- Ne pas réécrire une fonctionnalité existante sans nécessité.
- Avant une modification importante, expliquer les fichiers concernés.

## Architecture

Le moteur de jeu contient notamment :
- Player
- Hero
- Unit
- Location
- Quest
- Battle
- Game

Le GPS et les QR codes sont des interfaces avec le moteur et ne doivent pas contenir les règles principales du jeu.