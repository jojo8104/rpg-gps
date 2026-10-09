# Prototype de combat tactique

Les nouveaux combats créés par le serveur de l'app utilisent le plateau. Les
batailles sauvegardées avant cette évolution continuent avec les duels existants.
Le mode GPS et la simulation utilisent le même moteur et les mêmes commandes.

## Essai dans l'app

1. Démarrer le serveur (`npm start`) puis ouvrir `/app/`.
2. Créer une partie « Test local ».
3. Dans **Armée**, ouvrir une troupe et choisir Réserve, Gauche, Centre ou Droite.
4. Sur la carte, ouvrir **Menu → Terrain → Déclencher un combat ici**.
5. Sélectionner une troupe puis une case accessible ; sélectionner à nouveau la
   même troupe pour Défense, Ralliement ou Charge.
6. Ouvrir les cartes de réserve par la poignée du bas ou un glissement vers le haut.
   Choisir la carte centrale, fermer l'éventail si nécessaire, puis toucher une case
   libre de la ligne de départ.
7. Dans **Ordres programmés**, changer les priorités ou annuler des ordres, puis
   valider. **Lire les étapes** explique la dernière résolution.

## Règles de cette première version

- Plateau de 3 colonnes et 5 rangées, orienté avec son propre camp en bas.
- Trois positions de départ pour les troupes, persistantes et sans malus de veille.
  Les unités restantes et le héros sont en réserve. Les commandants des camps
  sont attaquables à portée derrière leur camp lorsqu'ils sont en réserve ; une fois
  déployés, ils ne sont attaquables que sur leur case.
- Cinq cartes déployées au maximum, héros compris.
- Budget d'ordres : Commandement final du héros, arrondi à l'entier inférieur,
  avec un minimum de 2 et un maximum de 5. L'Autorité continue de limiter l'armée.
- Un ordre par carte par tour. Déployer, déplacer, attaquer, rallier, défendre ou
  charger coûte un ordre. Une carte sans ordre se défend sur place.
- Déplacement orthogonal d'une case. La cavalerie peut charger de deux cases
  en ligne droite ; aucune unité ne peut être traversée.
- Portée d'attaque en distance orthogonale, issue du type d'unité. Le héros a
  une portée de 1. Les archers tirent sans déplacement ni riposte gratuite à distance.
- Un déploiement utilise une case libre de sa propre rangée de départ.
- Chaque priorité exécute les ordres des deux camps simultanément. Les mouvements
  précèdent les attaques de cette priorité. Les dégâts sont calculés avant d'être
  appliqués ensemble. Une unité neutralisée perd son ordre des priorités suivantes.
- Deux ennemis visant la même case ou se croisant sont bloqués et s'affrontent.
  Entrer sur une case ennemie provoque également un affrontement. Un passage allié
  bloqué bloque les mouvements qui en dépendent. Pas de choix aléatoire de priorité.
- Une attaque dont la cible est sortie de portée échoue sans nouvelle cible.
- Défense consacre la vitesse à la défense ; Charge à l'attaque de sa rencontre.
  Ralliement rend 2 points de moral à la troupe, jusqu'à 10, sans diminuer un moral
  déjà supérieur à 10. Les PV individuels, blessures, morts et bonus d'embuscade
  utilisent les modules de combat existants.
- Terrain et météo fixes durant la bataille. Pas de règle aléatoire ni récompense
  intermédiaire dans ce prototype ; les conséquences finales restent officielles.
- Un camp commence avec 20 points de cohésion. Chaque ennemi restant dans sa rangée
  de départ retire 1 point en fin de tour, avec un maximum de 2 par tour.
- Victoire quand le commandant tombe ou quand la cohésion du camp atteint zéro.
  Fuir concède la victoire en conservant les blessures déjà subies.
- Limite de 25 tours pour éviter les blocages : comparaison de la cohésion restante
  plus 20 fois la proportion de PV du commandant. Égalité possible.
- 30 secondes pour la première programmation, puis 34 secondes par tour
  (4 de lecture + 30 de programmation). Aucun délai imposé après validation si
  l'adversaire a déjà validé. À l'échéance, le serveur utilise le dernier brouillon
  reçu, ou fait tenir les positions s'il n'y en a pas.

## Autorité et confidentialité

La préparation est validée par `setArmyFormation` ; les ordres utilisent les
commandes de combat existantes avec un numéro de tour obligatoire. Le serveur
calcule aussi les cases/cibles autorisées présentées par la vue. Les réserves et
les ordres adverses restent secrets ; seules les cartes déployées sont visibles.
Le navigateur conserve uniquement ses brouillons et ne calcule aucun dégât,
déplacement officiel ni gain de secours.

## Interface compacte (9 octobre 2026)

La carte garde une hauteur stable pendant la sélection des techniques et l’ouverture de la main. La validation ✓ et le budget d’ordres sont placés en haut, loin de la poignée de réserves ; sans ordre, cette validation tient les positions et passe le tour. Le bouton i ouvre une notice sans modifier le combat. Le panneau de résolution, la liste textuelle des ordres et les explications permanentes des bonus sont supprimés. Les numéros et flèches restent sur les cases, avec des boutons de priorité pour l’unité sélectionnée. Les socles et barres de santé sont plus petits pour dégager les sprites.

L’en-tête n’affiche plus l’ancien terrain global du duel, qui pouvait contredire les cases générées ; la météo reste affichée. Les icônes de bonus conservent leur description accessible. Les résultats serveur fournissent les PV réellement perdus, les nouveaux blessés (soldats aptes passant sous le seuil, sans mourir) et les morts de chaque échange. Ces valeurs sont présentées en texte flottant blanc, orange et rouge au-dessus des unités. Cette présentation ne change ni les dégâts ni les règles de santé, et ne calcule aucune perte localement.
