# API

Base path: `/api`. All requests and responses are JSON. Times are ISO-8601 strings in UTC.

## Conventions

### Errors

Every non-2xx response has this shape:

```json
{ "error": { "code": "NOT_FOUND", "message": "Human readable message", "details": {} } }
```

`details` is optional (for `VALIDATION_ERROR` it holds the list of Zod issues).

| Status | Code                | When                                                           |
| ------ | ------------------- | -------------------------------------------------------------- |
| 400    | `VALIDATION_ERROR`  | Request body/query failed validation                           |
| 400    | `BAD_REQUEST`       | Malformed request (e.g. invalid JSON)                          |
| 401    | `UNAUTHENTICATED`   | Missing or expired session                                     |
| 404    | `NOT_FOUND`         | Unknown route, or a resource that doesn't exist or isn't yours |
| 413    | `PAYLOAD_TOO_LARGE` | Body larger than 100 KB                                        |
| 429    | `RATE_LIMITED`      | Too many requests (see `Retry-After` header)                   |
| 500    | `INTERNAL_ERROR`    | Unexpected server error (details are logged, not returned)     |

### Authentication

Clients authenticate with a session cookie (`HttpOnly`, `SameSite=Lax`, `Secure` in production) set by
sign-up / sign-in. Send it with every request. Protected endpoints return `401 UNAUTHENTICATED`
without a valid session. Sessions expire after 7 days without use; using the app extends them
(the refreshed cookie arrives in `Set-Cookie`).

Browser requests to `/api/auth/*` must include an `Origin` header matching the app's origin
(browsers do this automatically).

Errors from auth endpoints use the standard error shape; the `code` comes from the auth library
(e.g. `INVALID_EMAIL_OR_PASSWORD`, `USER_ALREADY_EXISTS`, `INVALID_TOKEN`, `INVALID_PASSWORD`).

## Endpoints

### `GET /api/health`

Uptime check. No authentication.

**200** — API and database are up:

```json
{ "status": "ok", "database": "ok", "time": "2026-10-17T15:48:59.166Z" }
```

**503** — database unreachable: same shape with `"status": "error", "database": "error"`.

---

## Auth (`/api/auth`)

Rate limits (per client IP and, where an email is sent, per email address):

| Endpoint                       | Per IP      | Per email   |
| ------------------------------ | ----------- | ----------- |
| `POST /sign-in/email`          | 30 / 15 min | 10 / 15 min |
| `POST /sign-up/email`          | 10 / hour   | 5 / hour    |
| `POST /request-password-reset` | 10 / hour   | 3 / hour    |
| `POST /reset-password`         | 10 / hour   | —           |

### `POST /api/auth/sign-up/email`

Creates an account and signs in.

```json
{
  "name": "Ana",
  "email": "ana@example.com",
  "password": "at least 8 chars",
  "timezone": "Europe/London"
}
```

- `password`: 8–128 characters, no other rules. `timezone`: IANA name (send the browser's).
- **200** `{ "token": "...", "user": { "id", "name", "email", ... } }` + session cookie.
- **400** `VALIDATION_ERROR`; **422** `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL` when the email is taken.

### `POST /api/auth/sign-in/email`

```json
{ "email": "ana@example.com", "password": "..." }
```

- **200** `{ "redirect": false, "token": "...", "user": { ... } }` + session cookie.
- **401** `INVALID_EMAIL_OR_PASSWORD` — same response for unknown email and wrong password.

### `POST /api/auth/sign-out`

Deletes the session on the server and clears the cookie. **200** `{ "success": true }`.

### `GET /api/auth/get-session`

The current session and user, or `null` when signed out. (Clients normally use `GET /api/me`.)

### `POST /api/auth/request-password-reset`

```json
{ "email": "ana@example.com" }
```

Emails a single-use link `<app>/reset-password?token=...` that expires in 30 minutes.
Always **200** `{ "status": true, "message": "..." }`, whether or not the email exists.

### `POST /api/auth/reset-password`

```json
{ "token": "from the link", "newPassword": "at least 8 chars" }
```

- **200** `{ "status": true }`. The token is consumed and **all of the user's sessions are signed out**.
- **400** `INVALID_TOKEN` — unknown, used or expired token.

### `POST /api/auth/delete-user`

Requires a session. Permanently deletes the account and all its lists, tasks and push subscriptions.

```json
{ "password": "current password" }
```

- **200** `{ "success": true, "message": "User deleted" }`.
- **400** `INVALID_PASSWORD`.

---

## Me (`/api/me`) — requires a session

### `GET /api/me`

The signed-in user's profile and settings.

```json
{
  "id": "…",
  "name": "Ana",
  "email": "ana@example.com",
  "timezone": "Europe/London",
  "notifyInApp": true,
  "notifyPush": false,
  "notifyEmail": true,
  "createdAt": "2026-10-17T16:05:58.248Z"
}
```

### `PATCH /api/me`

Updates any of `name`, `timezone`. Other fields are ignored.

```json
{ "name": "Ana B.", "timezone": "Asia/Tokyo" }
```

- **200** the updated profile (same shape as `GET /api/me`).
- **400** `VALIDATION_ERROR` (e.g. unknown timezone).
