# TaskFlow

A collaborative project and task management application. TaskFlow organizes work into workspaces with a Kanban board and built-in messaging.

## Features

- User registration, sign-in, profile management, and account deletion.
- Workspaces with member management and roles: owner, admin, member, and guest.
- Projects and tasks with status, priority, assignee, and due date.
- Real-time workspace chat and direct messages.
- Light and dark themes.

## Tech stack

- **Backend**: Python 3.12, Flask, Flask-SocketIO, and Psycopg.
- **Database**: PostgreSQL 17.
- **Frontend**: Vue 3, TypeScript, and Vite, in `frontend-vue/`. See [Vue frontend](docs/frontend-vue.md).
- **Previous frontend**: vanilla JavaScript in `frontend/`, replaced by the Vue one and kept until it is removed.
- **Local environment**: Docker Compose.

## Local setup

Prerequisites: Docker with Docker Compose, and Node.js 20 or later for the frontend. Run all commands from the repository root.

### 1. Configure the environment

If `.env` does not already exist, create it from the template:

```bash
cp .env.example .env
```

Replace the placeholder values in `.env`:

| Variable | Purpose |
| --- | --- |
| `POSTGRES_ADMIN_PASSWORD` | Password for the PostgreSQL administrator account. |
| `DATABASE_APP_PASSWORD` | Password for the application's PostgreSQL account. |
| `SECRET_KEY` | Flask secret key. |

Keep `APP_ENV=development` for this local setup. Docker Compose configures the database connection and passes `DATABASE_APP_PASSWORD` to the backend as `DATABASE_PASSWORD`.

Run this command separately for each secret to generate a random value:

```bash
python3 -c 'import secrets; print(secrets.token_hex(32))'
```

### 2. Start the API and database

```bash
docker compose up --build -d
```

The API is available at `http://localhost:5000`. The SQL schema and application database account are created automatically on the first startup, when the PostgreSQL volume is empty.

### 3. Start the frontend

Prerequisite: Node.js 20 or later. In another terminal:

```bash
npm ci --prefix frontend-vue
npm run dev --prefix frontend-vue
```

Open [http://localhost:5173](http://localhost:5173), then create an account from the registration screen.

The development server relays API and Socket.IO calls to port 5000, so the browser only talks to port 5173. Use `localhost:5173` or `127.0.0.1:5173` consistently: the session cookie belongs to one host name.

### 4. Check service health

```bash
curl --fail http://localhost:5000/health
```

When the API and PostgreSQL are available, the response is:

```json
{"api": "ok", "database": "ok"}
```

## Useful commands

```bash
docker compose ps             # Show service status
docker compose logs -f backend # Follow API logs
docker compose logs -f db      # Follow PostgreSQL logs
docker compose down           # Stop services and keep stored data
```

PostgreSQL data is stored in the `postgres_data` volume. Initialization scripts do not run again on an existing volume; changing these scripts or passwords in `.env` does not update an initialized database. Adding `-v` to `docker compose down` deletes the volume and its data.

## Repository structure

```text
app/          Flask application, data access, routes, and Socket.IO events
app/sql/      Database schema and application account initialization
frontend-vue/ Vue 3 frontend
frontend/     Previous frontend; still holds the stylesheet and icons the Vue one imports
e2e/          Browser tests and reference screenshots
docs/         Documentation and design mockups
compose.yaml  Docker Compose services
Dockerfile    Backend image
```

## Tests

Create and activate a Python virtual environment, then install the application and test dependencies:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt -r requirements-dev.txt
python -m pytest -q
```

Tests are in `app/tests/`. They use Flask and Socket.IO test clients with database calls replaced by test doubles, so PostgreSQL is not required. They check selected authentication, permissions, validation, and messaging behavior. Database queries and browser rendering are not covered by this suite.

Opt-in network tests use a disposable PostgreSQL database and real HTTP/WebSocket connections. Run them in a separate Python process: see [chat access tests](docs/correction-acces-chat.md) and [request security tests](docs/protection-requetes.md). The latter also describes the JavaScript and Nginx checks.

Frontend unit tests and type checks:

```bash
npm test --prefix frontend-vue
npm run typecheck --prefix frontend-vue
```

Browser tests are in `e2e/`. They drive Chromium with Playwright against a disposable stack (`compose.e2e.yaml`), never the development database, and compare the main screens with reference screenshots. Stop the development stack and the development server first, since they use ports 5000 and 5173:

```bash
npm ci --prefix e2e
npx --prefix e2e playwright install chromium
npm test --prefix e2e
```

See [browser tests](docs/tests-e2e.md) for the covered journeys, reports and reference screenshots.

## Production request security

Set `PUBLIC_ORIGIN=https://taskflow.auxance.dev` to the public origin used by your deployment. Mutations now require the session's CSRF token and an allowed request origin; `frontend/js/api.js` sends the token automatically, including for login and uploads. Deploy frontend and backend together. Follow the [Nginx, proxy and cache installation procedure](docs/protection-requetes.md) before enabling `TRUST_PROXY_HEADERS=1`.

## Documentation

- [Account deletion, migration and file cleanup](docs/suppression-compte.md)
- [Privacy notice](docs/confidentialite.md)
- [Data requests and incidents](docs/demandes-et-incidents.md)
- [Retention and backups](docs/retention-sauvegardes.md)
- [Personal data features and release preparation](docs/donnees-personnelles.md)
- [Architecture](docs/architecture.md)
- [API reference](docs/api.md)
- [Request security and deployment](docs/protection-requetes.md)
- [Real-time chat access](docs/correction-acces-chat.md)
- [Browser tests](docs/tests-e2e.md)
- [Vue frontend](docs/frontend-vue.md)
- [Database schema](docs/db.md)
- [API security audit](docs/audit-securite-api.md)
- [Audit closure report](docs/cloture-audit-securite-api.md)
- [UI mockups](docs/design/figma-desktop/README.md)
- [RNCP5 real application screenshots](docs/design/captures-reelles/)

The `/health` check verifies API and database availability separately from the automated tests.
