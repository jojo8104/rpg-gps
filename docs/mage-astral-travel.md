# Voyage astral du Mage

Le pouvoir est disponible dans les deux modes de carte, avec les mêmes commandes serveur.

## Activation et ciblage

L’activation affiche un cercle violet vif centré sur la position officielle du Mage et une projection translucide au-dessus de son pion. Le joueur glisse cette projection sur un lieu connu, un héros visible ou un groupe autonome détecté. Le fantôme dispose d’une grande poignée « Glisser » au-dessus des illustrations : maintenez le doigt ou le bouton gauche sur celle-ci puis déplacez-le sans relâcher. Il suit le geste même sur une carte tournée ou inclinée, mais son point d’ancrage reste dans le cercle : un geste vers l’extérieur est arrêté au bord. Le point de relâchement est lui aussi borné lorsque le geste atteint cette limite. La sélection utilise le point où le doigt ou la souris est relâché, plutôt que le socle décalé sous le fantôme. Relâcher près d’une cible envoie la sélection ; un geste annulé ne sélectionne rien. Aucun lieu n’est choisi automatiquement. Le héros réel ne se déplace pas et ne gagne aucune XP de marche.

Le rayon est celui du grade : capitaine 15, banneret 25, commandant 40, seigneur 60, maréchal 90. Il est exprimé en mètres en GPS et en unités de carte fictive en simulation. Le centre de la cible doit être dans le cercle ; le serveur recalcule cette distance à partir des positions officielles. Les cibles inconnues ou non détectées restent inaccessibles.

## Fin et recharge

Le pouvoir dure 10 secondes à compter de l’activation réussie, ciblage compris. La sélection ouvre la fiche habituelle de la cible ; elle ne consomme pas encore le pouvoir. Une action réussie sur cette cible le consomme immédiatement. Une action refusée conserve le temps restant. L’expiration retire le cercle et la projection ; elle supprime également la portée astrale des validations serveur. La recharge de 10 minutes commence à l’activation et persiste dans les sauvegardes.

Les règles habituelles de propriété, de ressources, d’alliance et de PvP restent applicables. Une conversation ou un échange accepté conserve sa propre session serveur après la disparition de la projection, dans la portée autorisée lors de la demande.

## Architecture

`HeroClassFeatureService` porte la durée et la recharge ; `Game` valide l’activation et les cibles ; `astral-interaction.js` vérifie la portée ciblée et la consommation après commande. `AstralTravelRenderer` affiche l’effet et `AstralGhostDrag` gère la capture du pointeur et la projection écran du glissement. Les modules d’affichage sont également inclus dans le cache de démarrage de l’application. Cette correction de manipulation ne change ni la durée, ni la portée, ni la recharge ou les règles d’interaction. Les interactions de quête utilisent aussi la présence et la portée validées par le serveur ; leurs règles de progression restent inchangées. Le navigateur n’applique aucun déplacement ou gain au héros.
