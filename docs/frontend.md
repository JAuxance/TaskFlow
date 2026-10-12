# Frontend

## D'où vient ce frontend

Le frontend est une application Vue 3, écrite en TypeScript strict et construite avec Vite, dans `frontend/`.

Il remplace un frontend en JavaScript sans framework, qui a été reconstruit écran par écran en octobre 2026. Chaque écran n'a été considéré comme migré qu'une fois passés, sans modification, les tests navigateur et les captures d'écran de l'ancien frontend. L'ancien code est consultable au tag Git `vanilla-frontend-final` ; l'état d'avant la migration est au tag `pre-vue-migration`.

Les écrans ont gardé le HTML d'origine : mêmes classes, mêmes identifiants, mêmes libellés, mêmes messages. La feuille de style de l'ancien frontend a d'abord été déplacée telle quelle, puis découpée en un fichier par zone, règle pour règle : les captures de référence n'ont pas changé d'un pixel.

## Contenu

| Fichier (`frontend/`) | Rôle |
| --- | --- |
| `vite.config.ts` | Serveur de développement sur le port 5173 et proxy vers le backend. |
| `src/main.ts` | Démarre Vue, Pinia et le routeur ; charge les feuilles de style. |
| `public/theme-init.js` | Applique le thème clair ou sombre avant la feuille de style. |
| `src/router.ts` | Routes, protection selon la session, titre et focus de chaque page. |
| `src/guards.ts` | Règle de redirection, isolée pour être testée seule. |
| `src/page.ts` | Titre de l'onglet et focus sur le titre après chaque navigation. |
| `src/api/client.ts` | Client HTTP. |
| `src/api/auth.ts` | Connexion, inscription, déconnexion. |
| `src/api/types.ts` | Types des réponses de l'API, ajoutés avec l'écran qui en a besoin. |
| `src/stores/session.ts` | Utilisateur connecté et état de la session. |
| `src/api/workspaces.ts`, `projects.ts`, `messages.ts` | Lectures et créations utilisées par les écrans migrés. |
| `src/api/images.ts` | Charge les photos et icônes protégées, une seule fois chacune. |
| `src/stores/sidebar.ts` | Workspaces et conversations affichés dans la barre latérale. |
| `src/theme.ts` | Bascule clair/sombre et mémorisation du choix. |
| `src/domain.ts` | Couleurs, libellés des rôles, initiale d'un avatar : définis une seule fois. |
| `src/layout/AppLayout.vue` | Cadre des écrans connectés : barre latérale, fil d'Ariane, thème. |
| `src/layout/CreateWorkspaceDialog.vue` | Fenêtre de création d'un workspace, ouverte par le « + » de la barre latérale ou par l'écran d'accueil. |
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
| `src/task/board.ts` | Règles du Kanban : ordre d'une colonne, effet d'un déplacement. |
| `src/api/tasks.ts` | Appels des tâches. |
| `src/chat/ChatPanel.vue` | Une conversation : historique, messages en direct, saisie. Sert au chat du workspace et aux messages privés. |
| `src/chat/subscribe.ts` | Abonnement Socket.IO d'une conversation. |
| `src/views/` | Un écran par fichier : connexion, inscription, accueil sans workspace, workspace, projet, tâche, messages privés, pages légales. |
| `src/styles/` | Feuilles de style : `tokens.css` (police, couleurs des deux thèmes), `base.css`, `components.css` (blocs partagés), `layout.css` (cadre), puis une feuille par écran. `main.ts` les charge dans cet ordre, qui est celui de la cascade. |
| `src/assets/` | Police Inter et icônes. |

## Direction artistique

La refonte graphique a suivi la migration, une fois le code unique. Elle mélange deux inspirations : la sobriété d'Apple et de Slack pour le cadre, et les aplats de couleurs de MetaMask pour les repères. Rien n'est copié : ni logo, ni police, ni couleur de marque.

| Élément | Choix |
| --- | --- |
| Barre latérale | Encre, presque noire, dans les deux thèmes. L'élément ouvert est une pilule lilas. |
| Contenu | Fond gris très clair, cartes blanches sans contour, coins de 16 px. |
| Actions | Un seul bleu : bouton principal, barres de progression, liens. Les boutons sont des pilules. |
| Chiffres clés | Un aplat par total : lilas, citron, bleu ciel. Le total des retards passe à l'orange quand il n'est pas nul. |
| Statuts et priorités | Petites pilules dans ces mêmes paires de couleurs. |
| Kanban | Volontairement sobre : colonnes grises, cartes blanches, un point pour le statut. Le nom du projet est dans une bulle lilas. |
| Couleur d'une tâche | Un point devant son titre, à la place du liseré. |
| Onglets | Contrôle segmenté : l'onglet ouvert est relevé en blanc. |
| Logo | Une coche dont le grand trait s'incurve, blanche sur un carré bleu arrondi. Il sert aussi d'icône d'onglet. |
| Police | Inter, embarquée ; aucune police n'est chargée depuis un autre site. |
| Animations | Courtes (0,1 à 0,3 s) : un contrôle répond au pointeur, un écran ou un onglet fait monter ses blocs, une fenêtre s'ouvre et se referme en fondu. Tout est dans `src/styles/motion.css` et rien ne bouge quand le système demande moins d'animations (`prefers-reduced-motion`). |
| Fenêtres | Une fenêtre se ferme par sa croix, par Échap ou par un clic à côté ; jamais pendant un enregistrement. |

Toutes les couleurs sont dans `src/styles/tokens.css`, pour les deux thèmes ; les autres feuilles n'en écrivent aucune. Chaque aplat est une paire, un fond et son encre : en thème sombre la paire s'inverse, fond profond et encre vive. Les paires ont été choisies pour un contraste d'au moins 4,5 pour 1 entre le texte et son fond.

## Routes

| Adresse | Écran | Accès |
| --- | --- | --- |
| `/login` | Connexion | visiteur ; un utilisateur connecté est renvoyé vers `/` |
| `/register` | Inscription | visiteur ; un utilisateur connecté est renvoyé vers `/` |
| `/confidentialite/`, `/cookies/` | Pages légales, même texte et mêmes adresses que les pages statiques qu'elles remplacent | tout le monde |
| `/` | Arrivée : ouvre le premier workspace de la barre latérale (le plus ancien) ; sans aucun workspace, écran d'accueil qui invite à en créer un | utilisateur connecté ; sinon renvoi vers `/login` |
| `/workspaces/:id` | Workspace ; `/members`, `/settings` ou `/messages` à la suite ouvre directement cet onglet | membre du workspace |
| `/projects/:id` | Kanban du projet | membre du workspace |
| `/tasks/:id` | Détail d'une tâche | membre du workspace |
| `/messages/:userId` | Messages privés ; `?workspace=` indique d'où l'on vient, pour le retour | membre partageant un workspace |
| toute autre adresse | renvoi vers `/` | — |

Chaque écran a son adresse : un rechargement y reste, et le bouton « précédent » du navigateur fonctionne. L'ancien frontend n'en avait pas.

On arrive directement dans un workspace, comme dans une messagerie d'équipe. La liste des workspaces est dans la barre latérale, avec un « + » pour en créer un depuis n'importe quel écran ; le workspace créé s'ouvre aussitôt. La règle d'arrivée est dans `src/guards.ts` (`arrivalFor`), appliquée par le routeur une fois la barre latérale chargée.

Il n'y a plus de page listant tous les workspaces en cartes : elle faisait doublon avec la barre latérale. Ce qu'elle était seule à offrir, la liste des tâches de tous les workspaces réunis, a été abandonné avec elle ; chaque workspace garde son panneau « Tasks to focus on ».

Le fil d'Ariane n'apparaît que s'il a au moins deux niveaux : sur un workspace, il ne ferait que répéter le titre.

## Développement et production

- **Une seule origine pour le navigateur.** Vite relaie `/api`, `/static`, `/health` et `/socket.io` (WebSocket compris) vers le port 5000, comme Nginx en production. Le code appelle toujours des chemins relatifs.
- **Origine autorisée côté serveur.** Les requêtes relayées gardent l'origine `http://localhost:5173`. C'est la seule origine de développement acceptée par `app/app.py`, pour le contrôle CSRF, CORS et Socket.IO. La production n'accepte que `PUBLIC_ORIGIN`.
- **Session.** Le cookie est lié au nom d'hôte : `localhost` et `127.0.0.1` sont deux hôtes distincts.
- **Icônes sous leur nom.** La feuille de style reconnaît certaines icônes à leur nom de fichier (`[src$="folder.svg"]`), pour les éclaircir en thème sombre. Le build garde donc les fichiers SVG tels quels dans `assets/icons/`, sans les renommer ni les intégrer au code.
- **Script du thème à part.** `public/theme-init.js` applique le thème avant la feuille de style. Il doit être un fichier séparé, car la CSP interdit les scripts en ligne.

## Client HTTP

`apiRequest` ne lève jamais d'exception et renvoie toujours `{ ok, status, data }`, avec un message lisible dans `data.error` en cas d'échec.

Avant chaque écran connecté, les listes de la barre latérale sont relues : un workspace dont on vient d'être retiré disparaît à la navigation suivante.

Les photos et icônes protégées ne sont demandées qu'une fois par visite. Une nouvelle photo a toujours une nouvelle adresse, donc ce cache ne peut pas afficher une ancienne image.

Après une modification du workspace (nom, icône, membre, projet), l'écran relit le workspace au lieu de se fier à la réponse de la modification : certaines réponses nomment l'identifiant `workspace_id` et d'autres `id` (constat D5 de l'audit).

## Enregistrement d'une tâche

Le serveur enregistre une tâche en réécrivant toute sa ligne. Deux enregistrements envoyés en même temps peuvent donc s'écraser : un changement de statut et une sauvegarde du formulaire, par exemple. L'écran de tâche les envoie **un par un**, dans l'ordre, grâce à `useSerialQueue`.

Ce qui vient de l'ancien frontend :

- le statut, la priorité et la couleur partent dès qu'on les change ; le titre, la description, l'échéance et le responsable attendent « Save changes » ;
- si le serveur refuse, le champ reprend la dernière valeur confirmée, et les enregistrements suivants partent quand même ;
- « Back to project » attend la fin des enregistrements, pour que le tableau les affiche ;
- une saisie faite pendant un enregistrement est signalée (« Your latest edits are still unsaved »).

Ce qui a été ajouté :

| Comportement | Raison |
| --- | --- |
| Toutes les sorties de l'écran attendent la file : fil d'Ariane, barre latérale, bouton « précédent ». | Seul « Back to project » attendait ; le tableau pouvait alors afficher une valeur périmée. |
| Une requête bloquée est abandonnée après 15 secondes. | Sans délai, elle figeait la file et l'écran. |
| Une session expirée ramène à la connexion. | Constat D2 de l'audit : le Kanban et la tâche l'ignoraient. |

La file ne protège toujours que l'onglet courant. Deux personnes, ou deux onglets, peuvent encore s'écraser : corriger cela demande un contrôle de version côté serveur, hors du périmètre de la migration.

## Déplacement d'une tâche dans le Kanban

Une colonne est un statut. Dans une colonne, les tâches sont rangées de la plus pressante à la moins pressante ; à priorité égale, la plus ancienne est en premier.

Un membre déplace une carte pour changer deux choses :

| Geste | Effet |
| --- | --- |
| Vers une autre colonne | La tâche prend le statut de cette colonne. |
| Vers le haut ou le bas | La tâche prend la priorité de la carte sous laquelle elle est déposée ; tout en haut, celle de la première carte. |
| Dans une colonne vide | Seul le statut change. |

Il existe quatre priorités, pas un ordre libre : la carte rejoint donc un groupe de priorité, et peut ne pas rester exactement à l'endroit du dépôt. Pour donner une priorité qu'aucune carte de la colonne n'a encore, on passe par la fiche de la tâche.

Les règles sont des fonctions sans effet de bord, dans `src/task/board.ts` (`sortForBoard`, `dropChanges`, `stepChanges`), testées à part. L'écran applique le déplacement tout de suite, puis l'enregistre ; si le serveur refuse, il relit les tâches et affiche l'erreur. Les enregistrements partent un par un, par la même file que l'écran de tâche.

Le glisser-déposer n'est pas le seul moyen, pour qui n'utilise pas de souris :

- au clavier, Maj et une flèche déplacent la carte qui a le focus d'une colonne ou d'un niveau de priorité ;
- le mode d'emploi n'est pas affiché, pour ne pas charger l'écran, mais il est lu avec chaque carte par les lecteurs d'écran ;
- chaque déplacement est annoncé aux lecteurs d'écran ;
- la fiche de la tâche permet toujours de changer le statut et la priorité.

Un guest ne peut rien déplacer : les cartes ne sont pas déplaçables pour lui, et le serveur refuse la modification.

## Messages

Le chat du workspace et les messages privés partagent un seul composant, `ChatPanel`. Il assure :

- une connexion Socket.IO par conversation ouverte, qui rejoint son salon à chaque (re)connexion ;
- après une coupure, relecture de l'historique jusqu'au dernier message connu, même si plus d'une page a été manquée ;
- un message reçu à la fois par la réponse HTTP et par l'événement en direct n'est affiché qu'une fois ;
- si le serveur retire l'accès, la conversation se ferme aussitôt ; si la session a expiré, retour à la connexion avec un message ;
- un brouillon refusé par le serveur reste dans le champ.

Le client Socket.IO vient de npm (`socket.io-client` 4.8.1). Il se connecte à la même origine que la page : Vite en développement, Nginx en production relaient `/socket.io`.

Le profil est découpé en sections, mais elles partagent un seul verrou (`src/layout/profile/lock.ts`) : pendant qu'une section enregistre, les autres attendent et le dialogue ne peut pas être fermé. À la fermeture, les mots de passe saisis et le récapitulatif de suppression sont oubliés.

Quatre comportements du client n'existaient pas dans l'ancien frontend :

| Comportement | Raison |
| --- | --- |
| Le jeton CSRF est gardé en mémoire. | L'ancien frontend le redemandait avant chaque modification, soit une requête de plus à chaque fois. |
| Si le serveur refuse le jeton (`csrf_failed`), il est redemandé et la modification renvoyée **une seule fois**. | Le serveur change de jeton à la connexion et à la déconnexion. Le refus a lieu avant tout traitement : renvoyer la requête ne peut pas appliquer deux fois le changement. |
| Une requête est abandonnée après 15 secondes. | Sans délai, une requête bloquée fige l'écran indéfiniment. |
| Une réponse 401 prévient un gestionnaire unique. | Chaque écran traitait l'expiration à sa façon, et deux l'ignoraient (constat D2 de l'audit). |

## Commandes

Le backend doit tourner sur le port 5000 (`docker compose up -d`).

| Besoin | Commande |
| --- | --- |
| Installer | `npm ci --prefix frontend` |
| Développer, sur `http://localhost:5173` | `npm run dev --prefix frontend` |
| Vérifier les types | `npm run typecheck --prefix frontend` |
| Tests unitaires | `npm test --prefix frontend` |
| Build de production, dans `frontend/dist/` | `npm run build --prefix frontend` |
| Tests navigateur | `npm test --prefix e2e` |
| Les mêmes, à travers un serveur Vite déjà lancé | `E2E_REUSE_VITE=1 npm test --prefix e2e` |

## Dépendances

| Paquet | Version | Usage |
| --- | --- | --- |
| `vue` | 3.5.43 | Framework. |
| `vue-router` | 5.4.0 | Navigation par URL. |
| `pinia` | 4.0.3 | État partagé, limité à la session pour l'instant. |
| `vite`, `@vitejs/plugin-vue` | 8.3.4, 6.0.10 | Serveur de développement et build. |
| `typescript`, `vue-tsc` | 6.0.3, 3.3.13 | Vérification des types, y compris dans les fichiers `.vue`. |
| `vitest` | 5.0.4 | Tests unitaires. |
| `socket.io-client` | 4.8.1 | Messages en direct. |

TypeScript est volontairement fixé à la version 6 : `vue-tsc` ne fonctionne pas encore avec TypeScript 7.

## Vérifications du 12 octobre 2026

| Vérification | Résultat |
| --- | --- |
| Types stricts (`vue-tsc`) | aucune erreur |
| Tests unitaires | 95 réussis |
| Tests navigateur | 84 réussis sur les quatre profils |
| Captures de référence | les 45 identiques au pixel près à celles de l'ancien frontend à la fin de la migration, puis régénérées volontairement pour la refonte graphique |
| `pytest` | 104 réussis, et 41 tests d'intégration |
| Contrôle Nginx (`scripts/check_nginx_security.py`) sur le build | tous les contrôles réussis |

Le build ne contient ni script ni style en ligne, et n'utilise pas `eval`. Il pèse 235 Ko de JavaScript (80 Ko compressé).

## Mise en production

Nginx sert le contenu de `frontend/dist/` et renvoie vers `index.html` toute adresse qui n'est pas un fichier : c'est déjà ce que fait `deploy/nginx/taskflow.auxance.dev.conf`. La procédure complète est dans [la protection des requêtes](protection-requetes.md).

`scripts/check_nginx_security.py` vérifie ce build derrière le vrai fichier Nginx, dans un conteneur jetable : en-têtes de sécurité et CSP, scripts et styles servis en fichiers, adresses des écrans rendues à l'application.

## Ce qui reste

La suite de la refonte graphique : finitions écran par écran et réorganisation de la mise en page.
