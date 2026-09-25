# Kong Admin API Connection — Design Spec

Date: 2026-09-25

## Purpose

Extend `kong-config-viewer` so it can connect directly to a running Kong
Gateway's Admin API (DB-less mode) as an alternative to loading a local
YAML file — pulling the live declarative config in to browse/edit/compare
with the existing UI, and pushing edits back to the same or another
running instance. Today the app is file-only: load a `.yaml`, edit it,
export a new `.yaml`. This adds "a live Kong instance" as a second
source and a second destination, without duplicating any of the
existing Browse/Edit/Compare/Diff code.

**Reference**: [Primate](https://github.com/getprimate/primate)
(formerly KongDash) — an existing open-source Electron desktop client
for the Kong Admin API. It confirms this is a known, well-scoped
feature category (a GUI for Kong administration) and validates the
overall direction; its own docs are too sparse to borrow concrete
wire-format details from, so those are taken from Kong's own DB-less
`/config` contract instead and confirmed against a live instance during
implementation (see Testing plan).

## Non-goals

- No support for database-backed Kong (traditional per-entity REST
  CRUD against `/services`, `/routes`, `/consumers`, etc.). This
  targets DB-less mode only, matching the declarative-YAML model the
  app is already built around.
- No production reverse-proxy or CORS story. The Admin API connection
  is a **dev-only** feature, used via `npm run dev`, routed through a
  Vite dev-server proxy. It is not expected to work from a built/static
  deployment of this app.
- No saved/persisted connection profiles. Base URL and token are
  session-only, in memory (Pinia state), never written to
  localStorage or disk — consistent with the app's existing
  never-leaves-the-browser secret handling.
- No multi-node orchestration or awareness of Kong clusters. Each
  connection targets exactly one Admin API base URL at a time, and a
  push affects only that one node (matches Kong's own `/config`
  semantics — it doesn't propagate to other nodes).
- No new auth schemes beyond an optional `Kong-Admin-Token` header. No
  basic auth, mTLS, or OAuth in v1.

## Architecture

- **`src/lib/kongAdminApi.ts`** — a small fetch-based client,
  independent of Vue, mirroring the existing `lib/yaml.ts` /
  `lib/diff.ts` pattern (pure functions, unit-testable in isolation):
  - `getConfig(baseUrl, token?)`: `GET {baseUrl}/config`, attaches
    `Kong-Admin-Token` header when `token` is set, returns the parsed
    `KongConfig`. Non-2xx or network errors throw with a message
    surfaced verbatim to the UI (same pattern as YAML parse errors
    today).
  - `setConfig(baseUrl, config, token?)`: serializes `config` via the
    existing `serializeKongConfig` and `POST`s it to `{baseUrl}/config`
    per Kong's documented DB-less config-replace contract. Throws on
    non-2xx with the response body surfaced to the UI.
  - Both calls go through the dev-proxy path (below), not directly to
    `baseUrl`, so the browser never makes a genuine cross-origin
    request.

- **Dev-server proxy (`vite.config.ts`)** — Kong's Admin API does not
  send CORS headers, and the target host is chosen live in the app UI
  rather than fixed at build time. The proxy is configured with a
  `router` function (Vite's proxy is `http-proxy-middleware` under the
  hood, which supports this): the browser always calls a fixed local
  path, `/kong-admin-proxy/*`, carrying the user-entered base URL in a
  request header (`X-Kong-Admin-Target`); the proxy's `router` reads
  that header and returns it as the real target for that request, and
  a `pathRewrite` strips the `/kong-admin-proxy` prefix. This requires
  no restart when switching Kong instances and keeps all of this
  inside dev-server config — no app server code to maintain, no change
  to the "runs entirely in the browser" model for anything other than
  this optional dev-only bridge.
  - `kongAdminApi.ts` therefore calls `/kong-admin-proxy/config` with
    the `X-Kong-Admin-Target` header set to the user's entered base
    URL, not the base URL directly.

- **Config store (`src/stores/config.ts`)** — `LoadedFile` is
  generalized to carry an origin discriminant instead of a bare
  filename:
  ```ts
  type LoadedSource = { config: KongConfig } & (
    | { origin: 'file'; fileName: string }
    | { origin: 'kong-admin'; baseUrl: string }
  )
  ```
  A `sourceLabel` getter replaces direct `fileName` reads in the UI
  (`kong-config.yaml` for file sources, `Kong Admin @ <baseUrl>` for
  API sources). Two new actions:
  - `loadFromKongAdmin(baseUrl, token?)` — calls `kongAdminApi.getConfig`,
    sets `primary` with `origin: 'kong-admin'`, clears `modifiedKeys`
    and `compareTarget` (mirrors `loadPrimary`).
  - `pushToKongAdmin(baseUrl, token?)` — calls `kongAdminApi.setConfig`
    with the current `primary.config`. Does not mutate any store state
    on success or failure; it only talks to the remote instance. (No
    "un-modified" reset on push — matches the existing precedent that
    the app never overwrites the reference file after export either.)

## UI changes

### Load view (`/`)

- The existing drag-and-drop zone stays as the primary path. A new,
  visually secondary section below it: **"Connect to Kong Admin API"**
  with a Base URL input (placeholder `http://localhost:8001`), an
  optional Admin Token input (masked like other secret fields, using
  the existing `SecretField` component), and a "Connect" button.
- On success, behaves exactly like a file load: the summary card
  (services/routes/consumers/plugins counts) and "Browse this config"
  CTA appear, with the loaded-file heading showing `sourceLabel`
  instead of a raw filename.
- On failure: the same inline error banner pattern as YAML parse
  failures, showing the underlying HTTP/network error.

### Push to Kong (new modal, header action)

- A new header button, "Push to Kong", enabled under the same
  condition as today's "Generate new config" (export) button — any
  config loaded, regardless of its origin.
- Opens a modal with Base URL and Admin Token fields, pre-filled from
  the current connection when `primary.origin === 'kong-admin'`,
  otherwise blank (so pushing a locally-edited file to a live instance
  for the first time is a supported, equally-first-class flow).
- Because this replaces a running gateway's entire config, the modal
  requires an explicit confirmation step (a distinct "Confirm push"
  button after reviewing a warning message) rather than sending on the
  first click — the same weight the app already gives to irreversible
  actions elsewhere is extended here, scaled to "this changes a real
  running system" rather than "this downloads a file."
- On failure, an inline error in the modal with the response
  status/body; the modal stays open so the user can retry or adjust.
- On success, a brief success confirmation (toast or inline banner) and
  the modal closes; no local state changes.

## Error handling

- Connect failures (network error, non-2xx, invalid token, unreachable
  proxy target): inline error banner on Load view, never crashes the
  app — same posture as existing YAML parse failures.
- Push failures: inline error in the Push modal, local state untouched.
- A successful `GET /config` that lacks the expected top-level Kong
  keys is treated like a structurally-empty-but-valid file today:
  loads fine, Browse shows its existing per-tab empty states.

## Security considerations

- Base URL and Admin Token exist only in component state / the Pinia
  store for the session; nothing is written to localStorage, cookies,
  or disk. Closing or reloading the tab clears them, same as an
  unsaved file edit today.
- The Admin Token field reuses the existing `SecretField` masking
  component, consistent with how credential secrets are already
  handled in Browse/Compare.
- The dev-proxy bridge only exists under `npm run dev`; it is not part
  of the production build output, so it doesn't expand the attack
  surface of a deployed instance of this app (there is no deployed
  instance in this feature's scope — see Non-goals).

## Testing plan

- **Vitest unit tests**:
  - `kongAdminApi.ts`: request construction (URL, headers, method,
    body), success parsing, and error surfacing for both `getConfig`
    and `setConfig`, against a mocked `fetch`.
  - New store actions (`loadFromKongAdmin`, `pushToKongAdmin`):
    correct state transitions on success, no state mutation on
    failure.
- **Manual verification**: against a real DB-less Kong instance (e.g.
  a local Docker Kong container) — connect, confirm the live config
  loads into Browse correctly, edit a field, push back, then re-fetch
  independently (e.g. `curl {baseUrl}/config`) to confirm the change
  landed. This step also confirms the exact `/config` wire format
  (JSON vs. YAML body, field naming) against the real Admin API rather
  than assumed from documentation, and any adjustment needed to
  `kongAdminApi.ts` is made at that point.

## Project structure (additions)

```
src/
  lib/
    kongAdminApi.ts          # GET/POST /config client
  stores/
    config.ts                # LoadedSource origin discriminant, new actions
  components/
    load/
      KongConnectForm.vue    # Base URL + token + Connect button
    PushToKongModal.vue      # parallel to ExportModal.vue
  views/
    LoadView.vue             # + KongConnectForm section
vite.config.ts                # + dynamic /kong-admin-proxy router
```
