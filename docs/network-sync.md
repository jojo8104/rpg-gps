# Synchronisation multijoueur

Le moteur serveur avance toutes les 500 ms. Le cycle de production reste de 10 secondes.
Les diffusions automatiques de chaque flux (`game:state`, `game:positions`,
`game:world-state`) sont espacées d'au moins 3 secondes par connexion.
Les changements intermédiaires sont regroupés ; un état projeté identique ne produit aucun envoi.

La projection est calculée avant la différence : lieux connus et actifs, GA détectés
(y compris par divination), traces détectables, gisements découverts et sites de combat visibles.
Les règles existantes de confidentialité des héros, alliances et combats continuent de s'appliquer.
Les lieux découverts restent connus à distance. La découverte de proximité est exécutée
par le serveur avant le filtrage. Le moteur serveur conserve toujours le monde complet.

Le premier paquet contient un état complet filtré (`sync.kind: full`). Ensuite les paquets
`delta` contiennent une séquence de base, une nouvelle séquence et les champs modifiés.
Les collections identifiées sont mises à jour par identifiant : ajout, modification,
retrait ou changement d'ordre. Une sortie de visibilité retire l'entité du cache client.
La révision globale seule n'entraîne pas de diffusion. Les journaux sans identifiants
sont mis à jour par index.

Les réponses aux commandes restent immédiates et utilisent le même cache de différences.
Les accusés de réception GPS contiennent seulement des métadonnées : ils ne contournent
pas la cadence automatique. Initialisation, reprise et resynchronisation explicite peuvent
envoyer un état complet. `game:sync` réinitialise les trois flux.

Le client reconstruit l'état dans un cache indépendant de la simulation optimiste de
l'interface. Il demande une resynchronisation si une séquence manque et reprend sa session
après reconnexion. Ce protocole nécessite la mise à jour conjointe du serveur et du client.
Le cache du service worker est versionné pour charger le nouveau client.

Les marqueurs des GA visibles sont animés côté client entre les paquets. Le temps
restant du trajet serveur est ancré sur une horloge locale monotone à sa réception,
sans dépendre d'une synchronisation des horloges des téléphones. Une correction de
400 ms absorbe les écarts au paquet suivant. L'animation s'arrête à destination,
sur interruption ou au retrait du marqueur. Elle ne modifie aucune position du moteur
et n'effectue aucun envoi réseau supplémentaire.

## Confidentialité de l’exploration — 28 octobre 2026

Le modèle privé explorationState ne traverse pas le réseau. La vue explorationView
est calculée par destinataire avant les snapshots et deltas, y compris pour les
synchronisations et accusés de commandes. Elle expose uniquement les découvertes,
indices détenus et missions autorisées. Les graines, cibles internes, fragments
manquants et résultats futurs restent côté serveur. Voir le
[contrat de lecture](exploration-privacy.md). Ce raccordement ne déclenche aucune
découverte ni récompense supplémentaire.
