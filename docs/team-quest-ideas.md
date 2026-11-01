# Idées de quêtes collectives

Notes de conception du 27 septembre 2026, à reprendre ultérieurement.
La première quête possède maintenant une première implémentation testable ;
les autres idées restent des pistes de conception.

## Introduction des quêtes d'équipe dans le scénario

- Distinguer les quêtes individuelles et les quêtes d'équipe.
- Lorsque les joueurs sont dispersés, utiliser un messager GA pour l'appel commun.
- Structure narrative retenue : appel commun → rassemblement dans un même lieu
  → révélation collective → mission d'équipe.
- Le jeu peut aussi détecter au moins deux joueurs d'une même équipe au même lieu.
  Par exemple, si un groupe est à la capitale et qu'un membre demande une quête,
  une quête d'équipe lui est proposée.

## 1. Quête d'amélioration : transformer un camp en fort

Un camp doit être transformé en fort doté d'une garnison le plus rapidement possible.
Le transport de ressources et de troupes à plusieurs est fortement souhaitable.

- Coopération autour de l'approvisionnement, de l'amélioration du camp et de
  l'installation de la garnison.
- Plus la quête est accomplie rapidement, plus la récompense est élevée.

### Choix retenus le 28 septembre 2026

- Le camp est déjà partiellement avancé au début de la quête. Son état initial
  est adapté au nombre de joueurs participants.
- La garnison demandée est une unité de lanciers au grade Soldat, quelle que
  soit son origine.
- Un nouvel accessoire, le **Mandat d'autorité**, facilite le transport de cette
  unité en plus des troupes habituelles du joueur. Une fois équipé, il donne un
  bonus d'autorité suffisant pour couvrir le commandement de l'unité de lanciers
  supplémentaire : +3 autorité dans le catalogue actuel.
- Pour le moment, un seul mandat est remis pour toute l'équipe lors du briefing,
  à attribuer à un participant, et non un exemplaire par joueur.
- Le mandat peut être conservé après la quête.

### Première version jouable — réglages à équilibrer

À la capitale, au moins deux héros actifs de la même équipe doivent être présents.
Le dialogue du chef propose le briefing puis le choix du porteur du mandat.
L'acceptation fixe les participants présents, crée un camp dédié et démarre le
chronomètre. Les participants peuvent tous construire et déposer leurs troupes.
Le camp appartient au porteur initial du mandat ; les permissions de mission
des autres participants prennent fin à la réussite.

Le camp commence au niveau 3 avec 12 habitants et l'expérience nécessaire.
L'état initial dépend de l'effectif fixé à l'acceptation :

| Participants | Barricades | Poste de guet | Matériaux restant à apporter pour travaux et évolution |
| --- | --- | --- | --- |
| 2 | Niveau 3 | Niveau 2 | 20 bois, 10 pierres, 5 fer |
| 3–4 | Niveau 2 | Niveau 1 | 62 bois, 25 pierres, 12 fer |
| 5 et plus | Niveau 2 | Absent | 85 bois, 35 pierres, 12 fer |

Le camp possède déjà les 15 or nécessaires à son évolution. Les coûts standards
des constructions restent appliqués ; les stocks du camp sont utilisés en
priorité, puis les ressources du héros qui réalise l'action.

La réussite est automatique quand le camp devient un fort avec une unité active
complète de 6 lanciers au grade Soldat en garnison, sans restriction d'origine.
Les troupes peuvent être déposées avant ou après l'évolution. Le mandat reste
au joueur : pour l'équiper, ouvrir **Héros → Accessoire I ou II**.

Barème provisoire, par participant réel : 20 or et 100 XP de base, plus un bonus
diminuant linéairement de 20 or et 100 XP à zéro sur 30 minutes (arrondi inférieur).
Il n'y a pas d'échec automatique au bout de 30 minutes. La récompense est versée
une seule fois et l'état est sauvegardé, y compris le début du chronomètre.
Une mission par participant et par partie pour cette première version.

### Tester seul

1. Démarrer **Test local → À la maison**.
2. Sur la carte : **Menu → Quête à tester → Un fort pour le royaume (équipe · test solo)**.
3. Choisir **2, 4 ou 6 joueurs** simulés, puis **Lancer**.
4. Équiper le mandat dans **Héros → Accessoire**.
5. Dans **Quêtes**, afficher le dépôt de test. Il contient les matériaux manquants
   et une unité de lanciers à retirer de la garnison. Les transporter au camp.
6. Terminer les améliorations, choisir **Ériger un fort**, puis installer les
   lanciers en garnison. Le journal affiche le résultat.

Le test simule l'effectif pour la préparation du camp, pas des coéquipiers autonomes :
le joueur réalise toutes les tâches. Seul son héros reçoit la récompense.
Les capacités de transport et d'armée habituelles s'appliquent ; prévoir des
allers-retours si les bagages sont pleins. Pour essayer un autre effectif,
commencer une nouvelle partie locale. Le dépôt gratuit est réservé au test local.

## 2. Quête de relais : faire participer toute l'équipe

La quête commence comme une quête individuelle. Le premier joueur doit contacter
un autre joueur sur le terrain. Celui-ci doit à son tour contacter un autre joueur.
Le relais se poursuit jusqu'à ce que toute l'équipe ait joué.

La manière de valider le contact et de gérer les membres indisponibles reste à définir.

## 3. Quêtes de groupe avec rôles spécifiques

Principe envisagé : un objet attribué ou transporté donne un rôle spécifique
à un participant. Trois variantes sont à explorer.

### 3.1. Sceaux au temple

Les joueurs doivent amener en même temps des objets magiques ou des sceaux dans
un temple. Leur présence simultanée permet d'accéder à un artefact qu'il faut
ensuite ramener.

### 3.2. Préparation d'un siège

Les joueurs amènent des armes de siège autour d'un fort ennemi pour affaiblir
la position. Un groupe autonome allié ou un autre joueur peut alors donner
l'assaut. Le jeu autorise le combat dans ce scénario.

### 3.3. Vol et infiltration avec diversion

Les héros reçoivent des tâches réparties selon leur nombre, dans un lieu ou
une taverne. L'un doit s'infiltrer et voler un objet ; les autres accomplissent
des tâches complémentaires, notamment :

- discuter avec le chef du village ;
- discuter avec le tavernier ;
- offrir une tournée ;
- déclencher une bagarre ;
- se rendre au marché ou dans une autre amélioration du lieu.

Concrètement, chaque participant clique sur une entrée de menu correspondant
à sa tâche. Certains menus peuvent être créés uniquement pour la quête et
demander des conditions particulières pour être accessibles ou valider l'action.
Les conditions et la coordination précise entre ces tâches restent à définir.

## 4. Adapter la quête actuelle d'évacuation

Si plusieurs joueurs acceptent la quête d'évacuation, répartir les activités :

- retenir les vagues ennemies ;
- construire les chariots sur place ;
- aller chercher les ressources si nécessaire.

L'objectif est d'adapter la quête existante à une participation collective.

## 5. Partie de chasse du roi

Les joueurs se positionnent sur le terrain pour rabattre le gibier.

- Enchaîner deux ou trois positions successives.
- Ajouter éventuellement des combats contre des bêtes sauvages.
- Prévoir des récompenses liées au tableau de chasse.

## 6. Le convoi à la croisée des chemins

Un messager GA annonce le départ d'un convoi précieux. Un joueur escorte le
convoi pendant que les autres reconnaissent les routes et sécurisent les passages.
À chaque carrefour, leurs découvertes déterminent les chemins possibles : détour
sûr, pont à réparer ou passage court occupé par l'ennemi. L'équipe choisit entre
rapidité et risque.

## 7. La malédiction des trois sanctuaires

L'équipe se rassemble auprès d'un érudit, puis se répartit entre plusieurs
sanctuaires. Chaque joueur y découvre une information utile à un autre : symbole
à activer, offrande nécessaire ou ordre des actions. Les participants doivent
communiquer, puis revenir ensemble pour lever la malédiction.

## 8. L'évasion du prisonnier

Un joueur rencontre le captif et déclenche sa fuite. Les autres préparent la
sortie : récupérer une clé, ouvrir une porte depuis un autre lieu et sécuriser
un refuge. Le prisonnier ne peut avancer que lorsque les alliés ont préparé
l'étape suivante. Des variantes peuvent permettre la discrétion, la corruption
des gardes ou le combat.

## 9. Le conseil des villages

Plusieurs villages doivent accepter une alliance. Les joueurs se répartissent
les négociations, mais les demandes des villages dépendent les unes des autres :
du bois contre des vivres, une protection contre l'accès à un passage, etc.
Les décisions de chaque joueur modifient les possibilités des autres.
Un rassemblement final permet de ratifier l'accord.

## 10. La créature qu'on ne peut pas vaincre de front

Une créature menace la région. L'équipe doit découvrir sa faiblesse, préparer
un piège dans un lieu, puis l'y attirer. Un joueur transporte l'appât pendant
que les autres préparent le terrain ou défendent le dispositif. La préparation
détermine les conditions du combat final.

## 11. L'enquête aux témoignages contradictoires

À la capitale, le groupe reçoit une enquête sur un sabotage. Chaque joueur
interroge un témoin différent ou examine un lieu. Les indices individuels sont
incomplets ; leur mise en commun permet de confronter un suspect et de choisir
une accusation. Des objets remis au départ peuvent attribuer les rôles : mandat
d'interrogatoire, loupe ou sceau donnant accès aux archives.

## 12. Le réseau de feux d'alarme

Une invasion approche et les communications sont coupées. Les joueurs doivent
remettre en service des tours de signalisation réparties sur le terrain.
Une tour réparée révèle l'état de la suivante. Certaines nécessitent des
ressources, d'autres sont occupées. Plus le réseau est rétabli rapidement,
plus les villages peuvent préparer leurs défenses.

## Points à préciser lors de la conception

Les sept idées supplémentaires sont retenues comme pistes. Leurs mécanismes
concrets et leur narration restent à définir avant toute implémentation :
déclenchement, personnages et dialogues, étapes, actions accessibles dans les
menus, conditions de validation, conséquences, réussite et échec. Les résumés
ci-dessus donnent une intention de jeu, pas des règles finalisées.

- Conditions de participation, validation du rassemblement et départ de la mission.
- Répartition des rôles et adaptation au nombre de participants.
- Gestion des absences et des départs pendant une quête, notamment pour le relais.
- Conditions de simultanéité pour les sceaux et de coordination pour les diversions.
- Début du chronomètre et calcul de la récompense de la quête d'amélioration.
- Partage des récompenses entre participants.
