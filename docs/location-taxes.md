# Impôts des lieux

Les villages, villes et capitales actifs et peuplés accumulent une réserve fiscale
à chaque cycle de production. Les pauses de production suspendent les impôts.

Plafond en or : `population + 2 × somme des niveaux des améliorations économiques`.
Le résultat est arrondi à l'entier inférieur.

Les bâtiments économiques du catalogue sont le comptoir, le relais de chasse,
la ferme et la brasserie. Chaque niveau apporte 2 or au plafond. Les habitations
agissent indirectement par la population accueillie. Le niveau du lieu ne donne
plus de multiplicateur supplémentaire.

Le revenu par cycle vaut **1 % du plafond**. Avec 20 habitants et une ferme de
niveau 2 : plafond de 24 or, revenu de 0,24 or par cycle. La réserve vide se remplit
en 100 cycles à situation constante. La production s'arrête au plafond et reprend
après la collecte.

Le bouton affiche « collecter impôts : xx gold », avec le montant entier disponible.
Le joueur qui contrôle le lieu collecte sur place avec
son héros. Les fractions restent dans la réserve, sauvegardée avec le lieu.

En mode expert, chaque collecte réussie diminue le moral (contentement) de la
population de 1 point par tranche de 10 gold entamée, jusqu'à 5 points par collecte.
Le moral reste au minimum à zéro. Un moral non renseigné est initialisé à 50 avant
la pénalité. La collecte n'affecte pas le moral en mode casual, ni en cas d'échec.

Si le plafond diminue, la réserve est limitée au nouveau plafond lors du prochain
cycle ou de la collecte. Cette limite vaut aussi pour les anciennes sauvegardes.

Les règles sont dans `app/js/core/location-tax-service.js`.
