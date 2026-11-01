# Carte et fiches d’exploration

Les découvertes personnelles apparaissent sur la carte après confirmation du serveur. La carte permet d’ouvrir les préparations existantes ; elle n’accorde ni ressource ni récompense au clic.

| Découverte | Présentation | Action |
| --- | --- | --- |
| Bois | Marqueur de bois | Préparer l’installation d’un camp |
| Pierre | Marqueur de pierre | Préparer l’installation d’un camp |
| Fer | Marqueur de fer | Préparer l’installation d’un camp |
| Or | Marqueur d’or | Préparer l’installation d’un camp |
| Terre fertile | Marqueur de terre fertile | Préparer l’installation d’un camp |
| Terrain vide | Aucun marqueur | Accessible parmi les cases prospectées de la fiche d’installation |
| Trésor, artefact ou donjon découvert et actif | Symbole de site exceptionnel | Ouvrir la préparation d’expédition |

Les ressources encore secrètes ne sont pas transmises. Les positions des marqueurs sont fournies par le serveur pour les seules cellules connues du joueur. Un autre joueur possède sa propre carte de connaissances.

## Installer et préparer

Sélectionner un gisement ouvre sa fiche et présélectionne la case pour un envoi depuis un poste de prospection. Le bouton de fondation sur place concerne explicitement la case actuelle du héros : il faut s’y rendre pour l’utiliser. Les coûts, conditions de terrain et moyens disponibles sont ceux validés par le serveur.

Lorsqu’un camp visible occupe la cellule, sa fiche de lieu remplace le marqueur de ressource. Les évolutions respectent le terrain. La création du camp ne donne pas immédiatement une production.

Un site exceptionnel ouvre la fiche d’expédition avec le site choisi. La préparation, le départ, la tentative et le retrait des récompenses utilisent les commandes serveur existantes. Les résultats restent consultables dans la fiche, y compris pendant le retour d’un groupe. Les installations disposent de leur historique séparé.

## Résultats et documents

Les sites remportés ou disparus perdent leur marqueur actif. Leurs résultats restent dans l’historique des missions du joueur. La victoire est annoncée à tous immédiatement ; la disparition est annoncée après cinq minutes. Ces annonces ne donnent pas de coordonnées cachées.

Les cartes et messages détenus se lisent dans les documents des bagages. Ils ne prennent pas de place dans leur capacité. Les indices devenus inutiles restent des items et peuvent être vendus aux archives d’un cartographe ou géographe pour 5 à 10 or selon leur type. Les options de vente sont validées par le serveur.

Les nouvelles parties placent les sites exceptionnels hors des lieux ordinaires et de leur influence. Une ancienne référence hébergée ne crée aucun marqueur ni interaction de carte supplémentaire ; sa migration suit les règles de clôture des anciennes sauvegardes.

## Vérification technique — 1er novembre 2026

La même couche affiche les positions officielles en GPS et sur carte fictive. Les tests couvrent les cinq ressources, le terrain vide, les doublons de camps et de sites hébergés, le retrait des sites fermés, la sauvegarde/reprise et l’isolation des connaissances. La suite d’intégration vérifie aussi les commandes répétées, les stocks, les missions concurrentes et les projections réseau. La vérification automatisée ne remplace pas un essai visuel dans un navigateur ni une sortie GPS réelle.
