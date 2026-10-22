# Protection des requêtes — RG-07

## Fonctionnement

Une attaque CSRF cherche à faire envoyer une action par le navigateur d'une personne connectée depuis un autre site. Le cookie d'authentification ne suffit pas à montrer que cette personne a choisi cette action.

`app/security.py` contrôle toutes les requêtes qui modifient `/api/` : inscription, connexion, déconnexion, créations, modifications, suppressions et retrait des anciennes images. Le contrôle précède le traitement métier.

1. Le frontend demande un jeton aléatoire à `GET /api/auth/csrf`. Flask l'associe à sa session signée.
2. Le client HTTP du frontend (`frontend/src/api/client.ts`) transmet ce jeton dans `X-CSRF-Token` avec le cookie.
3. Le serveur vérifie l'origine exacte et compare le jeton à celui de la session. Une origine étrangère, une origine absente sans Referer valable ou un jeton incorrect donne `403`.
4. Après une connexion ou une inscription réussie, la session change et un nouveau jeton sera demandé. Les mutations suivantes récupèrent le jeton courant ; plusieurs sauvegardes simultanées partagent la requête de récupération en cours.

Le jeton est une protection complémentaire : les routes continuent à vérifier l'utilisateur et ses droits. Il n'est ni un mot de passe ni un mécanisme d'autorisation. Une erreur ne déclenche pas une répétition automatique de la mutation. Une requête `FormData` conserve son type multipart et sa frontière générée par le navigateur.

En développement, les origines autorisées sont `http://localhost:5173` et `http://127.0.0.1:5173`, celles du serveur Vite du frontend. En production, `PUBLIC_ORIGIN` doit être l'origine HTTPS publique exacte, sans chemin. Les cookies de production restent `Secure`, `HttpOnly` et `SameSite=Lax`.

## Cache et scripts

Les réponses de l'API et des images utilisateur portent `Cache-Control: no-store, private`, y compris les erreurs, avec `Vary: Cookie`. Nginx ne met pas en cache les réponses transmises au backend. Les exports sous `/api/` bénéficient du même contrôle.

La configuration Nginx ajoute une CSP : scripts, styles et polices locaux, images locales ou `data:`, connexions de l'application, interdiction des objets intégrés et de l'encadrement du site dans une iframe. Elle complète `nosniff`, `DENY` et la politique de Referer. L'initialisation du thème a été déplacée sans changement de comportement dans `theme-init.js` pour éviter d'autoriser les scripts inline.

Les en-têtes de cache ne remplacent pas les permissions de lecture appliquées par app/routes/media.py.

## Adresse IP et limitation de débit

La chaîne active est : navigateur → Cloudflare → Nginx → backend local.

- Nginx accepte `CF-Connecting-IP` uniquement lorsque son correspondant appartient à une plage officielle Cloudflare. Si un client contacte directement le serveur, ses faux en-têtes sont ignorés.
- Nginx remplace `X-Forwarded-For` par l'adresse ainsi établie, au lieu de prolonger un en-tête reçu du client. Il fixe aussi le protocole et retire les autres en-têtes non utilisés.
- Le backend reste publié sur `127.0.0.1:5000`. Avec `TRUST_PROXY_HEADERS=1`, Flask fait confiance à un seul niveau de proxy pour l'IP et le protocole, avant la limitation de débit. La valeur par défaut `0` ignore les en-têtes transmis.

Le test montre que deux adresses transmises par le proxy disposent de quotas distincts. Deux personnes derrière une même adresse publique partagent naturellement le quota par IP. La liste Cloudflare doit être revue avant installation et lors de ses mises à jour.

## Déploiement

Ces étapes concernent Nginx et compose.prod.yaml. Le site public utilise cette architecture ; il ne dispose pas de relais WebSocket.

Les fonctions de gestion des données et leurs limites sont décrites dans [donnees-personnelles.md](donnees-personnelles.md).

Le site servi par Nginx est le build du frontend Vue. Le produire avec `npm ci --prefix frontend` puis `npm run build --prefix frontend`, et copier **tout le contenu** de `frontend/dist/` à la racine du site (`/var/www/taskflow`), en remplaçant l'ancien contenu. Les pages `/confidentialite/` et `/cookies/` font partie de l'application : il n'y a plus de dossier à copier à part. Recharger les anciens onglets avec actualisation du cache si nécessaire.

1. Sauvegarder les versions actives du site Nginx, du frontend et l'identifiant de l'image backend pour un retour arrière. Comparer le site proposé à la configuration réelle, notamment les chemins du frontend et des certificats et les réglages Certbot.
2. Installer les trois fichiers inclus de `deploy/nginx/` dans `/etc/nginx/taskflow/` : `cloudflare-real-ip.conf`, `proxy-headers.conf`, `security-headers.conf`. Actualiser les plages Cloudflare depuis ses listes officielles si nécessaire. Préparer le site `taskflow.auxance.dev.conf` dans le site activé pour ce seul domaine.
3. Dans Cloudflare, créer une règle **Bypass cache** pour les chemins commençant par `/api/`, `/static/avatars/` et `/static/workspace_icons/`. La placer après toute règle contradictoire : la dernière règle applicable l'emporte pour un réglage en conflit. Purger les éventuelles copies antérieures des données et des anciens fichiers frontend. Prévoir une courte fenêtre de maintenance pour coordonner le changement.
4. Configurer `PUBLIC_ORIGIN=https://taskflow.auxance.dev` dans le fichier d'environnement du VPS. Conserver la clé secrète existante. Construire l'image backend et le build du frontend à partir de la même révision. Aucune migration SQL ni remise à zéro de la base n'est nécessaire.
5. Installer le frontend préparé avant d'activer la nouvelle CSP. Vérifier Nginx avec `sudo nginx -t`, puis recharger avec `sudo systemctl reload nginx` uniquement si le contrôle réussit.
6. Après installation de cette chaîne de proxy et vérification que le backend est toujours lié à l'adresse locale, mettre `TRUST_PROXY_HEADERS=1`, puis recréer le backend avec `docker compose -f compose.prod.yaml up -d --no-deps --build backend`. Ne pas publier PostgreSQL ou Redis. Une ancienne page ouverte devra être rechargée pour utiliser le nouveau client API.
7. Vérifier sur le domaine public : connexion, création/modification, lecture des médias autorisés, déconnexion ; refus d'une mutation sans jeton ; en-têtes CSP et `no-store`. Vérifier que les réponses privées ne deviennent jamais `HIT` dans Cloudflare après plusieurs lectures. `DYNAMIC` ou `BYPASS` est attendu selon son traitement.
8. Contrôler l'IP dans un contexte administrateur, avec deux clients distincts et une tentative d'en-têtes falsifiés vers l'origine. Ne pas ajouter d'endpoint public révélant les informations de diagnostic. En cas d'échec fonctionnel, revenir ensemble à l'image, au frontend, à la configuration Nginx et aux variables sauvegardées.

## Recette locale

Depuis le dépôt, après installation de `requirements.txt` et `requirements-dev.txt` dans un environnement Python :

```bash
python -m pytest -q
npm test --prefix frontend
npm run build --prefix frontend
docker compose -f compose.integration.yaml up -d --wait
TASKFLOW_INTEGRATION=1 python -m pytest -q app/tests/integration
python scripts/check_nginx_security.py
docker compose -f compose.integration.yaml down
```

Les tests unitaires et réseau doivent rester dans deux processus Python séparés. La base de recette est PostgreSQL 17, en mémoire temporaire, sur `127.0.0.1:55438`. Le script Nginx utilise Docker, OpenSSL et des certificats de test ; il ouvre temporairement `127.0.0.1:54443` et `127.0.0.1:54080`. Il ne contacte pas le VPS.

La campagne locale du 22 octobre 2026 sur a9bb4bd comprend 98 tests unitaires backend, 29 intégrations HTTP/PostgreSQL, 66 tests frontend et 75 scénarios Playwright réussis. Ces résultats ne sont pas des tests exécutés sur la base de production. La recette HTTP publique a vérifié connexion, tâche persistée, refus guest, export, aperçu de suppression et suppression de comptes temporaires. Le contrôle Nginx local couvre notamment les en-têtes et le rejet des IP falsifiées ; ce test ne prouve pas à lui seul les réglages du compte Cloudflare.

## Références

- [OWASP — prévention CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [Flask — proxy inverse](https://flask.palletsprojects.com/en/stable/deploying/proxy_fix/)
- [Nginx — adresse réelle du client](https://nginx.org/en/docs/http/ngx_http_realip_module.html)
- [Cloudflare — restitution de l'adresse cliente](https://developers.cloudflare.com/support/troubleshooting/restoring-visitor-ips/restoring-original-visitor-ips/)
- [Cloudflare — ordre des règles de cache](https://developers.cloudflare.com/cache/how-to/cache-rules/order/)
