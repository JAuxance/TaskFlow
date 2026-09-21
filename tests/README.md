Tests des messages privés (Python 3.12).

Depuis la racine du dépôt :

```bash
python -m pip install -r requirements-test.txt
python -m unittest discover -s tests -v
python -m playwright install --with-deps chromium
python -m tests.browser_direct_messages
```

Les tests utilisent un serveur PostgreSQL temporaire, supprimé à la fin. Ils ne lisent pas `.env` et ne touchent pas la base de développement. Le test navigateur démarre lui-même le backend et le front : les ports 5000 et 5500 doivent être libres. Il utilise trois sessions Chromium et le client Socket.IO chargé par le front.

Couverture : envoi/réponse, historique privé paginé, validation, droits d'accès, isolation des conversations, sessions expirées/révoquées, retrait du workspace, réception temps réel, reconnexion, absence de doublons, brouillon conservé en cas d'échec, affichage mobile et non-régression du chat de workspace.

Pour une base Docker existante qui n'a pas encore la table `direct_messages`, appliquer la migration (réexécutable) :

```bash
docker compose exec -T db psql -U taskflow -d taskflow -v ON_ERROR_STOP=1 < app/sql/migrations/20260920-direct-messages.sql
```

Accès dans l'interface : ouvrir un workspace, puis **Members → Message** sur un autre membre. La conversation est commune à tous les workspaces partagés avec cette personne.
