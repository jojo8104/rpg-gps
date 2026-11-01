# Atelier web de quêtes

La vue des ressources accepte un hôte navigateur injecté pour la liaison avec
l’éditeur de portraits des PNJ. Les tests Node fournissent un hôte simulé sans
variable globale `window` ; dans le navigateur, la fenêtre habituelle reste
utilisée par défaut. Les tests des modèles de groupes restent actifs et vérifient
que leur sélection n’ouvre pas l’éditeur de portraits. Cette correction technique
ne change ni les projets exportés, ni les règles, ni les validations serveur.

L’atelier est disponible dans le serveur du jeu à `/editor/`. Lancer `npm start`
depuis le dossier du projet puis ouvrir `http://localhost:3000/editor/` (adapter
le port à `RPG_GPS_PORT`). Cette application PC en HTML, CSS et modules JavaScript
prépare des définitions. Le serveur les valide avec les modèles du moteur.

## Schéma et fiches

Le bouton **+ Nouvelle quête** se trouve en haut de la colonne gauche. Il ouvre
un projet vide après proposition de téléchargement du projet courant.
Sous chaque champ, **ⓘ À quoi sert ce champ ?** déplie une explication : utilité,
références attendues, unités, exemples et effet réel sur les règles serveur.

La palette propose Atteindre, Parcourir, Prendre, Donner, Parler, Construire et
Combattre. Cliquer sur un type pour créer un bloc puis sur le bloc pour éditer sa
fiche. Ses champs s’adaptent : lieu, distance, objet, quantité, dialogue,
construction ou cible. Voir [le catalogue des champs](quest-authoring-guide.md).

Déplacer les blocs à la souris et glisser le fond pour déplacer la vue. La
molette et +/− règlent le zoom. Organiser répartit les actions selon leurs
dépendances ; Recentrer affiche le schéma entier. La disposition appartient au
projet d’édition, séparément de la définition exécutée par le moteur.

Pour relier deux blocs, cliquer sur une sortie puis sur l’entrée suivante.
Cliquer sur une flèche pour éditer ses conditions. Sorties & enchaînement règle
les sorties nommées, les jonctions OU/ET, les dépendances obligatoires et les fins
explicites de réussite ou d’échec. Une sortie de dialogue doit correspondre au
résultat d’un choix dans Conversation & choix. Ce panneau édite les nœuds,
répliques, réponses et conditions de conversation.

La Fiche de quête contient identité, proposition, participation, conditions
d’accès, publication, créations et conséquences des trois issues. Les réactions
aux événements, les quêtes suivantes, les propriétés complètes des créations de
lieux et certains réglages spécialisés restent éditables en JSON dans les
sections avancées. Les champs supplémentaires importés sont conservés dans le
projet ; l’export applique la normalisation du moteur.

La bibliothèque contient un exemple à deux missions exclusives et les fiches
actuelles du Ravitaillement et des Prospecteurs perdus. Changer de projet propose
de télécharger le brouillon précédent. Dupliquer et supprimer sont disponibles
dans les fiches. Ctrl+Z et Ctrl+Y annulent ou rétablissent les changements en
dehors des champs de saisie.

## Monde et carte optionnels

Une quête peut être conçue sans play area. Monde & carte permet de créer les
lieux logiques, régler type, rayons, visibilité et cycle de vie, puis sélectionner
un lieu et cliquer sur la carte pour le placer. Déplacer son marqueur à la souris
ou saisir ses coordonnées dans sa fiche. Retirer la position imposée rétablit un
placement libre.

Play area dessine le périmètre : cliquer sur au moins trois sommets puis Terminer
le tracé. Exclusion ajoute une zone interdite au placement. Échap abandonne le
tracé. La fiche du monde permet aussi d’importer ou éditer le JSON du terrain et
de le détacher. La validation réutilise PlayArea et LocationSpacingPolicy :
limites, exclusions et espacements officiels. Elle ne vérifie pas à elle seule
la praticabilité des chemins ni l’accès physique aux lieux.

Le fond OpenStreetMap est optionnel et désactivé initialement. L’activer charge
les tuiles d’OpenStreetMap pour la zone consultée. Le quadrillage, les polygones
et les marqueurs fonctionnent sans ces tuiles. Aucune géolocalisation du
navigateur n’est demandée.

## Sauvegarde, validation et export

Le brouillon actif est enregistré automatiquement dans le stockage local du
navigateur. Enregistrer télécharge aussi un `.project.json` contenant quête,
dialogues, monde, terrain et disposition. Conserver ce fichier pour échanger ou
retrouver le projet dans un autre navigateur. Importer accepte un projet complet,
une fiche de quête seule, un catalogue de dialogues ou une play area JSON.
Un seul projet est ouvert à la fois.

Valider transmet le brouillon à `/api/editor/validate`. Le serveur vérifie modèles,
cycles, sorties, références, dialogues, conditions, effets, créations et
placements. Une erreur empêche l’export moteur. Les avertissements signalent
notamment un terrain facultatif absent, un lieu libre ou une dépendance externe.
La validation structurelle ne prouve pas que toutes les conditions narratives
seront réalisables dans une partie.

Exporter produit un ZIP : fiche de quête, dialogues, `scenario.json`,
`locations.json`, `placements.json`, `play-area.json`, projet d’édition et README.
Les lieux libres sont sérialisés avec une coordonnée neutre dans `locations.json`,
nécessaire au modèle Location ; leur placement reste à résoudre pendant la
préparation du monde. Le scénario exporté est une base à une phase, à adapter
si le scénario cible possède ses propres phases. Les lieux du projet représentent
ses slots logiques.

Le bouton **Enregistrer dans le jeu** valide et sauvegarde un paquet versionné
dans `data/quests/editor-<identifiant>/`, puis remplace atomiquement le registre
`data/quests/editor-catalog.json`. Les anciennes versions sont conservées.
Redémarrer le serveur puis créer une nouvelle partie : ses quêtes, dialogues et
lieux sont chargés dans le catalogue et la préparation. Les définitions de lieu
déjà présentes gardent leur fiche officielle ; les nouveaux slots sont ajoutés.
Le terrain du projet reste une aide de conception : la partie utilise son terrain
de préparation, et les créations sont à nouveau contrôlées contre ce terrain.
Seules les quêtes de départ du scénario sont proposées initialement ; les autres
sont publiées par les transitions. Cet enregistrement est réservé au PC du serveur
(connexion locale). Aucune partie en cours n’est modifiée.

## PNJ, groupes autonomes et objets

L’onglet **PNJ, GA & objets** contient trois catalogues propres au projet,
conservés dans `assets.npcs`, `assets.groups` et `assets.items`. Ajouter une fiche,
déplier son nom puis remplir les champs. Les aides contextuelles sont également
disponibles ici. Supprimer une fiche laisse ses références à vérifier au serveur.

Les PNJ sont des **fiches narratives** : identifiant, nom, rôle, lieu, dialogue et
description. Leur dialogue s’édite dans les actions Parler. Si un dialogue est
associé, son speakerId et son lieu doivent correspondre à la fiche du PNJ.
Renommer un PNJ actualise les références de proposition et de conversation.
Ce catalogue ne crée pas un héros combattant ou un PNJ recrutable en taverne.

Les GA utilisent le modèle **AutonomousGroup** : type, propriétaire, origine,
position initiale, comportement, détection et discrétion. Armée, cargaison et
mission sont accessibles en JSON avancé, avec explications de format. Une armée
est validée avec Army et Unit. Le serveur vérifie les coordonnées et la play area.
Une mission structurellement valide n’est pas une simulation de son comportement.

Les objets utilisent **createUniqueItemDefinition** : identifiant, nom, catégorie
unique/equipment/character, icône, description, utilité, emplacement d’équipement
et modificateurs numériques. Un objet officiel ne peut pas être écrasé par une
fiche personnalisée. Les nouveaux objets apparaissent dans les suggestions des
champs d’objets des quêtes. Renommer une fiche actualise les références des
transferts, créations et récompenses.

La validation ajoute des avertissements d’intégration explicites. L’export inclut
`npcs.json`, `autonomous-groups.json` et `items.json`. Ces définitions doivent être
raccordées aux services concernés avant utilisation générale en partie. Une fiche
GA peut maintenant être copiée dans les créations de la quête avec **Créer ce GA
dans la quête courante**. Sa création est ensuite exécutée par le moteur serveur.
Les objets personnalisés ne sont pas encore enregistrés dans le catalogue actif
des objets ; leur intégration reste distincte. Créer une fiche seule ne fait
apparaître aucune entité et n’applique aucune récompense.

## Modules complémentaires

`editor/js/field-help.js` contient les explications. `asset-model.js` gère les
données et références ; `asset-view.js` affiche les fiches.
`server/editor/editor-assets.js` effectue leur validation serveur.

13 octobre 2026 : bouton Nouvelle quête visible, aides contextuelles et catalogues
de PNJ narratifs, groupes autonomes et objets intégrés à l’atelier.

## Scénario et enchaînement des quêtes

**Scénario & quêtes** permet de renseigner identifiant, nom et introduction du
scénario, puis de composer sa liste de quêtes. Ajouter / actualiser la quête
ouverte conserve sa définition. Ajouter une fiche de la bibliothèque, importer
un projet ou une fiche de quête, ou créer une nouvelle quête du scénario.
Éditer les actions ouvre la quête correspondante dans le schéma ; les dispositions
de chaque quête sont conservées lors du passage de l’une à l’autre.

Le monde, les dialogues et les catalogues sont communs. Les lieux manquants d’un
projet ajouté sont fusionnés ; les lieux déjà présents conservent leurs réglages.
Un dialogue de même identifiant avec un autre contenu doit être renommé avant
ajout. Une quête seule importée doit utiliser les lieux et dialogues du projet.
Les coordonnées de catalogue des lieux aléatoires importés sans terrain sont
ignorées : ils restent à placer. Les positions fixes sont conservées et doivent
être adaptées à la play area commune.

Cocher **Départ** pour les quêtes à publier au lancement. Créer un enchaînement
avec sa source, une issue (réussite, échec, abandon) et la quête suivante. Les
liens sont affichés avec leurs noms et une flèche ; leurs conditions s’éditent en
JSON avec les types de conditions habituels. Une transition publie la suivante,
sans acceptation automatique. Plusieurs transitions peuvent publier plusieurs
quêtes. Les conditions ne sont pas reevaluées continuellement après la fin.

La validation serveur contrôle toutes les quêtes du scénario et refuse les
départs inconnus, suites absentes et cycles. Elle avertit sur les quêtes
inaccessibles depuis les départs. Le scénario exporté utilise le monde commun
et la phase de base de l’atelier ; les phases narratives historiques ne sont
pas éditées par cette interface.

L’archive inclut `quests/*.json`, les dialogues communs et `quest-campaign.json`
avec scenarioId, questIds et initialQuestIds. Ce manifeste de conception doit
être raccordé au lancement serveur pour charger toutes les définitions et publier
uniquement les quêtes de départ. **Enregistrer dans le jeu** effectue cet
enregistrement sans modification manuelle du catalogue JavaScript.
Les transitions sont les champs existants `transitions` des définitions Quest.
Les règles des parties en cours restent inchangées.

Une quête ouverte qui n’appartient pas au scénario reste une fiche indépendante :
utiliser Ajouter / actualiser pour l’inclure. Après modification de son identifiant,
retirer l’ancienne entrée et ajouter la nouvelle, puis vérifier ses références.
L’interface propose actuellement une liste de blocs et de flèches d’enchaînement,
sans placement libre des blocs de quête dans cet onglet.

13 octobre 2026 : composition de scénarios de quêtes et export de leur manifeste.

## Fichiers techniques

### Carte Leaflet pour préparer le terrain (14 octobre 2026)

Monde & carte utilise Leaflet 1.9.4, comme la carte du jeu, avec le fond
OpenStreetMap activé par défaut. Déplacer la carte et zoomer, ou renseigner le
centre GPS ; Voir le terrain recadre la zone et les lieux déjà définis.
Play area démarre le tracé : cliquer pour ajouter les sommets, puis Terminer le
tracé. Exclusion ajoute un polygone interdit au terrain existant. Échap annule
le tracé en cours. Sélectionner un lieu et cliquer sur la carte fixe sa position ;
glisser son marqueur permet de l’ajuster. Les rayons d’interaction sont affichés.

Le projet conserve les coordonnées GPS de la zone, les exclusions et les positions
fixes. Les exports et l’installation serveur conservent leur format ; la validation
et le placement aléatoire restent exécutés par le serveur. La vue et le zoom sont
des préférences de l’éditeur. Leaflet et le fond de carte requièrent une connexion
réseau ; cette préparation n’exporte pas de tuiles pour un usage hors ligne.

### Générer des fiches aléatoires (14 octobre 2026)

Dans PNJ, GA & objets, Générer est disponible dans les rubriques PNJ et Objets.
Dans Monde & carte, Générer un lieu ajoute un lieu puis ouvre sa fiche. Chaque
clic ajoute une fiche modifiable avec un identifiant unique, sans remplacer les
fiches ou les actions existantes. Ctrl+Z permet d’annuler la création.

Les profils d’objets proposent des équipements (emplacement et bonus cohérents,
entre 1 et 4) ou des objets uniques sans bonus. Les profils de lieux proposent
village, camp, mine, camp de bûcherons, carrière ou fort ; les rayons sont remplis
et le placement reste aléatoire, sans coordonnées imposées. Les PNJ reçoivent un
rôle narratif et un lieu existant si disponible ; leur conversation reste à écrire.

Les noms utilisent provisoirement le type de fiche et un numéro. Le module
`editor/js/random-content.js` accepte une fonction `generateName` pour raccorder
plus tard des dictionnaires adaptés au type d’objet, lieu ou PNJ. La génération
est un outil de conception : aucune création dans la partie, aucune intégration
automatique d’objet au catalogue actif, aucune modification des règles serveur.

### Rôle des champs dans les aides (14 octobre 2026)

Les aides contextuelles distinguent Référence technique, Règle de jeu,
Descriptif / présentation, Outil de l’éditeur, Intégration requise et Structure
avancée. Un identifiant relie les éléments ; un nom et une image les présentent ;
une quantité, une condition ou un déclencheur influence le jeu sous contrôle serveur.
Un champ importé non catalogué est indiqué Structure avancée, sans lui attribuer
un effet présumé. Le rôle narratif d’un PNJ et le rôle d’un lieu ont des indications
différentes. Les tableaux structurés possèdent une aide Utilité du champ sur leurs
clés internes. Les bonus d’objets mentionnent aussi leur intégration encore nécessaire.
Ces indications sont informatives et ne changent aucune règle de jeu.

### Placement et terrain enregistré (14 octobre 2026)

Un nouveau lieu utilise `defaultPlacement.strategy: "random"` : le serveur choisit
sa position dans la zone autorisée avec les espacements requis. Définir un point
sur Monde & carte permet un placement fixe ; revenir à Aléatoire pour annuler ce
point imposé. L’absence de position ne signifie pas un placement fixe à zéro.

Tracer une play area et ses exclusions dans Monde & carte, puis Enregistrer dans
le jeu. Après redémarrage, choisir cette aventure dans Scénario et terrain, visible
dès l’étape Terrain de la salle. La mention terrain enregistré signale une zone
réutilisable. Le serveur la valide automatiquement et permet de continuer sans
retracer ni cliquer Valider la zone. On peut encore la modifier dans le jeu.
Le contrôle serveur reste le même que pour une zone manuelle (polygone valide,
surface positive, exclusions valides et maximum cinquante points pour son contour).
En simulation, la carte fictive reste utilisée, indépendamment du terrain GPS.

### Lancer un scénario installé (14 octobre 2026)

Après Enregistrer dans le jeu, redémarrer le serveur et recharger le navigateur.
Dans les réglages d’une nouvelle salle, choisir le nom du scénario dans Scénario.
Le menu est fourni par le catalogue serveur, avec le nom saisi dans Scénario &
quêtes ; `chaos` est réservé au scénario du jeu et ne peut pas être remplacé.
Sans scénario composé, la quête installée constitue une aventure à son propre nom.

Le serveur construit le monde exclusivement avec les lieux du projet sélectionné,
puis charge les quêtes de cette aventure. Aucun lieu économique d’un autre
scénario n’est ajouté automatiquement. Les quêtes de départ
sont publiées ; les transitions publient les suivantes. La préparation détaillée
utilise le même catalogue. Changer de scénario efface les placements et exclusions
précédents, pour éviter de mélanger deux aventures.

En simulation, le serveur génère des placements dans la carte de test avec les
mêmes contrôles du moteur ; les coordonnées GPS fixes ne sont pas utilisées comme
coordonnées fictives. En GPS, les positions imposées doivent respecter le terrain
et les espacements. Le navigateur charge le monde officiel reçu du serveur.
Les parties déjà démarrées et les sauvegardes existantes conservent leur monde.

### Saisie des structures sans JSON (14 octobre 2026)

Les anciens champs JSON utilisent maintenant des tableaux de clés et valeurs.
Chaque ligne indique sa clé et son type : texte, nombre, oui/non, liste,
sous-tableau ou absent. Les objets imbriqués se remplissent dans leur sous-tableau ;
les listes proposent Ajouter une ligne et Retirer la ligne. Les clés supplémentaires
importées sont conservées, et Ajouter une clé permet de renseigner une extension.

Les bonus proposent `attack`, `defense`, `morale`, `mobility`, `command`, `health`
avec des champs numériques. Une case non renseignée n’ajoute pas de bonus au projet.
L’armée propose `units` ; une nouvelle troupe contient `id`, `ownerPlayerId`,
`typeId`, `quantity`, `rank`, `level`, conformément au modèle Unit (le grade est
`rank`, pas `grade`). Les valeurs facultatives restent absentes jusqu’à leur saisie.
Les réactions proposent `on`, `conditions`, `effects`, les enchaînements `questId`
et `on`. Les champs propres à un service peuvent être ajoutés avec leur type.

Cette interface ne valide pas toutes les règles métier : utiliser Validation avant
l’installation. Le serveur et les formats JSON exportés restent inchangés.

- `editor/` : interface, modèle d’édition, graphe, carte, fiches et ZIP.
- `server/editor/` : catalogue et validation sans mutation du jeu.
- `server/server.js` : raccordement des routes HTTP.
- `tests/quest-editor.test.js` : exports, références, géographie et API.

12 octobre 2026 : première version disponible de l’atelier PC. L’historique de
l’article du wiki est conservé par le générateur du wiki.


## Apparences et bibliothèque d’images (13 octobre 2026)

Dans PNJ, GA & objets, importer des PNG, JPEG ou WebP dans la bibliothèque commune.
Choisir ensuite l’image dans Apparence de chaque fiche de lieu, PNJ, objet ou GA.
La fiche de lieu est accessible depuis Monde & carte. Les créations de lieux et
GA dans la quête possèdent également ces choix. Chaque champ propose le visuel
habituel du jeu par défaut et un aperçu si une image est sélectionnée.

Le champ `visual` contient `icon` et `illustration` : références locales telles que
`assets/images/image-<id>.png`. Il est distinct du champ `appearance` des slots,
qui définit quand le lieu apparaît et ne décrit pas son graphisme. L’icône sert
à la carte ou à l’inventaire ; l’illustration sert à la fiche ou au portrait.
Un PNJ narratif utilise l’illustration comme portrait de sa conversation, avec
repli sur son icône, sans créer de personnage sur la carte. Un GA personnalisé
utilise une image fixe sur la carte ; les animations existantes restent le défaut.

Les fichiers sont intégrés en base64 dans `media.images` du projet éditable ;
le ZIP inclut aussi les vrais fichiers binaires dans `assets/images/`. Enregistrer
dans le jeu copie les images dans le paquet versionné. Au redémarrage, le serveur
résout les références en URL `/editor-media/editor-<paquet>/<image>` et sert les
fichiers avec leur type MIME. Les anciens paquets gardent leurs images pour les
sauvegardes qui les utilisent. Les quêtes de la bibliothèque conservent leurs
fichiers d’édition quand elles proviennent d’un paquet installé. L’import dans
un scénario fusionne les bibliothèques et refuse les identifiants conflictuels.

Limites : 2 Mo par image, 4096 × 4096 pixels, 8 Mo de fichiers dans une bibliothèque,
16 Mo par projet JSON transmis. Le serveur contrôle signature du format, dimensions,
taille et références locales. SVG et URL externes sont refusés. Retirer une image
utilisée exige d’abord de modifier ses références, y compris dans les créations
et les autres quêtes du scénario. Le quota local du navigateur peut être inférieur
à la taille du projet : dans ce cas le statut le signale, et Enregistrer permet
de télécharger le JSON ; conserver ce fichier. Les objets personnalisés nécessitent
encore leur intégration au catalogue actif avant usage en jeu.

Ces métadonnées changent la présentation, pas la progression, le combat, le GPS
ou les permissions. Les valeurs sont conservées par les modèles et sauvegardes.

14 octobre 2026 — correction de l’isolation des scénarios : le catalogue de
conception commun ne détermine plus les lieux de la partie choisie. Les placements
officiels du serveur sont utilisés directement en simulation. Les sauvegardes
existantes ne sont pas migrées ; tester dans une nouvelle partie.

## Coopération et événements stratégiques (20 octobre 2026)

20 octobre 2026 : l’atelier propose les modes de quête solo, ouvert, avec leader et groupe physique, ainsi que les mécaniques d’action simultanée, rôles complémentaires, relais et contribution collective. La section Événements stratégiques prépare un conseil physique avec votes séparés, au moins trois stratégies, leurs durées, défis conditionnels, positions et phases. Les modèles sont réutilisables en blocs du scénario avec source et sorties par résultat. Les invitations sont prévues par messager GA différé et les adversaires sont simulés sans GA. Ces données sont conservées dans le projet et exportées dans strategic-events.json ; elles ne sont pas encore exécutées en partie. L’installation de ces projets est refusée jusqu’au raccordement serveur des règles multijoueurs et tactiques. Les règles des parties existantes ne changent pas.

Dans Fiche de quête, choisir le mode, les effectifs et l’admission en cours. Les invitations utilisent ga-messenger. Sur chaque action, choisir la mécanique coopérative. Les anciens modes solo/equipe/competition restent conservés pour compatibilité.

Dans Événements stratégiques, créer le modèle, nommer les trois stratégies et régler leur préparation en secondes. Les tableaux structurés permettent de renseigner défis (référence questId/actionId), coût strategyCost et prérequis requirements : class, unit, authority, command, resource, equipment, improvement, avec id et minimum. Les positions référencent les lieux logiques du monde. Les phases décrivent informations, ordres et fenêtres ; leur contenu reste une spécification narrative, sans interprétation serveur à ce stade.

Utiliser comme bloc ajoute une occurrence dans Scénario & quêtes : choisir la quête précédente et les quêtes suivantes selon les issues. Une source vide représente le début ; une sortie vide termine la branche. Les blocs sont des références de conception, pas des transitions exécutables. Les votes, crédits, déplacements des messagers, présence physique, contributions, timing et récompenses nécessitent leur moteur serveur avant lancement.

## PNJ personnalisés de quête (25 octobre 2026)

Dans **PNJ, GA & objets**, ajouter ou ouvrir une fiche PNJ puis cliquer sur
**Ouvrir l’éditeur de PNJ**. L’éditeur de personnages s’ouvre dans un onglet.
**Enregistrer ce PNJ dans la quête** conserve ses pièces, couleurs, proportions,
réglages de calques et cadrage dans cette fiche du projet. Rouvrir le personnage
reprend ces réglages. Fermer sans enregistrer laisse la fiche inchangée.
Le brouillon autonome de l’éditeur de portraits ne remplace pas celui d’un PNJ.

Renseigner le lieu et le dialogue associé, en utilisant l’identifiant du PNJ
comme interlocuteur (`speakerId` et `dialogue.qui`). Tous les dialogues de ce
personnage dans le paquet utilisent son portrait personnalisé. Celui-ci est
prioritaire sur son illustration importée. Les PNJ restent propres au projet ;
les projets d’un scénario composé partagent leur catalogue de personnages.
Enregistrer le projet JSON ou installer avec **Enregistrer dans le jeu** conserve
les personnages ; l’export inclut aussi leurs réglages dans `npcs.json`.
Après installation et redémarrage du serveur, les conversations utilisent les
mêmes calques et réglages que l’aperçu. Cela ne crée pas de combattant sur la carte
et ne change aucune règle de progression, de combat ou de position.

## Schémas, proposition et action Modifier — 25 octobre 2026

25 octobre 2026 : le scénario affiche un schéma de quêtes déplaçables et reliables par Réussite, Échec ou Abandon, avec plusieurs départs ou des quêtes indépendantes. Chaque quête affiche Proposition de quête pour ouvrir sa fiche et ses conditions d’accès facultatives ; les traits vers les racines sont une aide visuelle sans action fictive exportée. Les références connues se choisissent par noms dans des menus, et le panneau de droite est redimensionnable. Modifier est une nouvelle action serveur automatique, appliquée une fois au déblocage. Elle propose ressources, objets non équipés du catalogue actif, XP et statistiques de base du héros ; genre du portrait pour son apparence ; images des lieux et GA ; retrait d’un GA pour l’existence. Les aptitudes, la capacité des bagages, la propriété des lieux et la suppression des héros ou lieux restent à développer.

| Cible | Propriété | Opération et limite |
| --- | --- | --- |
| Héros acteur | Ressource | Ajouter ou retirer au plus le disponible |
| Héros acteur | Objet transporté | Donner ou retirer des objets non équipés du catalogue actif |
| Héros acteur | XP | Accorder un entier positif |
| Héros acteur | Statistique de base | Variation conservant des valeurs valides |
| Héros acteur | Apparence | Genre du portrait masculin ou féminin |
| Lieu ou GA | Apparence | Icône et illustration du projet |
| GA | Existence | Retirer ; utiliser une création pour le faire apparaître |

Le sac reste soumis à sa capacité. Modifier est exécuté par le serveur lorsque
son bloc devient actif et ne se répète pas après accomplissement. Les montants
proviennent du scénario et ne sont pas transmis par le joueur. Une erreur de
modification reste transactionnelle. Le bloc Proposition de quête ne crée aucune
action supplémentaire ni condition obligatoire : il ouvre les données existantes.

Dans Scénario & quêtes, cliquer une sortie puis une entrée crée un enchaînement.
Les transitions publient la suite sans l’accepter pour le joueur. Une quête sans
lien doit être cochée Départ pour être accessible dès le lancement. Les positions
des blocs sont conservées dans les données d’édition. Les références importées
inconnues restent visibles dans les menus et sont contrôlées à la validation.
La bordure gauche du panneau de propriétés se glisse ; les flèches du clavier
la règlent également. Les noms et nouveaux identifiants restent des champs libres.

Exemple : une convocation acceptée mène à Parler → Accepter / Refuser. Accepter
termine en réussite et publie la vraie mission suivante ; Refuser mène à Modifier
→ Héros → Ressource → gold → Retirer → 20 puis à une fin d’échec. Le refus natif
d’une offre avant acceptation n’est pas encore disponible.
