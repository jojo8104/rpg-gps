# Combat à distance — concept prévu

Ce document décrit un nouveau mode demandé le 9 octobre 2026. Il n’est pas encore disponible dans le moteur. Les interactions astrales existantes et les embuscades actuelles conservent leurs règles jusqu’à l’intégration de ce mode.

## Déclenchement et présence du héros

Le combat peut démarrer alors que le héros réel est hors de la portée d’engagement habituelle. Le serveur valide la cible visible, la capacité active et sa portée. L’écran de bataille s’ouvre sans déplacer le héros réel. Le serveur reste responsable de tous les effets, en GPS comme en simulation.

## Projection astrale du mage

Le joueur active le voyage astral puis glisse le fantôme sur une unité ou une armée ennemie. La projection combat seule contre l’armée ; les troupes du mage et son corps réel ne sont pas engagés. Les attaques du fantôme infligent des dégâts physiques et diminuent le moral adverse. Sa destruction termine la projection sans blesser le corps réel du Mage.

À préciser avant implémentation : santé de la projection, puissance des dégâts physiques et moraux, et conséquences d’une victoire. Le lien avec le corps réel est fixé : les dégâts de la projection ne sont pas transférés au Mage.

## Embuscade à distance

La préparation de l’embuscade augmente la portée et la discrétion. Dans ce mode, seules les unités possédant la spécialité embuscade peuvent entrer sur le champ de bataille : cavalerie légère et archers montés. Les archers de l’armée donnent accès au pouvoir « Volée de flèches », sans être déployés comme unités.

Le défenseur ne joue pas le premier tour. La réaction défensive automatique et les éventuelles ripostes restent à spécifier ; l’absence d’ordres ne doit pas être confondue avec une absence de défense. Les règles actuelles de bonus d’embuscade et l’immunité existante de l’éclaireur devront être conciliées avec ce nouveau premier tour.

## Pouvoirs depuis la carte

Le mage peut lancer des sorts sur la carte dans un rayon croissant avec son niveau et sa maîtrise. L’éclaireur dispose d’un « Tir de précision » dans une portée à définir. Les portées GPS et simulation doivent suivre le même modèle de règle avec les unités de distance propres à chaque mode.

Ces pouvoirs ne consomment aucune mana. Depuis la carte, leur utilisation déclenche un cooldown validé par le serveur. Ils pourront aussi être utilisés dans une bataille normale, avec un coût en Commandement pris sur le budget du tour ; ils ne donnent donc pas une action gratuite en plus des ordres de l’armée.

À préciser : sens de la maîtrise dans la progression actuelle, formules de portée, dégâts, durées de cooldown et coûts chiffrés en Commandement. L’articulation entre le cooldown de carte et l’usage en bataille reste à définir. Aucune nouvelle ressource mana n’est prévue.

## Raccordement prévu

Créer des modules dédiés aux intentions à distance, aux participants projetés et aux pouvoirs. Raccorder les contrôleurs de ciblage existants aux commandes serveur ; conserver le point d’assemblage `main.js`. Distinguer les dommages du fantôme de ceux du héros réel dans les résultats persistants. Tester la portée, les troupes autorisées, le premier tour du défenseur, la consommation des pouvoirs et l’attribution unique des conséquences.
