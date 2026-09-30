# Admin API Foundation (Primate port, step 1)

## Context

Goal: port the functionality of Primate (`~/primate`, an Electron/AngularJS Kong Admin API client) into kong-manager while keeping kong-manager's own Vue/Tailwind UI. The port is split into five sub-projects, each with its own spec, plan and implementation:

1. **Foundation: REST client, connection store, capability detection (this spec)**
2. Entity management UIs (services, routes, upstreams + targets, consumers, plugins, certificates, CA certificates, SNIs)
3. Overview dashboard (node status/info, entity count charts)
4. Tag search and node config
5. Settings and release info

Decision already made: when connected to a Kong Admin API, the app edits entities **live** against the per-entity endpoints (`/services`, `/routes`, ...). The existing file/YAML and `/config` (DB-less declarative) flows stay as they are.

Only the logic and behaviour of Primate are ported, not its code. Electron-specific parts (IPC, window manager, menus, theme scanner) are out of scope.

## Current state

- `src/lib/kongAdminApi.ts` only talks to `/config` (`getConfig`, `setConfig`), with `Kong-Admin-Token` and Basic auth headers and a `KongAdminApiError`.
- `src/stores/config.ts` holds `primary` and `compareTarget` loaded configs; `LoadedFile.baseUrl` is the only trace of a live connection.
- `src/stores/savedConnections.ts` persists `{ id, baseUrl, username?, password? }` in localStorage.
- Kong only accepts writes on the per-entity endpoints when it runs with a database. DB-less Kong (`/config` only) rejects them.

## Goals

- A typed, tested client for Kong's per-entity Admin API covering list, get, create, update, upsert, delete, pagination, tag filtering and nested resources.
- An active-connection store that detects Kong version and database mode, and exposes whether writes are possible.
- No duplication with saved connections; the existing `/config` load and push flows keep working.

## Non-goals

- Any new UI (that is steps 2-5).
- Per-entity TypeScript types (each lands with its UI in step 2).
- Auth modes beyond the existing token and Basic auth.
- Delete confirmations and user-facing notices (UI layer).

## Design

### 1. Low-level client: `src/lib/kongAdmin/http.ts`

- `adminFetch(conn, method, path, { query?, body? })` performs the request.
  - `conn` is `{ baseUrl, auth? }`, with the same auth shape as `KongAdminAuth`.
  - Headers come from the existing `buildHeaders` logic (moved here, shared with `kongAdminApi.ts`).
  - 20 second timeout via `AbortController`.
  - Query values that are `null` or `undefined` are omitted, matching Primate's `rest-provider`.
- Failures throw `KongAdminApiError` with:
  - `status` (HTTP status, or `0` for network errors and timeouts)
  - `kind`: `network | auth | notFound | conflict | validation | server`
    (401/403 auth, 404 notFound, 409 conflict, 400 validation, 5xx server)
  - `kongMessage` and `fields`, parsed from Kong's JSON error body when present
  - a `message` that keeps the current format, `Kong Admin API responded <status>: <body>`
- `getConfig` and `setConfig` in `kongAdminApi.ts` are refactored onto `adminFetch`. Their behaviour and existing tests do not change.

### 2. Entity client: `src/lib/kongAdmin/entities.ts`

- `createEntityClient<T>(conn, resource, parentId?)` returns:
  - `list({ size?, offset?, tags? })` resolving to `{ data: T[], next: string | null }`
  - `listAll(opts?)`, which follows `offset` until Kong stops returning `next`
  - `get(idOrName)`
  - `create(body)` (POST)
  - `update(idOrName, patch)` (PATCH)
  - `upsert(idOrName, body)` (PUT)
  - `remove(idOrName)` (DELETE)
- `tags` accepts a string array and is sent as a comma-separated `tags` query parameter.
- Nested resources use path templates such as `upstreams/:parentId/targets`; `parentId` is required for them and the client throws a programming error if it is missing.
- `ENTITY_RESOURCES` registry, one entry per collection: `services`, `routes`, `upstreams`, `targets` (nested under upstreams), `consumers`, `plugins`, `certificates`, `ca_certificates`, `snis`.
  - Each entry has `path`, `nested?`, and `defaults`, the default-value object ported from Primate's models (`service-model.js`, `route-model.js`, `upstream-model.js`, and so on).
  - Primate's sentinel values (`'__none__'` for unset references) are not carried over; `defaults` uses `undefined` or omitted keys instead, because kong-manager forms will not need the sentinel.

### 3. Connection store: `src/stores/connection.ts`

- State: `active: { baseUrl, auth?, savedId? } | null` and `info: { version: string, database: string } | null`.
- `connect(conn)`:
  1. Calls `GET /` through `adminFetch`.
  2. Reads `version` and `configuration.database` from the response.
  3. Stores `active` and `info`.
  4. Upserts into `savedConnections` (the existing store's `upsert`), so nothing is duplicated.
  - On failure, leaves any previous connection untouched and rethrows the `KongAdminApiError`.
- `disconnect()` clears `active` and `info`.
- Getters:
  - `isConnected`
  - `canWrite`: true only when connected and `info.database !== 'off'`
  - `client(resource, parentId?)`: the entity client bound to the active connection; throws if not connected.
- `KongConnectForm.vue` calls `connect` for the Kong path in addition to its current `/config` load. That flow's behaviour is unchanged.

### 4. Write safety

- `client(...)` wraps `create`, `update`, `upsert` and `remove` with a guard. When `canWrite` is false they throw `ReadOnlyError` before any network request is made.
- Reads are never blocked by the guard.

### 5. Testing

Vitest, following the repo's existing style. No new dependencies.

- `http.test.ts` (mocked `fetch`): auth headers for token and Basic, query omission for null values, timeout, and each error `kind`, including the parsed Kong message and fields.
- `entities.test.ts`: paths, methods, query strings including `tags`, `listAll` pagination across multiple pages, and nested resource paths including the missing `parentId` error.
- `connection.test.ts`: `connect` against DB-backed Kong, DB-less Kong (`canWrite` false), and network failure (previous state kept); `upsert` into saved connections not duplicating; the `ReadOnlyError` guard on each write method.
- Existing `kongAdminApi.test.ts` passes unchanged after the refactor.

## Error handling summary

| Situation | Result |
|---|---|
| Network down or timeout | `KongAdminApiError`, `kind: 'network'`, `status: 0` |
| 401 / 403 | `kind: 'auth'` |
| 404 / 409 / 400 | `notFound` / `conflict` / `validation`, with Kong's `fields` |
| Write against DB-less Kong | `ReadOnlyError`, no request sent |
| Nested client without `parentId` | Programming error thrown at creation |

## Open questions

None. Anything Primate's setup model needs beyond token and Basic auth is out of scope here and would get its own design.
