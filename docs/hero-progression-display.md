# Affichage de la progression du héros

Dans une nouvelle partie, les héros joueurs commencent au niveau 1 avec 0 XP. Le lancement n’ajoute plus de cavaliers d’essai et n’augmente plus leur niveau pour compenser le coût de commandement d’une armée de test. Les forces de départ restent celles de la classe et du scénario. Une reprise de sauvegarde conserve la progression acquise ; les personnages non joueurs du scénario peuvent avoir un niveau supérieur.

Les gains d’XP et les passages de niveau sont affichés par la file d’animations des récompenses. L’interface compare l’expérience totale et le niveau des états officiels successifs du héros : elle n’accorde aucune récompense et ne calcule aucun niveau.

Le premier état reçu sert de référence. Les rafraîchissements identiques ne répètent pas les annonces ; une baisse d’expérience devient la nouvelle référence. Une réinitialisation ou un changement de héros efface cette référence et les animations en attente. Plusieurs gains entre deux affichages sont regroupés en une annonce.

Les messages contextuels de marche et de quête restent présents, mais leur XP est annoncé par cet affichage commun. Le niveau disponible et le choix d’amélioration restent distincts du niveau effectivement atteint. Les règles du moteur et la validation serveur sont inchangées, en GPS comme en simulation.

La marche fiable rapporte désormais 100 XP supplémentaires par tranche complète de 500 m, quel que soit le niveau du héros. Le serveur conserve le total de distance ; seuls les nouveaux paliers franchis sont récompensés. Il n’y a plus de pourcentage du niveau suivant ni de bonus kilométrique distinct. Les mesures imprécises et les sauts de plus de 250 m restent rejetés. Sur carte fictive, un pas de coordonnée correspond à 10 m, avec le même calcul serveur. Le navigateur n’accorde aucune XP de marche de secours.

Le message « Distance parcourue » indique le palier en mètres. L’annonce d’XP provient uniquement des états officiels. La distance officielle totale est affichée sous le grade du héros : le libellé « Distance parcourue » est plus petit et la valeur en mètres apparaît en dessous, plus grande. Le texte peut revenir à la ligne sans être tronqué. Le bloc de distance est séparé du grade et dispose de la hauteur nécessaire en paysage. Cette présentation ne change ni le cumul ni les récompenses calculés par le serveur. La fenêtre de choix de niveau utilise la palette parchemin, y compris ses boutons et son résumé. Une nouvelle partie solo reprend le pseudo du joueur comme nom de héros, comme en multijoueur ; les héros déjà sauvegardés gardent leur nom.

Les convois de l’économie royale desservent les exploitations d’or, fer, bois et pierre même si les contraintes de placement les ont éloignées du rayon économique indicatif. Les coûts, la propriété, la production et les trajets restent ceux du moteur serveur.

Le commandement de la fiche du héros affiche la caractéristique finale officielle, équipement et modificateurs temporaires compris. Les points disponibles restent consultables dans le détail. Ce changement de présentation ne modifie pas le budget calculé par le serveur.
