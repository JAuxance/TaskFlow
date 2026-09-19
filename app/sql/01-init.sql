CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    first_name VARCHAR(100),
    password_hash TEXT NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE workspaces (
    id SERIAL PRIMARY KEY,

    owner_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    name VARCHAR(50) NOT NULL,

    color VARCHAR(20) NOT NULL DEFAULT 'gray',
    CONSTRAINT workspace_color_check
        CHECK (
            color IN (
                'gray',
                'blue',
                'green',
                'yellow',
                'orange',
                'red',
                'purple'
            )
        ),

    icon_type VARCHAR(10),
    icon_value TEXT,

    CONSTRAINT workspace_icon_type_check
        CHECK (
            icon_type IN ('emoji', 'image')
            OR icon_type IS NULL
        ),

    CONSTRAINT workspace_icon_value_check
        CHECK (
            (icon_type IS NULL AND icon_value IS NULL)
            OR (
                icon_type IS NOT NULL
                AND icon_value IS NOT NULL
                AND btrim(icon_value) <> ''
            )
        ),

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE projects (
    id SERIAL PRIMARY KEY,

    workspace_id INTEGER NOT NULL
        REFERENCES workspaces(id)
        ON DELETE CASCADE,

    name VARCHAR(50) NOT NULL,
    description TEXT,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE tasks (
    id SERIAL PRIMARY KEY,

    project_id INTEGER NOT NULL
        REFERENCES projects(id)
        ON DELETE CASCADE,

    creator_id INTEGER
        REFERENCES users(id)
        ON DELETE SET NULL,

    assignee_id INTEGER
        REFERENCES users(id)
        ON DELETE SET NULL,

    title VARCHAR(100) NOT NULL,
    description TEXT,

    status VARCHAR(20) NOT NULL DEFAULT 'todo',
    CONSTRAINT task_status_check
        CHECK (
            status IN (
                'todo',
                'in_progress',
                'review',
                'done'
            )
        ),

    priority VARCHAR(20) NOT NULL DEFAULT 'medium',
    CONSTRAINT task_priority_check
        CHECK (
            priority IN (
                'low',
                'medium',
                'high',
                'urgent'
            )
        ),

    color VARCHAR(20) NOT NULL DEFAULT 'gray',
    CONSTRAINT task_color_check
        CHECK (
            color IN (
                'gray',
                'blue',
                'green',
                'yellow',
                'orange',
                'red',
                'purple'
            )
        ),

    due_date TIMESTAMP,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE workspace_members (
    id SERIAL PRIMARY KEY,

    workspace_id INTEGER NOT NULL
        REFERENCES workspaces(id)
        ON DELETE CASCADE,

    user_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    role VARCHAR(20) NOT NULL DEFAULT 'member',

    CONSTRAINT workspace_member_role_check
        CHECK (
            role IN (
                'owner',
                'admin',
                'member',
                'guest'
            )
        ),

    joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (workspace_id, user_id)
);


CREATE TABLE sessions (
    id SERIAL PRIMARY KEY,

    user_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    session_token TEXT NOT NULL UNIQUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,

    revoked BOOLEAN NOT NULL DEFAULT FALSE
);


CREATE TABLE workspace_messages (
    id SERIAL PRIMARY KEY,

    workspace_id INTEGER NOT NULL,
    user_id INTEGER,

    content TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_workspace_messages_workspace
        FOREIGN KEY (workspace_id)
        REFERENCES workspaces(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_workspace_messages_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE SET NULL
);
