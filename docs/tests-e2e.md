# Tests de bout en bout

## Objet

Ces tests pilotent un vrai navigateur (Chromium, via Playwright) sur l'application complète : frontend, backend et base de données.

La campagne du 22 octobre 2026 couvre 75 scénarios répartis entre quatre profils : desktop clair, desktop sombre, mobile clair et mobile sombre. Les captures correspondent au périmètre simplifié.

## Couverture

- Comptes, connexion, déconnexion et expiration de session.
- Workspaces, projets, quatre rôles, transfert de propriété et refus côté serveur pour guest.
- Tâches : création, suppression et un seul enregistrement explicite pour tous les champs.
- Brouillon conservé après erreur, nouvelle tentative, double clic bloqué, confirmation avant abandon.
- Modification d'un champ qui préserve un autre champ modifié par un autre utilisateur.
- Export, suppression du compte et protection des workspaces partagés.
- Navigation, clavier, thèmes, responsive et captures des écrans courants.

Le chat, les uploads et le glisser-déposer ont été retirés, ainsi que leurs scénarios obsolètes. Les tests de refus des anciennes routes et les tests d'intégration sur les données historiques restent nécessaires.

## Pile jetable et garde-fous

Les tests créent, expirent et suppriment des données. Ils ne doivent jamais atteindre une base réelle.

- `compose.e2e.yaml` démarre un projet Docker séparé, `taskflow-e2e` : l'image de production (Python 3.12, Gunicorn) et PostgreSQL 17 **en mémoire**. Rien n'est conservé après l'arrêt.
- La base est créée par les vrais scripts `app/sql/`, et l'application s'y connecte avec le compte limité `taskflow_app`, comme en production.
- Le backend écoute sur `127.0.0.1:5000`, le port vers lequel Vite relaie les appels. **La pile de développement et la pile de test ne peuvent donc pas tourner en même temps.**
- Le backend de test publie une adresse de contact sentinelle. Avant le premier test, `e2e/global-setup.ts` interroge `/api/privacy` : si un autre backend répond sur le port 5000, la suite s'arrête sans rien lancer.
- La limitation de débit est désactivée dans cette pile seulement (`e2e/server.py`), comme dans les tests d'intégration. Les routes Flask ne sont pas modifiées, et le dossier `e2e/` est exclu de l'image de production.
- La base est vidée avant chaque test. Les tests s'exécutent un par un.

## Installation

Prérequis : Docker et Node.js 20 ou plus récent.

```bash
npm ci --prefix frontend
npm ci --prefix e2e
npx --prefix e2e playwright install chromium
```

## Lancer les tests

Depuis la racine du dépôt, pile de développement et serveur Vite arrêtés :

```bash
npm test --prefix e2e
```

La commande construit et démarre la pile jetable, sert le frontend Vue sur le port 5173, exécute les tests puis détruit la pile.

| Besoin | Commande |
| --- | --- |
| Un seul fichier | `npm test --prefix e2e -- task.spec` |
| À travers un serveur Vite déjà lancé | `E2E_REUSE_VITE=1 npm test --prefix e2e` |
| Une seule largeur ou un seul thème | `npm test --prefix e2e -- --project=mobile-dark` |
| Mode interactif | `npm run test:ui --prefix e2e` |
| Garder la pile entre deux passages | `E2E_KEEP_STACK=1 npm test --prefix e2e` |
| Arrêter la pile gardée | `docker compose -f compose.e2e.yaml down --volumes` |

## Rapports

| Suite | Commande | Rapport |
| --- | --- | --- |
| Navigateur | `npm test --prefix e2e` | `e2e/playwright-report/index.html` et `reports/e2e-junit.xml` |
| Python | `python -m pytest -q --junitxml=reports/pytest.xml` | `reports/pytest.xml` |
| Frontend, tests unitaires | `npm test --prefix frontend -- --reporter=junit --outputFile=../reports/frontend-unit.xml` | `reports/frontend-unit.xml` |

`npm run report --prefix e2e` ouvre le rapport HTML. En cas d'échec, il contient une capture, la trace complète du navigateur et, pour un écart visuel, les images attendue, obtenue et leur différence. Les rapports ne sont pas versionnés.

## Captures de référence

Les images sont dans `e2e/__screenshots__/<profil>/`, avec quatre profils : `desktop-light`, `desktop-dark`, `mobile-light` et `mobile-dark`.

Écrans : présentation, connexion, inscription, accueil sans workspace, workspace (aperçu, membres), Kanban, tâche, tâche vue par un guest, profil.

Elles sont reproductibles parce que les données sont fixes (`e2e/support/seed.ts`), que l'horloge du navigateur est figée au 12 octobre 2026. Elles ne valent que pour Chromium sous Linux : sur une autre machine, les polices et l'anticrénelage diffèrent.

Deux réglages les rendent fiables :

- **Tolérance de couleur à 0,02**, dix fois plus stricte que celle de Playwright par défaut (0,2). Avec la valeur par défaut, remplacer une couleur sombre par une autre passait inaperçu : c'est arrivé lors du changement de couleur de la barre latérale.
- **Animations réduites** (`reducedMotion: 'reduce'`) pour tous les tests : l'application ne joue alors aucune animation, donc un clic ne tombe jamais sur un bloc en mouvement et les captures ne dépendent pas du temps. `motion.spec.ts` vérifie le cas animé.

Pour les régénérer **volontairement**, après un changement visuel assumé :

```bash
npm run screenshots:update --prefix e2e
```

Relire ensuite la différence des images dans Git avant de valider.

## Ce que les tests ont apporté à la migration

- Les tests et les captures n'ont pas changé d'un frontend à l'autre : c'est ce qui prouve que le nouveau fait la même chose que l'ancien.
- Deux tests décrivaient un défaut de l'ancien frontend (constat D2 de l'audit) : après expiration de la session, le Kanban et le détail d'une tâche affichaient une erreur au lieu de revenir à la connexion. Ils étaient marqués « échec attendu » ; le nouveau frontend les fait passer.
- Un test a révélé un vrai blocage dans la première version Vue de l'écran de tâche, avant qu'elle ne soit enregistrée dans le dépôt.

Quelques repères techniques sont utilisés quand aucun rôle ni libellé ne convient. Une refonte de l'interface doit les conserver, ou mettre les tests à jour avec elle :

`#login-form`, `#page-content`, `#workspace-cards`, `#overview-tasks`, `#workspace-project-count`, `#workspace-focus-list`, `.page-heading .role-badge`, `.kanban-column[data-status]`, `.kanban-count`, ainsi que l'attribut `aria-busy` des listes de tâches.

## Résultats du 12 octobre 2026

| Suite | Résultat |
| --- | --- |
| `pytest` unitaire | 104 réussis, 5 modules d'intégration ignorés |
| `pytest` intégration (`TASKFLOW_INTEGRATION=1`) | 41 réussis |
| Tests unitaires du frontend | 84 réussis |
| `scripts/check_nginx_security.py` | tous les contrôles réussis |
| Playwright | 89 réussis sur les quatre profils |
