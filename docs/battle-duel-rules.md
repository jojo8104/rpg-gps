# Combat par duels : PV et passes

Un choix de cartes déclenche au plus trois passes automatiques simultanées.
Les attaques d'une passe utilisent les effectifs et le moral au début de cette
passe. Les conséquences sont appliquées avant la suivante. Si un héros tombe
ou qu'un camp ayant joué des cartes n'a plus de carte engagée apte, l'échange
s'arrête, sans reporter les attaques restantes sur son héros. Passer volontairement
expose toujours le héros. La règle spéciale existante « Duel à mort » prolonge
les passes jusqu'à neutralisation, avec une limite de 200 passes.

## Calcul

Le budget est la **vitesse effective entière**, bonus du commandant compris.

- Normale : moitié en attaque, moitié en défense.
- Défense : tout en défense.
- Charge de cavalerie : tout en attaque à la première passe normale, puis Normale.
- Mur de lances : même répartition que Défense pour les lanciers.

« Techniques sans effet » impose Normale aux deux camps.

Pour une troupe :

```
puissance = (attaque + bonus de récompense + bonus de vitesse offensif)
            × effectif apte × (0,65 + moral / 20)
dégâts = max(1, plancher(2 × puissance / (défense effective adverse + 5)))
```

Les statistiques des troupes incluent déjà les bonus du commandant et du lieu.
Les modificateurs de terrain, météo et défense du camp restent appliqués.
Un héros n'a ni facteur d'effectif ni facteur de moral. Contre un héros, le
dénominateur utilise +3 au lieu de +5 ; le bonus existant ×3 entre héros reste actif.

## Volée d'ouverture

Avant la passe 1, les troupes de portée supérieure à 1 tirent gratuitement.
Les troupes de mêlée ne ripostent pas ; deux tireurs frappent simultanément.
Pendant cette volée, les tireurs reçoivent deux fois leur vitesse en attaque,
sans bonus défensif de vitesse. Les dégâts sont multipliés par
`vitesse du tireur / vitesse de la cible`, **sans plafond**, avant l'arrondi.
Les vitesses absentes ou nulles utilisent un minimum technique de 0,1 pour
éviter une division par zéro. Les interdictions de tir s'appliquent à la volée.

## PV, blessures et moral

Chaque soldat conserve ses PV. Au-dessus du seuil de son type, il combat.
Entre 1 PV et le seuil inclus, il est blessé hors combat ; à zéro, il est mort.
Chaque attaque est un paquet de PV, distribué par rotation des cibles avec
report des dégâts excédentaires sur les soldats suivants.
Un dernier soldat encore apte reste jouable.

```
perte de moral = plafond(6 × nouveaux soldats hors combat ou morts
                         / effectif apte avant la passe)
```

Seules de nouvelles incapacités diminuent le moral. À zéro de moral, la troupe
déroute. Les blessures, PV résiduels et morts sont sauvegardés et transférés au
monde à la fin de la bataille, y compris en cas de fuite.

## Embuscade

Les multiplicateurs d’embuscade s’appliquent aux statistiques de base des troupes
pendant les passes du premier duel, avant les bonus de technique. Ils expirent au
duel suivant et ne modifient pas les statistiques persistantes ni celles des héros.

## Rythme et validation

La première décision dispose de 15 secondes. Les suivantes disposent de
19 secondes : 4 secondes de lecture du résultat puis 15 secondes de choix.
Le bouton Continuer permet de passer la lecture sans changer l'échéance commune.
La validation transmet le choix final et le verrouille en une commande serveur.
Les commandes du navigateur portent le numéro de manche ; un choix périmé est
refusé. Les brouillons déjà reçus restent utilisables à l'échéance.
