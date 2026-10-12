# Frontend Vue — socle

## Où en est la migration

Le frontend est en cours de reconstruction avec Vue 3, TypeScript strict et Vite, dans `frontend-vue/`. Le frontend actuel (`frontend/`) reste celui qu'on utilise : il n'est pas modifié et continue de fonctionner sur le port 5500.

Cette étape pose uniquement le socle. **Aucun écran n'est encore migré** : la page affichée par Vite indique seulement si une session est ouverte, pour prouver que l'application atteint le backend.

## Contenu

| Fichier (`frontend-vue/`) | Rôle |
| --- | --- |
| `vite.config.ts` | Serveur de développement sur le port 5173 et proxy vers le backend. |
| `src/main.ts` | Démarre Vue, Pinia et le routeur ; charge la feuille de style actuelle. |
| `src/router.ts` | Routeur en mode historique. Les écrans y seront ajoutés un par un. |
| `src/api/client.ts` | Client HTTP : même contrat que `frontend/js/api.js`. |
| `src/api/types.ts` | Types des réponses de l'API, ajoutés avec l'écran qui en a besoin. |
| `src/stores/session.ts` | Utilisateur connecté et état de la session. |
| `src/views/FoundationView.vue` | Page provisoire, remplacée par l'écran de connexion à l'étape suivante. |

## Cohabitation avec le frontend actuel

- **Une seule feuille de style.** `src/main.ts` importe `frontend/css/style.css` et ses polices. Le design n'est donc défini qu'à un endroit tant que les deux frontends coexistent.
- **Une seule origine pour le navigateur.** Vite relaie `/api`, `/static`, `/health` et `/socket.io` (WebSocket compris) vers le port 5000, comme Nginx en production. Le code Vue appelle toujours des chemins relatifs.
- **Origine autorisée côté serveur.** Les requêtes relayées gardent l'origine `http://localhost:5173`. Elle est ajoutée aux origines de développement dans `app/app.py`, pour le contrôle CSRF, CORS et Socket.IO. La production n'accepte toujours que `PUBLIC_ORIGIN`.
- **Même session.** Le cookie est lié au nom d'hôte, pas au port : une session ouverte sur `localhost:5500` est reconnue sur `localhost:5173`. `localhost` et `127.0.0.1` restent deux hôtes distincts.

## Client HTTP

`apiRequest` garde le contrat du frontend actuel : il ne lève jamais d'exception et renvoie toujours `{ ok, status, data }`, avec un message lisible dans `data.error` en cas d'échec. Les messages sont repris à l'identique.

Quatre comportements sont nouveaux :

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
| Types stricts (`vue-tsc`) | aucune erreur ; une erreur volontaire est bien détectée dans un `.ts` et dans un `.vue` |
| Tests unitaires | 25 réussis (client HTTP et session) |
| Tests navigateur sur Vue, à travers le proxy | 5 réussis : lecture de la session, session reconnue, modification acceptée avec jeton et refusée sans, repli des chemins inconnus, WebSocket Socket.IO |
| Tests navigateur sur le frontend actuel | 30 réussis, sans régression |
| `pytest` | 104 réussis, dont le nouveau test des origines de développement |
| Build sous la CSP de `deploy/nginx/security-headers.conf` | la page s'affiche, la police se charge, aucune violation |

Le build ne contient ni script ni style en ligne, et n'utilise pas `eval`.

## Étape suivante

Migrer l'écran de connexion et d'inscription, puis ajouter `auth.spec.ts` à la liste `VUE_SPECS` de `e2e/playwright.config.ts` : les tests écrits pour le frontend actuel devront passer tels quels sur le nouveau.
