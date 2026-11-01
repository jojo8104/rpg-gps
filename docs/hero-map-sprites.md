# Apparence du héros sur la carte

La carte choisit l'apparence à partir de la classe officielle du héros : aventurier à cape turquoise pour le Guerrier, mage aux cheveux roux avec robe violette et bâton, éclaireuse à cape verte avec queue de cheval et carquois. Le double du voyage astral utilise aussi l'apparence de la mage. Les silhouettes des alliés utilisent leur classe connue.

Chaque personnage dispose de huit orientations relatives à la caméra et de trois poses pour une marche simple : immobile, pas gauche, pas droit. Les cinq vues dessinées sont N, NE, E, SE et S. NW, W et SW reprennent respectivement NE, E et SE par miroir horizontal. Les accessoires changent donc de côté selon la direction ; cela n'a aucun effet sur l'équipement ou les capacités.

Les poses sont alignées sur un axe vertical et une ligne de pieds commune. Le cycle de marche dure 560 ms et accompagne l'interpolation visuelle des positions officielles. Les sprites ne calculent ni déplacement, ni vitesse, ni portée, ni récompense. Les règles restent validées exclusivement par le serveur, en GPS et sur carte fictive.

Les planches transparentes sont conservées dans `app/assets/heroes/`. Les rectangles des poses et les échelles sont définis dans `hero-sprite-atlas.js` et `hero-class-sheets.js`.

Le genre officiel du héros sélectionne désormais la variante de sa classe : Guerrière, Mage masculin ou Éclaireur masculin en complément des visuels historiques. Les rectangles correspondants se trouvent dans `hero-gender-sheets.js`. Le portrait, les héros distants identifiés et le double astral utilisent également le genre enregistré. Voir [Variantes visuelles des héros](hero-gender-variants.md). Le choix est purement visuel et ne modifie aucune règle du moteur.


## Direction anime — 24 octobre 2026

Les portraits des six héros utilisent désormais les fichiers `hero-{classe}-{genre}-anime-v2.png`. Le Mage masculin conserve le violet et l’or, avec les cheveux courts et une capuche rabattue. Sa planche `mage-male-jrpg-walk-v2.png` et ses rectangles dans `mage-male-sheet-v2.js` remplacent visuellement le chapeau pointu. Les autres sprites restent identiques. Les anciens fichiers sont conservés. Les identités et les caractéristiques des sauvegardes ne changent pas ; la présentation courante utilise les nouveaux portraits. Voir [Portraits anime et personnages composés](modular-portraits.md) pour la bibliothèque des PNJ, les décors et les limites de personnalisation.
