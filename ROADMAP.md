# Roadmap

## Révision prioritaire — Battle temps réel et interactions Map événementielles

Cette révision remplace la tactique sur grille et les interactions manuelles de
proximité. Le téléphone accompagne l'action physique selon le parcours
`carte → événement → décision → combat`, sans imposer de microgestion spatiale.

### Principes non négociables

- Les règles du jeu restent indépendantes du DOM.
- GPS, QR et carte produisent des événements ; ils ne décident jamais de leurs
  conséquences narratives ou ludiques.
- `BattleEngine` fait évoluer la simulation, `BattleState` porte l'état
  sérialisable et `BattleUI` ne fait que l'afficher et transmettre des intentions.
- Les trois lignes sont une abstraction tactique, pas une grille de déplacement.
- Le moteur doit pouvoir être testé avec des ticks déterministes, sans navigateur.

## 1. Remplacer le Battle tactique manuel

Supprimer de la logique exposée au joueur et de l'interface :

- la grille de déplacement ;
- la sélection par boutons d'une ligne ;
- les déplacements case par case ;
- l'orientation des unités ;
- la zone de commandement visible ;
- le placement manuel des renforts ;
- la validation et l'avancement manuel des tours.

Le combat oppose au maximum trois héros à trois héros. Chaque équipe possède trois
lignes abstraites. Chaque ligne accueille un héros et les unités qui lui sont
affectées. Une unité peut se trouver en réserve, en renfort ou sur la ligne d'un
héros, mais ne possède plus de coordonnées de grille.

Un héros qui rejoint physiquement une bataille en cours prend automatiquement la
première ligne libre de son équipe. Ses unités arrivent avec lui selon le délai et
les règles de renfort. L'arrivée échoue proprement si les trois lignes sont
occupées.

### Critères d'acceptation

- Aucune API publique de Battle ne demande de case, d'orientation ou de bord de
  grille.
- Une équipe ne peut jamais avoir plus de trois héros actifs dans une bataille.
- L'affectation d'un héros de renfort à une ligne libre est automatique et
  déterministe.
- L'état complet d'une bataille peut être sérialisé sans donnée DOM.

## 2. Introduire BattleState et BattleEngine

`BattleState` contient uniquement des données simples et sérialisables :

- statut, horodatages, équipes et trois lignes par équipe ;
- héros, unités, réserves et renforts attendus ;
- ordre courant, cible, progression abstraite, moral et cooldowns ;
- journal des événements, vainqueur et conséquences à appliquer au monde.

`BattleEngine` reçoit un `BattleState` et le fait évoluer par ticks. Une fois le
combat démarré, il résout automatiquement :

1. l'arrivée des renforts ;
2. l'acquisition ou le changement de cible ;
3. le déplacement abstrait vers la portée utile ;
4. les attaques et dégâts ;
5. la mort, la perte de moral et la retraite ;
6. la poursuite éventuelle ;
7. la victoire ou la défaite.

Le moteur ne dépend ni d'une cadence d'affichage ni de `setInterval`. Le contrôleur
de l'application choisit quand appeler `tick(deltaMs)`. Les tests utilisent une
horloge et, si nécessaire, une source aléatoire injectées.

### Ordres tactiques

Les ordres décrivent un comportement automatique et non une suite de mouvements :

- `charge` : engagement rapide et offensif ;
- `defense` : maintien de ligne et bonus défensif ;
- `harass` : maintien à portée et repli sous pression ;
- `flank` : tentative de contournement abstraite ;
- `retreat` : désengagement et retraite ;
- `support` : priorité aux alliés et cibles de leur ligne.

Le commandement du héros reste abstrait. Il peut modifier la capacité d'unités,
le délai de changement d'ordre, l'arrivée des renforts, le moral, la
réorganisation des lignes et l'accès aux tactiques. Il ne crée pas de rayon à
surveiller sur la carte de bataille.

### Critères d'acceptation

- `start()` puis des appels à `tick(deltaMs)` suffisent pour terminer un combat.
- Les unités acquièrent, poursuivent et remplacent leurs cibles sans action UI.
- Un ordre modifie le comportement observable d'une unité lors des ticks.
- Deux simulations recevant le même état, la même horloge et la même source
  aléatoire produisent le même résultat.

## 3. Faire du drag & drop l'interaction principale de BattleUI

Avant ou pendant le combat, le joueur glisse une carte d'unité vers :

- la ligne d'un de ses héros pour l'y affecter ;
- la réserve ou la zone de renfort pour la retirer temporairement d'une ligne ;
- une autre ligne pour réaffecter son axe d'avancée.

Chaque type d'unité possède son propre comportement, `advance` par défaut. Aucun
ordre tactique n'est demandé au joueur pendant le prototype. Le drag & drop exprime
une intention de déploiement. `BattleUI` appelle une commande du moteur et
réaffiche le nouvel état ; elle ne déplace pas elle-même une unité et ne calcule
aucune règle. Prévoir une alternative tactile accessible sans geste précis.

Une unité qui atteint le bout d'une ligne sans adversaire ne change pas de ligne :
elle attaque directement le héros ennemi actif le plus proche avec un multiplicateur
de dégâts configurable. S'il ne reste aucun héros, Battle se termine immédiatement
et déclenche la gestion de fin de combat ; il n'existe pas de camp à attaquer.

### Critères d'acceptation

- Aucun bouton de validation de tour ou de déplacement n'est présent.
- La navigation vers les autres écrans est verrouillée tant que Battle est active.
- Seules la résolution du combat, la reddition ou la sortie physique confirmée de
  la zone peuvent terminer Battle et libérer la navigation.
- La vue présente trois confrontations héros contre héros, les unités associées,
  les réserves et les renforts attendus.
- Chaque interaction UI correspond à une commande testable du moteur.

## 4. Ajouter LocationEngine

`LocationEngine` reçoit les positions normalisées des adaptateurs GPS ou de la
carte fictive et suit, pour chaque héros et chaque zone, les états :

`OUTSIDE → ENTERED → INSIDE → EXITED → OUTSIDE`

Il émet notamment `LocationEntered` et `LocationExited`. Rester dans une zone ne
réémet pas `LocationEntered`. Un cooldown configurable peut empêcher une nouvelle
entrée de relancer immédiatement certaines interactions après une sortie.

Les zones qui se chevauchent sont suivies indépendamment. L'incertitude GPS doit
pouvoir être filtrée afin d'éviter une alternance entrée/sortie au bord d'une zone.

### Critères d'acceptation

- Une série de positions à l'intérieur d'une zone ne produit qu'une entrée.
- Une sortie confirmée produit exactement un événement de sortie.
- Une nouvelle entrée respecte le cooldown configuré.
- Le moteur fonctionne avec des positions GPS réelles comme avec la carte fictive.

## 5. Ajouter InteractionEngine et Encounter

`InteractionEngine` consomme les événements de lieu et de QR, puis consulte le
scénario, les quêtes et les règles du jeu pour produire une interaction : village,
exploration, progression de quête ou rencontre.

Une présence ennemie crée d'abord un `Encounter`, distinct de `Battle` :

- un ennemi passif propose `combattre` ou `éviter` ;
- un ennemi agressif peut décider d'attaquer selon le scénario, la faction, la
  réputation, la puissance relative et les événements précédents ;
- une attaque automatique émet une courte notification avant de créer Battle.

Ni le GPS, ni le QR, ni `MapView` ne connaissent ces règles. Ils transmettent des
positions ou des événements techniques au moteur.

### Critères d'acceptation

- Entrer dans un lieu ouvre automatiquement l'interaction produite, sans clic sur
  son marqueur.
- Une rencontre passive ne crée pas Battle avant le choix `combattre`.
- Une rencontre agressive peut créer Battle automatiquement.
- Les décisions d'agressivité sont testables sans carte et sans navigateur.

## 6. Chaîne cible

```text
GPS / QR / carte fictive
          │
          ▼
    LocationEngine
          │ LocationEntered / LocationExited / QRTriggered
          ▼
   InteractionEngine
      ┌───┼──────────┐
      ▼   ▼          ▼
   Quest Explore  Encounter
                       │
                       ▼
                  BattleEngine
                       │
              ┌────────┴────────┐
              ▼                 ▼
         BattleState        BattleUI
```

## 7. Ordre de migration

1. Écrire les tests de contrat pour les trois lignes, les renforts automatiques et
   les ticks déterministes.
2. Introduire `BattleState` et `BattleEngine`, puis migrer les conséquences,
   la fuite et la poursuite existantes.
3. Adapter `BattleService`, `Game` et `EngagementService` pour retirer toute
   conversion GPS vers une grille tactique.
4. Remplacer la vue de grille par la vue trois lignes et le drag & drop.
5. Introduire et tester `LocationEngine` avec anti-spam, cooldown et hystérésis.
6. Introduire `InteractionEngine` et `Encounter`, puis brancher scénario et quêtes.
7. Connecter la carte fictive et `GpsTracker` à la même chaîne événementielle.
8. Retirer les anciennes API, styles et tests de grille après migration de leurs
   règles persistantes encore utiles.

La fuite GPS, la poursuite, les pertes persistantes, les prisonniers, les
déserteurs et le butin restent des fonctionnalités à conserver. Leur déclenchement
doit être adapté au nouveau modèle, pas supprimé avec l'ancienne grille.

## TODO — Capacité de placement de la PlayArea

- Estimer le nombre maximal d'emplacements à partir de la forme réelle de la
  `PlayArea`, de sa surface et de la distance minimale entre éléments.
- Réserver les emplacements obligatoires, notamment la capitale et les lieux du
  scénario, avant de calculer la capacité restante pour les lieux et les groupes
  autonomes.
- Afficher la capacité et le nombre d'emplacements sélectionnés dans le setup,
  puis recalculer ces valeurs chaque fois que la zone ou les options changent.
- Borner les quantités configurables et empêcher la validation d'une sélection
  qui dépasse la capacité réelle de la zone.
- Prévoir un message invitant à agrandir la zone ou réduire les contraintes
  lorsqu'aucune disposition valide n'existe.

## 8. Résolution physique du butin

Battle conserve un registre de contribution par héros. À la fin du combat, seuls
les héros actifs de l'équipe victorieuse participent au partage. Un héros éliminé
ne reçoit rien, même si son équipe gagne.

`LootDistributionService` répartit les quantités transportables selon les
contributions et crée un `LootSite` à la position GPS de Battle. Une attribution
n'est pas un transfert d'inventaire : le héros doit rester ou revenir dans le rayon
du site et disposer de la capacité nécessaire pour collecter ses objets. Tout objet
non transportable ou non collecté reste dans le monde. Les objets de quête et liés
au compte sont protégés.

Le champ de bataille est un `BattleSite` dynamique visible par ses participants et
par les joueurs passant dans son rayon de visibilité. Le `LootSite` reste discret :
une action contextuelle `chercher`, effectuée dans le rayon du champ après la fin de
Battle, l'ajoute aux sites connus du joueur. Tous les sites dynamiques possèdent une
expiration configurable et sont retirés automatiquement lorsqu'ils expirent ou
sont épuisés afin de ne pas saturer la carte.
