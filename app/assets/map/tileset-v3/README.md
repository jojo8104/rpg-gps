# Terrain JRPG v3 — piton rocheux

Variante créée avec l’outil intégré imagegen à partir de l’atlas v2. La quatrième tuile représente désormais un piton massif à sommet clair, avec des falaises verticales et un pied herbeux. Format conservé : atlas 1536 × 1024, trois colonnes et deux rangées ; ordre plaine, forêt, colline / piton rocheux, eau, seconde plaine.

Cette variante conserve les identifiants et règles du biome `rock`. L’atlas v2 et les médias archivés sont conservés. Les structures restent chargées depuis `tileset-v1/structures.png`.

## Génération

- Outil intégré imagegen, mode édition, sans CLI.
- Cible : `../tileset-v2/terrain.png`.
- Résultat : `terrain.png`, copié sans retouche.

## Prompt final

Edit this production JRPG terrain atlas, keeping the same 1536x1024 canvas and EXACT 3 columns by 2 rows grid with equal 512x512 square tiles. Change ONLY the BOTTOM LEFT square (rock terrain, x=0..511,y=512..1023). Replace its scattered boulders with ONE coherent prominent rocky crag / rocky pinnacle: a broad elevated flat-topped blue-gray rock formation, with a clear tall steep cliff face facing the bottom of the image, two or three broad vertical rock faces, a spacious lighter stone summit at the top/back for a unit sprite to stand on, sparse grass at the foot. A stylized mesa-like rocky outcrop, not a sharp needle mountain, not a pile of small stones. It must read instantly as an elevated rocky position with a cliff at tiny mobile-game size. Clean anime/JRPG cel-shading, simple broad polygons and two or three value levels, darker cliff faces and lighter summit, consistent near-overhead view of the existing map. Fit the whole formation inside this bottom-left tile, filling most of that square, no overflow across atlas tile boundaries. Preserve the existing top-left grass, top-middle forest, top-right hills, bottom-middle water and bottom-right grass exactly as they are, and keep the grid alignment. No text, borders, labels, people, units, buildings, water within the rock tile, or new UI. This atlas is the edit target, not a style reference.
