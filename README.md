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
- **Frontend**: HTML, CSS, and vanilla JavaScript, with no build step.
- **Local environment**: Docker Compose.

## Local setup

Prerequisites: Docker with Docker Compose, and Python 3 to serve the frontend. Run all commands from the repository root.

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

In another terminal:

```bash
python3 -m http.server 5500 --directory frontend
```

Open [http://localhost:5500](http://localhost:5500), then create an account from the registration screen.

Use `localhost` and port `5500` to match the origin allowed by the backend. The Socket.IO client is loaded from a CDN and requires an Internet connection.

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
frontend/     HTML, CSS, JavaScript, and visual assets
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

## Documentation

- [Architecture](docs/architecture.md)
- [API reference](docs/api.md)
- [Database schema](docs/db.md)
- [API security audit](docs/audit-securite-api.md)
- [Audit closure report](docs/cloture-audit-securite-api.md)
- [UI mockups](docs/design/figma-desktop/README.md)

The `/health` check verifies API and database availability separately from the automated tests.
