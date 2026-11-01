# Commandes PowerShell et accès au serveur

Cette fiche explique les commandes de maintenance et de supervision. Elle ne modifie aucune règle du jeu. Les exemples supposent que l’alias SSH `rpg-gps-server` est déjà configuré sur le PC Windows.

## Sur Windows : ouvrir PowerShell dans le projet

```powershell
Set-Location 'C:\Users\A\Desktop\HTML\RPG GPS'
```

Les commandes npm suivantes s’exécutent depuis ce dossier. `npm.cmd` évite le blocage éventuel de `npm.ps1` par la politique d’exécution PowerShell.

## Déployer la version locale sur le serveur Linux

```powershell
npm.cmd run deploy
```

Cette commande exécute les tests, prépare une archive, la transfère par SSH, puis installe la version sur le serveur. Elle met à jour le jeu et son Dashboard ; elle peut demander le mot de passe sudo du serveur. Attendre le message de réussite. Fermer un tunnel SSH ne déploie pas le jeu.

## Accéder au Dashboard depuis Windows

Dans une première fenêtre PowerShell :

```powershell
ssh -N -L 3001:127.0.0.1:3000 rpg-gps-server
```

Laisser cette fenêtre ouverte. Il est normal de ne plus avoir d’invite pour écrire : SSH maintient le tunnel. Ouvrir ensuite dans le navigateur :

```text
http://127.0.0.1:3001/dashboard/
```

Le port 3001 de Windows est relié au port 3000 du serveur. `Ctrl + C` ferme le tunnel et coupe cet accès au Dashboard. Pour taper d’autres commandes, utiliser une deuxième fenêtre PowerShell. Si le port 3001 est déjà occupé, remplacer 3001 par 3002 dans la commande et dans l’adresse du navigateur.

## Se connecter au terminal Linux

Dans une deuxième fenêtre PowerShell :

```powershell
ssh rpg-gps-server
```

Après connexion, les commandes saisies s’exécutent sur Linux. Pour revenir à PowerShell :

```bash
exit
```

Fermer cette connexion de terminal ne ferme pas le tunnel de la première fenêtre.

## Sur Linux : trouver la clé du Dashboard

Après `ssh rpg-gps-server`, saisir :

```bash
journalctl -u rpg-gps -n 30 --no-pager
```

Chercher la ligne indiquant la clé du Dashboard et saisir cette clé dans le formulaire du navigateur. Si le démarrage est plus ancien, afficher davantage de lignes :

```bash
journalctl -u rpg-gps -n 200 --no-pager
```

Sans clé stable configurée avec `RPG_GPS_DASHBOARD_TOKEN`, la clé change au redémarrage du serveur. Si l’accès au journal est refusé, ajouter `sudo` devant `journalctl`. Le mot de passe sudo est celui du compte Linux ; les caractères saisis ne s’affichent pas, c’est normal.

On peut aussi consulter le journal directement depuis PowerShell, sans ouvrir de terminal Linux interactif :

```powershell
ssh rpg-gps-server 'journalctl -u rpg-gps -n 30 --no-pager'
```

## Sur Linux : vérifier le service et les ressources

État du serveur de jeu :

```bash
systemctl --no-pager --full status rpg-gps
```

Journal en direct (`Ctrl + C` arrête la lecture, sans arrêter le jeu) :

```bash
journalctl -u rpg-gps -f
```

Mémoire disponible et place sur le disque :

```bash
free -h
df -h /
```

Consommation du processus du service, même si son nom est MainThread :

```bash
top -p "$(systemctl show -p MainPID --value rpg-gps)"
```

Appuyer sur `q` pour quitter `top`. Le Dashboard affiche aussi mémoire, CPU et nombre de parties actives.

## Sur Linux : redémarrer, arrêter ou démarrer le serveur

Ces commandes agissent sur tout le service du jeu, donc sur les connexions des joueurs. Les utiliser lorsque cette interruption est souhaitée. Pour effacer une seule partie, préférer son bouton Effacer dans le Dashboard.

```bash
sudo systemctl restart rpg-gps
sudo systemctl stop rpg-gps
sudo systemctl start rpg-gps
```

Choisir une seule de ces commandes selon le besoin ; ne pas lancer les trois à la suite. Redémarrer ou arrêter le service ne supprime pas ses sauvegardes.

## Sur Windows : lancer le jeu localement et maintenir le wiki

Depuis le dossier du projet :

```powershell
npm.cmd start
```

Ouvrir `http://127.0.0.1:3000/` pour le jeu local ou `http://127.0.0.1:3000/dashboard/` pour le Dashboard local. Ce serveur Windows est distinct du serveur Linux. Sa clé est affichée dans la fenêtre qui lance le serveur. `Ctrl + C` l’arrête.

Pour lancer les tests :

```powershell
npm.cmd test
```

Après modification des sources du wiki, générer une version avec une note, puis préparer l’export :

```powershell
npm.cmd run wiki:build -- --note 'Description du changement'
npm.cmd run wiki:export
```

L’export prépare `.wiki-publish/` et conserve les archives. Il ne publie pas à lui seul : la publication nécessite un commit et un push dans le dépôt dédié `jojo8104/rpg-gps-wiki`, lorsqu’elle est demandée.
