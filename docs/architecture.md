# Architecture

TaskFlow is a web application with a JavaScript frontend, a Flask backend, and a PostgreSQL database. HTTP handles authentication and data operations; Socket.IO delivers chat updates.

## Runtime components

| Component | Responsibility | Local address |
| --- | --- | --- |
| Frontend | Renders screens and sends HTTP and Socket.IO requests. | `http://localhost:5500` |
| Backend | Validates requests, checks permissions, accesses data, and publishes messages. | `http://localhost:5000` |
| PostgreSQL | Stores accounts, sessions, workspaces, projects, tasks, and messages. | `db:5432` inside Docker Compose |

Docker Compose starts the backend and database. The frontend is served separately using Python's HTTP server. The backend waits for PostgreSQL's health check before starting. PostgreSQL has no host port published in the Compose configuration.

## Code organization

```text
app/
  app.py                 Flask setup, blueprint registration, health endpoint, server startup
  extensions.py          Shared rate limiter and Socket.IO instance
  db.py                  PostgreSQL connections and parameterized SQL queries
  permissions.py         Session validation and resource access checks
  validation.py          JSON, text, identifier, and pagination validation
  routes/                HTTP endpoints grouped by feature
  sockets/               Workspace and direct-message Socket.IO handlers
  utils/chat.py          Shared direct-message room naming
  sql/                   Database and application role initialization
  tests/                 Pytest tests for HTTP routes and socket subscriptions
frontend/
  index.html             Application entry page
  css/style.css          Layout, components, and themes
  js/app.js              Navigation, page layout, profile dialog, and theme selection
  js/api.js              HTTP requests, response handling, pagination, and asset URLs
  js/ui.js               Shared HTML escaping, feedback, and button busy states
  js/views/              Screen rendering and UI event handlers
  js/                    Feature modules for authentication, workspaces, projects, tasks, and chat
  assets/                Fonts and icons
```

## HTTP request flow

A task update illustrates the main flow:

1. The task view calls `updateTask()` in `frontend/js/task.js`.
2. `apiRequest()` sends a JSON `PATCH /api/tasks/{task_id}` request with the session cookie.
3. The route checks authentication, workspace membership, role, and input values.
4. `app/db.py` executes the update through Psycopg and returns the database row.
5. The route serializes the row as JSON, and the view updates its display or shows the error.

Routes delegate shared access checks to `permissions.py` and input checks to `validation.py`. Database functions open their own connections and use connection context managers to commit successful operations or roll back failures. Workspace creation inserts the workspace and its initial owner membership in one transaction.

## Authentication and permissions

Registration hashes passwords with Argon2. Registration and login create a random token in the `sessions` table and place that token in Flask's signed session cookie. The token expires after 24 hours. Authenticated HTTP requests check that the database session exists, is not revoked, and has not expired. Logout revokes the database session and clears the cookie.

Workspace membership determines access to projects and tasks. The roles are `owner`, `admin`, `member`, and `guest`. The designated owner in `workspaces.owner_id` has additional rights, including workspace deletion and ownership transfer. This is separate from the membership role: several members may have the `owner` role.

The frontend uses permissions to display the relevant controls; the backend enforces access. See the [API reference](api.md) for each endpoint's rules.

## Frontend lifecycle

The browser loads native JavaScript modules without a build step. `app.js` switches views and provides navigation callbacks. A view version prevents an older asynchronous response from replacing a newer screen, and cleanup callbacks disconnect chat subscriptions when navigating away.

`api.js` includes cookies in requests and converts network or HTTP failures into a consistent frontend result: `{ ok, status, data }`. Its collection helper loads all pages for workspace, member, project, and task lists. Chat history uses separate pages of 50 messages.

Theme preference is stored in `localStorage`; authentication uses the session cookie. The Socket.IO browser client is loaded from a CDN.

## Real-time messaging

Messages are submitted through HTTP and saved before a Socket.IO event is emitted. Clients join a workspace room or a room shared by two users. Workspace subscriptions check authentication and membership when joining. Direct-message subscriptions require a shared workspace; delivery also rechecks the stored session's validity and participant identity.

Workspace chat and direct messages share the frontend chat renderer and connection lifecycle. The renderer merges HTTP responses and live events by message ID to avoid duplicates. On reconnect, it reloads history to recover missed messages. History remains accessible through HTTP when live updates are unavailable.

## Storage and configuration

The database schema and deletion rules are documented in [db.md](db.md). PostgreSQL data persists in the `postgres_data` volume. Uploaded avatars and workspace icons are files under `app/static/`, served by Flask; the database stores their URL paths. The repository bind mount preserves these files in the local setup.

The backend reads environment variables directly. Docker Compose provides the database settings, `APP_ENV`, and `SECRET_KEY` from its configuration and `.env`. Development permits the frontend origin `http://localhost:5500`; the frontend API address is defined in `frontend/js/api.js`. Setting `APP_ENV=production` disables debug mode and enables secure cookies, but does not configure a production deployment.

## Verification

The [README](../README.md#tests) explains how to run the tests. They use Flask and Socket.IO test clients, with database calls replaced by test doubles. They cover selected authentication, permission, validation, messaging, and health-check paths. They do not verify PostgreSQL queries or browser rendering; those require a running database and manual application checks.
