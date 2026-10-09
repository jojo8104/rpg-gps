# Maintenir le wiki

Le wiki public se trouve dans `wiki/index.html`. C’est une page HTML statique,
consultable sans backend et sans JavaScript.

## Mise à jour

À chaque changement du jeu dans une discussion, mettre à jour le wiki en parallèle,
sauf indication contraire explicite de l’utilisateur. Pour les changements techniques,
expliquer leur effet ou leur absence d’effet sur les règles dans la rubrique concernée.

1. Modifier les textes dans `docs/wiki-content.json` pour refléter le changement.
2. Mettre à jour les documents de règles associés dans `docs/`.
3. Exécuter `npm run wiki:build -- --note "Description du changement"` : les classes et les unités sont reprises automatiquement des catalogues JSON du jeu.
4. Vérifier `wiki/index.html` dans un navigateur et inclure la page, `wiki/history.json` et les nouvelles archives de `wiki/archives/` dans le commit.

## Historique des articles

Chaque rubrique du guide et chaque catalogue constitue un article. Une note en fin
d’article affiche sa version, sa date et le changement effectué, puis les liens vers
ses versions précédentes. Les archives sont des pages HTML autonomes ; les documents
de règles liés y sont aussi conservés sous forme de texte à déplier.

Le générateur compare le contenu de chaque article et de ses documents liés. Seuls
les articles modifiés obtiennent une nouvelle version. Une génération identique ne
crée pas d’archive supplémentaire. Une modification d’un article existant sans note
est refusée, y compris dans le workflow de publication : générer et committer les
archives avec une note avant de pousser le changement.

Ne jamais supprimer ni modifier une archive ou réinitialiser `wiki/history.json`.
Pour corriger une erreur, modifier l’article actuel et créer une nouvelle version.
L’historique commence avec la version initiale du wiki ; les changements du jeu
antérieurs à sa création ne sont pas reconstitués.

Ne pas modifier directement le HTML généré : la génération suivante l’écraserait.
Le style se modifie dans `wiki/wiki.css`. Les valeurs des catalogues sont des
valeurs de base, pas une simulation des bonus ou du résultat des actions.

## GitHub Pages

Le workflow existant `.github/workflows/pages.yml` génère le wiki avant de publier
le dépôt. Une fois le déploiement réussi, ajouter `wiki/` à l’URL GitHub Pages
du projet : `https://<compte>.github.io/<depot>/wiki/`.

En local, ouvrir `wiki/index.html` ou, après `npm start`, aller à
`http://localhost:3000/wiki/`. Les liens vers les documents Markdown ouvrent
les fichiers sources ; le guide principal et les catalogues sont affichés en HTML.

## Contenu fiable

Vérifier toute nouvelle explication contre les modules du moteur et leurs tests.
Une fonctionnalité prévue doit être annoncée comme telle et séparée des règles
disponibles. Lors d’un changement de règle, mettre à jour son explication dans
le même changement de code. La génération automatise les catalogues, pas la
rédaction des explications.
