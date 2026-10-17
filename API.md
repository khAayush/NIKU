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
| 429    | `RATE_LIMITED`      | Too many requests                                              |
| 500    | `INTERNAL_ERROR`    | Unexpected server error (details are logged, not returned)     |

## Endpoints

### `GET /api/health`

Uptime check. No authentication.

**200** — API and database are up:

```json
{ "status": "ok", "database": "ok", "time": "2026-10-17T15:48:59.166Z" }
```

**503** — database unreachable: same shape with `"status": "error", "database": "error"`.
