# Prompts des sprites de classe

Créés avec l'outil intégré imagegen, fond alpha transparent. Référence de style : `app/assets/heroes/hero-jrpg-walk-v2.png`. Les images sources générées sont copiées dans le projet sans retouche des pixels ; les vues occidentales utilisent un miroir CSS.

## Spécification commune

> Production transparent sprite sheet for a 16-bit JRPG GPS game, matching the reference's chunky pixels, chibi proportions and dark outlines. Exactly 15 full-body sprites arranged in a strict 3-column by 5-row grid, generous empty gutters, equal scale. Columns: standing idle, walking left foot forward, walking right foot forward. Rows: NORTH (back fully to viewer), NORTH-EAST (back three-quarter facing screen right), EAST (pure profile facing screen right), SOUTH-EAST (front three-quarter facing screen right, both eyes visible), SOUTH (front fully facing viewer). Western directions mirrored by game code. Identical head center alignment and feet baseline within each cell, consistent size. No captions, grid lines, scenery or ground shadows. Genuine transparent alpha background. Clean readable pixel-art silhouette, simple walking movement.

## Mage

> Female mage, auburn hair, violet robes with gold trim, small pointed purple wizard hat, brown boots, a short wooden staff with a turquoise orb. Same character in all fifteen poses.

Fichier : `app/assets/heroes/mage-jrpg-walk-v1.png`.

## Éclaireuse

> Female ranger/scout, long chestnut ponytail, moss green hood pushed back, short green cloak, tan leather tunic, brown boots, small bow and quiver. Same character in all fifteen poses.

Deux corrections ciblées ont imposé la grille de cinq lignes et la vue de face, puis les vues N et NE :

> Keep rows 3,4,5 exactly as-is. Correct only rows 1 and 2. Row1 all three characters face perfectly north: back fully to camera, zero face/eyes/nose visible on either side. Row2 all three characters face north-east: back three-quarter looking to screen right. Columns remain idle, walking left foot, walking right foot. Keep 3 columns and 5 rows, same style, size, head and feet alignment, transparent background.

Fichier : `app/assets/heroes/ranger-jrpg-walk-v1.png`.
