# Live upstreams, targets and health

## Context

Live mode manages services, routes, plugins and consumers against a connected Kong Admin API. Upstreams (Kong's load balancer entity) are the largest remaining gap. This spec adds them, with their targets and a read-only health view. It builds on:

- `2026-09-30-admin-api-foundation-design.md`: `createEntityClient`, `ENTITY_RESOURCES`, the `connection` store.
- `2026-09-30-live-shell-services-routes-design.md`: `useLiveEntities`, the list-and-form view pattern (`LiveServicesView`), the form-module pattern (`serviceForm.ts`).
- `2026-09-30-live-consumers-credentials-design.md`: nested resources and the panel pattern for child entities.

## Current state

- `ENTITY_RESOURCES.upstreams` (`upstreams`) and `ENTITY_RESOURCES.targets` (`upstreams/:parentId/targets`, nested) already exist, so list, create and delete need no client work.
- `useLiveEntities(resource, { parentId, listVia, withTotal })` covers nested lists and counts.
- `useLiveDashboard` loads services, routes, consumers, plugins and `/status`, each with its own loading and error state.
- There is no upstream or target UI, no health call, and no sidebar entry.

## Goals

- Live upstreams: list, filter by tag, create, edit, delete.
- For a saved upstream, manage its targets: list, add, delete, and "set weight".
- Show per-target health (read-only) in the upstream detail.
- An Upstreams tile on the Overview dashboard, with an on-demand unhealthy count.

## Non-goals

- Editing `healthchecks` (active and passive). They are preserved untouched on edit and omitted on create so Kong applies its own defaults.
- Marking targets healthy or unhealthy (`POST .../healthy|unhealthy`).
- Polling or auto-refresh of health.
- Changes to Browse, Compare, Load, file mode, or other live pages beyond navigation and the dashboard.
- Refactoring the live views into a generic page.

## Design

### 1. Navigation

- Router: `/live/upstreams` renders `LiveUpstreamsView` (name `live-upstreams`).
- Sidebar: the LIVE group gains an Upstreams link after Services. `AppShell.vue` maps the route to the title "Live upstreams".
- `redirectToHomeOnLoad` already covers every `/live/*` path; no change.

### 2. API layer

- `getUpstreamHealth(connection, upstreamId)` in `src/lib/kongAdmin/` calls `GET /upstreams/{id}/health` through `adminJson` and returns `{ data: TargetHealth[] }`, where `TargetHealth` is `{ target: string; weight: number; health: string }` (other fields ignored).
- `parseUpstreamHealth(raw)` is tolerant: a malformed body yields `[]`, unknown `health` strings are passed through, and a missing `health` becomes `undefined`.

### 3. Forms (`src/lib/live/`)

- `upstreamForm.ts`: defaults from `ENTITY_RESOURCES.upstreams` minus `healthchecks`; fields `name` (required), `algorithm` (`round-robin`, `consistent-hashing`, `least-connections`, `latency`), `hash_on`, `hash_fallback`, `slots`, `host_header`, `tags`. `toPayload` drops empty strings. On edit, `healthchecks` from the loaded entity is carried through unchanged.
- `targetForm.ts`: `target` (required, `host`, `host:port` or `[ipv6]:port`), `weight` (integer 0 to 65535), `tags`. Validation messages are shown through `FieldError`; Kong's own `fields` errors are merged the same way as in `serviceForm.ts`.
- "Set weight": Kong targets are append-only, so changing a weight posts a new target with the same address. The UI labels the action "Set weight" and the helper `targetsByAddress` collapses the list to the newest entry per address so the old rows are not shown as duplicates.

### 4. Composables

- `useLiveEntities('upstreams', { withTotal: true })` for the list.
- `useLiveEntities('targets', { parentId: () => selectedUpstreamId })` for targets.
- `useUpstreamHealth(upstreamId)`: `{ health, loading, error, updatedAt, refresh }`. It loads when the selection changes, keeps a request token so a slower, older response is dropped (same approach as `useLiveDashboard`), and keeps its error separate from CRUD errors. A failure shows "No health data" and never blocks the targets list or forms.

### 5. Components (`src/components/live/`)

- `LiveUpstreamsView.vue` (in `src/views/live/`): same layout as `LiveServicesView` with the tag-filter toolbar, a list of name, algorithm and target count, and a detail pane.
- `UpstreamForm.vue`: the fields in section 3, built from the existing `TagInput`, `FieldError` and `LiveErrorBanner`.
- `UpstreamTargetsPanel.vue`: modelled on `ServiceRoutesPanel`. Each row shows `target`, `weight` and a `TargetHealthBadge`; there is an inline add form, a "Set weight" action and a delete with confirmation. A Refresh button and an "as of" time sit on the health header.
- `TargetHealthBadge.vue`: `HEALTHY` green, `UNHEALTHY` red, `DNS_ERROR` amber, `HEALTHCHECKS_OFF` neutral, anything else or missing a dash. Colour is never the only signal; the label text is always shown.

### 6. Dashboard

- `useLiveDashboard` gains an `upstreams` section using the same `load` helper, so a failing upstream request leaves other tiles intact.
- `DashboardTile` for Upstreams links to `/live/upstreams` and shows the count.
- Unhealthy count is on demand: a "Check health" control fetches `/upstreams/{id}/health` for each upstream, at most 10 in flight, and `summarizeUpstreamHealth` (in `dashboard.ts`) returns `{ upstreams, targets, unhealthy, unknown }`. Nothing is fetched until the user asks. Per-upstream failures count as `unknown` rather than failing the tile.

## Error handling

- CRUD errors use `toLiveError` and `LiveErrorBanner` as elsewhere.
- Health errors are scoped to the health header and the dashboard control; they never replace the list or detail.
- Kong in DB-less mode, or a Kong without health data, returns an error or empty body; both render as "No health data".

## Testing

Vitest, with a test file next to each module, as in the repo.

- `upstreamForm`, `targetForm` (validation, payload, `targetsByAddress`), `parseUpstreamHealth`, `summarizeUpstreamHealth`.
- `useUpstreamHealth`: success, failure that leaves CRUD untouched, and a stale response being dropped.
- `useLiveDashboard`: the upstreams section and the isolated failure.
- `LiveUpstreamsView` and `UpstreamTargetsPanel` with the mocked-client style of `LiveServicesView.test.ts`; `routes.test.ts` gains the new path; the sidebar test gains the link.
- Runtime check: before the work is called done, run the app against a real Kong with at least one upstream with two targets (one unreachable) and confirm in the browser that the list, add and delete, set weight, the health badges, and the dashboard tile and "Check health" work. Typecheck and tests alone are not enough.

## Open decisions

None. Health checks configuration and mark-healthy/unhealthy are deliberate follow-ups.
