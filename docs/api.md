# API reference

Local base URL: `http://localhost:5000`. Routes are implemented in [app/routes](../app/routes), with the health endpoint in [app/app.py](../app/app.py).

## Conventions

- Send JSON bodies with `Content-Type: application/json`, except for file uploads.
- JSON bodies must be nonempty objects. Fields described as required must be supplied.
- Authentication uses a session cookie created by registration or login. Browser requests must include credentials.
- Every mutation under `/api/` also requires an allowed `Origin` (or a same-origin `Referer` if absent) and the session's `X-CSRF-Token`. Obtain the token from `GET /api/auth/csrf`, preserving its cookie. This applies before login and to uploads as well. The frontend API helper handles it automatically.
- Identifiers in paths are integers. The placeholders below, such as `{workspace_id}`, must be replaced with actual IDs.
- Dates in responses use ISO 8601 strings. Nullable values are returned as JSON `null`.
- Collection endpoints return arrays, without a pagination envelope.

List endpoints accept `page` (default `1`) and `limit` (default `20`, maximum `100`). Both must be positive integers. `/api/direct_conversations` returns the full conversation list and does not use pagination. Message history is ordered newest first, by creation date and then ID.

## Authentication and profile

| Method | Path | Body | Success |
| --- | --- | --- | --- |
| GET | `/api/auth/csrf` | None. | `200`: `csrf_token`; creates an anonymous session cookie if needed. |
| POST | `/api/users` | Required: `username`, `email`, `password`. | `201`: account details; starts a session. |
| POST | `/api/auth/login` | Required: `email`, `password`. | `200`: `id`, `username`, `email`; starts a session. |
| GET | `/api/auth/me` | None. | `200`: current user profile. |
| POST | `/api/auth/logout` | None. | `200`: confirmation; revokes the session. |
| PATCH | `/api/users/me` | Required: `first_name`. | `200`: updated user profile. |
| GET | `/api/users/me/deletion-preview` | None. | `200`: owned solo workspaces, blocking shared workspaces and data counts. |
| DELETE | `/api/users/me` | Required: current `password`, `confirmed_workspace_ids` array; no extra fields. | `200`: confirmation; deletes the authenticated account and clears the cookie. |
| POST | `/api/users/me/avatar` | Multipart file field `avatar`. | `200`: updated user profile. |
| DELETE | `/api/users/me/avatar` | None. | `200`: profile with `avatar_url: null`; removes the current uploaded picture. |
| POST | `/api/users/me/data-export` | Required: current `password`, no other field. | `200`: private JSON attachment for the session user. |

Token retrieval, registration and login do not require a signed-in account. The other routes require authentication. A successful registration or login clears the anonymous CSRF token; fetch a fresh token before the next mutation. Logout clears the session cookie. Responses under `/api/` use `Cache-Control: no-store, private`.

Registration accepts a nonblank username of at most 50 characters, a valid email of at most 255 characters, and a password of at least 8 characters. Duplicate emails return `409`. Invalid login credentials return `401`.

Registration is limited to 3 requests per hour per IP address; login is limited to 5 per minute per IP address. Sessions expire after 24 hours. `first_name` is trimmed and limited to 100 characters; an empty or whitespace-only string clears this optional field to `null`.

Picture removal is idempotent. If the file cannot be removed, it returns `503` and preserves the profile reference for a retry. Default assets and other users' pictures are never removed by this route.

Data export is limited to 3 requests per hour per IP address. It returns `format_version`, `generated_at`, `database_timezone`, scope notes, the user's `profile`, current `memberships`, attributed tasks in accessible workspaces, and messages authored by that user. No other person's message history, password hashes or session tokens are included. It uses a read-only database snapshot and stores no export file on the server. A request with any extra field (including `user_id`) returns `400`; an incorrect password returns `403`. More than 5,000 rows or 5 MiB of serialized JSON gives `409` with `code: export_too_large`, without a partial export. Image copies, logs and larger requests use the separate privacy-contact procedure.

`GET /api/privacy` is public and returns only `contact_email`, or `null` when not yet configured. The chosen public address is `contact@auxance.dev`; configure it through `PRIVACY_CONTACT_EMAIL` when deploying.

Registration returns `id`, `username`, `email`, and `created_at`. A user profile contains `id`, `username`, `email`, `first_name`, and `avatar_url`.

Account deletion requires the current password (`403` if incorrect), an explicit list of confirmed solo workspace IDs and the session CSRF token. It is limited to 5 requests per minute per IP and always targets the authenticated account. A transaction locks the account and owned workspaces, checks the password and rereads memberships. Ownership with any other member returns `409 shared_workspaces`; a changed workspace list returns `409 preview_changed`. Lock conflicts return `409 deletion_busy`. No deletion occurs on these refusals. Review the preview and confirm again after resolving the cause.

Deletion removes all database sessions, memberships, direct messages for both participants, and confirmed solo workspaces with their projects, tasks and chat. Tasks and messages in other owners' workspaces remain with account links set to `null`; their text may still contain personal information. Generated current image paths are queued transactionally, then removed after commit. Failed removals remain in `file_cleanup_jobs` for the cleanup command; unreferenced images are no longer served. Deploy the migration before the backend, and deploy the updated frontend with it. See [account deletion](suppression-compte.md).

## Workspaces

All workspace routes require authentication. “Any member” includes guests. “Designated owner” means the user referenced by `workspaces.owner_id`.

| Method | Path | Body | Access / success |
| --- | --- | --- | --- |
| GET | `/api/workspaces` | None. | Signed-in user; `200`, their workspaces. |
| POST | `/api/workspaces` | Required: `name`. | Signed-in user; `201`, workspace. |
| GET | `/api/workspaces/{workspace_id}` | None. | Any member; `200`, workspace. |
| PATCH | `/api/workspaces/{workspace_id}` | Required: `name`. | Owner or admin; `200`, workspace. |
| DELETE | `/api/workspaces/{workspace_id}` | None. | Designated owner; `200`, confirmation. |
| POST | `/api/workspaces/{workspace_id}/icon` | Multipart file field `icon`. | Owner or admin; `200`, updated icon details. |
| PATCH | `/api/workspaces/{workspace_id}/icon` | Required: `emoji`. | Owner or admin; `200`, updated icon details. |
| PATCH | `/api/workspaces/{workspace_id}/owner` | Required: `user_id`. | Designated owner; `200`, updated ownership details. |

Names must be nonblank and at most 50 characters. Emoji values must be nonblank printable text of at most 16 characters; joined emoji sequences are allowed.

A workspace contains `id`, `owner_id`, `name`, `created_at`, `icon_type`, `icon_value`, and `color`. Icon and ownership update responses use `workspace_id` instead of `id` and include a confirmation `message`.

Ownership transfer requires the target to already have the `owner` membership role. It changes the designated owner without changing membership roles. Transferring to the current designated owner returns `409`.

### Members

| Method | Path | Body | Success |
| --- | --- | --- | --- |
| GET | `/api/workspaces/{workspace_id}/members` | None. | `200`: members. |
| POST | `/api/workspaces/{workspace_id}/members` | Required: `email`; optional: `role` (default `member`). | `201`: confirmation. |
| PATCH | `/api/workspaces/{workspace_id}/members/{user_id}` | Required: `role`. | `200`: updated membership. |
| DELETE | `/api/workspaces/{workspace_id}/members/{user_id}` | None. | `200`: confirmation. |

Any member can list memberships. Adding members requires an existing registered account; duplicate membership returns `409`. Membership changes require the `owner` or `admin` role, with these additional rules:

- Admins can add, change, or remove only members and guests, and can assign only those two roles.
- Only the designated owner can grant the `owner` role or change/remove another member with that role.
- The designated owner's own membership cannot be changed or removed through these endpoints.

Member lists contain `id` (membership ID), `workspace_id`, `user_id`, `role`, `created_at`, `user_name`, and `avatar_url`. Emails are omitted for every role; adding a member still requires their known email address. A role update returns `id`, `workspace_id`, `user_id`, `role`, and `joined_at`. Both timestamp names refer to the membership's creation time.

## Projects

| Method | Path | Body | Access / success |
| --- | --- | --- | --- |
| GET | `/api/workspaces/{workspace_id}/projects` | None. | Any member; `200`, projects. |
| POST | `/api/workspaces/{workspace_id}/projects` | Required: `name`; optional: `description`. | Owner or admin; `201`, project. |
| GET | `/api/projects/{project_id}` | None. | Any member; `200`, project. |
| PATCH | `/api/projects/{project_id}` | `name` and/or `description`. | Owner or admin; `200`, project. |
| DELETE | `/api/projects/{project_id}` | None. | Owner or admin; `200`, confirmation. |

Names must be nonblank and at most 50 characters. Descriptions may be text or `null`. A project contains `id`, `workspace_id`, `name`, `description`, and `created_at`. Deleting a project also deletes its tasks.

## Tasks

| Method | Path | Body | Access / success |
| --- | --- | --- | --- |
| GET | `/api/projects/{project_id}/tasks` | None. | Any member; `200`, tasks. |
| POST | `/api/projects/{project_id}/tasks` | Required: `title`, `status`, `priority`; optional fields below. | Owner, admin, or member; `201`, task. |
| GET | `/api/tasks/{task_id}` | None. | Any member; `200`, task. |
| PATCH | `/api/tasks/{task_id}` | Fields to update from the table below. | Owner, admin, or member; `200`, task. |
| DELETE | `/api/tasks/{task_id}` | None. | Owner, admin, or member; `200`, confirmation. |

| Field | Accepted values |
| --- | --- |
| `title` | Nonblank string, at most 100 characters. |
| `description` | String or `null`; optional on creation. |
| `status` | `todo`, `in_progress`, `review`, `done`. |
| `priority` | `low`, `medium`, `high`, `urgent`. |
| `color` | `gray`, `blue`, `green`, `yellow`, `orange`, `red`, `purple`; defaults to `gray` on creation. |
| `assignee_id` | Positive user ID belonging to the workspace, or `null` for no assignee; optional on creation. |
| `due_date` | ISO 8601 date or datetime string, or `null`; optional on creation. |

Creation requires `status` and `priority` even though the database defines defaults. Updates preserve omitted fields. Task dates are stored without time zone; see [db.md](db.md#timestamps-and-sessions).

A task response contains `id`, `project_id`, `creator_id`, `assignee_id`, `title`, `description`, `status`, `priority`, `due_date`, and `color`.

Example creation body:

```json
{
  "title": "Document the API",
  "status": "todo",
  "priority": "medium",
  "color": "blue",
  "assignee_id": null,
  "due_date": "2026-10-01"
}
```

## Messaging

| Method | Path | Body | Access / success |
| --- | --- | --- | --- |
| GET | `/api/workspaces/{workspace_id}/messages` | None. | Any member; `200`, history. |
| POST | `/api/workspaces/{workspace_id}/messages` | Required: `message`. | Any member; `201`, message. |
| GET | `/api/users/{user_id}/direct_messages` | None. | Shared workspace with the other user; `200`, history. |
| POST | `/api/users/{user_id}/direct_messages` | Required: `message`. | Shared workspace with the other user; `201`, message. |
| GET | `/api/direct_conversations` | None. | Signed-in user; `200`, existing conversations with users who still share a workspace. |

Messages are trimmed and must contain 1–2,000 characters. Direct conversations with yourself are rejected with `400`. Sending a message saves it and publishes the corresponding Socket.IO event.

Workspace message creation returns `id`, `workspace_id`, `user_id`, `message`, `created_at`, and an `author` object containing `username`, `first_name`, and `avatar_url`. Workspace history uses flat `user_name`, `first_name`, and `avatar_url` fields instead of `author`.

Direct message creation and history use the same shape: `id`, `sender_id`, `receiver_id`, `message`, `created_at`, and `author`. Conversation summaries contain `user_id`, `username`, `first_name`, `avatar_url`, `last_message`, and `last_message_time`, ordered by the latest message first.

### Socket.IO events

Connect to the base URL with credentials enabled, using the default namespace. Joining a room requires the HTTP session cookie.

The handshake accepts only the configured public origin in production, or the two documented local origins in development. Each message delivery rechecks the recipient's session and room access. Logout, membership removal and deletion also remove forbidden subscriptions. See [chat access](correction-acces-chat.md).

| Direction | Event | Payload |
| --- | --- | --- |
| Client → server | `join_workspace` | `{ "workspace_id": 1 }` |
| Server → client | `workspace_joined` | `{ "workspace_id": 1 }` |
| Server → client | `new_message` | Workspace message in the HTTP creation response format. |
| Client → server | `join_direct_message` | `{ "user_id": 2 }` |
| Server → client | `direct_message_joined` | `{ "user_id": 2 }` |
| Server → client | `new_direct_message` | Direct message in the HTTP creation response format. |
| Server → client | `socket_error` | `{ "message": "..." }` |

Messages are sent through the HTTP endpoints, not through a socket send event. Fetch history after joining or reconnecting, and merge messages by ID because the HTTP response and live event may contain the same message. The frontend disconnects its subscription when leaving the chat view.

## Files and health

Avatar and workspace icon uploads use `multipart/form-data`. The file must decode as JPEG, PNG, or WebP, at most 5 MiB and 4096 pixels on its longest edge. The stored file is a new encoding of that image. Files that fail these checks return `400`; requests exceeding the overall 6 MiB body limit return `413`.

Returned image paths are relative to the API origin, for example `/static/avatars/7_example.png`. `GET /static/avatars/{filename}` and `GET /static/workspace_icons/{filename}` require a session. An avatar is returned to its owner, to someone who shares a workspace with them, or to someone who has exchanged a direct message with them. A workspace icon is returned to a member of that workspace. Other spellings of the same path, including `/static/avatars/./...`, are not served. Responses use `Cache-Control: no-store, private`.

`GET /health` is public. It executes `SELECT 1` and returns `200` with `{"api":"ok","database":"ok"}`, or `500` with `{"api":"ok","database":"error"}` if the database is unavailable.

## Errors

Application errors generally use this shape:

```json
{"error": "resource not found"}
```

| Status | Meaning |
| --- | --- |
| `400` | Invalid body, field value, pagination, or uploaded file. |
| `401` | Invalid credentials, missing session, expired session, or revoked session. |
| `403` | Insufficient permissions, disallowed request origin, or invalid/missing CSRF token. |
| `404` | Resource missing or outside the user's workspace membership. |
| `409` | Duplicate email, duplicate membership, or redundant ownership transfer. |
| `413` | Request body exceeds the global size limit. |
| `429` | Registration or login rate limit exceeded. |
| `500` | Database health failure or a server-side operation failed. |

Framework-generated errors, including unmatched routes and rate-limit responses, may use HTML instead of JSON. Clients should check the status and handle a non-JSON response.

## Example session

With an existing account, save the session cookie and reuse it for authenticated requests:

```bash
taskflow_csrf=$(curl -s -c cookies.txt -H 'Origin: http://localhost:5500' \
  http://localhost:5000/api/auth/csrf | python3 -c 'import json,sys; print(json.load(sys.stdin)["csrf_token"])')

curl -b cookies.txt -c cookies.txt \
  -H 'Origin: http://localhost:5500' -H "X-CSRF-Token: $taskflow_csrf" \
  -H 'Content-Type: application/json' \
  -d '{"email":"alex@example.com","password":"your-password"}' \
  http://localhost:5000/api/auth/login

curl -b cookies.txt \
  http://localhost:5000/api/workspaces

taskflow_csrf=$(curl -s -b cookies.txt -c cookies.txt -H 'Origin: http://localhost:5500' \
  http://localhost:5000/api/auth/csrf | python3 -c 'import json,sys; print(json.load(sys.stdin)["csrf_token"])')

curl -b cookies.txt -c cookies.txt -X POST \
  -H 'Origin: http://localhost:5500' -H "X-CSRF-Token: $taskflow_csrf" \
  http://localhost:5000/api/auth/logout
```
