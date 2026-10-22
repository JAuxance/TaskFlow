# Rétention et sauvegardes

La cible de production est `compose.prod.yaml`. Pour un essai local, passer `COMPOSE_FILE=compose.yaml`.

Le 22 octobre 2026, une sauvegarde de livraison a été créée et vérifiée. Les crontabs et timers système contrôlés ne présentent pas de planification TaskFlow. Les règles ci-dessous sont celles des scripts ; les lignes cron sont des exemples à installer, pas une automatisation attestée.

## Ce qui est conservé

Les sessions durent **24 heures**. `scripts/cleanup.py` supprime les sessions expirées, et les sessions révoquées créées depuis plus de **7 jours**.

Les images orphelines (avatars et icônes) sont supprimées après **24 heures**, seulement si le nom est `nombre_32hex.jpg|jpeg|png|webp` et que le chemin n'est plus référencé. Les fichiers d'un compte supprimé passent d'abord par `file_cleanup_jobs` (`flask --app app.app cleanup-deleted-files`).

Les tâches, les projets et les messages restent jusqu'à la suppression du workspace ou du compte.

## Sauvegardes

```bash
./scripts/backup.sh
```

Le script utilise `compose.prod.yaml`. Il écrit dans `$HOME/.local/share/TaskFlow/backups`, hors du dépôt :

- `taskflow-YYYYMMDDTHHMMSSZ.dump` : dump PostgreSQL custom ;
- `taskflow-YYYYMMDDTHHMMSSZ-images.tar` : volumes d'images montés dans le backend.

Le répertoire est en `0700`, les fichiers en `0600`. Une copie est retirée lorsqu'elle a plus de **30 jours** ou lorsqu'elle dépasse les **14** plus récentes. Si la tâche cron s'arrête, cette limite n'est pas appliquée tant que le script ne tourne pas : vérifier chaque jour que le dump le plus récent a moins de 36 heures.

```cron
15 3 * * * cd /chemin/vers/TaskFlow && docker compose -f compose.prod.yaml exec -T backend python scripts/cleanup.py
30 3 * * * cd /chemin/vers/TaskFlow && ./scripts/backup.sh
```

## Restauration

Le script arrête le backend public, restaure la base pendant que `db` reste démarré, puis utilise un conteneur ponctuel (mêmes volumes, port 5000 non publié) pour les images, le journal d'effacements et le nettoyage des fichiers. Si `pg_restore` échoue, il s'arrête avant de toucher aux images. Il ne relance pas le backend.

Lancer d'abord la procédure sur une copie jetable. Sur la copie de production, taper `--confirm` au moment de l'exécution :

```bash
./scripts/restore.sh --confirm "$HOME/.local/share/TaskFlow/backups/taskflow-YYYYMMDDTHHMMSSZ.dump"
```

Le script attend aussi l'archive `-images.tar` du même horodatage. Le journal `/var/taskflow/deletions.log` est un volume séparé du dump SQL. Les lignes de moins de 30 jours sont réappliquées avant la réouverture : un compte supprimé après le dump, depuis le profil ou par `scripts/delete_account.py`, reste absent. Relancer le backend seulement après avoir vérifié le résultat.

Le dump SQL ne contient pas les volumes `avatars_data`, `workspace_icons_data` et `deletion_log`. Une image ajoutée ou retirée après l'heure du dump n'est pas dans l'archive.
