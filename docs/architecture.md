# Architecture de TaskFlow

Révision du 22 octobre 2026. Vue 3 + TypeScript communique par HTTP JSON avec Flask. Psycopg exécute les requêtes PostgreSQL. Les fonctions de messagerie et Socket.IO ont été retirées.

## Parcours d'une modification

1. TaskView charge la tâche, son projet et les droits du workspace.
2. Les champs restent dans un brouillon local. Save changes construit un PATCH avec seulement les champs modifiés.
3. Le client HTTP ajoute le jeton CSRF et transmet le cookie de session.
4. Flask vérifie origine, CSRF, session, appartenance, rôle et valeurs.
5. db.py exécute un UPDATE paramétré limité aux champs transmis, puis renvoie la ligne confirmée.
6. Vue remplace le brouillon après succès. En cas d'échec, il reste modifiable pour réessayer.

Les champs sont désactivés pendant la requête. Une confirmation protège une navigation avec des modifications non enregistrées. L'expiration de session permet toujours de revenir à la connexion.

## Responsabilités

- frontend/src/views : écrans, formulaires et navigation.
- frontend/src/api : appels HTTP et types des échanges.
- frontend/src/stores : session et liste des workspaces.
- app/routes : contrats HTTP et validation des entrées.
- app/permissions.py : autorisation côté serveur.
- app/db.py : requêtes SQL et transactions.
- app/account_deletion.py, data_export.py, deletion_log.py : droits sur les données et restauration.

## Données et droits

Six tables servent le périmètre courant : users, sessions, workspaces, workspace_members, projects, tasks. Les deux tables de messages historiques et file_cleanup_jobs restent conservées. Les anciennes images gardent leurs contrôles d'accès et leur procédure de nettoyage. Aucune migration destructive n'accompagne cette simplification.

Owner, admin, member et guest sont conservés. Le titulaire principal reste distinct du rôle owner. Un guest consulte les tâches sans pouvoir les modifier. Masquer un bouton n'est jamais le contrôle de sécurité : Flask décide.

## Exécution

En développement : Vite sur 5173 relaie les requêtes vers Flask sur 5000 ; PostgreSQL tourne avec Compose.
En production : Cloudflare, Nginx, Gunicorn/Flask, PostgreSQL et Redis pour les limites de requêtes. Le frontend compilé est servi par Nginx. Voir [déploiement](deploiement.md).

## Limites connues

Deux modifications de champs différents se conservent. Sur le même champ, la dernière écriture réussie gagne : il n'y a pas de résolution de conflit ni de verrou optimiste. Le tableau ne se synchronise pas en temps réel entre utilisateurs. Les dates des tâches restent des TIMESTAMP sans fuseau. Les contrôles avant écriture et la mise à jour ne forment pas une transaction unique verrouillant toutes les permissions.
