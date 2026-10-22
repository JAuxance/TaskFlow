# Frontend Vue 3

Révision du 22 octobre 2026. Vue, TypeScript, Vue Router, Pinia et Vite. Les styles et thèmes existants sont conservés.

## Écrans

LandingView présente le produit. LoginView gère connexion et inscription. WorkspaceView propose Overview, Members et Settings. ProjectView affiche quatre colonnes Kanban (todo, in_progress, review, done). TaskView édite une tâche. ProfileDialog gère le prénom, l'export et la suppression du compte. Les pages Privacy et Cookies restent publiques.

La navigation Messages, le composant ChatPanel, Socket.IO, les uploads d'avatar et d'icône ont été supprimés. Les utilisateurs et workspaces sont représentés par leurs initiales.

## Formulaire de tâche

Tous les champs se sauvegardent avec Save changes. La comparaison avec l'état initial construit un seul PATCH contenant les changements. Une requête en cours désactive les champs et les boutons pour éviter les doubles envois. Les erreurs conservent le brouillon. Une navigation avec des changements demande confirmation ; quitter pendant l'envoi est bloqué, sauf redirection de session expirée.

La date passe par task/dueDate.ts pour préserver une valeur inchangée. Un assignee inconnu reste affiché sans réassignation automatique. Les droits serveur restent décisifs.

## Tableau Kanban

Les cartes s'ouvrent par clic ou clavier. Pour changer de colonne, ouvrir une tâche, changer Status puis Save changes. Le tri par priorité puis identifiant reste déterministe. Aucun glisser-déposer ni file de sauvegardes n'est nécessaire.

## Échanges et sécurité

api/client.ts centralise fetch, les erreurs réseau, le cookie de session et le jeton CSRF. Les appels utilisent des chemins relatifs. Vite relaie /api, /static et /health au backend local. Vue échappe le texte utilisateur par interpolation. La session n'est pas enregistrée dans localStorage ; le thème peut l'être.

## Vérification

```bash
npm ci --prefix frontend
npm test --prefix frontend
npm run build --prefix frontend
```

Les tests navigateur utilisent une base jetable, avec rôles, formulaires, navigation, responsive et captures dans les deux thèmes. Voir [tests E2E](tests-e2e.md).
