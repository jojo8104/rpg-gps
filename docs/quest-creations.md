# Créations de quête : lieux et groupes autonomes

Depuis le 18 octobre 2026, les modèles gobelins, orcs, loups, ours, sangliers et cerfs sont accessibles dans **PNJ, GA & objets**. Chaque fiche porte une référence `archetypeId` et un alignement `enemy`, `neutral` ou `ally`, conservés et validés à la création par le serveur. Les modèles sont neutres par défaut et ne contiennent aucune troupe implicite. Voir [les sprites et leur utilisation](enemy-map-sprites.md). L’apparence ne change pas les règles de terrain.

Disponible depuis le 13 octobre 2026. La quête sérialisée décide du déclencheur ;
le moteur serveur crée les entités. Le navigateur édite et transmet les définitions.
Les services du jeu restent autorisés à créer des GA pour leurs règles propres.
Les anciens scénarios et quêtes spécialisés ne sont pas supprimés par ce changement :
leur conversion et leur retrait doivent se faire progressivement, avec leurs tests.

Dans `prerequisites`, le type `ga` contient `id`, `when`, `scope`, `properties`,
`locationId` facultatif, `belongsToLocation` et `dependsOn` (liste d’identifiants).
`properties` est une fiche AutonomousGroup : type, owner, factionId, behavior,
army, mission, etc. Une armée contient des Unit valides ; un comportement passif
ne signifie pas allié. Faction et propriétaire déterminent les règles existantes
de contrôle et de combat ; aggressive déclenche les comportements autonomes existants.

```json
{
  "id": "gardes", "type": "ga", "when": "accepted",
  "locationId": "camp", "belongsToLocation": true,
  "properties": {
    "type": "army", "factionId": "bandits", "behavior": "passive",
    "army": { "units": [{
      "id": "gardes-milice", "ownerPlayerId": "bandits",
      "typeId": "militia", "quantity": 3
    }] }
  }
}
```

Le camp doit être un lieu existant ou une création `lieu`/`marqueur` de la même
quête. Le lieu créé est automatiquement une dépendance ; le fichier peut présenter
le GA avant le camp. Le GA reprend sa position, mémorise `originLocationId` et,
si `belongsToLocation` vaut true, reçoit `owner: {kind: "location", id: ...}`.
Il dépend alors des règles de contrôle du lieu. Sans appartenance, fournir `owner`
dans sa fiche ; le lieu n’est que son origine. Sans lieu, fournir une position.

Le rattachement ne transforme pas le groupe en garnison interne du lieu et ne
duplique pas les unités dans `location.garrison`. Le GA reste une entité autonome.
Le présent changement n’ajoute ni disparition en cascade ni transfert automatique
des unités à la suppression du lieu.

Déclencheurs : `accepted` par défaut, `published` pour une création commune,
ou événement officiel. `when: "ActionCompleted"`, `actionId` et éventuellement
`output` permettent de créer le GA après une action choisie, par exemple une arrivée.
Une dépendance doit déjà être créée au déclenchement ; sinon toute la transaction
est annulée. Les cycles, dépendances absentes et dépendances communes vers privées
sont refusés. Une création publiée exige `scope: "world"`.

Sans portée commune, lieu et groupe portent un identifiant préfixé par l’instance.
Deux joueurs peuvent ainsi avoir chacun leurs gardes. Une action `Combattre` garde
`qui: "gardes"` dans le JSON ; le serveur retrouve le groupe de cette instance
et exige une preuve officielle de combat contre lui. Le combat d’une autre
instance ne valide pas l’action. Les créations communes sont réutilisées.

Les limites du terrain et les espacements des lieux sont contrôlés au serveur.
Un échec restaure le monde et la progression. Les groupes et leur rattachement
sont enregistrés dans les sauvegardes du jeu.

Historique : 13 octobre 2026 — création générique de GA, dépendances de lieu,
appartenance et enregistrement des paquets depuis l’éditeur. Première version.

## Apparence des créations (14 octobre 2026)

Les propriétés d’un lieu ou d’un GA peuvent contenir `visual.icon` et
`visual.illustration`. Ces références proviennent de la bibliothèque d’images
de l’éditeur ; le paquet installé contient les fichiers et le serveur résout
leurs URL. Elles sont conservées dans les sauvegardes. Elles changent uniquement
la présentation : les dépendances, l’apparition, l’appartenance au lieu et les
règles de combat restent identiques. Voir `docs/quest-editor.md` pour les formats,
limites et étapes d’import.
