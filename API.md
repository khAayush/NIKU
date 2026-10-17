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

---

## Lists (`/api/lists`) — requires a session

A list object:

```json
{ "id": "uuid", "name": "Work", "openTaskCount": 3 }
```

| Method & path           | Body                   | Success                                       | Errors                                                                        |
| ----------------------- | ---------------------- | --------------------------------------------- | ----------------------------------------------------------------------------- |
| `GET /api/lists`        | —                      | **200** `{ "items": [...] }` (sorted by name) |                                                                               |
| `POST /api/lists`       | `{ "name": "Work" }`   | **201** the list                              | 400 `VALIDATION_ERROR` (1–50 chars), 409 `LIST_NAME_TAKEN` (case-insensitive) |
| `PATCH /api/lists/:id`  | `{ "name": "Office" }` | **200** the list                              | 400, 404 `NOT_FOUND`, 409 `LIST_NAME_TAKEN`                                   |
| `DELETE /api/lists/:id` | —                      | **204**                                       | 404 `NOT_FOUND`                                                               |

Deleting a list does **not** delete its tasks; they move to "no list" (`listId: null`).

---

## Tasks (`/api/tasks`) — requires a session

A task object:

```json
{
  "id": "uuid",
  "title": "Submit report",
  "notes": null,
  "dueAt": "2026-10-20T16:00:00.000Z",
  "dueAllDay": false,
  "remindAt": "2026-10-20T15:00:00.000Z",
  "priority": "HIGH",
  "recurrence": "NONE",
  "status": "OPEN",
  "completedAt": null,
  "listId": null,
  "isOverdue": false,
  "createdAt": "…",
  "updatedAt": "…"
}
```

- `priority`: `LOW` | `MEDIUM` | `HIGH`. `recurrence`: `NONE` | `DAILY` | `WEEKLY` | `MONTHLY`. `status`: `OPEN` | `COMPLETED`.
- `dueAllDay: true` means "due on that date, no time". `dueAt` is then the start of that day in the
  user's timezone (the server normalizes whatever instant you send to that day's start).
- `isOverdue` is computed by the server: open, and past `dueAt` (all-day: the day has ended in the
  user's timezone).
- Rules: `title` 1–200 chars; a `dueAt` is required unless `priority` is `LOW`; a repeating task
  needs a `dueAt` or a `remindAt`; `listId` must be one of your lists (else 400 `INVALID_LIST`).

### `GET /api/tasks`

All tasks / search. Query parameters (all optional):

| Param    | Values                                        | Default   |
| -------- | --------------------------------------------- | --------- |
| `listId` | a list id, or `none` for tasks without a list | all lists |
| `status` | `open`, `completed`, `all`                    | `open`    |
| `q`      | text; case-insensitive search in titles       | —         |

**200** `{ "items": [Task, ...] }` sorted by due date (undated last), then priority (high first),
then creation time. At most 500 results.

### `GET /api/tasks/today`

**200** `{ "overdue": [Task], "today": [Task] }`. `overdue` = open tasks past due; `today` = tasks
due today in the user's timezone (including completed ones) that aren't in `overdue`.

### `GET /api/tasks/overdue`

**200** `{ "items": [Task] }` — all open tasks past their due date.

### `POST /api/tasks/parse`

Quick add: turns a sentence into a task **draft**. Nothing is saved — show the draft for
confirmation, then `POST /api/tasks` with it (edited as needed).

```json
{ "text": "Submit report tomorrow at 5pm urgent" }
```

`text`: 1–500 characters. **200**:

```json
{
  "draft": {
    "title": "Submit report",
    "notes": null,
    "dueAt": "2026-10-18T16:00:00.000Z",
    "dueAllDay": false,
    "remindAt": null,
    "priority": "HIGH",
    "recurrence": "NONE",
    "listId": null
  },
  "recognized": ["tomorrow at 5pm", "urgent"]
}
```

What it understands (dates are read on the user's local calendar, in their timezone):

| Kind                        | Examples                                                                                                           | Result                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Dates / times (chrono-node) | "tomorrow at 5pm", "next Friday", "Oct 31", "in 2 hours", "noon tomorrow", "on the 1st"                            | `dueAt`; without a time → `dueAllDay: true`                                           |
| Times of day                | "this morning" 9:00, "afternoon" 14:00, "evening" 18:00, "tonight" 20:00                                           | timed `dueAt`                                                                         |
| Past bare times             | "at 9" said at 10pm                                                                                                | tomorrow 9:00                                                                         |
| High priority               | "urgent", "important", "asap", "high priority", "!!"                                                               | `HIGH`                                                                                |
| Low priority                | "low priority", "not urgent", "no rush", "whenever"                                                                | `LOW`                                                                                 |
| Recurrence                  | "every day"/"daily", "every week"/"weekly", "every month"/"monthly", "every Monday", "on Mondays", "every morning" | `DAILY` / `WEEKLY` / `MONTHLY` (first due date = next matching day; today if no date) |
| Lists (the user's own)      | "#work", "in my Work list", "for groceries", "Groceries list"                                                      | `listId`                                                                              |
| Reminder                    | "remind me to …"                                                                                                   | `remindAt` = due time (9:00 for all-day)                                              |

Recognized phrases are removed from the title. Numeric dates like "3/11" use US order
(month/day). **400** `VALIDATION_ERROR` for empty or too-long text.

### `GET /api/tasks/:id`

**200** Task, **404** `NOT_FOUND` (also for other users' tasks).

### `POST /api/tasks`

```json
{
  "title": "Submit report",
  "notes": "optional",
  "dueAt": "2026-10-20T16:00:00Z",
  "dueAllDay": false,
  "remindAt": "2026-10-20T15:00:00Z",
  "priority": "HIGH",
  "recurrence": "NONE",
  "listId": null
}
```

Only `title` is required (plus `dueAt` unless `priority` is `LOW`). Defaults: `priority: MEDIUM`,
`recurrence: NONE`, `dueAllDay: false`, others `null`. **201** Task. **400** `VALIDATION_ERROR` /
`INVALID_LIST`.

### `PATCH /api/tasks/:id`

Any subset of the `POST` fields; send `null` to clear `notes`, `dueAt`, `remindAt` or `listId`.
The rules are checked against the task as it would be after the change. **200** Task.
**400**, **404**.

### `DELETE /api/tasks/:id`

**204**, **404**.

### `POST /api/tasks/:id/complete`

Marks the task completed. For a repeating task, also creates its next occurrence:

- counted from the due date (or the reminder time when there's no due date), never from the
  completion time, on the user's local calendar (wall-clock time is kept across DST changes);
- monthly tasks keep their original day of the month, using the last day of shorter months;
- if occurrences were missed, only the next one that isn't already past due is created;
- the reminder keeps the same offset from the due date.

**200** `{ "task": Task, "next": Task | null }`. Completing an already-completed task changes
nothing and returns `next: null`.

### `POST /api/tasks/:id/snooze`

```json
{ "option": "10m" }
```

`option`: `10m` (10 minutes from now), `1h` (1 hour from now), `tomorrow` (9:00 tomorrow in the
user's timezone). Sets `remindAt` to that time — even if the task had no reminder — and changes
nothing else (not the due date, not the stored reminder offset used for repeats).
**200** Task. **400** `VALIDATION_ERROR`, **404**, **409** `TASK_COMPLETED`.

### `POST /api/tasks/:id/reopen`

Marks the task as not completed. **200** Task. (A next occurrence created when it was completed
is kept.)
