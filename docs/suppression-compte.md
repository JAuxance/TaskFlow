# Suppression du compte — RG-06

Version préparée localement le 8 octobre 2026. Le reset et le déploiement restent reportés.

## Parcours

Dans le profil, « Review deletion » affiche les espaces concernés, les projets/tâches/chats qu'ils contiennent, les messages directs, les images courantes et les contenus liés au compte qui restent dans les espaces d'autres propriétaires. Les compteurs sont indicatifs au moment de la lecture.

Un espace possédé avec au moins un autre membre bloque la suppression du compte. Le propriétaire doit d'abord transférer la propriété depuis la gestion des membres (le destinataire doit avoir le rôle `owner`, selon le fonctionnement existant) ou supprimer explicitement l'espace depuis ses réglages. Le compte ne supprime automatiquement que les espaces où son propriétaire est seul.

Après lecture, l'utilisateur coche la confirmation, saisit son mot de passe et confirme l'action. Les textes partagés conservés peuvent encore contenir des informations personnelles : enlever une référence de compte ne les rend pas anonymes. Leur traitement complémentaire passe par le contact.

## Vérification côté serveur

- `GET /api/users/me/deletion-preview` : compte de la session, sans identifiant fourni par le client ; lecture cohérente et réponse privée sans cache.
- `DELETE /api/users/me` : uniquement `password` et `confirmed_workspace_ids` (liste des espaces seuls présentés). Un champ `user_id` supplémentaire est refusé.
- La transaction verrouille la ligne du compte, vérifie le mot de passe actuel puis verrouille ses espaces dans l'ordre des identifiants. Elle relit les autres membres après obtention des verrous. Les contrôles de clés étrangères empêchent l'ajout d'un membre pendant l'effacement.
- Si un autre membre existe : `409 shared_workspaces`. Si la liste des espaces possédés diffère de la confirmation : `409 preview_changed`. Dans les deux cas, rien n'est supprimé.
- Un conflit de verrous ou un interblocage renvoie `409 deletion_busy`, avec annulation de la transaction et invitation à relire le récapitulatif.
- La suppression SQL retire le compte, toutes ses sessions/appartenances et les échanges directs impliquant ce compte. Elle supprime les espaces seuls confirmés, leurs projets, tâches et chats. Les autres espaces restent ; les liens du compte dans leurs tâches et messages passent à `NULL`.
- Les abonnements Socket.IO sont recontrôlés après la suppression ; les diffusions recontrôlent aussi la session et les droits avant chaque envoi.

Code principal : `app/account_deletion.py`, routes dans `app/routes/auth.py`, présentation dans `frontend/src/layout/profile/ProfileDeletionForm.vue`. Le code utilise des fonctions, des requêtes SQL explicites et les clés étrangères déjà présentes.

## Nettoyage des fichiers

La table `file_cleanup_jobs` conserve uniquement le chemin généré du fichier, sa date d'enregistrement et un compteur d'échecs. Les demandes sont enregistrées dans la même transaction que l'effacement du compte. Après commit, une première tentative supprime les images ; en cas d'échec, la ligne reste disponible pour reprise. Un chemin arbitraire, une image par défaut ou un fichier portant l'identifiant d'un autre propriétaire n'est pas pris en charge par cette suppression.

`app/file_cleanup.py` empêche Flask de servir les images générées qui ne sont plus référencées par un profil ou un espace. Cela couvre les fichiers en attente de reprise après suppression. La configuration Nginx préparée transmet `/static/` à Flask ; ne pas la remplacer par un accès direct au répertoire d'images. Les copies déjà téléchargées par un navigateur ne peuvent pas être reprises.

Commande manuelle de reprise (100 fichiers au maximum par exécution) :

```bash
flask --app app.app cleanup-deleted-files
```

Elle affiche uniquement les nombres de suppressions et d'échecs. Vérifier les permissions disque en cas d'échec, puis relancer. Plusieurs exécutions sont sans effet supplémentaire une fois la file vide. La planification, le nettoyage des autres orphelins et l'expiration des sauvegardes seront traités dans RG-09/RG-10. Aucune durée de sauvegarde non appliquée n'est promise dans l'interface.

## Migration et livraison

Sur une base neuve, `01-init.sql` contient la table de reprise et le script suivant donne les droits à `taskflow_app`. Sur une base existante, appliquer **avant le nouveau backend**, depuis le dossier du dépôt :

```bash
docker compose -f compose.prod.yaml exec -T db psql -U taskflow -d taskflow -v ON_ERROR_STOP=1 < app/sql/migrations/20261008_file_cleanup.sql
docker compose -f compose.prod.yaml exec -T db psql -U taskflow -d taskflow -v ON_ERROR_STOP=1 -c 'GRANT SELECT, INSERT, UPDATE, DELETE ON file_cleanup_jobs TO taskflow_app;'
```

La migration crée uniquement la table manquante ; elle est réexécutable et ne réinitialise aucune donnée. Les noms ci-dessus correspondent au Compose du dépôt. Le volume `deletion_log` est déclaré dans `compose.prod.yaml` : le premier démarrage le crée vide, et il ne fait pas partie du dump SQL. Conserver les sauvegardes et les vérifications prévues par la procédure de livraison, puis déployer frontend et backend ensemble : l'API exige désormais la liste confirmée.

Après livraison, la reprise s'exécute dans le conteneur ayant les volumes d'images :

```bash
docker compose -f compose.prod.yaml exec -T backend flask --app app.app cleanup-deleted-files
```

Chaque suppression, depuis le profil ou par `scripts/delete_account.py`, écrit d'abord une ligne `date`, identifiant, e-mail dans `DELETION_LOG_PATH` (en production, le volume `deletion_log`), puis valide le SQL. Ce fichier n'est pas dans le dump SQL. `scripts/restore.sh` réapplique l'identifiant pendant 30 jours : une adresse réutilisée par un autre compte n'est pas effacée. Si l'écriture échoue, le compte reste. Si le SQL échoue, la ligne est retirée.

## Recette

`app/tests/integration/test_account_deletion.py` utilise uniquement la base jetable locale `taskflow_chat_test`. Il couvre propriétaire avec collaborateurs, transfert puis suppression, espace solo et images, contenu partagé conservé, deux sessions distinctes, mot de passe incorrect, liste devenue obsolète, échec disque puis reprise, protection CSRF, chemins étrangers, migration idempotente et deux ordres de concurrence entre ajout de membre et suppression. Les tests du chat couvrent aussi la révocation sur plusieurs connexions.

Les tests ont été préparés et exécutés avec Codex ; la fiche d'oral propose un cas court à reprendre personnellement.

[Documentation PostgreSQL 17 : verrous de lignes et conflits](https://www.postgresql.org/docs/17/explicit-locking.html).
