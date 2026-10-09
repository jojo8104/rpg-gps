# Affichage de la progression du héros

Dans une nouvelle partie, les héros joueurs commencent au niveau 1 avec 0 XP. Le lancement n’ajoute plus de cavaliers d’essai et n’augmente plus leur niveau pour compenser le coût de commandement d’une armée de test. Les forces de départ restent celles de la classe et du scénario. Une reprise de sauvegarde conserve la progression acquise ; les personnages non joueurs du scénario peuvent avoir un niveau supérieur.

Les gains d’XP et les passages de niveau sont affichés par la file d’animations des récompenses. L’interface compare l’expérience totale et le niveau des états officiels successifs du héros : elle n’accorde aucune récompense et ne calcule aucun niveau.

Le premier état reçu sert de référence. Les rafraîchissements identiques ne répètent pas les annonces ; une baisse d’expérience devient la nouvelle référence. Une réinitialisation ou un changement de héros efface cette référence et les animations en attente. Plusieurs gains entre deux affichages sont regroupés en une annonce.

Les messages contextuels de marche et de quête restent présents, mais leur XP est annoncé par cet affichage commun. Le niveau disponible et le choix d’amélioration restent distincts du niveau effectivement atteint. Les règles du moteur et la validation serveur sont inchangées, en GPS comme en simulation.

Le message de marche porte le titre « Distance parcourue » et indique le palier en mètres, avec la mention du bonus kilométrique lorsqu’il est atteint. Il ne répète pas le gain d’XP du résultat de déplacement : l’annonce d’XP provient uniquement de la comparaison des états officiels. La correction du test de ce message ne modifie aucune règle de récompense.
