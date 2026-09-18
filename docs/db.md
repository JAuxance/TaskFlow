Schéma défini dans [01-init.sql](../app/sql/01-init.sql).

```mermaid
erDiagram
    USERS ||--o{ WORKSPACES : owns
    WORKSPACES ||--o{ PROJECTS : contains
    PROJECTS ||--o{ TASKS : contains
    USERS ||--o{ TASKS : creates
    USERS |o--o{ TASKS : is_assigned
    WORKSPACES ||--o{ WORKSPACE_MEMBERS : has
    USERS ||--o{ WORKSPACE_MEMBERS : joins
    USERS ||--o{ SESSIONS : has

    USERS {
        SERIAL id PK
        VARCHAR(50) username "NOT NULL"
        VARCHAR(255) email UK "NOT NULL"
        TEXT password_hash "NOT NULL"
        TIMESTAMP created_at "NOT NULL; DEFAULT CURRENT_TIMESTAMP"
    }

    WORKSPACES {
        SERIAL id PK
        INTEGER owner_id FK "NOT NULL"
        VARCHAR(50) name "NOT NULL"
        TIMESTAMP created_at "NOT NULL; DEFAULT CURRENT_TIMESTAMP"
    }

    PROJECTS {
        SERIAL id PK
        INTEGER workspace_id FK "NOT NULL"
        VARCHAR(50) name "NOT NULL"
        TEXT description "NULL autorise"
        TIMESTAMP created_at "NOT NULL; DEFAULT CURRENT_TIMESTAMP"
    }

    TASKS {
        SERIAL id PK
        INTEGER project_id FK "NOT NULL"
        INTEGER creator_id FK "NOT NULL"
        INTEGER assignee_id FK "NULL autorise"
        VARCHAR(100) title "NOT NULL"
        TEXT description "NULL autorise"
        VARCHAR(20) status "NOT NULL; DEFAULT todo; CHECK todo, in_progress, review, done"
        VARCHAR(20) priority "NOT NULL; DEFAULT medium; CHECK low, medium, high, urgent"
        TIMESTAMP due_date "NULL autorise"
        TIMESTAMP created_at "NOT NULL; DEFAULT CURRENT_TIMESTAMP"
        TIMESTAMP updated_at "NOT NULL; DEFAULT CURRENT_TIMESTAMP"
    }

    WORKSPACE_MEMBERS {
        SERIAL id PK
        INTEGER workspace_id FK "NOT NULL; UNIQUE avec user_id"
        INTEGER user_id FK "NOT NULL; UNIQUE avec workspace_id"
        VARCHAR(20) role "NOT NULL; DEFAULT member; CHECK owner, admin, member, guest"
        TIMESTAMP joined_at "NOT NULL; DEFAULT CURRENT_TIMESTAMP"
    }

    SESSIONS {
        SERIAL id PK
        INTEGER user_id FK "NOT NULL"
        TEXT session_token UK "NOT NULL"
        TIMESTAMPTZ created_at "NOT NULL; DEFAULT CURRENT_TIMESTAMP"
        TIMESTAMPTZ expires_at "NOT NULL"
        BOOLEAN revoked "NOT NULL; DEFAULT FALSE"
    }
```

- Toutes les clés étrangères utilisent `ON DELETE CASCADE`, sauf `tasks.assignee_id`, qui utilise `ON DELETE SET NULL` : une tâche peut être non assignée.
- La contrainte `UNIQUE (workspace_id, user_id)` interdit plusieurs adhésions du même utilisateur au même workspace. Chaque colonne peut contenir des doublons individuellement.
- `tasks.updated_at` reçoit une valeur par défaut à la création ; ce script ne définit pas de déclencheur pour l'actualiser lors des modifications.
