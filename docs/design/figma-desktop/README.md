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

Les cinq écrans sont intégrés en HTML, CSS et JavaScript natifs dans `frontend/`. La navigation reste dans `app.js` et les formulaires dans les vues existantes. Le backend n'a pas été modifié.

Avec le backend démarré, lancer depuis la racine :

```sh
python3 -m http.server 5500 --directory frontend
```

Ouvrir **http://localhost:5500**, l'origine déjà autorisée par l'API. Aucune compilation nécessaire.
