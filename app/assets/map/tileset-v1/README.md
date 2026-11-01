# Tileset mini-carte v1

Généré avec l’outil intégré imagegen. Atlas conservés sans modification.

- terrain.png : 1536 × 1024, grille 3 × 2, cellules 512 × 512. Herbe, forêt, colline / roche, eau, variante d’herbe.
- structures.png : atlas RGBA transparent ; rectangles normalisés définis dans app/js/map/minimap-tileset.js (les objets générés ne suivent pas une grille stricte).
- Prévisualisation : playtest/minimap-tileset.html, à ouvrir via le serveur du projet.
- Module : loadMinimapTileset puis renderMinimapTileset(canvas, atlas, grille, objets).
- Grille rectangulaire : grass, forest, hill, rock, water. Objets : kind, col, row, rotation en degrés.

Les jonctions utilisent un champ bilinéaire commun aux cases, avec fondu et berge sur l’eau. Les textures générées ne garantissent pas un raccord pixel parfait de leurs bords opposés. Ce rendu est une présentation d’une grille reçue, sans calcul métier. Aucun branchement au fond Leaflet existant n’a été effectué : il reçoit actuellement des polygones géographiques, pas cette grille.

## Prompts utilisés

### Terrains

Use case: stylized-concept. Asset type: production terrain tileset atlas for a medieval GPS RPG minimap. Create ONE precisely aligned 1536x1024 rectangular sprite atlas: EXACTLY 3 columns and 2 rows of equal square cells, no gutters, no borders, no labels. Orthographic directly overhead 2D hand painted strategy game textures, readable when reduced to 64 pixels, muted sage green, deep forest greens, warm earthy ochre, slate gray rocks, blue teal water. Consistent scale and upper-left soft lighting. Every cell fully filled to its edges, no isolated floating tile, no perspective diamond. Row 1 left to right: GRASS meadow texture with sparse tiny tufts; FOREST dense small rounded tree canopies on green ground, continuous canopy texture; HILL grassy rolling low hills, gentle earthy ridges with grass; Row 2 left to right: ROCKY RELIEF clustered rugged gray crags on earthy grass, no snow; WATER uninterrupted blue teal lake water with subtle tiny ripples, absolutely no shore or land anywhere in this cell; GRASS alternate meadow texture. Each terrain designed for repetition, similar opposite edges with no frame, no large recognizable repeating landmarks. All actual biome boundaries will be masked in software, so no baked shorelines, no roads, no structures, no text.

### Constructions

Use case: stylized-concept. Asset type: transparent upper-layer sprite atlas for medieval strategy RPG minimap. ONE square 1024x1024 canvas, EXACT 2 columns x 2 rows equal square cells, no gutters or visible grid. Genuine transparent background throughout all empty areas. Hand painted 2D orthographic overhead view, small readable game sprites, muted sage/forest greens, warm brown timber, warm gray slate stone, terracotta roofs, consistent upper-left soft light, matches hand-painted terrain maps. Each object completely contained within its cell with generous transparent margin, same world scale. Top left: horizontal east-west timber BRIDGE, straight plank deck crossing the whole central width, stout wood railings, approaches, NO water or ground baked behind it; top right: small round stone WATCHTOWER with crenellations, overhead roof interior visible; bottom left: horizontal defensive wooden BARRICADE made of sharpened stakes, no soldiers; bottom right: small VILLAGE cluster of five medieval cottages with terracotta pitched roofs around a tiny open square, no enclosing background terrain. Keep subtle compact translucent contact shadows, no large shadows, no labels, no text, no watermark, no frame, no grass tile backdrops, no isometric diamonds.

