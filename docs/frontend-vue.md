# Frontend Vue

## Où en est la migration

Le frontend est en cours de reconstruction avec Vue 3, TypeScript strict et Vite, dans `frontend-vue/`. Le frontend actuel (`frontend/`) reste celui qu'on utilise : il n'est pas modifié et continue de fonctionner sur le port 5500.

| Écran | État |
| --- | --- |
| Connexion, inscription | migrés, identiques au pixel près aux captures de référence |
| Mise en page (barre latérale, fil d'Ariane, thème), tableau de bord | migrés, identiques au pixel près aux captures de référence |
| Profil (prénom, photo, export des données, déconnexion, suppression du compte) | migré, identique au pixel près aux captures de référence |
| Workspace (aperçu, membres, réglages, création de projet, ajout de membre) | migré, identique au pixel près aux captures de référence |
| Kanban et réglages du projet, détail d'une tâche | migrés, identiques au pixel près aux captures de référence |
| Messages du workspace, messages privés | à migrer |

Les écrans pas encore migrés ont déjà leur adresse : ils affichent une page « Not migrated yet » dans la mise en page.

## Contenu

| Fichier (`frontend-vue/`) | Rôle |
| --- | --- |
| `vite.config.ts` | Serveur de développement sur le port 5173 et proxy vers le backend. |
| `src/main.ts` | Démarre Vue, Pinia et le routeur ; charge la feuille de style actuelle. |
| `public/theme-init.js` | Applique le thème clair ou sombre avant la feuille de style. |
| `src/router.ts` | Routes, protection selon la session, titre et focus de chaque page. |
| `src/guards.ts` | Règle de redirection, isolée pour être testée seule. |
| `src/page.ts` | Titre de l'onglet et focus sur le titre après chaque navigation. |
| `src/api/client.ts` | Client HTTP : même contrat que `frontend/js/api.js`. |
| `src/api/auth.ts` | Connexion, inscription, déconnexion. |
| `src/api/types.ts` | Types des réponses de l'API, ajoutés avec l'écran qui en a besoin. |
| `src/stores/session.ts` | Utilisateur connecté et état de la session. |
| `src/api/workspaces.ts`, `projects.ts`, `messages.ts` | Lectures et créations utilisées par les écrans migrés. |
| `src/api/images.ts` | Charge les photos et icônes protégées, une seule fois chacune. |
| `src/stores/sidebar.ts` | Workspaces et conversations affichés dans la barre latérale. |
| `src/theme.ts` | Bascule clair/sombre et mémorisation du choix. |
| `src/domain.ts` | Couleurs, libellés des rôles, initiale d'un avatar : définis une seule fois. |
| `src/layout/AppLayout.vue` | Cadre des écrans connectés : barre latérale, fil d'Ariane, thème. |
| `src/layout/ProfileDialog.vue` | Dialogue du profil : compte, copie de l'email, déconnexion. |
| `src/layout/profile/` | Une section du profil par fichier : prénom, photo, export, suppression du compte. |
| `src/api/profile.ts` | Appels du profil. |
| `src/components/FormMessage.vue` | Message d'erreur ou de confirmation d'un formulaire. |
| `src/components/AppDialog.vue` | Dialogue modal ; ne se ferme pas pendant un enregistrement. |
| `src/components/ProtectedImage.vue` | Photo ou icône protégée, avec image de repli. |
| `src/composables/useBusy.ts` | Empêche un double envoi pendant qu'une requête est en cours. |
| `src/layout/state.ts` | Fil d'Ariane et workspace actif, annoncés par chaque écran une fois ses données lues. |
| `src/workspace/useWorkspace.ts` | Un workspace, ses membres et les droits de l'utilisateur ; servira aussi au Kanban et à la tâche. |
| `src/workspace/` | Un onglet du workspace par fichier : aperçu, membres, réglages. |
| `src/dates.ts` | Lecture d'une échéance et format court d'un jour, définis une seule fois. |
| `src/composables/useSerialQueue.ts` | File qui envoie les enregistrements d'une tâche un par un. |
| `src/task/dueDate.ts` | Conversions de l'échéance entre le serveur et le champ de saisie. |
| `src/api/tasks.ts` | Appels des tâches. |
| `src/views/LoginView.vue`, `RegisterView.vue`, `DashboardView.vue`, `WorkspaceView.vue`, `ProjectView.vue`, `TaskView.vue` | Écrans migrés. |
| `src/views/PendingView.vue` | Page affichée à la place d'un écran pas encore migré. |

## Routes

| Adresse | Écran | Accès |
| --- | --- | --- |
| `/login` | Connexion | visiteur ; un utilisateur connecté est renvoyé vers `/` |
| `/register` | Inscription | visiteur ; un utilisateur connecté est renvoyé vers `/` |
| `/` | Tableau de bord | utilisateur connecté ; sinon renvoi vers `/login` |
| `/workspaces/:id` | Workspace ; `/members`, `/settings` ou `/messages` à la suite ouvre directement cet onglet | membre du workspace |
| `/projects/:id` | Kanban du projet | membre du workspace |
| `/tasks/:id` | Détail d'une tâche | membre du workspace |
| `/messages/:userId` | pas encore migré | utilisateur connecté |
| toute autre adresse | renvoi vers `/` | — |

Le frontend actuel n'a pas d'adresses : un rechargement y ramène toujours au tableau de bord. Ici, chaque écran a la sienne, et le bouton « précédent » du navigateur fonctionne.

Les écrans migrés reprennent le HTML de l'écran d'origine : mêmes classes, mêmes identifiants, mêmes libellés et mêmes messages. C'est ce qui permet de leur appliquer les tests et les captures écrits pour le frontend actuel.

## Cohabitation avec le frontend actuel

- **Une seule feuille de style.** `src/main.ts` importe `frontend/css/style.css` et ses polices. Le design n'est donc défini qu'à un endroit tant que les deux frontends coexistent.
- **Une seule origine pour le navigateur.** Vite relaie `/api`, `/static`, `/health` et `/socket.io` (WebSocket compris) vers le port 5000, comme Nginx en production. Le code Vue appelle toujours des chemins relatifs.
- **Origine autorisée côté serveur.** Les requêtes relayées gardent l'origine `http://localhost:5173`. Elle est ajoutée aux origines de développement dans `app/app.py`, pour le contrôle CSRF, CORS et Socket.IO. La production n'accepte toujours que `PUBLIC_ORIGIN`.
- **Même session.** Le cookie est lié au nom d'hôte, pas au port : une session ouverte sur `localhost:5500` est reconnue sur `localhost:5173`. `localhost` et `127.0.0.1` restent deux hôtes distincts.
- **Icônes sous leur nom.** La feuille de style reconnaît certaines icônes à leur nom de fichier (`[src$="folder.svg"]`), pour les éclaircir en thème sombre. Le build garde donc les fichiers SVG tels quels dans `assets/icons/`, sans les renommer ni les intégrer au code.
- **Script du thème en double.** `public/theme-init.js` est une copie de `frontend/js/theme-init.js` : il doit être un fichier à part, chargé avant la feuille de style, car la CSP interdit les scripts en ligne. Un test unitaire échoue si les deux copies diffèrent.

### Limite connue

Les pages `/confidentialite/` et `/cookies/` sont des fichiers statiques de `frontend/`. Le serveur Vite ne les sert pas : en développement, leurs liens ramènent à l'application. En production, Nginx les servira à côté du build ; ce point est à traiter au moment de la bascule.

## Client HTTP

`apiRequest` garde le contrat du frontend actuel : il ne lève jamais d'exception et renvoie toujours `{ ok, status, data }`, avec un message lisible dans `data.error` en cas d'échec. Les messages sont repris à l'identique.

Avant chaque écran connecté, les listes de la barre latérale sont relues, comme le fait le frontend actuel : un workspace dont on vient d'être retiré disparaît à la navigation suivante. Deux requêtes suffisent, contre quatre aujourd'hui.

Les photos et icônes protégées ne sont demandées qu'une fois par visite. Une nouvelle photo a toujours une nouvelle adresse, donc ce cache ne peut pas afficher une ancienne image.

Après une modification du workspace (nom, icône, membre, projet), l'écran relit le workspace au lieu de se fier à la réponse de la modification. Cela évite un contournement du frontend actuel, nécessaire parce que certaines réponses nomment l'identifiant `workspace_id` et d'autres `id` (constat D5 de l'audit).

## Enregistrement d'une tâche

Le serveur enregistre une tâche en réécrivant toute sa ligne. Deux enregistrements envoyés en même temps peuvent donc s'écraser : un changement de statut et une sauvegarde du formulaire, par exemple. Comme le frontend actuel, l'écran de tâche les envoie **un par un**, dans l'ordre, grâce à `useSerialQueue`.

Ce qui est repris à l'identique :

- le statut, la priorité et la couleur partent dès qu'on les change ; le titre, la description, l'échéance et le responsable attendent « Save changes » ;
- si le serveur refuse, le champ reprend la dernière valeur confirmée, et les enregistrements suivants partent quand même ;
- « Back to project » attend la fin des enregistrements, pour que le tableau les affiche ;
- une saisie faite pendant un enregistrement est signalée (« Your latest edits are still unsaved »).

Ce qui change :

| Comportement | Raison |
| --- | --- |
| Toutes les sorties de l'écran attendent la file : fil d'Ariane, barre latérale, bouton « précédent ». | Sur le frontend actuel, seul « Back to project » attend ; le tableau peut alors afficher une valeur périmée. |
| Une requête bloquée est abandonnée après 15 secondes. | Sans délai, elle figeait la file et l'écran. |
| Une session expirée ramène à la connexion. | Constat D2 de l'audit : le Kanban et la tâche l'ignoraient. |

La file ne protège toujours que l'onglet courant. Deux personnes, ou deux onglets, peuvent encore s'écraser : corriger cela demande un contrôle de version côté serveur, hors du périmètre de la migration.

## Messages

Dans l'onglet des messages, le workspace affiche pour l'instant un avis : le chat sera migré avec les messages privés.

Le profil est découpé en sections, mais elles partagent un seul verrou (`src/layout/profile/lock.ts`) : pendant qu'une section enregistre, les autres attendent et le dialogue ne peut pas être fermé. À la fermeture, les mots de passe saisis et le récapitulatif de suppression sont oubliés.

Quatre comportements du client sont nouveaux :

| Comportement | Raison |
| --- | --- |
| Le jeton CSRF est gardé en mémoire. | Le frontend actuel le redemande avant chaque modification, soit une requête de plus à chaque fois. |
| Si le serveur refuse le jeton (`csrf_failed`), il est redemandé et la modification renvoyée **une seule fois**. | Le serveur change de jeton à la connexion et à la déconnexion. Le refus a lieu avant tout traitement : renvoyer la requête ne peut pas appliquer deux fois le changement. |
| Une requête est abandonnée après 15 secondes. | Sans délai, une requête bloquée fige l'écran indéfiniment. |
| Une réponse 401 prévient un gestionnaire unique. | Aujourd'hui chaque écran traite l'expiration à sa façon, et deux l'ignorent (constat D2 de l'audit). |

## Commandes

Le backend doit tourner sur le port 5000 (`docker compose up -d`).

| Besoin | Commande |
| --- | --- |
| Installer | `npm ci --prefix frontend-vue` |
| Développer, sur `http://localhost:5173` | `npm run dev --prefix frontend-vue` |
| Vérifier les types | `npm run typecheck --prefix frontend-vue` |
| Tests unitaires | `npm test --prefix frontend-vue` |
| Build de production, dans `frontend-vue/dist/` | `npm run build --prefix frontend-vue` |
| Tests navigateur sur le frontend Vue | `E2E_FRONTEND=vue npm test --prefix e2e` |
| Les mêmes, à travers un serveur Vite déjà lancé | `E2E_FRONTEND=vue E2E_REUSE_VITE=1 npm test --prefix e2e` |

## Dépendances

| Paquet | Version | Usage |
| --- | --- | --- |
| `vue` | 3.5.43 | Framework. |
| `vue-router` | 5.4.0 | Navigation par URL. |
| `pinia` | 4.0.3 | État partagé, limité à la session pour l'instant. |
| `vite`, `@vitejs/plugin-vue` | 8.3.4, 6.0.10 | Serveur de développement et build. |
| `typescript`, `vue-tsc` | 6.0.3, 3.3.13 | Vérification des types, y compris dans les fichiers `.vue`. |
| `vitest` | 5.0.4 | Tests unitaires. |

TypeScript est volontairement fixé à la version 6 : `vue-tsc` ne fonctionne pas encore avec TypeScript 7.

## Vérifications du 12 octobre 2026

| Vérification | Résultat |
| --- | --- |
| Types stricts (`vue-tsc`) | aucune erreur |
| Tests unitaires | 82 réussis, dont la file d'enregistrements et les conversions de date |
| Tests navigateur sur Vue | 65 réussis sur les quatre profils |
| dont captures de référence | tous les écrans sauf les messages : identiques au pixel près, en clair et en sombre, à 1440 et 390 px |
| Tests navigateur sur le frontend actuel | 60 réussis, sans régression |
| `pytest` | 104 réussis |
| Build sous la CSP de `deploy/nginx/security-headers.conf` | parcours complet jusqu'à la tâche : aucune violation, aucune erreur |

Le build ne contient ni script ni style en ligne, et n'utilise pas `eval`.

## Étape suivante

Migrer les messages du workspace et les messages privés, avec le client Socket.IO, puis marquer `@vue` les derniers tests. Viendront ensuite la bascule et le retrait du frontend actuel, qui demandent des décisions sur la production.
