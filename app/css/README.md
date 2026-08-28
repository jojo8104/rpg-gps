# Organisation des styles

`index.html` charge trois points d'entrée dans cet ordre :

1. `map-tokens.css` définit les variables visuelles de la carte ;
2. `style.css` importe l'interface générale dans l'ordre de cascade historique ;
3. `map.css` contient le rendu Leaflet et importe les illustrations spécialisées.

## Modules importés par `style.css`

- `base.css` : fondations, composants partagés et premières variantes des vues ;
- `management.css` : héros, équipement, armée et fiches de localisation ;
- `battle-mobile.css` : bataille plein écran, HUD de quête et setup terrain ;
- `game-components.css` : dialogues, feuilles, inventaire et composants de jeu ;
- `responsive.css` : adaptations communes et commandes compactes ;
- `map-navigation.css` : navigation, menus et pouvoirs superposés à la carte ;
- `landscape.css` : compositions finales en paysage, dont la perspective de bataille.

L'ordre de ces imports est intentionnel. Il préserve la cascade existante pendant
que les composants sont progressivement rapprochés de leur module propriétaire.

## Règles de contribution

- Modifier la règle existante dans son module au lieu d'ajouter un override en fin
  de fichier.
- Placer la variante responsive près du composant concerné lorsque cela ne change
  pas la cascade ; sinon documenter la contrainte dans `responsive.css` ou
  `landscape.css`.
- Réutiliser les variables de `map-tokens.css` pour les valeurs communes à la carte.
- Lancer `npm run format` puis `npm run format:check` avant de valider un changement.
