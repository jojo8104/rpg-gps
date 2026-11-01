# Fonder et spécialiser un camp

Après une prospection ou une découverte par spécialiste, une case connue peut recevoir un camp. Vous pouvez rejoindre la case avec le héros ou envoyer les matériaux depuis l’un de vos postes de prospection. Le serveur vérifie la case, l’espace disponible et les moyens réels avant toute dépense.

| Terrain connu | Camp et évolutions autorisés |
| --- | --- |
| Vide | Camp, fort |
| Bois 🌲 | Camp, camp de bûcheron |
| Pierre 🪨 | Camp, carrière |
| Terre fertile 🌾 | Camp, village, ville |
| Fer ⛏️ | Camp, mine de fer |
| Or 🪙 | Camp, mine d’or |

Les pictogrammes distinguent les terrains ; ils ne révèlent aucune ressource cachée. Le camp reste possible sur les six terrains. La terre fertile n’autorise pas une capitale. Une mine de fer et une mine d’or utilisent le type de lieu « mine », mais leur ressource reste différente et contrôlée.

## Fondation sur place

Utilisez « Installer un camp » puis « Fonder sur ma case actuelle ». Le héros doit être actif, disponible et réellement sur la case connue. En GPS, une précision supérieure à 50 mètres empêche l’action. Le navigateur ne peut ni imposer une ressource ni créer un camp à distance.

La case ne doit pas être occupée ou neutralisée par l’influence d’un autre lieu. Le camp est placé au centre de la cellule ; l’espacement entre lieux permanents est vérifié en GPS comme en simulation. Un seul camp actif peut occuper la même case, même lorsque deux joueurs essaient de la construire.

| Réglage initial proposé et appliqué | Coût ou valeur |
| --- | --- |
| Fondation d’un camp | 20 bois, 10 nourriture et 1 outil d’exploration |
| Spécialisation productive d’un camp de niveau 3 | 20 bois, 10 pierre et 10 or, avec l’XP d’évolution requise |
| Production de base de la spécialisation | 1 unité de sa ressource par cycle |
| Camp nouvellement fondé | Niveau 1 ; population initiale 0 ; aucune production naturelle automatique |

Ces chiffres sont des réglages initiaux du moteur proposés pour cette étape, modifiables côté serveur. Les coûts et prérequis existants des branches village et fort sont conservés. Aucune ressource de fondation n’est créée gratuitement.

Les matériaux sont pris dans les ressources transportées et les lots du bagage. Une commande répétée sur votre camp déjà installé ne débite pas une seconde fois.

## Habiter et développer le camp

Le camp attend des habitants : transportez et installez des lots de population avec les interactions existantes. Un camp sans habitants suit les règles existantes d’abandon ; il ne produit rien et ses constructions restent indisponibles tant qu’il n’a pas été habité. L’installation de population réactive le lieu. Un lieu vide non réoccupé disparaît après les 24 cycles d’abandon déjà prévus.

Les niveaux 1 à 3 gardent leurs conditions de population, bâtiments, orientations, XP et ressources. Au niveau 3, les nouvelles spécialisations sont proposées seulement sur leur terrain correspondant. Elles utilisent aussi l’XP d’évolution requise. Les évolutions village et fort gardent leurs prérequis existants, mais sont filtrées respectivement par terre fertile et terrain vide.

Le serveur refuse une branche interdite avant de retirer les ressources ou l’XP. Sur bois, vous ne pouvez donc obtenir ni fort, ni village, ni carrière, ni mine. Les villes issues d’un camp de terre fertile ne peuvent pas poursuivre vers capitale.

Le camp de bûcheron produit du bois, la carrière de la pierre, les mines leur fer ou leur or. La production passe par les cycles serveur et les limites de stockage existantes ; une fondation seule ne produit pas. Les bâtiments ordinaires, comme le relais de chasse, conservent leurs effets propres : ils ne changent pas le gisement naturel.

## Expédition d’installation

Le héros doit être présent dans un lieu lui appartenant, doté d’un poste de prospection. Dans « Installer un camp », choisissez une case connue et le poste de départ. Le stock local fournit les mêmes 20 bois, 10 nourriture et 1 outil que la fondation sur place ; les réserves d’un autre lieu ou les bagages du héros ne complètent pas cet envoi.

Les matériaux quittent le stock au départ et sont conservés dans la cargaison du groupe autonome. Le moteur de déplacement existant l’amène jusqu’à la cellule. À l’arrivée, le serveur vérifie de nouveau la disponibilité de la case avant de fonder le camp et de consommer les matériaux. Il n’y a ni score de réussite ni tirage aléatoire pour l’installation.

Si un autre camp a pris la place, si un lieu voisin neutralise désormais la case ou si la cargaison est insuffisante après un événement du trajet, aucun camp supplémentaire n’est créé. Le groupe rapporte ses moyens restants au poste. Les capacités de stockage sont respectées ; le surplus reste en cargaison et peut être déchargé après avoir libéré de la place. Une origine détruite ou capturée suspend le retour selon les règles existantes.

Un même envoi rejoué ne prélève pas un second chargement. Les trajets, matériaux, résultats et fondations sont sauvegardés. La reprise ne redébite rien et ne crée pas un second lieu.

## Influence et conservation du gisement

Le camp conserve une référence à sa cellule et au terrain officiel qui a permis son installation. Son propre gisement n’est pas annulé par sa propre influence : il reste le support de ses évolutions, y compris après sauvegarde ou changement de propriétaire.

Les cellules voisines touchées par sa portée normale sont neutralisées pour les installations et ressources naturelles. Selon la règle déjà validée excluant les sites exceptionnels des lieux normaux, un site encore actif couvert par le nouveau camp disparaît : aucun trésor, artefact ou butin de donjon n’est attribué par une construction. La clôture est partagée, les indices deviennent obsolètes et les missions concurrentes sont rappelées. La règle générale d’annonce de disparition après cinq minutes s’applique. Un site déjà remporté conserve son issue et ses récompenses en attente de retrait.

## Cases vides et confidentialité

Une prospection active révèle désormais aussi les cases vides parcourues, hors influence neutralisante. C’est ce qui permet de choisir un terrain vide pour un futur fort. Les spécialistes transportés conservent leurs probabilités de découverte des ressources ; aucun nouveau tirage sur les terrains vides n’est ajouté.

La liste d’installation ne contient que les cellules connues du joueur. Une construction ne donne aucune information sur les ressources cachées des autres cases. Pour les camps fondés par ce parcours, l’interface affiche les possibilités et paiements calculés par le serveur, puis transmet les intentions de construction.

Les lieux historiques et les camps de scénario sans référence de terrain conservent leur progression antérieure. Ils ne reçoivent pas arbitrairement un nouveau gisement ; les spécialisations naturelles exigent toujours un terrain adapté.

## Exemple

Une prospection révèle du fer. Le joueur rejoint la case avec les matériaux et fonde un camp de niveau 1, puis y installe des habitants. Après les niveaux et prérequis habituels, le camp de niveau 3 peut devenir une mine de fer. Les branches fort, village, carrière, bûcheron et mine d’or restent indisponibles.

1er novembre 2026 — fondation sur place ou par expédition, référence de terrain persistante, spécialisations contrôlées et possibilités d’évolution officielles.
