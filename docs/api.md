# API reference

Local base URL: `http://localhost:5000`. Routes are implemented in [app/routes](../app/routes), with the health endpoint in [app/app.py](../app/app.py).

## Conventions

- Send JSON bodies with `Content-Type: application/json`, except for file uploads.
- JSON bodies must be nonempty objects. Fields described as required must be supplied.
- Authentication uses a session cookie created by registration or login. Browser requests must include credentials.
- Identifiers in paths are integers. The placeholders below, such as `{workspace_id}`, must be replaced with actual IDs.
- Dates in responses use ISO 8601 strings. Nullable values are returned as JSON `null`.
- Collection endpoints return arrays, without a pagination envelope.

List endpoints accept `page` (default `1`) and `limit` (default `20`, maximum `100`). Both must be positive integers. `/api/direct_conversations` returns the full conversation list and does not use pagination. Message history is ordered newest first, by creation date and then ID.

## Authentication and profile

| Method | Path | Body | Success |
| --- | --- | --- | --- |
| POST | `/api/users` | Required: `username`, `email`, `password`. | `201`: account details; starts a session. |
| POST | `/api/auth/login` | Required: `email`, `password`. | `200`: `id`, `username`, `email`; starts a session. |
| GET | `/api/auth/me` | None. | `200`: current user profile. |
| POST | `/api/auth/logout` | None. | `200`: confirmation; revokes the session. |
| PATCH | `/api/users/me` | Required: `first_name`. | `200`: updated user profile. |
| DELETE | `/api/users/me` | Required: current `password`. | `200`: confirmation; deletes the authenticated account and clears the cookie. |
| POST | `/api/users/me/avatar` | Multipart file field `avatar`. | `200`: updated user profile. |

Registration and login are public; the other routes require authentication. Registration accepts a nonblank username of at most 50 characters, a valid email of at most 255 characters, and a password of at least 8 characters. Duplicate emails return `409`. Invalid login credentials return `401`.

Registration is limited to 3 requests per hour per IP address; login is limited to 5 per minute per IP address. Sessions expire after 24 hours. `first_name` is trimmed, must be nonblank, and is limited to 100 characters.

Registration returns `id`, `username`, `email`, and `created_at`. A user profile contains `id`, `username`, `email`, `first_name`, and `avatar_url`.

Account deletion requires the current password (`403` if incorrect) and is limited to 5 requests per minute per IP. It always targets the authenticated user. Deletion removes all database sessions, memberships, direct messages, and owned workspaces with their projects, tasks, and chat history. Tasks and messages in other workspaces remain with user references set to `null`. Transfer workspace ownership first to preserve shared work. Uploaded avatars and owned workspace icons are removed after the database transaction commits; file removal failures are logged. This action is irreversible.

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

Member lists contain `id` (membership ID), `workspace_id`, `user_id`, `role`, `created_at`, `user_name`, `user_email`, and `avatar_url`. A role update returns `id`, `workspace_id`, `user_id`, `role`, and `joined_at`. Both timestamp names refer to the membership's creation time.

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

Avatar and workspace icon uploads use `multipart/form-data`. Supported extensions are `jpg`, `jpeg`, `png`, and `webp`, with an `image/` content type and a file size of at most 5 MiB. Files above that limit return `400`; requests exceeding the overall 6 MiB body limit return `413`.

Returned image paths are relative to the API origin, for example `/static/avatars/7_example.png`. Flask serves them through `GET /static/{filename}` without an authentication check.

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
| `403` | Insufficient role or direct-message access denied. |
| `404` | Resource missing or outside the user's workspace membership. |
| `409` | Duplicate email, duplicate membership, or redundant ownership transfer. |
| `413` | Request body exceeds the global size limit. |
| `429` | Registration or login rate limit exceeded. |
| `500` | Database health failure or a server-side operation failed. |

Framework-generated errors, including unmatched routes and rate-limit responses, may use HTML instead of JSON. Clients should check the status and handle a non-JSON response.

## Example session

With an existing account, save the session cookie and reuse it for authenticated requests:

```bash
curl -c cookies.txt \
  -H 'Content-Type: application/json' \
  -d '{"email":"alex@example.com","password":"your-password"}' \
  http://localhost:5000/api/auth/login

curl -b cookies.txt \
  http://localhost:5000/api/workspaces

curl -b cookies.txt -c cookies.txt -X POST \
  http://localhost:5000/api/auth/logout
```
