# Correction des accès au chat - RG-01

## Problème et changement

Un membre retiré d'un espace ne pouvait plus lire ses messages par l'API, mais une connexion Socket.IO déjà ouverte restait dans le salon et recevait les publications suivantes.

La diffusion vérifie maintenant la session et les droits de chaque destinataire. Un destinataire interdit quitte le salon. La suppression d'un membre, d'un espace ou d'un compte, ainsi que le logout, provoquent également un contrôle immédiat des abonnements. Une expiration ou une modification directe en base est prise en compte au plus tard lors de la prochaine diffusion.

Les mêmes contrôles protègent les messages privés : les deux personnes doivent encore partager au moins un espace. La perte d'un espace n'interdit pas la conversation si un autre espace commun existe. Un logout concerne sa session ; les autres sessions valides du même compte restent utilisables.

## Lire le code

1. `app/permissions.py` : `get_session_user(token)` réutilise la vérification de session pour HTTP et Socket.IO.
2. `app/sockets/access.py` : un dictionnaire associe chaque connexion à son jeton de session. `can_read_chat` contrôle les droits ; `publish_chat_message` vérifie chaque destinataire avant envoi ; `refresh_chat_access` retire les abonnements interdits. Le dictionnaire est nettoyé à la déconnexion.
3. `app/sockets/workspace_chat.py` et `direct_messages.py` : les salons utilisent ce contrôle commun.
4. Les routes de logout/suppression appellent le contrôle après la modification réussie en base.

Le code utilise des fonctions, des conditions et des boucles. Il n'ajoute ni bibliothèque de production ni migration SQL. Le dictionnaire reste en mémoire dans le worker unique configuré dans le Dockerfile. Un passage à plusieurs workers devra prévoir une coordination des connexions et révocations ; il ne suffit pas d'augmenter `--workers`.

Les messages déjà envoyés avant le retrait ne peuvent pas être repris au navigateur. La correction empêche les nouvelles publications de parvenir à un destinataire qui n'est plus autorisé au moment du contrôle. Elle n'est pas une garantie d'effacement des copies qu'un utilisateur a déjà reçues.

## Refaire les tests locaux

Depuis la racine du dépôt TaskFlow, avec un environnement Python contenant les dépendances du projet :

```bash
python -m pip install -r requirements.txt -r requirements-dev.txt
python -m pytest -q
docker compose -f compose.chat-tests.yaml up -d --wait
TASKFLOW_CHAT_INTEGRATION=1 python -m pytest -q app/tests/integration/test_chat_revocation.py
docker compose -f compose.chat-tests.yaml down
```

Les tests unitaires et réseau sont exécutés dans deux processus Python séparés : le client de test Flask-SocketIO remplace des fonctions de transport du serveur et ne doit pas être mélangé avec les connexions réseau dans le même processus.

Le conteneur PostgreSQL est jetable, sans volume persistant, accessible seulement sur `127.0.0.1:55438`. Les identifiants sont fictifs. La recette réinitialise uniquement `taskflow_chat_test` sur ce port ; elle n'utilise ni la base du VPS ni le laboratoire RNCP sur le port 55437.

## Couverture de la recette

- Retrait d'un membre avec deux connexions ouvertes ; refus d'une nouvelle adhésion ; réception maintenue pour le propriétaire.
- Session expirée, révoquée ou supprimée ; logout ; suppression du compte.
- Droits supprimés directement en PostgreSQL, sans dépendre du contrôle déclenché par une route.
- Conservation d'un autre espace autorisé et d'une autre session valide.
- Messages privés : retrait, suppression d'espace, logout, expiration et suppression du compte.
- Conversation privée conservée s'il reste un autre espace partagé ; refus après disparition de la dernière appartenance commune.
- Entrées Socket.IO incorrectes refusées sans erreur serveur.

Les tests d'intégration utilisent PostgreSQL réel, HTTP via `requests` et WebSocket via le client Python Socket.IO. Leurs connexions représentent plusieurs onglets, mais aucun navigateur graphique n'est lancé par cette recette.

## État de livraison

Correctif préparé localement depuis `main` à `8201754ff0eba2b952f902c8f8f66b60a44121fe`, sur `fix/chat-access-revocation`. Pas de déploiement sur le VPS. Les protections CSRF, pages de confidentialité, export et règles de conservation restent des lots distincts du cahier des charges.
