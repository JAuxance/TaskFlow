# Frontend Vue

## Où en est la migration

Le frontend est en cours de reconstruction avec Vue 3, TypeScript strict et Vite, dans `frontend-vue/`. Le frontend actuel (`frontend/`) reste celui qu'on utilise : il n'est pas modifié et continue de fonctionner sur le port 5500.

| Écran | État |
| --- | --- |
| Connexion, inscription | migrés, identiques au pixel près aux captures de référence |
| Mise en page (barre latérale, fil d'Ariane, thème), tableau de bord | migrés, identiques au pixel près aux captures de référence |
| Profil (prénom, photo, export des données, déconnexion, suppression du compte) | migré, identique au pixel près aux captures de référence |
| Workspace, Kanban, tâche, messages | à migrer |

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
| `src/views/LoginView.vue`, `RegisterView.vue`, `DashboardView.vue` | Écrans migrés. |
| `src/views/PendingView.vue` | Page affichée à la place d'un écran pas encore migré. |

## Routes

| Adresse | Écran | Accès |
| --- | --- | --- |
| `/login` | Connexion | visiteur ; un utilisateur connecté est renvoyé vers `/` |
| `/register` | Inscription | visiteur ; un utilisateur connecté est renvoyé vers `/` |
| `/` | Tableau de bord | utilisateur connecté ; sinon renvoi vers `/login` |
| `/workspaces/:id/:tab?`, `/projects/:id`, `/tasks/:id`, `/messages/:userId` | pas encore migrés | utilisateur connecté |
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
| Tests unitaires | 60 réussis |
| Tests navigateur sur Vue | 39 réussis sur les quatre profils, stables sur deux passages |
| dont captures de référence | connexion, inscription, tableau de bord et profil identiques au pixel près, en clair et en sombre, à 1440 et 390 px |
| Tests navigateur sur le frontend actuel | 44 réussis, sans régression |
| `pytest` | 104 réussis |
| Build sous la CSP de `deploy/nginx/security-headers.conf` | inscription, tableau de bord, création d'un workspace, thème, photo de profil, téléchargement des données et déconnexion : aucune violation, aucune erreur |

Le build ne contient ni script ni style en ligne, et n'utilise pas `eval`.

## Étape suivante

Migrer l'écran du workspace (aperçu, membres, réglages), puis marquer `@vue` les tests correspondants et ajouter ses écrans à `VUE_SCREENS` dans `e2e/support/stack.ts`.
