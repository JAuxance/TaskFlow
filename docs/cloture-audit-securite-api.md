# Clôture de l’audit de sécurité — TaskFlow

Date : 14 septembre 2026. Référence : [audit initial du 11 septembre](audit-securite-api.md).

La recette locale du périmètre applicatif convenu est terminée. Les corrections et les tests ci-dessous sont réalisés ; les réserves de production restent explicites. Ce bilan ne vaut pas validation d’un déploiement HTTPS ni audit de l’hôte ou du futur front.

## Environnement et reset

- Backend reconstruit avec Python **3.12.14**, Flask **3.1.3**, python-dotenv **1.2.2**, Flask-Limiter **4.1.1** et psycopg **3.2.1**.
- PostgreSQL **17.11**, volume `taskflow_postgres_data` recréé après sauvegarde.
- Sauvegarde avant reset : `/home/auxance/.local/share/TaskFlow/backups/pre-audit-reset-20260914T114529Z.dump`. Archive vérifiée avec `pg_restore --list`, conservée hors du dépôt et du contexte Docker.
- Les scripts `01-init.sql` et `02-create-app-user.sh` ont initialisé automatiquement les six tables et le compte applicatif restreint.
- Les tests d’intégration utilisent le client HTTP Flask, l’application, PostgreSQL, Argon2, les sessions et le limiteur réels. Leurs comptes fictifs sont supprimés après exécution ; les six tables sont vides après la recette.
- Des requêtes réseau supplémentaires ont été envoyées à `http://localhost:5000` pour vérifier le serveur Docker réellement démarré.

## Corrigé / testé / restant

| Point | Corrigé côté code/configuration | Testé après reset | Restant ou limite |
| --- | --- | --- | --- |
| **SEC-01 — Attribution des rôles** | Oui. Attribution de `admin`/`owner` refusée aux administrateurs ; rôle `owner` réservé au titulaire principal. | POST et PATCH interdits : **403**. Ajouts et modifications autorisés : **201/200**. | Aucun dans le périmètre convenu. |
| **SEC-02 — Rétrogradation puis suppression** | Oui. Le rôle actuel de la cible est contrôlé. | Suppression, rétrogradation puis nouvelle suppression d’un pair ou d’un owner par un administrateur : **403**, cible conservée. Gestion des membres ordinaires : **200**. | Aucun dans le périmètre convenu. |
| **SEC-03 — Débogueur** | Oui pour le débogage : `debug=False`. | Configuration vérifiée ; exception synthétique : **500 générique**, sans trace ni interface interactive. | Serveur WSGI de production et exposition réseau de production à configurer. Compose démarre encore le serveur de développement Flask. |
| **SEC-04 — PostgreSQL** | Oui. Port non publié, secrets fournis par environnement, utilisateur `taskflow_app` distinct de l’administrateur. | Aucune liaison de port hôte ; compte non superutilisateur, sans création de rôles/bases/schémas ; six tables accessibles. Ancien mot de passe par défaut refusé pour les deux comptes. | Validation du réseau et du pare-feu de production hors de cette recette locale. |
| **SEC-05 — Contexte Docker** | Oui. `.env`, `.git`, fichiers de cookies et notes locales exclus. | **8 couches** de la nouvelle image inspectées : aucun des fichiers locaux exclus présent sous `/app`. | L’historique des images et une éventuelle diffusion antérieure ne sont pas certifiés par cette vérification de la nouvelle image. |
| **SEC-06 — Cookies** | Oui pour la configuration. `Secure` en production, désactivé en développement ; `HttpOnly` et `SameSite=Lax`. | Attributs réellement émis vérifiés pour `APP_ENV` absent, `development` et `production`. | HTTPS réel, reverse proxy et absence de contournement par le port HTTP direct à valider au déploiement. |
| **SEC-07 — Révocation** | Oui. Correction de la requête `UPDATE sessions`, du tuple de paramètres et du retour de la session révoquée. | Connexion **200**, `/me` **200**, logout **200**, puis `/me` **401** et copie de l’ancien cookie **401**. Révocation confirmée en base. | Aucun dans le périmètre convenu. |
| **SEC-08 — Limites et pagination** | Oui. Connexion 5/minute, inscription 3/heure, body maximum 1 Mio. Pagination par défaut 1/20 ; `limit` entre 1 et **100**, paramètres invalides refusés. | **429** au dépassement ; **413** pour le body trop gros. Quatre listes de 25 éléments : pages **20 puis 5**, tri stable, limite personnalisée et page vide. Pagination invalide : **400**, priorité SEC-12 conservée. | Le stockage du limiteur est en mémoire du processus ; prévoir un stockage partagé pour une production à plusieurs processus/instances. Quotas et dimensionnement de production hors recette. |
| **SEC-09 — Validation des entrées** | Oui. JSON objet, types, longueurs, valeurs, IDs, encodage et dates vérifiés. Champs optionnels contrôlés seulement s’ils sont présents. `priority: null` refusé conformément au `NOT NULL` du schéma. | Matrices d’entrées invalides : **400**, sans modification des ressources. Options omises, descriptions/dates nulles autorisées et mutations valides conservées. Aucune erreur **500** dans ce rejeu. | Aucun dans le périmètre convenu. |
| **SEC-10 — Affectation des tâches** | Oui. L’assigné doit appartenir au workspace. | Assigné absent ou extérieur : même **404**, aucune création. Membres autorisés, y compris guest, et tâche sans assigné : **201**. | Aucun dans le périmètre convenu. |
| **SEC-11 — `/health`** | Oui. État public minimal, sans texte de l’exception. | Base disponible : **200**. Panne synthétique : **500** avec uniquement `{"api":"ok","database":"error"}` ; marqueur technique absent. | Corrélation et supervision des journaux à compléter pour la production. |
| **SEC-12 — Masquage des ressources** | Oui selon la politique convenue : session invalide **401**, absent/non-membre **404** générique, rôle insuffisant **403**. | Comparaison des réponses sur les routes de ressources, sessions absentes/inconnues/expirées/révoquées, droits guest et protection du titulaire. | Le contrat d’inscription et ses conflits d’email n’ont pas été modifiés. Une politique supplémentaire de masquage des comptes reste hors du périmètre convenu. |

## Dépendances corrigées

Seules les deux versions demandées ont été mises à jour :

```diff
-Flask==3.1.0
+Flask==3.1.3
-python-dotenv==1.0.1
+python-dotenv==1.2.2
```

Flask 3.1.3 inclut les corrections des deux avis cités par l’audit : [CVE-2025-47278](https://github.com/pallets/flask/security/advisories/GHSA-4grg-w6v8-c28g) et [CVE-2026-27205](https://github.com/pallets/flask/security/advisories/GHSA-68rp-wp8r-4726). python-dotenv 1.2.2 corrige [CVE-2026-28684](https://github.com/theskumar/python-dotenv/security/advisories/GHSA-mf9w-mj56-hr94).

Le build réussit, les versions sont confirmées dans le conteneur et `pip check` ne détecte aucun conflit. Les dépendances transitives ne sont pas verrouillées exhaustivement ; aucun scan complet des bibliothèques natives et de l’OS n’est revendiqué.

## Résultats enregistrés

**35 tests unitaires/de configuration passent**, auxquels s’ajoutent **14 tests d’intégration PostgreSQL réussis**. La commande générale découvre 49 tests et ignore volontairement les 14 tests d’intégration lorsqu’ils ne sont pas activés explicitement.

Les tests d’intégration ont émis **579 requêtes** :

| Statut | Nombre |
| --- | ---: |
| 200 | 51 |
| 201 | 13 |
| 400 | 332 |
| 401 | 94 |
| 403 | 40 |
| 404 | 46 |
| 413 | 1 |
| 429 | 2 |
| 500 | **0** |

Les `500` synthétiques attendus pour SEC-03/11 appartiennent aux tests de configuration et ne sont pas des régressions de validation.

Vérifications réseau supplémentaires sur le backend lancé : cinq connexions avec un compte inconnu donnent **401**, la sixième **429** ; un JSON dépassant 1 Mio donne **413** ; `/health` donne **200** avec API et base disponibles.

## Rejouer la recette

Tests sans données métier réelles :

```bash
docker compose exec -T backend python -m unittest discover -s tests -v
```

Tests d’intégration, à lancer sur la base de recette sélectionnée :

```bash
docker compose exec -T -e TASKFLOW_SECURITY_INTEGRATION=1 backend \
  python -m unittest discover -s tests -p test_security_integration.py -v
```

Cette seconde commande crée ses propres comptes et ressources fictifs, puis les nettoie. Elle ne réinitialise pas la base et n’efface pas les autres comptes. Les scénarios sont versionnés dans [test_security_integration.py](../tests/test_security_integration.py) ; les sondes de configuration dans [test_security_configuration.py](../tests/test_security_configuration.py).

Le développement du front TaskFlow peut démarrer sur cette base. Les réserves de production du tableau doivent être traitées avant une mise en ligne avec des données réelles.
