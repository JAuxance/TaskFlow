# Tests de bout en bout

## Objet

Ces tests pilotent un vrai navigateur (Chromium, via Playwright) sur l'application complète : frontend, backend et base de données.

Ils ont été écrits sur l'ancien frontend, avant sa reconstruction en Vue 3, pour en fixer le comportement et l'apparence. Le nouveau frontend n'a remplacé l'ancien qu'après les avoir tous passés sans modification. Ils servent maintenant de filet de sécurité pour la suite, à commencer par la refonte graphique.

Ils complètent les autres suites sans les remplacer : `pytest` (routes et sécurité), les tests d'intégration (PostgreSQL et WebSocket réels) et les tests unitaires du frontend.

## Ce que la suite couvre

| Fichier (`e2e/tests/`) | Parcours |
| --- | --- |
| `smoke.spec.ts` | Le frontend se charge et parle au backend jetable. |
| `auth.spec.ts` | Inscription et connexion qui ouvrent une session, mot de passe faux, email déjà utilisé, passage d'un écran à l'autre, déconnexion depuis le profil. |
| `addresses.spec.ts` | Proxy Vite, protection des adresses selon la session, arrivée dans le premier workspace, renouvellement du jeton CSRF, historique du navigateur. |
| `workspace-project.spec.ts` | Création d'un workspace depuis le tableau de bord, nom obligatoire, création d'un projet. |
| `dashboard.spec.ts` | Tâches de chaque projet, filtre par statut, rôle affiché à chaque membre, bascule du thème. |
| `profile.spec.ts` | Prénom, photo de profil, téléchargement des données avec mot de passe, copie de l'email, oubli des mots de passe à la fermeture, fermeture par un clic à côté, suppression du compte et blocage tant qu'un workspace est partagé. |
| `task.spec.ts` | Création d'une tâche, statut et priorité enregistrés automatiquement, titre et description enregistrés sur demande, couleur, responsable et échéance, persistance, suppression. Enregistrements envoyés un par un, attendus avant le retour au tableau, annulés à l'écran si le serveur refuse. |
| `project.spec.ts` | Renommage, description et suppression d'un projet ; un membre ajoute des tâches sans pouvoir modifier le projet. |
| `guest.spec.ts` | Un guest voit le workspace sans aucune commande de gestion, lit le tableau et la tâche ; les champs sont désactivés **et** le serveur refuse les mêmes actions (403). |
| `session.spec.ts` | Session expirée ou cookie absent : retour à la connexion ; message d'expiration dans le chat. |
| `members.spec.ts` | Ajout d'un membre, changement de rôle, retrait et refus de la confirmation ; limites d'un admin ; le chat ouvert du membre retiré se ferme aussitôt et le serveur répond 404. |
| `workspace.spec.ts` | Totaux et tâches prioritaires de l'aperçu, renommage, emoji et image du workspace, transfert de la propriété, suppression protégée par le nom exact. |
| `board.spec.ts` | Ordre d'une colonne par priorité, déplacement d'une carte à la souris et au clavier, annulation d'un déplacement refusé, interdiction pour un guest. |
| `motion.spec.ts` | Les écrans s'animent, sauf quand le système demande moins d'animations. |
| `legal.spec.ts` | Pages de confidentialité et de cookies ouvertes à tous, liens entre elles et retour à l'application, capture de la page de confidentialité. |
| `messaging.spec.ts` | Chat du workspace et messages privés entre deux navigateurs, sans rechargement ; historique lu par pages de cinquante ; message vide impossible, brouillon conservé si le serveur refuse ; conversation privée fermée quand les deux membres ne partagent plus de workspace. |
| `responsive.spec.ts` | Mise en page à 1440 px et à 390 px : barre latérale, colonnes du Kanban, formulaire de tâche, absence de défilement horizontal. |
| `visual.spec.ts` | Onze écrans comparés à leurs captures de référence, en thèmes clair et sombre, aux deux largeurs. |

Chaque parcours testé passe par l'interface. Les données préalables (comptes, workspace, tâches) sont créées par l'API, comme le ferait le frontend : origine autorisée, cookie de session et jeton CSRF.

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

Écrans : connexion, inscription, tableau de bord, workspace (aperçu, membres, messages), messages privés, Kanban, tâche, tâche vue par un guest, profil.

Elles sont reproductibles parce que les données sont fixes (`e2e/support/seed.ts`), que l'horloge du navigateur est figée au 12 octobre 2026 et que les dates des messages sont réécrites dans la base jetable. Elles ne valent que pour Chromium sous Linux : sur une autre machine, les polices et l'anticrénelage diffèrent.

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
| `pytest` intégration (`TASKFLOW_CHAT_INTEGRATION=1`) | 41 réussis |
| Tests unitaires du frontend | 84 réussis |
| `scripts/check_nginx_security.py` | tous les contrôles réussis |
| Playwright | 84 réussis sur les quatre profils |
