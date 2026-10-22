# Déploiement de référence

Révision du 22 octobre 2026. La version a9bb4bd a été publiée et contrôlée sur le VPS. Cette procédure sert aux livraisons suivantes.

Le chemin retenu est Cloudflare → Nginx sur le VPS → Gunicorn/Flask, avec PostgreSQL et Redis dans compose.prod.yaml.

1. Identifier la révision à publier et sauvegarder PostgreSQL, les volumes d'images historiques et le journal externe de suppressions selon [la procédure de sauvegarde](retention-sauvegardes.md).
2. Configurer .env à partir de .env.example : secrets uniques, APP_ENV=production, PUBLIC_ORIGIN HTTPS, contact et mots de passe PostgreSQL. Ne pas versionner .env.
3. Sur une base existante, vérifier les migrations déjà appliquées. La livraison du 22 octobre ne nécessitait aucune suppression de table. Ne pas réinitialiser les volumes.
4. Construire le frontend de la même révision : npm ci --prefix frontend puis npm run build --prefix frontend. Publier frontend/dist dans la racine Nginx configurée.
5. Exécuter docker compose -f compose.prod.yaml up -d --build. Gunicorn utilise quatre threads ; PostgreSQL et Redis n'exposent pas de port public.
6. Installer les fichiers deploy/nginx selon [la procédure proxy et cache](protection-requetes.md). Vérifier nginx -t avant rechargement. /socket.io n'est plus relayé. Conserver le contrôle des médias historiques, les en-têtes de sécurité et l'exclusion du cache privé.
7. Contrôler /health, connexion, tâche sauvegardée, rôle guest, export et aperçu de suppression avec des comptes de recette. Vérifier les journaux et l'absence d'erreur avant de déclarer la livraison réussie.

TRUST_PROXY_HEADERS doit rester désactivé tant que la chaîne de proxy fiable n'est pas configurée. Le renouvellement HTTPS, les nettoyages planifiés, les sauvegardes et la réapplication des suppressions après restauration restent nécessaires.

Pour revenir en arrière, republier ensemble les anciens frontend/backend. Les données historiques restent compatibles ; ne pas restaurer aveuglément une base qui ferait réapparaître des comptes supprimés.

## Chemins constatés sur le VPS

- Code : `/srv/sites/taskflow/source` ; `/home/ubuntu/Deploy/TaskFlow` est un lien vers ce dossier.
- Frontend : `/srv/sites/taskflow/web` ; `/var/www/taskflow` est un lien vers ce dossier.
- Nginx : `/etc/nginx/sites-available/taskflow.auxance.dev` et inclusions dans `/etc/nginx/taskflow/`.
- HTTPS : certificats Certbot existants ; timer de renouvellement présent.
- Build frontend du 22 octobre : conteneur Node 22, car npm n’est pas installé directement sur l’hôte.
- Sauvegarde de livraison : `/home/ubuntu/taskflow-release-backup-20261022-a9bb4bd`, accès restreint.

Les contrôles publics de livraison sont distincts de la campagne de tests locale. La planification automatique des sauvegardes et nettoyages reste à mettre en place ; voir retention-sauvegardes.md.
