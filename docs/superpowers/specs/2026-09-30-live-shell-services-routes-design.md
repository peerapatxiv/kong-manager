# Live Section: shell, services and routes (Primate port, step 2a)

## Context

This is step 2a of the Primate port. Step 1 (`2026-09-30-admin-api-foundation-design.md`) added the Admin API client, the entity client and the `connection` store. Step 2 (entity management UIs) is split into:

- **2a: Live shell, services and routes (this spec)**
- 2b: Upstreams and targets
- 2c: Consumers and plugins
- 2d: Certificates, CA certificates and SNIs

Decision already made: live editing lives in a **separate Live section**. The file/YAML Browse and Compare screens are untouched. Live views use Kong's flat, id-based model through the connection store, and reuse the shared components and styling.

Primate (`~/primate/src/workbench/controllers/service-*.js`, `route-*.js`) supplies the behaviour: which fields each entity has, its defaults, its validation and its payload rules. Its Angular views are not ported.

## Current state

- `useConnectionStore()` exposes `isConnected`, `canWrite` and `client(resource, parentId?)`. Write methods on the client are guarded and raise `ReadOnlyError` on DB-less Kong.
- `ENTITY_RESOURCES` in `src/lib/kongAdmin/entities.ts` has defaults for `services` and `routes`, and one nested resource (`targets`).
- Browse is built on a nested declarative config keyed by entity name, with edits going to an in-memory copy. It is not reused for live data.
- The sidebar (`AppSidebar.vue`) links to Load, Browse and Compare. The router has three routes.
- Shared components exist: `ValueListEditor`, `ProtocolPicker`, `MethodPicker`, `ToggleSwitch`, `DynamicKeyValueEditor`, `SearchInput`, `Badge`, `TagInput`.
- Kong's list endpoints filter by `tags` on the server but have no text search.

## Goals

- A Live section with live services and routes: list, search, create, edit, enable/disable (services), delete.
- Gating on connection state and database mode, with clear empty and read-only states.
- Primate's validation and payload rules, implemented as pure, unit-tested modules.
- A reusable data composable so 2b to 2d do not repeat list/paging/save/delete logic.

## Non-goals

- Plugins on services or routes (2c).
- A certificate picker. `client_certificate` and `ca_certificates` are plain id fields until 2d.
- Upstreams and targets (2b), consumers (2c), certificates, CA certificates and SNIs (2d).
- Any change to Browse, Compare, Load, Export or Push.

## Design

### 1. Navigation and gating

- Router: `/live/services` and `/live/routes`, each rendering a view. `/live` redirects to `/live/services`.
- Sidebar: a "Live" group with Services and Routes links. Links are always visible; the views handle the unconnected state.
- Every Live view has three states, decided from `useConnectionStore()`:
  - **Not connected:** an empty state explaining that a live Kong Admin API connection is needed, with a link to the Load page.
  - **Connected, `canWrite` false (DB-less):** the list and detail render normally, a notice explains that Kong is running without a database so entities are read-only, and every write control (New, Save, Delete, enabled toggle) is disabled.
  - **Connected, `canWrite` true:** fully editable.

### 2. Data layer: `src/composables/useLiveEntities.ts`

`useLiveEntities<T>(resource, options?)` where `options.parentId` is forwarded for nested resources. It gets its client from the connection store at call time.

State: `items: T[]`, `next: string | null`, `loading: boolean`, `error: LiveError | null`, `tagFilter: string[]`.

Actions:
- `load()`: clears `items` and fetches the first page with the current `tagFilter`.
- `loadMore()`: fetches the next page using `next` and appends. No-op when `next` is null or a request is already in flight.
- `create(body)`, `save(idOrName, patch)`, `remove(idOrName)`, `toggleEnabled(idOrName, enabled)`: call the matching client method, then update `items` locally (insert, replace or remove) so the list reflects the change without refetching.

`LiveError` is `{ message: string; fields?: Record<string, unknown> }`, built from `KongAdminApiError` (`kongMessage` when present, otherwise `message`, plus `fields`). Any other thrown value becomes `{ message: String(err) }`. Write actions rethrow after setting `error`, so callers can keep the form open. A `ReadOnlyError` is surfaced the same way.

Text search is not part of the composable: views filter the already-loaded `items` client-side.

### 3. Foundation addition

`ENTITY_RESOURCES` gets a nested `service_routes` resource: `path: 'services/:parentId/routes'`, `nested: true`, with the same defaults as `routes`. `EntityResourceName` gains `'service_routes'`. The existing registry tests are updated to expect ten collections.

### 4. Form modules

Pure TypeScript, no Vue, under `src/lib/live/`.

**`serviceForm.ts`**
- `type ServiceForm`: `name`, `protocol`, `host`, `port`, `path`, `enabled`, `retries`, `connect_timeout`, `write_timeout`, `read_timeout`, `tags`, `client_certificate` (string id), `ca_certificates` (string ids), `tls_verify` (`'inherit' | 'true' | 'false'`), `tls_verify_depth` (number or empty).
- `fromEntity(entity): ServiceForm`: maps a Kong service to the form (`client_certificate.id` to a string, `tls_verify` null to `'inherit'`, null depth to empty).
- `newServiceForm(): ServiceForm`: built from `ENTITY_RESOURCES.services.defaults`.
- `validateService(form): string[]`: error messages; an empty list means valid. A protocol and a non-empty trimmed host are required.
- `toPayload(form): Record<string, unknown>`:
  - trims strings; an empty `name` is omitted;
  - `client_certificate` becomes `{ id }` when non-empty, otherwise `null`;
  - `tls_verify` maps to `true`, `false` or `null`; an empty depth becomes `null`;
  - fields that do not apply to the protocol are sent as `null` so a PATCH clears them: `ca_certificates`, `client_certificate`, `tls_verify` and `tls_verify_depth` apply only to `https`; `path` applies only to `http`, `https` and `tls_passthrough`.

**`routeForm.ts`**
- `type RouteForm`: `name`, `protocols`, `methods`, `hosts`, `paths`, `headers` (`{ name: string; values: string[] }[]`), `snis`, `sources` and `destinations` (`string[]` of `ip` or `ip:port`), `https_redirect_status_code`, `regex_priority`, `strip_path`, `path_handling`, `preserve_host`, `request_buffering`, `response_buffering`, `tags`, `service` (service id or empty).
- `fromEntity`, `newRouteForm` (from `ENTITY_RESOURCES.routes.defaults`), `validateRoute`, `toPayload`.
- `validateRoute` rules, ported from Primate:
  - at least one protocol is required (`Please check at least one protocol from the list.`);
  - for each selected protocol, at least one of its required field groups must be non-empty: `http` needs one of methods, hosts, headers, paths; `https` adds snis; `tcp` needs sources or destinations; `tls` needs sources, destinations or snis; `tls_passthrough` needs snis; `grpc` needs one of hosts, headers, paths; `grpcs` adds snis. The message is `At least one of <fields> is required, if <PROTOCOL> is selected.`;
  - selected protocols must come from one family: `http`/`https`, `grpc`/`grpcs`, or the stream family `tcp`/`tls`/`tls_passthrough`. Mixing families is an error (`Choose protocols from one family: HTTP/HTTPS, GRPC/GRPCS, or TCP/TLS/TLS passthrough.`). This is stricter than Primate, which would silently send contradictory clearing rules; Kong rejects such routes anyway;
  - a malformed `sources` or `destinations` entry (not `ip` or `ip:port`, port outside 1 to 65535) is an error.
- `toPayload` rules:
  - `sources` and `destinations` are parsed into `{ ip, port? }` objects, dropping entries with an empty ip;
  - `headers` becomes a `{ name: values[] }` map, or `null` when empty;
  - `https_redirect_status_code` and `regex_priority` are numbers;
  - `service` becomes `{ id }` or `null`;
  - fields that are mutually exclusive with the selected protocols are sent as `null`: `hosts`, `paths`, `methods` and `headers` are cleared when only stream protocols (`tcp`, `tls`, `tls_passthrough`) are selected, and `sources` and `destinations` are cleared when only http-family protocols (`http`, `https`, `grpc`, `grpcs`) are selected (`snis` is never cleared);
  - `strip_path` is omitted when every selected protocol is `grpc` or `grpcs`.

Create uses POST with the payload (null fields dropped for create). Save uses PATCH with the payload including nulls, so cleared fields are cleared on the server.

### 5. UI

- `src/views/live/LiveServicesView.vue` and `LiveRoutesView.vue`, each a list panel plus a detail panel, like Browse.
- **List panel:** a tag filter input (server-side, re-runs `load()`), a search box (client-side over loaded items, matching name, host, paths and tags), a "Load more" button shown when `next` is set, and a "New" button. Service rows show an enabled toggle; route rows show their service name.
- **Detail panel:** a form built from the shared components (`ValueListEditor` for hosts, paths and snis, `ProtocolPicker`, `MethodPicker`, `ToggleSwitch`, `DynamicKeyValueEditor` for headers, `TagInput` for tags). It has Save, Discard and Delete buttons and a dirty indicator. Discard and navigation-away prompt only when the form is dirty. Delete asks for confirmation.
- **Validation display:** `validateService` and `validateRoute` messages show in a banner above the form and block Save. A `LiveError` from Kong shows in the same banner; entries in `fields` that match a form field are also shown under that field.
- **Route service picker:** a searchable select over all services, loaded once with `listAll` on the routes view and refreshed after any service change made in the same session. It allows clearing the service (a route without a service).
- A route opened from a service can use `service_routes`; the routes view also accepts `?service=<id>` to filter to one service's routes.
- Styling follows the existing tokens and the `input-field`, `btn-primary` and `btn-secondary` classes.

### 6. Testing

Vitest, following the repo's existing style; no new dependencies.

- `serviceForm.test.ts` and `routeForm.test.ts`: every validation rule above, every payload rule (including null-clearing and protocol-dependent omissions), `fromEntity` round trips, and boundary inputs (whitespace-only host, port `0` and `65536`, `ip:` with empty port, empty headers).
- `useLiveEntities.test.ts` (mocked `fetch`): first page, `loadMore` appends and stops at the last page, no double fetch while loading, tag filter reload, create/save/remove update `items`, errors populate `error` and rethrow, `ReadOnlyError` path.
- View tests (jsdom): disconnected empty state; DB-less state disables every write control; connected create, edit and delete flows call the expected endpoints; dirty Discard confirmation; Kong `fields` errors render.
- Entity registry tests updated for `service_routes`.
- A browser check is not possible in this session (the Chrome extension was declined), so the final report says so and the person verifies the screens by hand.

## Error handling summary

| Situation | Result |
|---|---|
| No active connection | Empty state with a link to Load |
| DB-less Kong | Notice; all write controls disabled |
| Validation failure (client-side) | Banner with messages; Save blocked; no request sent |
| Kong 400 with `fields` | Banner plus per-field messages; form stays open |
| 401/403, 404, 409, 5xx, network | Banner with the message; form stays open |
| Delete of a service that still has routes | Kong's error is shown in the banner; nothing is deleted locally |

## Open questions

None.
