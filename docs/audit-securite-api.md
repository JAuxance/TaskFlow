# TaskFlow API Security Audit

Date: September 11, 2026. Reviewed version: commit `fc818aa`, with the files present in the workspace at the start of the audit.

Follow-up on September 14, 2026: see the [audit closure report and acceptance evidence after reset](cloture-audit-securite-api.md). This document preserves the initial findings and results.

Objective: identify risks and prepare working material for an RNCP level 5 portfolio. Fixes were still to be implemented by the project author. No application fix, configuration change, or data change was made during this audit.

## 1. Scope and method

Review of the 25 declared route/method pairs, authentication, permissions, PostgreSQL access, the SQL schema, direct dependencies, and Docker configuration. Files covered: `app/app.py`, `app/permissions.py`, `app/db.py`, the four modules in `app/routes/`, `app/sql/init.sql`, `requirements.txt`, `Dockerfile`, `compose.yaml`, `.env.example`, `.gitignore`, and the existing documentation.

The code review was supplemented by checks with the Flask test client and fictitious in-memory data. No network server or container was started for the audit; no connection to the real database, load test, or attempt against a public service was performed. The contents of `.env` and the five untracked `.txt` files were not accessed. Their presence alone was observed.

Verification environment: Python 3.14.4, Flask 3.1.0, Werkzeug 3.1.8, and argon2-cffi 25.1.0, in a temporary environment outside the repository. The Dockerfile specifies Python 3.12, so these probes do not validate the container. The PostgreSQL driver was replaced with a connection-blocking stub because `psycopg-binary==3.2.1` could not be installed for this Python version and `libpq` was missing. Data-access functions were simulated; the project routes and Flask HTTP processing were used. Exceptions were converted into HTTP responses to observe `500` codes; the interactive debugger was not started.

OWASP references classify risks only. They do not constitute API certification or an official mapping to a specific RNCP qualification, whose framework was not provided. [OWASP API Security 2023 framework](https://owasp.org/API-Security/editions/2023/en/0x11-t10/).

## 2. Findings summary

The API already has useful protections: Argon2 password hashing, parameterized SQL queries, workspace-membership checks, and role restrictions. The main application defect concerns role assignment: the rules differ depending on the action used. The Docker configuration must also be reviewed before network exposure.

Severity considers impact and exploitation conditions. “High” means a priority before exposure or use with real data; “medium” means a risk to address during the security cycle; “low” means limited disclosure or hardening. No CVSS score was calculated.

| ID | Finding | Severity | Evidence status |
| --- | --- | --- | --- |
| SEC-01 | Assignment of elevated roles when adding a member | High | Confirmed in code and by HTTP simulation |
| SEC-02 | Deletion of an administrator after demotion | Medium | Confirmed in code and by HTTP simulation |
| SEC-03 | Flask debugger enabled by Docker startup | High if network-accessible | Configuration confirmed; actual exposure not verified |
| SEC-04 | PostgreSQL exposed with an over-privileged account and weak credentials | High if network-accessible | Configuration confirmed; existing privileges not verified |
| SEC-05 | Local sensitive files included in the Docker build context | High if the image is distributed | Build rules and `.env` presence confirmed |
| SEC-06 | Session cookie without the `Secure` attribute | High on HTTP over an untrusted network | Cookie attributes verified; interception not performed |
| SEC-07 | Old cookie remains usable after logout | Medium | Replay confirmed with a fictitious session |
| SEC-08 | No application limits on attempts and resource consumption | Medium | Review and targeted checks; saturation not tested |
| SEC-09 | Insufficient validation of input types and values | Low in isolation; medium with SEC-03 | Processing errors confirmed with fictitious requests |
| SEC-10 | Task assigned to a user outside the workspace | Medium | Acceptance confirmed by HTTP simulation |
| SEC-11 | Technical details returned by `/health` | Low | Disclosure confirmed with a fictitious error |
| SEC-12 | Responses allow existing accounts or resources to be identified | Low | Review and targeted checks |

Conditional severities do not prove that the application is currently accessible from the Internet.

## 3. Finding details

### SEC-01 — Assignment of elevated roles when adding a member

**Evidence:** [app/routes/workspaces.py](../app/routes/workspaces.py), lines 124–146, compared with lines 214–225.

`POST /api/workspaces/{id}/members` allows `owner` and `admin` for any caller already holding either role. The `PATCH` route applies a different policy and reserves `owner` assignment to the primary owner, called the “crown holder” in the code.

**Scenario:** an administrator adds an external registered account with `{"email":"second@example.test","role":"owner"}`. The route accepts it. A non-primary `owner` can also add another `owner`.

**Impact:** privilege escalation within the workspace. The added role does not transfer `workspaces.owner_id`; primary ownership and workspace deletion remain separately protected.

**Suggested fix:** apply one role-assignment policy to member creation and modification. **Validation criterion:** an administrator cannot assign `admin` or `owner`, regardless of route; only the primary owner can assign `owner`.

Classification: OWASP API5:2023, function-level authorization.

### SEC-02 — Deletion of an administrator after demotion

**Evidence:** [app/routes/workspaces.py](../app/routes/workspaces.py), lines 198–225 and 266–275.

Direct deletion of an administrator by another administrator is forbidden, but `PATCH /api/workspaces/{id}/members/{user_id}` can demote that administrator to `member` or `guest`, after which deletion succeeds.

**Observed scenario:** deletion returns `403`, demotion returns `200`, and the subsequent deletion is called. The final response has a separate defect.

**Impact:** bypass of the administrator-protection rule. **Suggested fix:** check the target’s current role during modification. **Validation criterion:** A cannot demote and then delete B if this protection remains the policy.

Classification: OWASP API5:2023.

### SEC-03 — Debugger enabled by Docker startup

**Evidence:** [app/app.py](../app/app.py), line 33; [Dockerfile](../Dockerfile), line 11; [compose.yaml](../compose.yaml), lines 5–6.

The container runs `python -m app.app`, which calls `app.run(host="0.0.0.0", port=5000, debug=True)`. Port 5000 is published. Debug mode can expose internal traces and a dangerous interactive surface. Flask states that its debugger can execute Python code and is not production protection. [Flask debugging documentation](https://flask.palletsprojects.com/en/stable/debugging/).

No external access or PIN/host-control bypass was demonstrated; anonymous code execution is not asserted.

**Suggested fix:** disable debugging in production and use an appropriate WSGI server. **Validation criterion:** staging errors return a generic response without a traceback or interactive interface.

Classification: OWASP API8:2023, security misconfiguration.

### SEC-04 — PostgreSQL too exposed and over-privileged

**Evidence:** [compose.yaml](../compose.yaml), lines 13–14 and 23–28; [app/sql/init.sql](../app/sql/init.sql), lines 1–44.

Database credentials are weak values written in plain text in Compose, and `5432:5432` is published on all interfaces by default. The API uses the same account declared in `POSTGRES_USER`; on a new volume the official image creates it as a superuser. No restricted application role is defined. Existing-volume privileges were not queried. [Docker port publishing](https://docs.docker.com/get-started/docker-concepts/running-containers/publishing-ports/) and [PostgreSQL image documentation](https://hub.docker.com/_/postgres).

**Impact:** direct database access bypasses API controls, and an application compromise gains excessive privileges. **Suggested fix:** restrict network exposure, use strong secrets, and use a restricted application role. Verify that unauthorized networks cannot reach the port and that the application account is not a superuser.

Changing only `.env` does not replace literal Compose values. Changing `POSTGRES_PASSWORD` does not reset an already initialized volume; verify the existing database without deleting its data.

Classification: OWASP API8:2023.

### SEC-05 — Local sensitive files included in the Docker image

**Evidence:** [Dockerfile](../Dockerfile), line 9; [compose.yaml](../compose.yaml), line 3; [.gitignore](../.gitignore), line 1. No `.dockerignore` or `Dockerfile.dockerignore` was present; `.env` and `.git` were present.

With `build: .` and `COPY . .`, a future build includes `.env` and other unexcluded local files. `.gitignore` does not filter the Docker context. [Docker build context documentation](https://docs.docker.com/build/concepts/context/).

**Impact:** anyone retrieving the image may retrieve included secrets. No existing image or previous distribution was inspected or asserted. The `.txt` contents were not read; their names do not prove that they contain sessions.

**Suggested fix:** restrict the build context and inject secrets at runtime. Inspect the final image and layers; no `.env`, Git history, or local authentication file should be present. Rotate affected secrets if such an image was distributed.

Classification: OWASP API8:2023.

### SEC-06 — Session cookie without the `Secure` attribute

**Evidence:** [app/app.py](../app/app.py), lines 11–12; [app/routes/auth.py](../app/routes/auth.py), line 52; [compose.yaml](../compose.yaml), lines 5–6.

The session cookie has `HttpOnly`, but no `Secure` or explicit `SameSite`. The API starts over HTTP and no HTTPS proxy is described. Without `Secure`, a browser may send the cookie over HTTP. [Flask cookie configuration](https://flask.palletsprojects.com/en/stable/config/#SESSION_COOKIE_SECURE).

**Impact:** a user on an observable HTTP network may have their session and credentials intercepted. This was not performed; external HTTPS, HSTS, and filtering remain unverified.

**Suggested fix:** require HTTPS for real data and configure cookie attributes explicitly. **Validation criterion:** HTTPS login, `Secure` and `HttpOnly`, an explicit `SameSite`, and no unprotected direct-port access.

Classification: OWASP API2/API8:2023. Missing explicit `SameSite` alone does not demonstrate CSRF.

### SEC-07 — Logout does not revoke a copied cookie

**Evidence:** [app/routes/auth.py](../app/routes/auth.py), lines 52, 58, and 67–70; [app/app.py](../app/app.py), lines 11–12.

The session is a Flask-signed cookie. `logout()` removes `user_id` from the current browser session without server-side revocation. A prior copy remains accepted.

**Scenario:** retain a fictitious login cookie, log out, reinject the cookie, and call `/api/auth/me`. The original client is cleaned but the copy remains valid. The default signature lifetime is 31 days, provided the key remains valid. [Flask session configuration](https://flask.palletsprojects.com/en/stable/config/#PERMANENT_SESSION_LIFETIME).

**Impact:** logout cannot terminate a stolen session. No real theft was performed. **Suggested fix:** add revocation and an appropriate session lifetime. **Validation criterion:** the retained cookie receives `401` after logout. [OWASP session termination recommendations](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

Classification: OWASP API2:2023.

### SEC-08 — Attempts and resource consumption are not limited

**Evidence:** [app/routes/auth.py](../app/routes/auth.py), lines 12–25 and 36–52; [app/app.py](../app/app.py), lines 11–17; [app/db.py](../app/db.py), lines 71–83, 150–161, 239–251, and 335–346.

There is no limit on login or registration attempts. `MAX_CONTENT_LENGTH` is not configured, lists use unpaginated `fetchall()`, and free-text fields have no application maximum. Argon2 intentionally consumes significant CPU and memory.

**Impact:** automated password guessing, mass account creation, and resource exhaustion are easier. No saturation or server-capacity measurement was performed. [Flask resource consumption](https://flask.palletsprojects.com/en/stable/web-security/#resource-use).

**Suggested fix:** set request and field limits, limit attempts, paginate results, and provide quotas. **Validation criterion:** controlled `429` after the threshold, `413` for oversized bodies, bounded result counts, and no write when limits are exceeded.

Classification: OWASP API2/API4:2023.

### SEC-09 — Insufficient input validation

**Evidence:** [app/routes/auth.py](../app/routes/auth.py), lines 14–25 and 38–49; [app/routes/workspaces.py](../app/routes/workspaces.py), lines 106–109; [app/routes/tasks.py](../app/routes/tasks.py), lines 68–92 and 135–145; [app/sql/init.sql](../app/sql/init.sql), lines 26–32.

The code assumes JSON is an object and fields have expected types. `[1]` reaches `.get()` and raises an exception; a numeric registration password reaches `len(password)` and also raises one. Task statuses, priorities, dates, and lengths are not validated before SQL access.

**Impact:** clients can trigger `500` responses, unnecessary queries, and potentially exposed traces through SEC-03. SQL constraints prevent some forbidden values; this is an input/error-handling defect, not demonstrated SQL injection.

**Suggested fix:** define request schemas and validate types, lengths, allowed values, identifiers, and dates. Arrays, forbidden `null`, oversized strings, unknown statuses, and impossible dates should return JSON `400` or `422` without writing.

Classification: input validation, with OWASP API4/API8:2023 consequences.

### SEC-10 — Task assigned outside the workspace

**Evidence:** [app/routes/tasks.py](../app/routes/tasks.py), lines 80–86; [app/sql/init.sql](../app/sql/init.sql), line 25.

Task creation checks only that `assignee_id` belongs to an existing user, not that the user belongs to the project workspace. The foreign key has the same limitation.

**Scenario and impact:** an authorized member can assign a task to an external user. This creates an authorization inconsistency, although external read access was not demonstrated because workspace read controls remain.

**Suggested fix:** verify assignee membership, or document intentional external assignment and define its rights. **Validation criterion:** external assignment is rejected without insertion; internal and unassigned tasks remain possible.

Classification: OWASP API3:2023, object-property authorization.

### SEC-11 — Technical disclosure through `/health`

**Evidence:** [app/app.py](../app/app.py), lines 20–29.

The public endpoint returns `str(error)` on a database error. A synthetic error appeared in JSON; a real error may reveal hostnames, ports, or connection details.

**Impact:** infrastructure reconnaissance. **Suggested fix:** return minimal public status and keep details in internal logs. **Validation criterion:** simulated outages reveal no technical details, while an identifier permits server-side diagnosis.

Classification: OWASP API8:2023.

### SEC-12 — Account and resource enumeration

**Evidence:** [app/routes/auth.py](../app/routes/auth.py), lines 25–27; [app/routes/tasks.py](../app/routes/tasks.py), lines 36–48; [app/routes/projects.py](../app/routes/projects.py), lines 79–88; [app/routes/workspaces.py](../app/routes/workspaces.py), lines 65–70 and 142–148.

Registration for an existing email returns `409` with a specific message. An external logged-in user receives `403` for an existing task and `404` for an unknown ID. Similar distinctions exist for workspaces and projects; member addition also distinguishes registered emails.

**Impact:** account or resource existence can be discovered without demonstrated content access. **Suggested fix:** decide which existence information may be public and harmonize responses where confidentiality is required; add attempt limits. Login already uses the same message for an unknown account and incorrect password.

Classification: confidentiality and response design.

## 4. Dependencies: identified alerts and applicability

The direct versions in `requirements.txt` were compared with public PyPI metadata and maintainer advisories available at the audit date. Duplicate GHSA, CVE, and PYSEC identifiers refer to the same issue and are not counted more than once.

| Declared dependency | Alert and fixed version | Applicability |
| --- | --- | --- |
| Flask 3.1.0 | CVE-2025-47278; fixed in 3.1.1 | Concerns `SECRET_KEY_FALLBACKS`, not configured here. Exploitation not established. [Advisory](https://github.com/pallets/flask/security/advisories/GHSA-4grg-w6v8-c28g). |
| Flask 3.1.0 | CVE-2026-27205; fixed in 3.1.3 | Requires, among other things, session-key access and a shared cache. No cache proxy is described. Exploitation not established. [Advisory](https://github.com/pallets/flask/security/advisories/GHSA-68rp-wp8r-4726). |
| python-dotenv 1.0.1 | CVE-2026-28684; fix announced in 1.2.2 | Concerns `set_key()`/`unset_key()` and local file conditions. These functions are not used. API exploitation not established. [Advisory](https://github.com/theskumar/python-dotenv/security/advisories/GHSA-mf9w-mj56-hr94). |

No alert was returned for `psycopg==3.2.1`, `psycopg-binary==3.2.1`, or `argon2-cffi==25.1.0`. [psycopg metadata](https://pypi.org/pypi/psycopg/3.2.1/json), [psycopg-binary](https://pypi.org/pypi/psycopg-binary/3.2.1/json), [argon2-cffi](https://pypi.org/pypi/argon2-cffi/25.1.0/json). This does not prove the absence of vulnerabilities: native libraries, the OS, and transitive dependencies of the deployed image were not inventoried or scanned.

**Action for the author:** update affected dependencies to compatible fixed versions, lock transitive dependencies, and scan the produced image. No project package or dependency file was modified. These maintenance alerts are distinct from confirmed application scenarios.

## 5. Additional observations and limitations

- **Docker hardening:** `compose.yaml:7–8` mounts the entire repository read-write at `/app`, and the Dockerfile defines no application user. A process compromise could reach mounted files according to their permissions. This does not demonstrate full host takeover. Use a production configuration with only required access.
- **Incorrect response after member deletion:** `app/routes/workspaces.py:278` returns a one-element tuple. Flask rejects it after deletion has run, so the client may receive `500` despite successful deletion. Return a valid HTTP response and test final database state.
- **CSRF requires client-specific follow-up:** no dedicated mechanism is visible. JSON mutations and the absence of permissive CORS block the classic cross-site form scenario, although logout accepts POST without JSON. No browser CSRF exploitation was demonstrated.
- **Secrets:** actual `SECRET_KEY` strength, `.env` permissions, complete Git history, and old images were not examined. A missing key causes session failure, not demonstrated authentication bypass.
- **Traceability:** no business log dedicated to role changes, ownership transfers, or sensitive deletions appears in the code. External monitoring was not inspected.
- **Unverified scope:** actual HTTPS, firewall, reverse proxy, backup/recovery, host system, transaction concurrency, and client interfaces. No frontend was examined; HTML in JSON is not sufficient to demonstrate XSS.

## 6. Protections already present

| Observed protection | Evidence | Scope |
| --- | --- | --- |
| Argon2 password hashing | `app/routes/auth.py:9,25,49` | Hashes are stored and passwords verified through the library. |
| Parameterized SQL queries | `app/db.py`, for example lines 32–38, 46–52, and 272–287 | No HTTP-input concatenation into SQL was identified. |
| Server-side permission checks | `app/permissions.py:4–10`, `app/routes/tasks.py:36–49` | Roles and membership are checked through workspace data; SEC-01/02 inconsistencies remain. |
| Creator identity from the session | `app/routes/tasks.py:54,85` | The client cannot choose the task creator in JSON. |
| Primary ownership checked separately | `app/routes/workspaces.py:87,201,296` | Protects workspace deletion, primary ownership, and ownership transfer. |
| Database integrity constraints | `app/sql/init.sql:4,28–31,40–43` | Unique email and membership, foreign keys, and allowed status/priority/role values. |
| Workspace and owner created transactionally | `app/db.py:349–369` | Both inserts share one transactional connection context. |
| Signed cookie with `HttpOnly` | Flask session used by `app/routes/auth.py:52` | Signature protects integrity; `HttpOnly` reduces JavaScript access. |
| Generic login message | `app/routes/auth.py:45–51` | Same message for unknown account and incorrect password. |
| `.env` excluded from current Git tracking | `.gitignore:1` and tracked-file list | Does not protect the Docker build or old commits. |

## 7. Use in an RNCP level 5 portfolio

This document provides the initial state. Select representative fixes for presentation: role authorization, data validation, session management, and deployment configuration. For each, retain initial evidence, explain its impact on confidentiality, integrity, or availability, then add the fix and validation evidence.

Suggested order: secure exposure and secrets before going online; fix SEC-01 and SEC-02 before shared use; then address sessions, limits, validation, and assignments; finish with limited disclosures and follow-up measures. Dependency updates can run in parallel with compatibility checks.

| Item to complete | Expected content |
| --- | --- |
| Selected finding | SEC identifier, file, and affected rule |
| Evidence before the fix | Fictitious request, caller role, actual result, and expected result |
| Fix implemented | Change explanation and fixing-commit reference |
| Verification after the fix | Forbidden case rejected, allowed case still works, final data state |
| Residual risk | Remaining limitations, deployment dependencies, and rationale |

Only present points as fixed when they have actually been addressed and verified. Complete simulated scenarios on a PostgreSQL test database and with the selected deployment mode.

## 8. Isolated verification results

The table preserves results observed during this audit. Detailed scripts and outputs were produced in `/tmp/taskflow-audit-n79la5l5/`, outside the repository; they are temporary and not a versioned test suite. Accounts, emails, identifiers, cookies, and data are fictitious. Code references correspond to the initial state and may change during remediation.

| Verification | Observed result | Conclusion |
| --- | --- | --- |
| 20 business operations without a session | 20 `401` responses | Authentication required. |
| Reads and mutations with a user outside the workspace | 17 `403` responses | Isolation respected in these scenarios. |
| Mutations with the `guest` role | 11 `403` responses | Guest blocked on tested mutations. |
| Primary-owner modification/deletion by six other accounts/roles | 12 `403` responses | Owner protected in these scenarios. |
| Six business reads with `guest` | 6 `200` responses | Authorized reads remain possible. |
| Administrator adds `owner` through POST | `201`; role stored in memory; primary owner unchanged | SEC-01 reproduced. |
| Administrator assigns `owner` through PATCH | `403` | POST/PATCH policy difference confirmed. |
| Non-primary owner adds another owner | `201` | Another SEC-01 path reproduced. |
| Administrator deletes, demotes, then deletes a peer | `403`, `200`, then `500`; target removed in memory | SEC-02 and response defect reproduced. |
| Task created with an external assignee | `201`; external ID passed to creation | SEC-10 reproduced; no external read access shown. |
| Login cookie | `session=<redacted>; HttpOnly; Path=/` | `Secure` and `SameSite` absent. |
| Login, `/me`, logout, `/me`, cookie replay, `/me` | `200`, `200`, `200`, `401`, then `200` | SEC-07 reproduced. |
| JSON `[1]` and integer passwords on auth routes | 4 `500` responses | Missing type validation confirmed. |
| JSON arrays on four mutations and JSON `null` on workspace PATCH | 5 `500` responses | SEC-09 reproduced. |
| Classic form login | `415` | Non-JSON MIME type rejected. |
| Form POST logout | `200` | Logout does not require JSON. |
| `/health` with synthetic connection error | `500`; exception text copied into `error` | SEC-11 reproduced. |
| 30 successive logins with an unknown email | 30 `401` responses; no `429` | No rate limiting observed; no load test. |
| Outside-user read: existing task then missing ID | `403`, then `404` | SEC-12 existence distinction confirmed. |

The first four rows total 60 expected denials that were verified. These results do not cover every role, route, concurrency, or database-state combination. Email enumeration, SQL constraints, and Docker configuration were assessed by code review, without testing a real database or deployment.
