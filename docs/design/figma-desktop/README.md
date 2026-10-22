# TaskFlow — Desktop UI

[Ouvrir les maquettes Figma](https://www.figma.com/design/mtS1ARRmR6puZsYI3PD9Jh/TaskFlow-Desktop-UI?node-id=5-52)

Maquettes haute fidélité de cinq écrans desktop, au format **1440 × 1024**.

| Écran | Aperçu | Figma |
| --- | --- | --- |
| Connexion | [01-login.png](01-login.png) | [Écran](https://www.figma.com/design/mtS1ARRmR6puZsYI3PD9Jh?node-id=5-49) |
| Workspaces | [02-dashboard.png](02-dashboard.png) | [Écran](https://www.figma.com/design/mtS1ARRmR6puZsYI3PD9Jh?node-id=5-50) |
| Administration du workspace | [03-workspace.png](03-workspace.png) | [Écran](https://www.figma.com/design/mtS1ARRmR6puZsYI3PD9Jh?node-id=5-51) |
| Projet et tableau Kanban | [04-project.png](04-project.png) | [Écran](https://www.figma.com/design/mtS1ARRmR6puZsYI3PD9Jh?node-id=5-52) |
| Détail et édition de tâche | [05-task.png](05-task.png) | [Écran](https://www.figma.com/design/mtS1ARRmR6puZsYI3PD9Jh?node-id=5-53) |

| Usage | Couleur |
| --- | --- |
| Fond principal | `#F7F7F8` |
| Surface | `#FFFFFF` |
| Bordure | `#E5E5E5` |
| Texte principal | `#1F1F1F` |
| Texte secondaire | `#6B6B6B` |
| Accent | `#2563EB` |
| Danger | `#C42B1C` |

## Parcours prototype

Depuis le point de départ **TaskFlow · Main workflow**, suivre : **Sign in → Development → Website → Connect the API → Back to project**.

## Frontend

Ces maquettes documentent la conception. L’interface actuelle utilise Vue 3, TypeScript et Vite dans `frontend/`.

Avec le backend démarré, depuis la racine :

```sh
npm ci --prefix frontend
npm run dev --prefix frontend
```

Ouvrir http://localhost:5173. Le serveur Vite relaie les appels à l’API. En production, `npm run build --prefix frontend` produit les fichiers servis par Nginx.
