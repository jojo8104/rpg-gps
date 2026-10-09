# Effets tactiques — première version ajustable

Règles exécutées sur le serveur. Les pourcentages modifient les statistiques avant le calcul des dégâts ; ils ne promettent pas une variation identique des dégâts finaux. Les effets de terrain et de structure se multiplient. La météo et les techniques existantes restent appliquées. Les anciennes cartes dont `terrainEffectsEnabled` est faux conservent leur comportement antérieur.

| Terrain / structure | Effet appliqué |
| --- | --- |
| Plaine | Aucun modificateur ; charges et harcèlement autorisés. |
| Forêt | Défense ×1,25 ; attaque de la cavalerie située en forêt ×0,75 ; vitesse pendant le déplacement ×0,75 ; déplacements d’une case ; charge et harcèlement interdits. |
| Colline | Défense ×1,15 ; attaque des archers situés sur la colline ×1,15 ; vitesse pendant le déplacement ×0,75 ; déplacements d’une case ; charge et harcèlement interdits. |
| Rochers | Défense ×1,30 ; attaque de la cavalerie située sur les rochers ×0,70 ; vitesse pendant le déplacement ×0,75 ; déplacements d’une case ; charge et harcèlement interdits. |
| Eau | Franchissable ; défense totale (technique incluse) ×0,25, soit −75 %. |
| Pont | Permet de franchir l’eau sans le malus défensif de l’eau ; ne permet pas un trajet de charge ou de harcèlement. |
| Tour | Défense ×1,20 ; portée des archers +1 ; charge et harcèlement interdits. |
| Barricade | Défense ×1,25 ; charge et harcèlement interdits. |
| Village | Défense ×1,10 ; charge et harcèlement autorisés si le terrain est une plaine. |

Les cartes sont générées avec ou sans rivière (50 % chacune), avec départs libres et pont central lorsqu’il y a une rivière.

| Type d’unité | Règle appliquée |
| --- | --- |
| Infanterie / héros | Déplacement d’une case orthogonale ; une victoire de mêlée permet d’occuper la case du défenseur neutralisé. |
| Lanciers | Défense ×1,50 contre les cavaleries, cumulable avec le terrain. |
| Mur de lances (lanciers) | Défense ×2 au total contre la cavalerie (remplace ×1,50), dégâts finaux ×1,50 contre elle et bonus de technique défensive égal à la vitesse. Riposte automatique à une attaque de cavalerie au contact. Immobilisation après activation jusqu’à la fin du tour : aucune prise de case, même après une victoire. |
| Infanterie lourde | Défense ×1,50 contre les archers, y compris montés. Entrée dans l’eau interdite, même après une victoire ; passage sur un pont autorisé. |
| Épéistes | Déplacements d’une case dans les huit directions. Attaque ×1,25 contre une cible en village, barricade ou tour. |
| Archers | Portée de la fiche ; restent en place après destruction de leur cible. |
| Cavaleries | Déplacement d’une case dans les huit directions ; charge rectiligne de deux cases maximum sur terrain plat, sans sauter une unité. |
| Cavalerie légère | Charge : attaque ×1,15 ; harcèlement : aller de deux cases maximum sur plaine, mêlée avec riposte, puis retour si elle survit. |
| Cavalerie lourde | Charge : attaque ×1,25 ; aucun harcèlement. |
| Archers montés | Harcèlement : aller de deux cases maximum sur plaine, tir à la portée de leur fiche en restant à deux cases minimum de la cible, puis retour ; aucune riposte de mêlée automatique. |

Le bonus de charge s’ajoute à la technique de charge existante. Le harcèlement consomme un seul ordre, son trajet est calculé et revérifié par le serveur et sa case de départ reste réservée pendant l’excursion. Si le trajet ou la cible devient inaccessible, l’action est annulée. Les archers montés restent soumis aux tirs adverses et aux autres attaques programmées.

Une case alliée n’est accessible que si son occupant a un ordre MOVE ou CHARGE exécuté plus tôt. Si cet ordre est bloqué, le mouvement suivant est annulé à son tour, même si une contre-attaque libère ensuite la case.

La prise de case concerne un attaquant de mêlée survivant adjacent, hors harcèlement. En cas de plusieurs prétendants simultanés à la même case, personne n’avance. Une unité mise en déroute ou rendue inapte libère également sa case.

La présentation rejoue les positions officielles : aller, projectiles / impacts et dégâts, puis retours de harcèlement et prises de case. Elle ne recalcule pas les combats.

La réduction de vitesse en forêt, sur colline et sur rochers est provisoirement de 25 %. Elle affecte les bonus de technique uniquement à l’étape où l’unité entre sur cette case, sans modifier sa statistique permanente ni la priorité de son ordre. Une unité déjà installée, y compris au sommet d’une colline ou sur des rochers, utilise toute sa vitesse dès l’étape suivante. Elle ne change pas la durée des animations.

Le mur de lances ne protège qu’après son numéro d’ordre ; ses effets expirent à la fin du tour. La riposte ne vise pas un tir à distance. Les valeurs des nouvelles spécialités sont provisoires et ajustables.

## Destination contestée

À priorité égale, deux déplacements adverses valides vers la même case libre provoquent un échange simultané sur le terrain de destination. Les effets du terrain, les spécialités et le ralentissement de déplacement s’appliquent aux deux combattants. Un seul survivant opérationnel occupe la case, y compris si son unité est un archer puisqu’il avait un ordre de déplacement. Deux survivants restent à leurs positions de départ ; deux unités neutralisées laissent la case vide. Le bonus n’est capturé qu’après l’occupation effective. Une charge bloquée avant la destination ne la conteste pas. Les échanges de positions adverses restent traités comme des engagements distincts.
