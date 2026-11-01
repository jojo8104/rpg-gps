# Préparer une expédition exceptionnelle

Après avoir découvert un trésor, un artefact ou l’entrée d’un donjon, ouvrez « Préparer une expédition » sur la carte. Choisissez le site et les moyens qui l’accompagneront. Le serveur calcule un score commun aux deux modes de départ.

| Catégorie | Points | Plafond |
| --- | --- | --- |
| PNJ | +10 par spécialité pertinente, +2 par autre PNJ utile | 30 |
| Volontaires | +2 par soldat apte sélectionné | 20 |
| Montures | +2 par cheval sélectionné | 10 |
| Matériel | +5 par outil d’exploration sélectionné | 20 |
| Provisions | Nourriture +1, bois +1, bière +2 par unité | 20 |

Les catégories donnent au maximum 100 points. Un spécialiste compte une seule fois par spécialité, même si plusieurs exemplaires sont transportés. Les cartes et indices ne comptent pas au score et ne sont pas consommés. Les provisions déjà consommées pendant la recherche ne sont plus disponibles.

## Choisir les moyens et vérifier le score

L’interface ne propose que les PNJ, montures, outils, ressources et troupes disponibles dans la source choisie. Le nombre de volontaires représente des individus aptes au combat, pas un nombre de fiches de troupe. Les blessés et troupes d’un autre joueur ne peuvent pas être sélectionnés.

Le réglage initial considère le cartographe et l’aventurier comme pertinents pour les sites exceptionnels. Les autres spécialistes et personnages utiles du catalogue donnent +2 chacun, une fois par type de PNJ. Le serveur peut définir une liste de spécialités pertinentes propre à chaque site. Le navigateur ne peut pas modifier cette liste ni ajouter un bonus narratif. Aucun nouveau bonus de dialogue n’est créé par cette étape.

« Actualiser le score » enregistre la préparation sans retirer de moyens. Le départ utilise cette préparation enregistrée ; après une modification du formulaire, actualisez le score avant de confirmer. Le serveur vérifie de nouveau les disponibilités au départ. Une préparation peut être annulée sans dépense.

## Avec le héros

Le héros utilise uniquement ses propres bagages et les soldats de son armée. Les stocks d’un village voisin ne comptent pas. Il se déplace lui-même jusqu’à la case découverte, avec sa position officielle GPS ou de simulation.

Les moyens restent dans ses bagages et son armée pendant le trajet. Le serveur recalcule le score avec les quantités encore présentes : une vente, une consommation, une perte ou une blessure peut le réduire. La sélection initiale reste le maximum engagé ; de nouvelles provisions ne s’ajoutent pas automatiquement au-delà. Un héros ne peut pas préparer plusieurs expéditions directes simultanées.

## Envoyer depuis un poste de prospection

Le héros doit être présent dans un lieu lui appartenant et doté du bâtiment `prospecting_post`, avec une position officielle dans sa portée normale. Le stock du lieu et sa garnison sont la seule source du groupe envoyé. Les règles GPS de précision restent applicables ; le mode simulation change seulement les contrôles de distance.

Au départ, les PNJ, chevaux, outils et provisions sélectionnés quittent réellement le stock. Les soldats aptes choisis quittent la garnison et rejoignent un groupe autonome. Les blessés restent sur place. Si une troupe est divisée, ses équipements et pouvoirs de troupe restent avec la partie restée en garnison ; ils ne sont pas dupliqués. Si toute la troupe part, elle conserve ses équipements.

Le groupe se déplace vers le site avec le moteur de déplacement existant. Le score tient compte des provisions et soldats qu’il conserve. Une répétition de la même commande de départ ne crée pas un second groupe et ne débite pas une seconde fois. Après un envoi, le héros peut préparer une autre expédition avec les moyens restants.

## Probabilité et limites actuelles

La [résolution des sites](exceptional-site-resolution.md) est disponible depuis le 1er novembre 2026. Les difficultés 40, 70 et 100 sont configurées côté serveur. Pour les donjons, le plus faible rapport entre expédition et puissance limite la chance.

Avec le héros, rejoignez la case puis lancez la tentative. Les groupes envoyés tentent automatiquement à l’arrivée et reviennent ensuite avec les survivants et les moyens restants. Les récompenses, les dégâts et les cinq minutes de moral sont conservés sans double application. Les items attendent leur retrait si les bagages sont pleins. Le surplus du stock de retour reste dans la cargaison. Une origine détruite ou capturée suspend le retour.

## Exemple

Deux spécialistes pertinents (+20), huit volontaires (+16), trois chevaux (+6), deux outils (+10), huit nourritures, quatre bois et deux bières (+16) donnent 68 points. Le même chargement donne le même score avec le héros ou depuis le poste. Contre une cible de 100, la probabilité indicative est 47,6 %. Aucun tirage n’est fait pendant la préparation.

1er novembre 2026 — préparation et départ serveur des expéditions exceptionnelles, score commun, contrôle des stocks réels, sauvegarde et projection privée.


1er novembre 2026 — résolution, puissance des donjons, conséquences et retour désormais raccordés ; voir l’article de résolution pour les conditions et barèmes.


## Clôture partagée — 1er novembre 2026

La [clôture partagée et les archives](exceptional-site-closure.md) sont centralisées côté serveur. La première victoire ou disparition est conservée ; les préparations concurrentes sont annulées immédiatement et les groupes en trajet rappelés. Les combats en cours restent en place jusqu’à leur issue. Les indices périmés restent archivables sans nouveau risque ni double paiement. La reprise réconcilie les anciens états sans rejouer de récompense ou de tirage.
