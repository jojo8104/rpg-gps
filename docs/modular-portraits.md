# Portraits anime et personnages composés

## Disponible depuis le 24 octobre 2026

Les six portraits des héros suivent une direction anime fantasy : contours nets,
couleurs lisibles et ombres légères. Ils conservent les costumes des sprites :
cape bleu pétrole du Guerrier, violet et or du Mage et cape verte de l'Éclaireur.
Le Mage masculin porte désormais les cheveux courts dégagés et une capuche
rabattue. Son sprite de marche utilise aussi cette tenue, sans chapeau pointu.
La Mage féminine conserve son chapeau. Les anciens fichiers restent archivés.

Les portraits des héros sont des illustrations fixes. La personnalisation de leur
visage par le joueur et la composition de leurs animations ne sont pas proposées.
Les calques dérivés de cette direction artistique servent aux PNJ génériques.

## Bibliothèques de PNJ v7 — correction du 25 octobre 2026

La première bibliothèque v1 combinait des éléments masculins et féminins avec
des points d'ancrage communs. Elle est remplacée par deux bibliothèques distinctes,
`v7/male` et `v7/female`, chacune avec ses proportions de tête, de cou, de traits
et de vêtements. Les fichiers v1 à v6 restent conservés pour l'historique.

La toile v3 mesure 512 × 832 pixels. La tête, les traits et les cheveux sont
réduits ensemble à 72 % de leur taille v2 pour conserver leurs placements relatifs.
Les seize tenues sont redessinées jusqu'aux hanches, avec les deux épaules entières
et une marge latérale transparente. Les tenues de travail et de forge comprennent
les avant-bras et les mains sous leurs manches retroussées. Ces parties suivent la
coupe des manches. En v4, tête, cou et haut du torse étaient trois calques
distincts. La tête s'arrête à la mâchoire. Les coiffures descendent de 12 pixels (8 pour les parties
arrière). Chaque œil féminin s'écarte de 7 pixels du centre ; nez et bouche gardent
leur ancrage. Les tenues masculines cessent d'être aussi étirées verticalement :
leur hauteur est ramenée à 88 %, avec le col fixe. Les bibliothèques restent séparées.

La v5 ajoute le haut du torse et les clavicules sous les cols ouverts. Un dessous
est découpé dans l'enveloppe de chacune des huit tenues de chaque bibliothèque,
afin de remplir les espaces autour du cou sans dépasser des épaules. L'indice
du corps doit correspondre à celui du vêtement ; un assemblage incohérent est
refusé. Les coiffures avant et arrière sont agrandies ensemble de 6 % autour du
même ancrage pour mieux couvrir le crâne. Le visage, les yeux et le cou restent
séparés. Les anciens fichiers ne sont pas remplacés.

La v6 harmonise le gabarit apparent des huit tenues dans chaque bibliothèque.
La largeur médiane de la silhouette dans la bande du haut du buste (lignes 440 à
520 de la toile) est ramenée à 300 pixels pour les femmes et à 320 pixels pour
les hommes. Le centrage et la hauteur restent fixes ; la coupe des manches et des
capes reste propre à chaque tenue. Le dessous de torse reçoit exactement le même
ajustement horizontal que son vêtement pour préserver les raccords des cols.

La première paire d'yeux féminins (`female-eyes-0`, « Variante 1 » dans l'éditeur)
est décalée de 2 pixels vers la gauche, sans déplacement vertical. La barbe
masculine est redessinée et repositionnée sur la mâchoire du visage actif ;
l'ouverture laisse visible le calque de bouche. Ces corrections ne changent
aucune règle du jeu.

La v7 remplace les silhouettes trop étroites par seize tenues redessinées avec
des épaules et des bustes plus larges. Chaque bibliothèque garde un même profil
adulte et une pose de bras commune. Les dessins sont placés sur une toile de
512 × 832 pixels avec des marges latérales ; les avant-bras et les mains restent
présents. Le rétrécissement systématique de la v6 n'est plus appliqué.

Le cou, les clavicules et le haut du torse sont dessinés ensemble dans un seul
calque de corps continu, sans raccord entre deux morceaux. Le visage reste
séparé. Chaque tenue dispose d'un corps adapté à son contour et d'un col arrière
assorti. L'ordre d'affichage est : cheveux arrière, col arrière, corps cou-torse,
visage, vêtement avant, traits, cheveux avant et accessoire. Une zone commune du
cou est protégée dans les seize vêtements avant : la partie postérieure du col
est transférée derrière le corps tandis que les revers avant restent visibles.
Le corps, le vêtement avant et le col arrière doivent porter le même indice.

Chaque bibliothèque utilise une base de tête chauve, quatre coupes de cheveux,
deux paires d'yeux avec sourcils, deux nez, deux bouches et huit tenues. Les tenues
féminines sont dessinées pour cette silhouette, avec une coupe propre. La barbe
existe uniquement dans la bibliothèque masculine ; les cicatrices, boucles
d'oreille et pendentifs ont leurs fichiers et placements propres à chaque
bibliothèque. L'absence d'accessoire reste possible.

Les variantes de visage larges `male-face-1` et `female-face-1` sont désactivées
depuis le 24 octobre 2026 : leurs proportions avec les bustes et l'écartement
apparent des yeux ne conviennent pas encore. Elles ne sont plus sélectionnées,
ni acceptées dans un assemblage, ni préchargées. Les fichiers restent conservés
pour une éventuelle reprise ; seule la base `face-0` de chaque bibliothèque est
actuellement utilisée. Les coiffures, traits, vêtements et accessoires gardent
leurs identifiants et leur sélection stable. Aucune règle du jeu ne change.

La coupe de cheveux est un calque indépendant : elle ne contient ni peau, ni
oreilles, ni yeux et n'est pas fusionnée avec la tête. Le visage reste identique
lorsqu'on change de coupe. Pour les coiffures longues féminines, une partie arrière
passe derrière la tête et le vêtement, puis une partie avant affiche la frange
et les mèches. Les deux parties portent le même indice de coupe et ne peuvent
pas être désaccordées. La toile est de 512 × 832 pixels, mais les points
d'ancrage sont propres à chaque bibliothèque et à chaque coupe.

Les chefs génériques, les responsables de mine, carrière et chantier forestier,
les responsables de fort, les forgerons, les taverniers et les PNJ recrutables en
taverne utilisent ces couches. Les PNJ recrutables apparaissent en vignette dans
les choix de conversation. Les illustrations narratives définies dans un scénario
ou dans l'éditeur restent prioritaires et ne sont pas remplacées.

## Identité stable et décor

Un descripteur de présentation sérialisable indique la version, la bibliothèque
masculine ou féminine et l'identifiant de chaque pièce, par exemple `male-hair-0`
ou `female-eyes-1`. Il est dérivé de l'identifiant permanent du PNJ, sans tirage aléatoire
à l'ouverture de la fenêtre. Un chef utilise l'identifiant de son lieu ; un forgeron
et un tavernier ont des identités distinctes dans le même lieu. Un spécialiste
recrutable conserve ses traits lorsqu'il change de taverne ou après une reprise.
La bibliothèque masculine ou féminine suit la base déjà attribuée par la v1 ; un
genre explicite peut aussi être fourni au générateur de présentation. Une pièce
de l'autre bibliothèque rend le descripteur invalide : elle n'est jamais affichée
par substitution ou par redimensionnement automatique. Les identifiants du catalogue et ses
identifiants doivent rester stables ; une nouvelle collection utilisera une
nouvelle version sans réordonner les pièces déjà utilisées.

Le décor suit le type de lieu : village, ville/capitale, fort, mine, carrière ou
forêt/chantier/camp. Les conversations du forgeron et du tavernier montrent leur
atelier ou leur salle. Les PNJ recrutables sont présentés dans la taverne. Les
tenues suivent la fonction : travailleur, responsable civil, artisan ou aventurier.

## Architecture et vérification

### Cadrage des conversations — 24 octobre 2026

Tous les dialogues partagent une géométrie fixe à taille d'écran donnée, y compris
ceux qui utilisent un portrait narratif. En portrait, le panneau de texte et de
choix occupe exactement 40 % de l'écran. Le bandeau du titre mesure 104 pixels,
auxquels s'ajoute la zone de sécurité supérieure ; la scène utilise le reste.
La longueur du texte et le nombre de choix ne changent ni la scène ni le portrait.
Seul le panneau défile. En paysage, le titre mesure 88 pixels et le panneau est
placé à droite, sur 38 % de la largeur avec un minimum de 300 pixels.
Ces tailles suivent les dimensions de l'écran et son orientation, jamais le contenu.

Le buste composé descend de 16 % de la hauteur de la scène pour cacher sa limite
inférieure. Son échelle reste stable lorsqu'on passe du texte aux choix ; le décor
reste visible. La taille du titre est conservée et son texte est limité à deux
lignes. La réplique du forgeron emploie des phrases naturelles et distingue une,
plusieurs ou aucune commande restante. Le tarif des outils et les règles restent
identiques : les valeurs continuent de provenir du serveur.

Le bandeau montre le lieu en petit puis le rôle ou nom du personnage en grand,
par exemple « Mine de fer de la Couronne » puis « Chef des mineurs ». Le nom
répété au-dessus du texte est supprimé. Un personnage narratif conserve son nom
et son titre distincts lorsqu'aucun nom de lieu n'est inclus. Le panneau garde
sa hauteur de 40 % en portrait.

### Éditeur de personnages — 24 octobre 2026

`app/portrait-editor.html`, accessible depuis l'atelier, permet de sélectionner
la bibliothèque, le décor, la tenue, les cheveux, les yeux, le nez, la bouche et
l'accessoire. Le corps suit automatiquement la tenue et les cheveux arrière
restent assortis à la coiffure avant. Les pièces des deux bibliothèques ne se
mélangent pas.

Les groupes tête et traits, coiffure, cou et torse réunis, vêtement avec col arrière, yeux, nez, bouche et
accessoire disposent d'un décalage horizontal et vertical, d'une largeur, d'une
hauteur, d'une opacité et d'une commande de visibilité. La tête et ses traits
peuvent bouger ensemble. Le cadrage global règle la position et la taille du
personnage ; des repères et un fond transparent aident à vérifier les raccords.
Les réglages suivent la toile de 512 × 832 pixels.

L'aperçu utilise les composants et styles du jeu dans un document local intégré,
en formats téléphone portrait/paysage, tablette et écran large. Les textes sont
modifiables et un mode de douze choix teste le défilement. Les curseurs agissent
sans reconstruire les images. Les en-têtes de protection du serveur restent
inchangés.

Le brouillon est enregistré dans le navigateur et restauré au rechargement.
L'import/export JSON conserve les pièces, les transformations, le cadrage et le
texte. Les imports sont validés : pas de chemin, de CSS ou de HTML libre dans
l'aperçu. Le JSON sert à partager les essais ; ces réglages ne modifient pas les
apparences d'une partie. Les intégrer au jeu demande une reprise explicite de la
bibliothèque. L'éditeur ne transmet aucune commande au moteur et ne change aucune
règle, aucun coût ni aucune récompense.
Les brouillons et exports v5/v6 sont repris en v7 en conservant les réglages du
torse pour le corps unifié. Les anciens décalages propres au cou, lorsqu'ils ont
été modifiés, restent archivés dans le JSON sous `legacyNeck` ; ils ne sont plus
appliqués séparément au corps. Les deux parties du vêtement se règlent ensemble.

Le découpage de la première rangée des coiffures féminines s'arrête dans l'espace
transparent entre les dessins. Cela retire un fragment de la coiffure voisine qui
apparaissait sous les yeux. Le contrôle des pixels alpha couvre cette zone pour
éviter une régression. Il s'agit uniquement de présentation, sans effet sur les
règles du moteur ni les mesures GPS.

`app/js/core/portrait-catalog.js` définit les références et les descripteurs sans
DOM. Les services existants de conversation et de taverne exposent les apparences.
`app/js/ui/portrait-view.js` valide le descripteur puis affiche les couches ; il
n'accepte aucun chemin d'image arbitraire dans ce descripteur. Les portraits
spécifiques continuent d'utiliser leur référence habituelle. Le navigateur ne
reçoit ici aucun pouvoir de calculer des coûts, récompenses, déplacements ou
combats : toutes les validations du jeu restent sur le serveur, en GPS comme
sur carte fictive. Cette évolution ne change aucune règle du jeu.

L'atelier `app/portrait-lab.html` présente les héros, douze assemblages masculins,
douze assemblages féminins par lot et quatre coupes sur un même visage pour
chacune des deux bibliothèques. Le sélecteur de calques permet de les examiner
séparément. Une galerie supplémentaire montre les seize tenues sur deux visages
fixes pour contrôler les proportions, les épaules et les avant-bras. Il ne modifie aucune partie.
L'aperçu de dialogue compare une femme ou un homme, un texte court ou long et douze
choix pour vérifier la stabilité du cadrage et le défilement du panneau.
Les scripts `prepare-portrait-assets.ps1`, `prepare-gendered-portrait-assets.ps1` et `prepare-mage-sprite.ps1` découpent
les atlas générés, alignent les pièces et mesurent les rectangles alpha du sprite.
Les sources de travail sont conservées dans `app/assets/portraits/modular/sources/`.
La génération artistique utilise l'outil intégré imagegen ; le découpage et les
aperçus assemblés sont déterministes. Les anciens assets ne sont pas supprimés.
Les prompts de cette correction sont conservés dans `sources/prompts-v2.json`.
Les sources et prompts v3 sont dans `sources/v3/`. Le script
`prepare-portrait-bodies-v3.ps1` prépare les calques selon `v3/layout.json` ;
`preview-portrait-bodies-v3.ps1` assemble les seize tenues pour vérification.
La préparation v4 utilise `prepare-portrait-layers-v4.ps1` et `v4/layout.json`.
Les sources et le prompt imagegen intégré sont conservés dans `sources/v4/`.
L'aperçu utilise `preview-portrait-bodies-v3.ps1 -Version v4`.
La préparation v5 utilise `prepare-portrait-layers-v5.ps1` et `v5/layout.json`.
Les sources et le prompt imagegen intégré sont conservés dans `sources/v5/`.
`preview-portrait-bodies-v3.ps1 -Version v5` assemble les seize tenues.
Les modules `portrait-editor-state.js`, `portrait-editor.js` et
`portrait-editor-preview.js` séparent les données, les commandes et l'aperçu.
La préparation v6 utilise `prepare-portrait-layers-v6.ps1` et `v6/layout.json`.
Les sources, le prompt imagegen intégré de la barbe et les mesures des tenues
restent dans `sources/v6/`. L'aperçu des seize tenues utilise
`preview-portrait-bodies-v3.ps1 -Version v6` ; les variantes de barbe se vérifient
avec `-Version v6 -MaleOnly -HeadStudy -Beards`.
La préparation v7 utilise `prepare-portrait-layers-v7.ps1` et `v7/layout.json`.
Les deux atlas de vêtements, les corps unifiés et les prompts imagegen intégrés
sont conservés dans `sources/v7/`. Le nettoyage retire les fragments des cellules
voisines avant le placement. Le centrage des bases utilise l'axe réel du cou.
L'aperçu des seize tenues utilise `preview-portrait-bodies-v3.ps1 -Version v7`.


## Ajustement masculin v8 — 25 octobre 2026

25 octobre 2026 : les tenues masculines de guerrier, mage, éclaireur, bourgmestre et tavernier sont élargies horizontalement à 115 %, avec des épaules redressées et plus carrées. Le cou masculin est élargi à 129 % avec un raccord progressif au torse dans le même calque. La hauteur et le cadrage des dialogues restent constants. Les brouillons v7 sont repris dans l’éditeur. Aucun effet sur les règles du jeu.

Le facteur horizontal de 1,15 porte sur les calques avant et arrière des cinq tenues, indépendamment des réglages additionnels de l’éditeur. Les PNG restent entiers et peuvent dépasser leur toile virtuelle dans la scène. Le cou est rééchantillonné à 1,29 dans le calque cou-torse, puis rejoint progressivement la largeur initiale de la poitrine. La bibliothèque féminine est conservée à l’identique. Les sources et versions précédentes restent archivées.


## Ajustements des vêtements féminins — 25 octobre 2026

25 octobre 2026 : ajustements des tenues féminines sur la toile de 512 × 832 pixels : guerrière à −5 px horizontal ; travailleuse et bourgmestre à 90 % de largeur, −3 px horizontal et −12 px vertical ; tavernière à +16 px vertical. Les réglages portent sur le vêtement et le col arrière, dans le jeu et l’éditeur. Le cou-torse reste aligné sur la tête. Les valeurs de l’éditeur sont des retouches additionnelles. Aucun effet sur les règles du jeu.

Les translations sont exprimées en pourcentage de la toile pour garder le même raccord sur tous les écrans. Elles utilisent les propriétés CSS translate et scale, indépendamment des retouches transform de l’éditeur. Les PNG et les planches précédentes sont conservés.


### Chef de village féminin — 25 octobre 2026

25 octobre 2026 : le vêtement féminin de chef de village et son col arrière sont remontés de 15 pixels sur la toile de 512 × 832, dans le jeu et l’éditeur. La tête et le cou-torse conservent leur position. Aucun effet sur les règles du jeu.


## Corpulence et densité de barbe — 25 octobre 2026

25 octobre 2026 : chaque PNJ composé reçoit une largeur de 90 à 110 % appliquée ensemble à tous ses calques, et une opacité de barbe de 40 à 100 % lorsqu’il porte cet accessoire. Ces variations sont déterminées par son identité et restent stables après rechargement ou changement de lieu. Le décor et les portraits narratifs fixes ne sont pas déformés. L’éditeur propose les mêmes paramètres, les conserve dans son brouillon et ses exports JSON, et permet une opacité de barbe de 0 à 100 % pour les essais. Les anciens descripteurs sans ces valeurs restent à 100 %. Aucun effet sur les caractéristiques, combats, productions ou validations du serveur.

Le descripteur sérialisable conserve `widthPercent` (entier entre 70 et 130, largeur du corps) et `beardOpacity` (entier entre 0 et 100). Le générateur utilise deux empreintes indépendantes de l’identité et de la bibliothèque pour conserver la sélection existante des pièces. Il tire la barbe entre 40 et 100 %. Le rendu applique `scaleX` sur un conteneur commun de tous les calques, séparé du décor et du cadrage. L’opacité ne vise que `male-accessory-1`, jamais les bijoux ou les cicatrices ; elle se multiplie avec une éventuelle retouche locale de l’accessoire dans l’éditeur. Les nouvelles valeurs sont strictement validées ; leur absence dans un ancien JSON est normalisée à 100 % à l’import. La génération reste une donnée de présentation ; elle n’introduit aucune règle métier côté navigateur.


### Extension de la corpulence — 25 octobre 2026

25 octobre 2026 : la plage de corpulence des PNJ est étendue à 50–180 %, pour la génération déterministe, la validation des descripteurs et le réglage de largeur globale dans l’éditeur. Tous les calques du personnage suivent le même facteur horizontal ; sa hauteur et le décor restent constants. Les variations de barbe sont conservées. Aucun effet sur les règles ou les caractéristiques du jeu.


## Corpulence en deux blocs liés — 25 octobre 2026

25 octobre 2026 : la corpulence relie désormais deux blocs de largeur. Le bloc tête (visage, cheveux, yeux, nez, bouche, barbe, cicatrices et boucles d’oreilles) varie de 90 à 110 %. Le bloc corps (cou-torse, vêtements, cols arrière et pendentifs) varie de 50 à 130 %. Un seul réglage les fait évoluer ensemble dans le même sens : corps 50 % / tête 90 %, référence 100 % / 100 %, corps 130 % / tête 110 %. La hauteur reste constante. La génération reste stable par identité, l’opacité de barbe est conservée et l’éditeur affiche les deux valeurs. Les anciens brouillons au-dessus de 130 %, jusqu’à l’ancienne limite de 180 %, sont ramenés à 130 % tout en conservant les autres retouches. Aucun effet sur les règles du jeu.

`portraitProportions` déduit la largeur de tête de celle du corps : sous 100 %, tête = 100 + (corps − 100) / 5 ; au-dessus, tête = 100 + (corps − 100) / 3. Le résultat est arrondi à deux décimales. `portraitLayerBlock` affecte chaque pièce à son bloc ; le rendu conserve un conteneur de transformation par calque pour respecter les profondeurs (cheveux arrière, col arrière, corps, tête, vêtement, traits, cheveux avant, accessoire). Les retouches locales de l’éditeur et les corrections de tenue restent à l’intérieur de ces blocs. Le décor et le cadrage n’utilisent pas leur facteur de largeur. L’ancien élargissement uniforme de tous les éléments est remplacé par cette règle de présentation. Les anciennes planches restent archivées.


### Minimum du corps à 70 % — 25 octobre 2026

25 octobre 2026 : la largeur minimale du bloc corps passe à 70 %, avec un maximum de 130 %. Le bloc tête reste lié de 90 à 110 %, avec les références corps 70 % / tête 90 %, 100 % / 100 % et 130 % / 110 %. Les anciens brouillons inférieurs à 70 % sont ramenés à ce minimum sans perdre leurs autres retouches. Ce réglage de présentation ne change aucune règle du jeu.

La correspondance actuelle est tête = 100 + (corps − 100) / 3 sur toute la plage 70–130 %. Elle remplace la correspondance précédente, conservée dans l’historique. L’éditeur utilise les mêmes limites que la génération et la validation des descripteurs.


## Extension des calques v9 — 25 octobre 2026

25 octobre 2026 : la bibliothèque v9 ajoute pour chaque genre un visage compatible, une tenue de brigand, deux paires d’yeux, deux nez, deux bouches, trois coiffures de couleurs variées, deux couvre-chefs, des lunettes et trois objets (lance, fourche, bâton magique). Deux barbes masculines sont ajoutées : barbe fournie et bouc poivre et sel, avec opacité réglable comme la barbe existante. Couvre-chef, lunettes et objet occupent des emplacements indépendants et peuvent se combiner avec les autres accessoires. Chaque bibliothèque compte désormais deux visages, sept coiffures, quatre variantes de chaque trait et neuf tenues. L’éditeur permet de choisir le visage et toutes les nouvelles pièces ; les anciens brouillons sont repris. Les variations liées tête 90–110 % / corps 70–130 % et les corrections de chaque tenue sont conservées. Les objets illustrés ne donnent aucun équipement, bonus ou capacité : aucune règle du jeu ni validation serveur ne change.

Les anciens PNG v8 sont copiés à l’identique dans v9. La seconde forme de visage utilise les mêmes ancrages et reste distincte des anciens visages larges désactivés. Les atlas sources, prompts ImageGen intégrés et corrections de transparence restent dans `app/assets/portraits/modular/sources/v9/`. `scripts/prepare-portrait-layers-v9.ps1` nettoie les fragments isolés puis découpe les pièces sur la toile commune 512 × 832. Les traits sont des calques séparés. Les nouvelles coiffures féminines sont courtes ou relevées ; leurs calques arrière assortis sont transparents. Les cols des brigands sont séparés en avant/arrière autour du cou-torse existant.

Le catalogue ajoute les emplacements optionnels `headwear`, `glasses` et `prop`. Leurs index zéro signifient absence et ne nécessitent aucun PNG. Les objets sont placés derrière la silhouette, les lunettes au-dessus des traits et les couvre-chefs après la coiffure. Les objets suivent le bloc corps ; lunettes et couvre-chefs suivent le bloc tête. `isPortraitBeard` identifie les trois barbes masculines et leur applique la densité de barbe, multipliée par les retouches locales de l’éditeur. Les références restent strictement validées par bibliothèque. Le rôle visuel `brigand` sélectionne la neuvième tenue sans ajouter de métier ou de comportement au moteur.

Le générateur choisit les nouvelles variantes de façon déterministe ; couvre-chef et objet sont présents environ une fois sur quatre, les lunettes environ une fois sur cinq. Les descripteurs déjà conservés peuvent être repris par l’éditeur sans changement de leurs pièces : les exports v5 à v8 sont migrés vers v9, les nouveaux emplacements et leurs réglages sont initialisés à vide/neutre. L’atelier affiche désormais les dix-huit tenues et les quatorze coiffures. La planche de contrôle se prépare avec `node scripts/portrait-v9-checks.mjs`, puis `powershell -NoProfile -File scripts/preview-portrait-v9.ps1`. Les anciennes illustrations et versions restent archivées.


## Visages, foulards, vieillesse et expressions v10 — 25 octobre 2026

25 octobre 2026 : la bibliothèque v10 ajoute pour chaque genre deux formes de visage (menton carré et joufflu), un foulard masquant le nez et la bouche, un foulard noué comme couvre-chef, une coiffure blanche, des yeux et sourcils vieillis, ainsi que les expressions rire, colère et menaçant. Les rides du front, les plis de la bouche et les pattes-d’oie sont trois calques indépendants, combinables et réglables en opacité dans l’éditeur. Le sélecteur Expression applique ensemble les yeux et la bouche assortis ; chaque trait reste modifiable séparément. Le foulard du visage reste au-dessus de la barbe ; le rire ouvert reste visible devant celle-ci. Les signes d’âge et les expressions générés sont stables par identité. Toutes les anciennes pièces et les réglages de corpulence sont conservés. Ces variations visuelles ne changent aucune caractéristique, attitude d’IA ou règle du jeu.

Le catalogue actif conserve les pixels v9 à l’identique et ajoute les visages `face-2` (menton carré) et `face-3` (joufflu) : quatre formes au total, sans reprendre les anciens visages larges v2. La largeur du front et les ancrages des traits restent compatibles. Chaque bibliothèque possède huit coiffures, huit paires d’yeux, sept bouches, quatre nez et neuf tenues. La coiffure `hair-7` est blanche ; sa partie arrière féminine est transparente car la coupe est courte. `headwear-3` est le bandana et `mask-1` le foulard du visage.

Trois nouveaux emplacements optionnels de vieillissement, `forehead`, `mouthLines` et `eyeWrinkles`, permettent de superposer les rides indépendamment. Ils suivent le bloc tête et les retouches du groupe Tête et traits. `mask` est un emplacement optionnel indépendant de la barbe, des lunettes et du couvre-chef ; il suit aussi le bloc tête. Le générateur choisit un profil plus âgé pour environ un quart des identités ; les trois rides sont alors présentes et une coiffure blanche est choisie dans environ la moitié de ces profils. Les yeux vieillis utilisent des sourcils grisonnants ; les sourcils des expressions restent bruns. Le foulard du visage apparaît environ une fois sur deux pour le rôle visuel brigand et une fois sur huit pour les autres rôles. Cela reste exclusivement cosmétique.

`PORTRAIT_EXPRESSION_PRESETS` définit Neutre (yeux 0/bouche 0), Rire (yeux 5/bouche 4), Colère (yeux 6/bouche 5) et Menaçant (yeux 7/bouche 6). `withPortraitExpression` et `selectPortraitEditorExpression` changent uniquement la paire de traits. Le générateur utilise les trois expressions sur trois cas sur huit, sinon il choisit des traits neutres ou vieillis. `portraitLayerOrder` place la barbe sous la bouche seulement pour un rire ouvert, puis conserve le foulard au-dessus. Les rides sont placées avant les cheveux et les accessoires pour respecter les occultations.

Les imports v5 à v9 sont migrés en conservant leurs pièces, leur équipement et leurs retouches ; les nouveaux emplacements sont initialisés à vide. Les sources, prompts ImageGen intégrés et corrections sont archivés dans `app/assets/portraits/modular/sources/v10/`. La préparation utilise `scripts/prepare-portrait-layers-v10.ps1`, les scénarios de comparaison `node scripts/portrait-v10-checks.mjs`, puis `powershell -NoProfile -File scripts/preview-portrait-v9.ps1 -ManifestPath output/portraits/v10-assemblies.json -OutputPath app/assets/portraits/modular/v10/assembly-check.png`. Toutes les anciennes versions et illustrations restent conservées.


## 25 octobre 2026 — Formes neutres et couvre-chefs frontaux (v11)

25 octobre 2026 — Portraits v11 : chaque coiffure et barbe utilise une forme neutre, teintée parmi noir, brun, châtain, blond, roux, gris et blanc. La barbe peut suivre les cheveux ou recevoir une couleur indépendante ; son opacité reste réglable. Les casques, la casquette et la tiare sont des calques frontaux sans intérieur ni bord arrière. Les anciens brouillons sont repris avec leurs réglages. Changement de présentation uniquement, sans effet sur les règles ni les calculs serveur.

Les PNG neutres conservent exactement les canaux alpha v10 et leurs ancrages. Un filtre SVG commun à sept palettes applique la teinte sans multiplier les PNG. Les identifiants des filtres sont propres à chaque portrait. Les couleurs sont sérialisées dans `hairColor` et `beardColor` (`null` : assortie). La génération reste déterministe ; les cheveux gris ou blancs sont liés aux profils âgés, indépendamment de la coupe. Les archives v10 restent intactes.


## 25 octobre 2026 — Soldat et casque de mineur (v12)

Les tests du déplacement des casques exigent des canaux alpha identiques après
translation de 20 pixels et tolèrent au maximum un niveau sur 255 pour les
canaux RGB : le réenregistrement par System.Drawing produit cet arrondi.
Le diagnostic est limité à des compteurs et à l’écart maximal afin d’éviter
l’impression de millions d’octets en cas d’échec. Le calque arrière de la tenue
barbare féminine (`female/clothingBack-10`) est vide après séparation de cette
tenue ; cette exception précise ne s’applique pas aux autres vêtements.
Ces corrections de tests ne modifient ni les PNG ni les règles du jeu.

25 octobre 2026 — Portraits v12 : les casques sont descendus de 20 pixels. Un casque de mineur à lanterne frontale et une tenue de simple soldat sobre sont disponibles dans les bibliothèques masculine et féminine, dans l’éditeur et le catalogue. Les dix tenues conservent leur corps et leur col arrière associés. Les anciens brouillons restent importables. Aucun changement des règles ni des caractéristiques des unités : il s’agit uniquement de présentation.

Le casque existant garde ses dimensions et descend de 20 pixels dans sa toile. Le casque de mineur utilise `headwear-4`, et le simple soldat `clothing-9`, `clothingBack-9`, `body-9`. Le rôle de présentation `soldier` sélectionne cette tenue sans modifier les rôles existants. Sources, prompts et scripts de préparation v12 conservés ; les calques v11 restent archivés.


## Aldren composé — 25 octobre 2026

25 octobre 2026 — Le maréchal Aldren est désormais composé avec les mêmes calques que les PNJ, selon une identité fixe : armure sombre aux insignes dorés, cape bleu nuit et coupe courte uniques, visage carré, cheveux et barbe gris, rides et carrure à 115 %. Le bouton Charger le maréchal Aldren de l’éditeur permet de le retoucher. Les références historiques de son portrait affichent cette composition dans les dialogues, y compris les conversations de scénario ; l’ancienne illustration reste archivée. Aucun changement de quête, de statistique ou de règle serveur.

L’identité est définie dans `portrait-characters.js`. Les pièces uniques sont `male-clothing-11`, `male-clothingBack-11`, `male-body-11` et `male-hair-8`. Sa coupe est disponible dans l’éditeur mais exclue du tirage des PNJ génériques. Les tenues actives sont au nombre de douze chez les hommes, onze chez les femmes. La référence historique `assets/characters/marshal-aldren.png` est reconnue explicitement ; les autres illustrations narratives gardent leur priorité.


25 octobre 2026 — Tenues et accessoires barbares : une tenue en cuir et fourrure est disponible pour chaque genre, avec bras visibles et corps/col arrière associés. La longue barbe masculine est un accessoire séparé, avec sept couleurs et une opacité réglable ; elle peut être portée avec les autres vêtements. Le sommet des cheveux est masqué sous les casques pour éviter les mèches qui traversent la coque. Aucun changement des règles du jeu.

La tenue barbare utilise `clothing-10`, `clothingBack-10`, `body-10` ; la longue barbe `male-accessory-7`. Le rôle de présentation `barbarian` choisit cette tenue.


## Coupe frontale et salle du maréchal — 25 octobre 2026

25 octobre 2026 — Aldren : la coupe courte est redessinée strictement de face, avec tempes et volumes équilibrés, pour correspondre au visage frontal. Un décor de salle du maréchal au château est ajouté : voûtes de pierre, fenêtres, bannières bleu et or, cartes et bureau de commandement. Cette salle est le décor fixe d’Aldren et reste sélectionnable dans l’éditeur. La coupe précédente et les illustrations précédentes sont conservées. Aucun effet sur les règles, les statistiques ou les quêtes.

La référence sérialisée `male-hair-8` résout désormais le fichier `male/hair-8-front.png` ; le fichier antérieur reste archivé. Le nouveau décor `marshal-room` suit le format RGBA de 512 × 640 des autres fonds. Le bouton de préréglage charge le descripteur actualisé ; un ancien brouillon conserve son décor personnalisé jusqu’à sa modification ou au rechargement du préréglage. Sources et prompts sont conservés avec les calques v12.


## Règles actuelles des accessoires et du cadrage — 25 octobre 2026

Les portraits permettent de cumuler plusieurs accessoires de la même bibliothèque : barbe, cicatrice, bijoux et pendentif. La barbe a désormais une opacité fixe de 100 %, y compris après import d’un ancien réglage ; les autres accessoires gardent leurs réglages. Dans l’éditeur, le déplacement global du personnage est autorisé de −150 % à +150 % horizontalement et verticalement. Le cadrage du dialogue reste fixe. Ces règles de présentation ne modifient aucune caractéristique ni action du jeu.

| Réglage | Valeur actuelle |
| --- | --- |
| Accessoires | Sélection cumulable par cases à cocher, dans la bibliothèque du genre |
| Opacité de barbe | 100 %, fixe |
| Déplacement horizontal du personnage | −150 à +150 % |
| Déplacement vertical du personnage | −150 à +150 % |
| Taille du personnage | 60 à 140 %, inchangé |

L’accessoire principal historique reste importable ; les autres références sont sérialisées dans `additionalAccessories`. Les doublons et références d’une autre bibliothèque sont refusés. Les pendentifs suivent le bloc corps ; les autres accessoires suivent la tête. Le réglage d’opacité du groupe Accessoires agit uniquement sur les pièces qui ne sont pas des barbes ; les cases de visibilité restent disponibles. Ces règles remplacent les anciennes notes de variation d’opacité de barbe, conservées dans l’historique. Les déplacements portent sur l’image du personnage, sans modifier le GPS ou une position de jeu.
