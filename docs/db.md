```mermaid
erDiagram
    USERS ||--o{ WORKSPACES : owns

    USERS {
        SERIAL id PK
        VARCHAR username
        VARCHAR email UK
        TEXT password_hash
        TIMESTAMP created_at
    }

    WORKSPACES {
        SERIAL id PK
        INTEGER owner_id FK
        VARCHAR name
        TIMESTAMP created_at
    }
```