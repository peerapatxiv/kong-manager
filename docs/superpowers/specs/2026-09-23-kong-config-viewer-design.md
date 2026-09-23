# Kong Config Viewer/Editor — Design Spec

Date: 2026-09-23

## Purpose

A local, browser-based tool to open `kong-config.yaml` (Kong declarative
config, format 3.0), browse it in a readable structured UI, edit it,
compare two config files (e.g. different environments or before/after a
change), and export an edited config back to YAML.

The reference file used to design against is ~4000 lines, format
version `3.0`, containing `consumers` (with `keyauth_credentials` /
`basicauth_credentials`), global `plugins`, and 45 `services` each with
nested `routes` and route-level `plugins`. It contains live secrets
(API keys, a password hash), which shapes the security-related
decisions below.

## Success criteria

- Open a Kong declarative YAML file and browse services, routes,
  consumers, and global plugins without reading raw YAML.
- Edit any field — including arbitrary plugin config — without losing
  or corrupting data the UI doesn't explicitly model.
- Compare two config files and see what's added, removed, or changed.
- Export a new YAML file reflecting in-app edits.
- Runs entirely in the browser; the file and its secrets never leave
  the user's machine.

## Non-goals

- No backend/server component, no writing directly to disk.
- No YAML comment/anchor/alias preservation on export (known
  limitation of `js-yaml` dump — acceptable tradeoff, called out so
  it isn't a surprise).
- No original-vs-in-app-edits diff view. Compare is for two loaded
  files. Unsaved edits are indicated with a lightweight "modified"
  badge only.

## Architecture

- **Vue 3** (`<script setup>`, TypeScript) + **Vite** + **Tailwind
  CSS**. No backend — pure client-side SPA.
- **Pinia** for app state: loaded config object(s), current file
  name(s), per-entity "modified" flags.
- **js-yaml** for parsing (`load`) and serializing (`dump`).
- **Vue Router**: `/` (Load view), `/browse`, `/compare`. Export is a
  header button + modal available from any route once a file is
  loaded, not a separate page.
- File input via drag-and-drop or `<input type="file">` (browser File
  API, `FileReader`). Export via `Blob` + object URL download.
- **Round-trip fidelity**: the entire parsed YAML object (from
  `js-yaml.load`) is kept as the single source of truth and mutated in
  place through the UI. Any field the UI doesn't explicitly render
  (unrecognized plugin config keys, other top-level sections such as
  `upstreams` or `certificates` if present) is preserved untouched and
  re-emitted on export, because we never reconstruct objects from
  scratch — only mutate existing ones. JS object key insertion order is
  preserved, so `js-yaml.dump` (with `sortKeys: false`) emits keys in
  their original order.

## Data model

Kong declarative config top-level shape (format 3.0), as encountered in
the reference file:

```yaml
_format_version: "3.0"
consumers:
  - username: string
    custom_id?: string
    tags?: string[]
    keyauth_credentials?: [{ key: string, tags?: string[] }]
    basicauth_credentials?: [{ username: string, password: string }]
plugins:            # global plugins
  - name: string
    enabled: boolean
    protocols: string[]
    config: { ...arbitrary per plugin type... }
    tags?: string[]
services:
  - name: string
    host: string
    port: number
    protocol: string
    path?: string
    connect_timeout/read_timeout/write_timeout: number
    retries: number
    enabled: boolean
    routes:
      - name: string
        hosts: string[]
        paths: string[]
        methods?: string[]
        protocols: string[]
        strip_path/preserve_host: boolean
        path_handling?: string
        https_redirect_status_code?: number
        regex_priority?: number
        request_buffering/response_buffering?: boolean
        tags?: string[]
        plugins?: [...]   # same shape as global plugins
```

The app does not hardcode an exhaustive schema. Known containers
(`consumers`, `plugins`, `services`, `services[].routes`,
`*.plugins[].config`) get structured treatment; anything else at the
top level (present or added later, e.g. `upstreams`) is preserved via
round-trip fidelity but not specially rendered in v1.

**Entity identity for matching (used by diff and list rendering)**:
`name` for services, routes, and plugins-within-a-scope; `username` for
consumers. Entities missing their natural key fall back to a flagged
"unmatched" bucket in Compare rather than being guessed by position.

## Views

### Load view (`/`)

- Drag-and-drop zone + file picker button.
- On successful parse: shows a summary card (counts: services, routes,
  consumers, global plugins) and a "Browse" call-to-action.
- On parse failure: inline error banner with the parse error message;
  stays on the Load view.

### Browse view (`/browse`)

- Sidebar with three tabs: **Services**, **Consumers**, **Global
  Plugins**. Each tab has a text search/filter (matches name, host,
  path, or tag).
- Selecting a list item opens a **detail panel**: side-by-side with the
  list on desktop (≥1024px / Tailwind `lg:`), stacked full-width below
  the list on smaller screens.
- **Service detail**: form for top-level fields (`host`, `port`,
  `protocol`, `path`, timeouts, `retries`, `enabled`, `tags`). Nested
  `routes` render as expandable cards showing route fields
  (`hosts`, `paths`, `methods`, `strip_path`, `preserve_host`,
  `path_handling`, etc.) plus that route's plugin list.
- **Consumer detail**: `username`, `custom_id`, `tags`, plus each
  credential list (`keyauth_credentials`, `basicauth_credentials`, …)
  rendered as editable rows with masked secret fields.
- **Global Plugins tab**: flat list of global `plugins`, each opening
  the generic plugin editor (below).
- Any entity with unsaved edits this session shows a small "modified"
  dot/badge in the list (edit-tracking only — no diff view here).

### Compare view (`/compare`)

- A second drag-and-drop/file-picker to load File B (File A is the
  config already loaded from `/`, or the current in-app edited state —
  whichever is active).
- Runs the diff engine (see below) and renders results grouped by
  entity type (Services, Routes, Consumers, Global Plugins), each
  split into **Added**, **Removed**, **Changed** sections.
- **Changed** entries show a field-by-field before → after list;
  secret-like fields stay masked with a reveal toggle, same as Browse.
- Entities that couldn't be matched by natural key appear in an
  **Unmatched** section per type, clearly labeled, instead of being
  silently paired incorrectly.

### Export (header button + modal, any route once loaded)

- "Generate new config" button in the app header, enabled once a
  config is loaded.
- Opens a modal to confirm/edit the output filename (default:
  `<original-name>-edited.yaml`).
- Serializes the current in-memory object with
  `js-yaml.dump(obj, { sortKeys: false })`, creates a `Blob`, and
  triggers a download via an object URL.

## Editing

- **Typed inputs for known fields**: text, number, boolean toggle,
  tag/array input (comma-or-enter-to-add chips), protocol multi-select
  (checkbox group over the fixed Kong protocol set:
  `http`/`https`/`grpc`/`grpcs`/`tcp`/`tls`/`udp`).
- **Generic dynamic plugin config editor**: for each key in a plugin's
  `config` object, infer a widget from the current value's runtime
  type:
  - `string` → text input; if the string contains a newline or the key
    matches known script-ish names (`access`, `header_filter`,
    `body_filter`, `rewrite`, `log`, or any string that looks like Lua)
    → multi-line textarea.
  - `number` → number input.
  - `boolean` → toggle.
  - `array` of strings → tag input; array of objects → repeated
    sub-editor (recurse).
  - `object` → nested recursive key-value editor.
  - `null` → text input that treats empty as `null`.
  - Keys can be added or removed for full flexibility beyond inferred
    types.
- **Secret masking**: any field whose key matches a secret-like
  pattern (case-insensitive substring match on `password`, `key`,
  `secret`, `token`, or being an entry under a `*_credentials` list)
  renders as a fixed-width dot mask with a per-field reveal toggle.
  Applies consistently in Browse and Compare. Revealed state is
  per-field, UI-only, and resets on reload.
- Editing any field marks its owning entity as "modified" in the
  Pinia store for the Browse-view badge.

## Diff engine

Pure function(s) in `src/lib/diff.ts`, independent of Vue, so they're
unit-testable in isolation:

1. For each entity collection (`services`, `consumers`, global
   `plugins`; and per-service `routes`, per-scope `plugins`), build a
   `Map<naturalKey, entity>` for File A and File B.
2. **Added** = keys in B not in A. **Removed** = keys in A not in B.
3. **Changed** = keys in both where a structural deep-equal fails;
   produce a flat list of `{ path, before, after }` for differing leaf
   fields (recursing into nested objects/arrays).
4. Entities without a usable natural key go into that type's
   **Unmatched** bucket for both files rather than being paired.

## Error handling

- Malformed/unparsable YAML on upload (Load view or Compare's second
  file): inline error banner with the underlying parse error message;
  never crashes the app.
- Valid YAML that has none of the expected top-level Kong keys: Browse
  view shows a graceful empty state per tab rather than an error.
- Export always available once *any* file is loaded, even if some
  sections are empty.

## Testing plan

- **Vitest** unit tests (no e2e framework needed given scope):
  - YAML round-trip: load → (no edits) → dump reproduces equivalent
    structure and preserves key order.
  - Diff engine: added/removed/changed detection, and unmatched-key
    fallback, across services/routes/consumers/plugins fixtures.
  - Secret-field detection heuristics (positive and negative cases).
  - Value-type inference for the dynamic plugin editor (string/
    number/boolean/array/object/null, including the multi-line/Lua
    heuristic).
- **Manual verification**: full flow (load the real `kong-config.yaml`
  → browse → edit a few fields across a service, a route plugin, and a
  consumer credential → export → re-load the exported file to confirm
  it opens cleanly) and a compare pass using two variants of the file.

## Project structure

```
src/
  main.ts
  App.vue
  router/index.ts
  stores/config.ts            # loaded config(s), file names, modified flags
  lib/
    yaml.ts                   # parse/serialize wrappers
    diff.ts                   # entity matching + diff engine
    secretFields.ts           # secret-key heuristics
    valueType.ts              # value -> widget-type inference
  components/
    FileDropZone.vue
    layout/AppShell.vue
    layout/Sidebar.vue
    browse/ServiceList.vue
    browse/ServiceDetail.vue
    browse/RouteCard.vue
    browse/ConsumerList.vue
    browse/ConsumerDetail.vue
    browse/CredentialEditor.vue
    shared/PluginEditor.vue
    shared/DynamicKeyValueEditor.vue
    shared/SecretField.vue
    shared/TagInput.vue
    shared/Badge.vue
    compare/DiffSummary.vue
    compare/DiffEntityList.vue
    compare/DiffField.vue
    ExportModal.vue
  views/
    LoadView.vue
    BrowseView.vue
    CompareView.vue
```