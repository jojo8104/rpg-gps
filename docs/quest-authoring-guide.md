# Concevoir une quête : template, champs et actions

Documentation du format actuellement exécuté par le serveur, vérifiée contre
`app/js/core/quest.js`, `app/js/core/quest-engine.js` et
`server/quests/quest-service.js`. Les sorties nommées et liens conditionnels sont
maintenant disponibles ; l'éditeur visuel reste à construire.

## 1. Template de fiche

Cet exemple décrit une collecte suivie d'une livraison. Les lieux doivent exister
dans le monde ou correspondre aux identifiants logiques du scénario. Le stock
créé est réservé à cette instance ; les lieux ne sont pas recréés.

```json
{
  "schemaVersion": 1,
  "id": "exemple-livraison",
  "title": "Livrer les rations",
  "description": "Collectez cinq rations puis livrez-les au fort.",
  "type": "simple",
  "locationSlotId": "capital",
  "giverNpcId": "intendant",
  "interactionLabel": "Recevoir la mission",
  "dialogueId": null,
  "participationModes": ["solo", "equipe"],
  "publicationCondition": null,
  "accessConditions": [
    { "type": "locationPlaced", "locationId": "capital" },
    { "type": "locationPlaced", "locationId": "village" },
    { "type": "locationPlaced", "locationId": "fort" }
  ],
  "prerequisites": [
    {
      "id": "stock-rations",
      "type": "ressource",
      "resource": "food",
      "quantity": 5,
      "locationId": "village",
      "when": "accepted"
    }
  ],
  "actions": [
    {
      "id": "collecter",
      "action": "Prendre",
      "interaction": "Prendre cinq rations",
      "origine": "village",
      "quoi": "food",
      "combien": 5,
      "requires": [],
      "rewards": []
    },
    {
      "id": "livrer",
      "action": "Donner",
      "interaction": "Livrer cinq rations",
      "destinataire": "fort",
      "quoi": "food",
      "combien": 5,
      "requires": ["collecter"],
      "rewards": []
    }
  ],
  "events": [],
  "outcomes": {
    "success": [
      { "type": "xp", "amount": 50, "recipient": "participants" },
      { "type": "narration", "text": "Les rations sont livrées." }
    ],
    "failure": [],
    "abandoned": []
  },
  "transitions": []
}
```

Ce template est une base à adapter, pas une quête automatiquement installée.
Ses identifiants de lieux et de PNJ sont des exemples.

## 2. Champs de la fiche

| Champ | Rôle et valeur par défaut |
| --- | --- |
| `schemaVersion` | Version du format, uniquement `1` actuellement ; défaut `1`. |
| `id` | Identifiant unique de quête, texte obligatoire. |
| `title` | Titre affiché, texte obligatoire. |
| `description` | Présentation, défaut chaîne vide. |
| `type` | `simple` pour une quête à actions ; défaut `simple`. Les composites ne sont pas exécutables dans ce moteur. |
| `locationSlotId` | Lieu proposant la quête, défaut `null`. |
| `giverNpcId` | Identifiant du donneur, défaut `null`. |
| `interactionLabel` | Libellé de proposition, défaut `null`. |
| `dialogueId` | Dialogue de proposition, défaut `null` ; les dialogues sont définis séparément. |
| `participationModes` | Liste non vide parmi `solo`, `equipe`, `competition` ; défaut `["solo"]`. |
| `publicationCondition` | Une condition permettant la publication, défaut `null` (aucune). |
| `accessConditions` | Conditions toutes nécessaires pour accepter, défaut `[]`. |
| `prerequisites` | Créations liées à la quête, défaut `[]` ; ce ne sont pas les conditions d'accès. |
| `actions` | Actions de la mission, défaut `[]` ; une nouvelle quête simple à actions doit en contenir au moins une. |
| `links` | Liens conditionnels entre sorties et actions, défaut `[]` ; voir section 9. |
| `events` | Réactions aux événements officiels, défaut `[]`. |
| `outcomes` | Effets de `success`, `failure`, `abandoned` ; listes vides par défaut. |
| `transitions` | Publication des quêtes suivantes selon le résultat, défaut `[]`. |

Le constructeur conserve aussi les champs historiques ou de composition suivants :
`natures`, `conditions`, `locationSlots`, `offer`, `steps`, `initialStepId`,
`childQuestIds`, `completionPolicy`, `scenes`, `presentation`.
Les listes sont vides par défaut ; `offer` vaut `null`, `presentation` vaut `{}`,
`completionPolicy` vaut `all` (valeurs reconnues `all` et `any`) et
`initialStepId` vaut l'identifiant de la première étape, sinon `null`.
Ces champs ne doivent pas être utilisés pour inventer des embranchements dans
le moteur à actions : les anciennes étapes ne sont pas exécutées par ce moteur.
En particulier, `completionPolicy: "any"` ne permet pas de terminer une quête
à actions après une seule branche.

## 3. Fiche d'une action

| Champ commun | Rôle |
| --- | --- |
| `id` | Texte obligatoire, unique dans la quête. |
| `action` | Un des sept noms exacts ci-dessous. |
| `requires` | Liste des actions devant toutes être terminées ; absence équivalente à `[]`. |
| `interaction` | Libellé du bouton proposé au lieu de l'action, si nécessaire. |
| `assignedPlayerId` | Facultatif : seul ce joueur peut accomplir l'action. |
| `rewards` | Effets appliqués une seule fois à la réussite ; absence équivalente à `[]`. |
| `outputs` | Noms des sorties possibles ; défaut implicite `["success"]`. |
| `join` | Pour les liens entrants : `any` par défaut, ou `all`. |
| `terminalOutcome` | Fin explicite facultative : `success` ou `failure`. |

Une action sans dépendance est active à l'acceptation. Les autres sont verrouillées
jusqu'à la réussite de toutes leurs dépendances et la sélection des liens requis.
Une action ciblée par un lien est verrouillée au départ. Les références manquantes,
l'auto-dépendance et les cycles sont refusés. `timer` et `pass` sont interdits.
Une action terminée ne se rejoue pas. Sans fin explicite, toutes les actions
doivent être terminées ou écartées (`skipped`) pour réussir la quête.

### Atteindre

```json
{ "id": "arriver", "action": "Atteindre", "lieu": "fort" }
```

`lieu` est obligatoire. Le serveur vérifie la présence officielle au lieu
visible et accessible. Aucun objet n'est transféré par cette action.

### Parcourir

```json
{ "id": "marcher", "action": "Parcourir", "distance": 500 }
```

`distance` est un nombre strictement positif en mètres. Le serveur compte la
distance officielle depuis l'activation de l'action, pas depuis le début de la
partie. Cette action ne crée ni ne place un lieu à elle seule.

### Prendre

```json
{
  "id": "collecter", "action": "Prendre",
  "interaction": "Prendre cinq rations",
  "origine": "village", "quoi": "food", "combien": 5
}
```

`origine`, `quoi` et `combien` sont obligatoires. `origine` est un lieu ; `quoi`
est l'identifiant de la ressource ou de l'objet ; `combien` est un entier positif.
Le serveur vérifie présence, accès, stock et capacité, puis transfère la quantité.
Cela peut représenter la récupération d'un indice ou d'un personnage transportable.

### Donner

```json
{
  "id": "livrer", "action": "Donner",
  "interaction": "Remettre cinq rations",
  "destinataire": "fort", "quoi": "food", "combien": 5,
  "requires": ["collecter"]
}
```

`destinataire`, `quoi` et `combien` sont obligatoires. Le destinataire technique
est un lieu, même si le récit décrit une remise à un PNJ. Le serveur vérifie
présence, droit de dépôt et quantité transportée, puis effectue la livraison.

### Parler

```json
{
  "id": "recevoir-ordre", "action": "Parler", "lieu": "capital",
  "interaction": "Parler à l'intendant",
  "dialogue": { "id": "ordre", "qui": "intendant", "goal": "ordre-recu" }
}
```

`dialogue.qui` est obligatoire ; `dialogue.goal` est obligatoire sans `outputs`.
Le service a aussi besoin de `dialogue.id` pour retrouver la conversation.
`lieu` permet de proposer le bouton au bon endroit ; le lieu du dialogue est
celui contrôlé par le serveur. Lire le texte ne suffit pas : un choix doit
atteindre le `goal` attendu.

Exemple de catalogue de dialogues séparé :

```json
{
  "ordre": {
    "speakerId": "intendant",
    "locationId": "capital",
    "initialNodeId": "accueil",
    "nodes": [
      {
        "id": "accueil",
        "lines": [ { "speaker": "Intendant", "text": "Le fort manque de vivres." } ],
        "choices": [
          { "id": "accepter", "label": "Je m'en charge", "goal": "ordre-recu" }
        ]
      }
    ]
  }
}
```

Un choix possède `id`, `label`, éventuellement `conditions`, puis un `goal`
ou un `nextNodeId` pour continuer la conversation. Avec `outputs`, un choix dont
le `goal` est une sortie déclarée termine l'action avec cette sortie. Sans
`outputs`, le dialogue conserve la vérification du seul `dialogue.goal` historique.

### Construire

```json
{
  "id": "ameliorer", "action": "Construire", "lieu": "fort",
  "goal": { "improvementId": "identifiant-amelioration", "level": 2 }
}
```

`lieu` et l'objet `goal` sont obligatoires. Utiliser un identifiant réel du
catalogue d'améliorations. Trois formes de résultat sont interprétées :

- `goal.improvementId` avec `goal.level` (défaut `1`) : amélioration au niveau minimal demandé.
- `goal.type` : le lieu possède le type demandé.
- `goal.level` seul : le lieu possède au moins ce niveau.

Utiliser une seule forme : le moteur donne priorité à l'amélioration, puis au
type, puis au niveau. L'action vérifie présence, droit de construire et état
officiel obtenu ; elle ne lance pas elle-même un chantier.

### Combattre

```json
{ "id": "vaincre", "action": "Combattre", "qui": "identifiant-cible" }
```

`qui` est obligatoire : lieu source de la bataille, héros adverse ou groupe
autonome. Sans `outputs`, le serveur exige une bataille terminée et gagnée par l'équipe du héros,
contre cette cible, terminée après l'activation de l'action et non déjà utilisée
comme preuve d'une autre action de cette instance. L'action ne lance pas le combat.
Avec `outputs`, les noms autorisés sont `victory`, `defeat`, `draw`. Le résultat
officiel sélectionne la sortie correspondante si elle est déclarée ; sinon
l'action reste en cours. Une défaite reconnue termine l'action avec la sortie
`defeat`, sans signifier automatiquement l'échec de toute la quête.

## 4. Conditions disponibles

| `type` | Autres champs | Signification |
| --- | --- | --- |
| `locationPlaced` | `locationId` | Placement confirmé du lieu. |
| `locationVisible` | `locationId` | Lieu visible pour le joueur. |
| `questCompleted` | `questId` | Quête terminée par le participant. |
| `actionCompleted` | `actionId` | Action terminée dans l'instance courante. |
| `hasResource` | `resource`, `amount` | Quantité disponible sur le héros. |
| `hasItem` | `itemId`, `amount` (défaut `1`) | Quantité transportée dans les bagages. |
| `flag` | `path`, `equals` | Valeur du monde égale à celle attendue. |
| `territoryOccupation` | `minimumRatio` | Taux d'occupation de l'équipe au moins égal à ce nombre de `0` à `1`. |

Les listes de conditions exigent toutes leurs entrées. `actionCompleted` nécessite
une instance : l'utiliser dans une réaction ou transition de cette instance,
pas comme condition de publication initiale. Placement et visibilité sont distincts ;
ne pas exiger une visibilité initiale pour une mission de découverte.

## 5. Créations : prerequisites

Chaque entrée contient `id` et `type`. Les champs spécifiques sont :

| Type | Champs |
| --- | --- |
| `ressource` | `resource`, `quantity` (défaut `1`), `locationId`. |
| `item` | `itemId`, `quantity` (défaut `1`), `locationId`. |
| `lieu` ou `marqueur` | `properties` : données valides de Location, dont la position explicite. |

`when` vaut `accepted` par défaut ; il peut être `published` ou un nom
d'événement officiel. `scope: "world"` rend la création commune au monde ;
sinon elle appartient à l'instance. Un stock créé à `published` exige `world`.
Les stocks réservés sont distincts du stock économique ordinaire.

Les lieux libres doivent respecter la zone et l'espacement. Leur placement
différé et leur raccordement au contrat de cycle de vie restent prévus.
Pour un lieu existant, référencer son identifiant dans les actions et conditions.
Pour l'apparition et le retrait des lieux du scénario, consulter
`scenario-map-definition.md` : ces règles appartiennent au scénario.

## 6. Récompenses et conséquences

Les effets suivants sont utilisables dans `rewards`, les `outcomes` et les réactions :

| `type` | Champs |
| --- | --- |
| `xp` | `amount`. |
| `resource` | `resource`, `amount`. |
| `item` | `itemId` du catalogue, `amount` (défaut `1`). |
| `revealLocation` | `locationId`. |
| `flag` | `path`, `value`. |
| `narration` | `text`. |

Les quantités sont positives. Par défaut l'acteur reçoit l'effet ;
`recipient: "participants"` l'applique à chaque participant. Une récompense
de 50 XP aux participants donne 50 XP à chacun, pas un total à partager.
Un effet `flag` modifie une seule fois l'état commun du monde.

## 7. Réactions aux événements

```json
{
  "id": "reveler-fort",
  "on": "ActionCompleted",
  "actionId": "collecter",
  "conditions": [],
  "repeat": false,
  "effects": [
    { "type": "revealLocation", "locationId": "fort", "recipient": "participants" }
  ]
}
```

`id` et `on` sont obligatoires. `actionId` est un filtre facultatif sur une
action existante ; `output` filtre facultativement une sortie déclarée de cette
action (exige `actionId`) ; `conditions` doivent toutes être remplies ; `effects`
contient les conséquences. Une réaction est unique par défaut. `repeat: true`
autorise plusieurs événements, chaque identifiant officiel étant traité une fois.
Le moteur émet notamment `QuestAccepted`, `ActionCompleted` et `QuestFinished`.
Les autres événements doivent réellement être produits par les services serveur.
Les créations à `published` utilisent ce moment de cycle de vie ; ne pas en
déduire l'existence d'une réaction `QuestPublished`.

Dans les réactions uniquement, `{"type":"failQuest"}` termine l'instance en
échec et applique `outcomes.failure`. Le navigateur ne peut pas fabriquer une
preuve de victoire ou un événement officiel pour valider un objectif.

## 8. Enchaînements de quêtes

```json
{ "questId": "mission-suivante", "outcome": "success", "conditions": [] }
```

`questId` est obligatoire. `outcome` filtre `success`, `failure` ou `abandoned` ;
sans ce filtre, tous les résultats sont concernés. Les conditions et la condition
de publication de la quête suivante doivent être satisfaites. La transition
publie la prochaine quête ; elle ne l'accepte pas automatiquement.

En équipe la progression est partagée. En compétition la première instance
victorieuse gagne et les autres instances concurrentes actives échouent.
Les mutations, preuves et récompenses sont validées et sauvegardées par le serveur,
avec les mêmes commandes en GPS et en simulation.

## 9. Sorties nommées et liens conditionnels disponibles

Disponible aujourd'hui :

```text
Collecter -> Livrer
```

`Livrer.requires = ["collecter"]` veut dire : terminer Collecter avant Livrer.

```text
Collecter au village A --+
                        +-> Livrer au fort
Collecter au village B --+
```

`Livrer.requires = ["collecter-a", "collecter-b"]` veut dire : terminer A
ET B avant Livrer. Les deux collectes peuvent être faites dans n'importe quel
ordre. Ce sont deux objectifs obligatoires, pas un choix de chemin.

Une quête peut désormais choisir une branche selon un résultat officiel :

```text
Choisir une mission -> soit Livrer des vivres -> Réussite
                    -> soit Explorer le camp -> Réussite
```

Exemple complet de fiche à deux chemins et jonction commune :

```json
{
  "id": "choisir-mission",
  "title": "Une mission au choix",
  "actions": [
    {
      "id": "choisir", "action": "Parler", "lieu": "capital",
      "interaction": "Choisir une mission",
      "dialogue": { "id": "choix-mission", "qui": "intendant" },
      "outputs": ["livraison", "exploration"]
    },
    { "id": "livrer", "action": "Donner", "destinataire": "fort", "quoi": "food", "combien": 5, "interaction": "Livrer les vivres" },
    { "id": "explorer", "action": "Atteindre", "lieu": "camp" },
    { "id": "retour", "action": "Atteindre", "lieu": "capital", "join": "any", "terminalOutcome": "success" }
  ],
  "links": [
    { "id": "choix-livraison", "from": "choisir", "output": "livraison", "to": "livrer" },
    { "id": "choix-exploration", "from": "choisir", "output": "exploration", "to": "explorer" },
    { "id": "retour-livraison", "from": "livrer", "output": "success", "to": "retour" },
    { "id": "retour-exploration", "from": "explorer", "output": "success", "to": "retour" }
  ]
}
```

Il faut fournir séparément le dialogue `choix-mission`, avec deux choix dont les
`goal` valent `livraison` et `exploration`, les lieux existants et les vivres à
livrer (transportés ou récupérés dans une action préalable).

| Champ de lien | Signification |
| --- | --- |
| `id` | Identifiant unique du lien dans la quête. |
| `from` | Identifiant de l'action source. |
| `output` | Sortie déclarée de la source ; `success` par défaut pour les actions ordinaires. |
| `to` | Identifiant de l'action à débloquer. |
| `conditions` | Liste facultative de conditions serveur, toutes nécessaires. |

Les conditions sont évaluées une seule fois à la résolution de la source, après
ses récompenses et réactions ActionCompleted. Le lien devient `selected` ou
`discarded`, puis cette décision est sauvegardée ; un changement ultérieur de
ressource ou de flag ne rouvre pas le lien.

`join: "any"` active la cible dès qu'un lien entrant est sélectionné.
`join: "all"` attend tous les liens entrants sélectionnés. Dans les deux cas,
les dépendances `requires` doivent aussi être terminées. Si une dépendance est
écartée, ou si les liens ne peuvent plus satisfaire la jonction, la cible devient
`skipped` : sans bouton, sans récompense, sans bloquer la fin. L'exclusion se
propage jusqu'aux descendants. Les cycles, y compris entre liens et requires,
et les sorties inconnues sont refusés.

Un choix exclusif utilise plusieurs sorties distinctes : une seule est obtenue.
Plusieurs liens d'une même sortie peuvent activer des objectifs parallèles.
`any` ne supprime pas les autres chemins déjà sélectionnés : ils restent requis
pour la fin automatique. `terminalOutcome` termine explicitement la quête à la
résolution de l'action et écarte les objectifs restants ; une action de fin ne
peut pas avoir de liens sortants. Si tous les liens conditionnels sont refusés,
la fin automatique peut réussir dès que les autres actions sont résolues :
prévoir un chemin de repli ou des fins explicites pour un autre résultat.

Les récompenses d'action s'appliquent à toute résolution reconnue, y compris
`defeat` pour un combat qui la déclare. Pour réserver une récompense à la victoire,
utiliser une réaction ActionCompleted avec `actionId` et `output: "victory"`.
Le client ne choisit jamais librement sa sortie : il transmet un choix de dialogue
ou une référence de bataille ; le serveur vérifie le résultat.

Les quêtes sans ces nouveaux champs restent compatibles, y compris leurs
sauvegardes sans liens. Le journal indique les chemins écartés. L’atelier web
disponible à `/editor/` produit ce JSON après validation serveur ; sa disposition
de blocs reste séparée des règles. Voir [le guide de l’atelier](quest-editor.md).

## 10. Vérification avant intégration

- Vérifier les identifiants uniques, les sept noms d'action et les quantités.
- Vérifier les lieux officiels, les dialogues, les objets et les améliorations référencés.
- Vérifier que toutes les dépendances peuvent être accomplies sans cycle.
- Vérifier que chaque action possède un parcours réalisable, les conditions de liens, les jonctions et les fins ; sans fin explicite, toutes les actions doivent être terminées ou écartées.
- Vérifier présence, transport, récompenses et reprise avec les commandes serveur.

Références concrètes : `data/quests/royal-fort-supply.json`, ses dialogues et
`data/quests/missing-prospectors.json` si présent dans le catalogue courant.
Les tests `missing-prospectors.test.js` et `quest-scenario-locations.test.js`
couvrent notamment le parcours serveur et la résolution des lieux.


## Créations de GA et enregistrement (13 octobre 2026)

Le moteur générique accepte désormais les créations `ga`, leurs dépendances et
leur appartenance à un lieu. Voir [Créations de quête](quest-creations.md).
L’éditeur peut enregistrer les définitions et le catalogue serveur ; un redémarrage
puis une nouvelle partie sont requis. Les anciens modules doivent encore être migrés.
