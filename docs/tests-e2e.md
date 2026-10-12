# Tests de bout en bout — base de référence avant migration

## Objet

Ces tests pilotent un vrai navigateur (Chromium, via Playwright) sur le frontend JavaScript actuel. Ils fixent le comportement et l'apparence de l'application avant la migration vers Vue 3 : le futur frontend devra faire passer les mêmes tests et produire les mêmes captures.

Ils complètent les suites existantes sans les remplacer : `pytest` (routes et sécurité), les tests d'intégration (PostgreSQL et WebSocket réels) et `node --test` (`api.js`).

## Ce que la suite couvre

| Fichier (`e2e/tests/`) | Parcours |
| --- | --- |
| `smoke.spec.ts` | Le frontend se charge et parle au backend jetable. |
| `auth.spec.ts` | Inscription, déconnexion, connexion, mot de passe faux, email déjà utilisé. |
| `workspace-project.spec.ts` | Création d'un workspace puis d'un projet ; nom obligatoire. |
| `task.spec.ts` | Création d'une tâche, statut et priorité enregistrés automatiquement, titre et description enregistrés sur demande, persistance après rechargement, suppression. |
| `guest.spec.ts` | Un guest lit le tableau et la tâche ; les champs sont désactivés **et** le serveur refuse les mêmes actions (403). |
| `session.spec.ts` | Session expirée ou cookie absent : retour à la connexion ; message d'expiration dans le chat. |
| `members.spec.ts` | Ajout d'un membre, changement de rôle, retrait ; le chat ouvert du membre retiré se ferme aussitôt et le serveur répond 404. |
| `messaging.spec.ts` | Chat du workspace et messages privés entre deux navigateurs, sans rechargement. |
| `responsive.spec.ts` | Mise en page à 1440 px et à 390 px : barre latérale, colonnes du Kanban, formulaire de tâche, absence de défilement horizontal. |
| `visual.spec.ts` | Onze écrans comparés à leurs captures de référence, en thèmes clair et sombre, aux deux largeurs. |

Chaque parcours testé passe par l'interface. Les données préalables (comptes, workspace, tâches) sont créées par l'API, comme le ferait `frontend/js/api.js` : origine autorisée, cookie de session et jeton CSRF.

## Pile jetable et garde-fous

Les tests créent, expirent et suppriment des données. Ils ne doivent jamais atteindre une base réelle.

- `compose.e2e.yaml` démarre un projet Docker séparé, `taskflow-e2e` : l'image de production (Python 3.12, Gunicorn) et PostgreSQL 17 **en mémoire**. Rien n'est conservé après l'arrêt.
- La base est créée par les vrais scripts `app/sql/`, et l'application s'y connecte avec le compte limité `taskflow_app`, comme en production.
- Le backend écoute sur `127.0.0.1:5000`, le port que le frontend appelle déjà en développement. **La pile de développement et la pile de test ne peuvent donc pas tourner en même temps.**
- Le backend de test publie une adresse de contact sentinelle. Avant le premier test, `e2e/global-setup.ts` interroge `/api/privacy` : si un autre backend répond sur le port 5000, la suite s'arrête sans rien lancer.
- La limitation de débit est désactivée dans cette pile seulement (`e2e/server.py`), comme dans les tests d'intégration. Les routes Flask ne sont pas modifiées, et le dossier `e2e/` est exclu de l'image de production.
- La base est vidée avant chaque test. Les tests s'exécutent un par un.

## Installation

Prérequis : Docker, Node.js 20 ou plus récent et Python 3 (pour servir le frontend, comme dans le README).

```bash
npm ci --prefix e2e
npx --prefix e2e playwright install chromium
```

## Lancer les tests

Depuis la racine du dépôt, pile de développement arrêtée :

```bash
npm test --prefix e2e
```

La commande construit et démarre la pile jetable, sert le frontend sur le port 5500, exécute les tests puis détruit la pile.

| Besoin | Commande |
| --- | --- |
| Un seul fichier | `npm test --prefix e2e -- task.spec` |
| Une seule largeur ou un seul thème | `npm test --prefix e2e -- --project=mobile-dark` |
| Mode interactif | `npm run test:ui --prefix e2e` |
| Garder la pile entre deux passages | `E2E_KEEP_STACK=1 npm test --prefix e2e` |
| Arrêter la pile gardée | `docker compose -f compose.e2e.yaml down --volumes` |

## Rapports

| Suite | Commande | Rapport |
| --- | --- | --- |
| Navigateur | `npm test --prefix e2e` | `e2e/playwright-report/index.html` et `reports/e2e-junit.xml` |
| Python | `python -m pytest -q --junitxml=reports/pytest.xml` | `reports/pytest.xml` |
| JavaScript | `node --test --test-reporter=junit --test-reporter-destination=reports/node.xml frontend/tests/api.test.mjs` | `reports/node.xml` |

`npm run report --prefix e2e` ouvre le rapport HTML. En cas d'échec, il contient une capture, la trace complète du navigateur et, pour un écart visuel, les images attendue, obtenue et leur différence. Les rapports ne sont pas versionnés.

## Captures de référence

Les images sont dans `e2e/__screenshots__/<profil>/`, avec quatre profils : `desktop-light`, `desktop-dark`, `mobile-light` et `mobile-dark`.

Écrans : connexion, inscription, tableau de bord, workspace (aperçu, membres, messages), messages privés, Kanban, tâche, tâche vue par un guest, profil.

Elles sont reproductibles parce que les données sont fixes (`e2e/support/seed.ts`), que l'horloge du navigateur est figée au 12 octobre 2026 et que les dates des messages sont réécrites dans la base jetable. Elles ne valent que pour Chromium sous Linux : sur une autre machine, les polices et l'anticrénelage diffèrent.

Pour les régénérer **volontairement**, après un changement visuel assumé :

```bash
npm run screenshots:update --prefix e2e
```

Relire ensuite la différence des images dans Git avant de valider.

## Défaut connu documenté par les tests

Après expiration de la session, le Kanban et le détail d'une tâche affichent une erreur au lieu de revenir à la connexion (constat D2 de l'audit). Deux tests de `session.spec.ts` décrivent le comportement attendu et sont marqués « échec attendu » sur le frontend actuel : ils apparaissent avec une croix dans la liste, mais comptent comme réussis. Le frontend Vue devra les faire passer ; le marqueur sera alors retiré.

## Réutilisation pour le frontend Vue

Les tests sont écrits pour tourner sur les deux frontends :

- ils naviguent uniquement par clics, puisque le frontend actuel n'a pas d'URL ;
- ils ciblent d'abord les rôles et libellés accessibles (boutons, champs, onglets, dialogues) ;
- la variable `E2E_FRONTEND` choisit la cible : `legacy` (par défaut) ou `vue`, servi par Vite sur le port 5173.

```bash
E2E_FRONTEND=vue npm test --prefix e2e
```

Sur la cible `vue`, seuls les fichiers listés dans `VUE_SPECS` (`e2e/playwright.config.ts`) sont exécutés. Pour l'instant c'est `vue-foundation.spec.ts`, qui vérifie le socle à travers le proxy ; chaque écran migré y ajoutera son fichier, jusqu'à couvrir toute la suite. Voir [le frontend Vue](frontend-vue.md).

Le portage doit donc conserver les libellés visibles et ces quelques repères techniques, utilisés quand aucun rôle ne convient :

`#login-form`, `#page-content`, `#workspace-cards`, `#overview-tasks`, `#workspace-project-count`, `#workspace-focus-list`, `.page-heading .role-badge`, `.kanban-column[data-status]`, `.kanban-count`, ainsi que l'attribut `aria-busy` des deux listes de tâches.

## Résultats du 12 octobre 2026

Sur le tag `pre-vue-migration`, avant tout changement du frontend :

| Suite | Résultat |
| --- | --- |
| `pytest` unitaire | 103 réussis, 5 modules d'intégration ignorés |
| `pytest` intégration (`TASKFLOW_CHAT_INTEGRATION=1`) | 41 réussis |
| `node --test` | 9 réussis |
| `scripts/check_nginx_security.py` | tous les contrôles réussis |
| Playwright | 30 réussis, dont 2 échecs attendus (D2) ; stable sur trois passages consécutifs |
