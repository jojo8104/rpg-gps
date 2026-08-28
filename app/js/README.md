# Organisation du JavaScript

- `core/` contient les règles et états sérialisables, sans dépendance au DOM ;
- `ui/` transforme un état en interface et transmet les intentions de l'utilisateur ;
- `map/` contient uniquement les renderers et couches Leaflet ;
- les adaptateurs navigateur (`gps.js`, `orientation.js`, stockage, alertes) restent à
  la racine ;
- `main.js` orchestre ces modules, mais ne doit pas devenir le propriétaire de
  nouvelles règles métier.

## Méthode de mise en forme et de commentaire

1. Une instruction ou propriété par ligne après `npm run format`.
2. Une ligne vide entre deux responsabilités distinctes.
3. Un commentaire de module explique sa responsabilité et ses frontières.
4. Dans les gros orchestrateurs, des commentaires de section servent de sommaire.
5. Les commentaires expliquent une intention, un invariant ou une contrainte ; ils
   ne paraphrasent pas une instruction évidente.
6. Toute règle ajoutée dans `core/` doit rester testable sans navigateur.

Utiliser `npm run format:check` pour détecter les nouveaux blocs compactés.
