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
wire-format details from, so those were verified directly against a
real Kong 3.7.1 DB-less container instead of assumed from
documentation (CORS behavior, `GET`/`POST /config` shapes — see
Architecture).

## Non-goals

- No support for database-backed Kong (traditional per-entity REST
  CRUD against `/services`, `/routes`, `/consumers`, etc.). This
  targets DB-less mode only, matching the declarative-YAML model the
  app is already built around.
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

- **CORS — verified, no proxy needed.** Kong's Admin API sends
  permissive CORS headers by default: `Access-Control-Allow-Origin`
  echoes the request's `Origin`, `Access-Control-Allow-Credentials:
  true`, and preflight `OPTIONS` responses echo back whatever
  `Access-Control-Request-Headers` was asked for (verified against a
  real Kong 3.7.1 DB-less container — a preflight requesting
  `kong-admin-token` gets it back in `Access-Control-Allow-Headers`,
  and the actual cross-origin `GET`/`POST` succeed). The browser can
  therefore call the Admin API's base URL directly; no Vite dev-proxy,
  no dev-only restriction. If an operator has hardened CORS on their
  own Admin API, a connect attempt fails like any other network error
  (see Error handling) — that's a property of their deployment, not
  something this feature needs to route around.

- **`src/lib/kongAdminApi.ts`** — a small fetch-based client,
  independent of Vue, mirroring the existing `lib/yaml.ts` /
  `lib/diff.ts` pattern (pure functions, unit-testable in isolation):
  - `getConfig(baseUrl, token?)`: `GET {baseUrl}/config` directly,
    attaches a `Kong-Admin-Token` header when `token` is set. Kong
    responds `{"config": "<yaml string>"}` — the YAML inside is
    Kong's **expanded/flattened** internal representation, not the
    nested authoring shape (verified: routes and credentials sit at
    the top level, each referencing its parent by a bare id string —
    e.g. a route has `service: "<uuid>"` — rather than being nested
    under `services[].routes`).
    `getConfig` parses that inner YAML with the existing
    `parseKongConfig`-equivalent loader and passes it through
    `denormalizeKongConfig` (new, below) to produce the nested
    `KongConfig` shape the rest of the app already understands.
    Non-2xx or network errors throw with a message surfaced verbatim
    to the UI (same pattern as YAML parse errors today).
  - `setConfig(baseUrl, config, token?)`: serializes `config` via the
    **existing, unmodified** `serializeKongConfig` (no transform
    needed for push — verified: `POST {baseUrl}/config` with a plain
    nested-shape YAML string, wrapped as `{"config": "<yaml
    string>"}` and sent as `application/json`, returns `201 Created`
    and Kong correctly resolves the nested structure into its
    internal model). Throws on non-2xx with the response body
    surfaced to the UI.

- **`src/lib/kongConfigTransform.ts`** (new) — pure function
  `denormalizeKongConfig(expanded: Record<string, unknown>):
  KongConfig`, unit-testable in isolation like `diff.ts`:
  - Groups top-level `routes` into their owning `services[].routes` by
    matching `route.service === service.id` (bare id-string
    reference); routes whose `service` id doesn't match any service go
    into a top-level `routes` array (unmatched, preserved rather than
    dropped).
  - Groups top-level `keyauth_credentials` / `basicauth_credentials`
    (and any other `*_credentials` collection present) into their
    owning `consumers[].<type>_credentials` by matching
    `credential.consumer === consumer.id`.
  - Groups top-level `plugins` into `services[].plugins` or
    `services[].routes[].plugins` when their `service`/`route`
    reference (bare id string) matches an entity being assembled;
    plugins with no `service`, `route`, or `consumer` reference (`~`/
    `null` in Kong's output) stay in the top-level `plugins` array
    (global plugins), matching today's model.
  - Strips the now-redundant back-reference field (`service`, `route`,
    `consumer`) plus Kong's bookkeeping fields (`id`, `created_at`,
    `updated_at`) from each entity — these are server-generated, never
    hand-authored, and would otherwise show up as pure noise in
    Compare when diffing a live pull against a hand-authored file.
    Everything else (including arbitrary plugin `config` contents) is
    passed through untouched, preserving round-trip fidelity for
    anything the transform doesn't know about.
  - **Known limitation**: Kong's expanded form always includes fields
    a hand-authored file typically omits (e.g. explicit `tags: null`
    vs. the key being absent). These are left as-is rather than
    scrubbed — Compare may show a handful of such cosmetic
    added/removed entries when diffing a live pull against a
    hand-written file. Called out here so it isn't a surprise, same
    spirit as the existing comment-loss limitation.

- **Config store (`src/stores/config.ts`)** — `LoadedFile` keeps its
  existing `fileName` field as the single display label (every current
  read site — `AppSidebar.vue`, `CompareView.vue`, `ExportModal.vue`,
  `LoadView.vue` — keeps working unchanged), and gains an origin tag
  plus the connection's base URL for Push-modal prefill:
  ```ts
  export type LoadedFile = {
    fileName: string          // real filename, or `Kong Admin @ <baseUrl>`
    origin: 'file' | 'kong-admin'
    baseUrl?: string          // set only when origin === 'kong-admin'
    config: KongConfig
  }
  ```
  Two new store actions:
  - `loadFromKongAdmin(baseUrl, token?)` — calls `kongAdminApi.getConfig`,
    sets `primary` to `{ fileName: `Kong Admin @ ${baseUrl}`, origin:
    'kong-admin', baseUrl, config }`, clears `modifiedKeys` and
    `compareTarget` (mirrors `loadPrimary`).
  - `pushToKongAdmin(baseUrl, token?)` — calls `kongAdminApi.setConfig`
    with the current `primary.config`. Does not mutate any store state
    on success or failure; it only talks to the remote instance. (No
    "un-modified" reset on push — matches the existing precedent that
    the app never overwrites the reference file after export either.)
  - `loadPrimary` and `loadCompareTarget` are updated to set
    `origin: 'file'` (and no `baseUrl`) so every `LoadedFile` always
    carries a valid origin.

## UI changes

### Load view (`/`)

- The existing drag-and-drop zone stays as the primary path. A new,
  visually secondary section below it: **"Connect to Kong Admin API"**
  with a Base URL input (placeholder `http://localhost:8001`), an
  optional Admin Token input (masked like other secret fields, using
  the existing `SecretField` component), and a "Connect" button.
- On success, behaves exactly like a file load: the summary card
  (services/routes/consumers/plugins counts) and "Browse this config"
  CTA appear, with the loaded-file heading showing `Kong Admin @
  <baseUrl>` in place of a filename (via the existing `fileName`
  field — see Architecture).
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
  host, CORS rejection from a hardened Admin API): inline error banner
  on Load view, never crashes the app — same posture as existing YAML
  parse failures.
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
- Requests go straight from the browser to the Admin API base URL the
  user enters — there is no intermediary of any kind, so the token
  never transits anything but the user's own machine and the Kong
  instance they pointed at.

## Testing plan

- **Vitest unit tests**:
  - `kongConfigTransform.ts`: `denormalizeKongConfig` — routes grouped
    under the right service (and left unmatched when their `service.id`
    doesn't resolve), credentials grouped under the right consumer,
    plugins routed to global/service/route scope correctly, bookkeeping
    fields (`id`, `created_at`, `updated_at`, back-references) stripped,
    unrelated fields passed through untouched.
  - `kongAdminApi.ts`: request construction (URL, headers, method,
    body), response parsing (including the `{"config": "<yaml
    string>"}` envelope and the denormalize call), and error surfacing
    for both `getConfig` and `setConfig`, against a mocked `fetch`.
  - New store actions (`loadFromKongAdmin`, `pushToKongAdmin`):
    correct state transitions on success, no state mutation on
    failure.
- **Manual verification**: against a real DB-less Kong instance (a
  local Docker container, e.g. `kong:3.7` with `KONG_DATABASE=off`,
  `KONG_DECLARATIVE_CONFIG` pointed at one of the `fixtures/*.yaml`
  files, `KONG_ADMIN_LISTEN=0.0.0.0:8001` — the exact setup used to
  verify the wire format for this spec) — connect from the running
  app, confirm the live config loads into Browse correctly (services,
  routes under the right service, consumer credentials under the right
  consumer), edit a field, push back, then re-fetch independently
  (`curl {baseUrl}/config`) to confirm the change landed.

## Project structure (additions)

```
src/
  lib/
    kongAdminApi.ts          # GET/POST /config client
    kongConfigTransform.ts   # denormalizeKongConfig: expanded -> nested KongConfig
  stores/
    config.ts                # LoadedSource origin discriminant, new actions
  components/
    load/
      KongConnectForm.vue    # Base URL + token + Connect button
    PushToKongModal.vue      # parallel to ExportModal.vue
  views/
    LoadView.vue             # + KongConnectForm section
```
