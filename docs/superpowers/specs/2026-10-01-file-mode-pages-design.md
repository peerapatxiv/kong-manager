# File mode as separate pages

Date: 2026-10-01
Status: approved in chat ("go ahead"), implemented in steps

## Goal

When a YAML config is loaded, browse it the way a live Kong is browsed: one page per entity type,
each with its own address, plus a dashboard. Replaces the single tabbed Browse page.

## Pages (sidebar group labelled with the file name)

| Address | Page |
|---|---|
| `/file/dashboard` | counts, services enabled/disabled, routes by protocol, most used plugins, file card (name, format version, unsaved edits) |
| `/file/services` | list + existing ServiceDetail |
| `/file/routes` | **new**: every route in the file (nested under services, or top-level), name-only rows, route editor with its service |
| `/file/consumers` | list + existing ConsumerDetail |
| `/file/plugins` | **all** plugins (global, service, route, consumer level), name-only rows, editor shows where it applies |
| `/compare` | unchanged |

`/browse` redirects to `/file/dashboard`. The first page after loading a file is the dashboard.

## Behaviour

- Same layout as Live (`LiveWorkspace`): resizable, full-height list, name-only rows, search.
- Edits stay staged in the loaded config with Save / Discard, "modified" markers and the unsaved
  prompt; they leave only through "Generate new config". Nothing is sent to any Kong.
- Plugin and route identity is positional (names are not unique), so editing replaces the entry at
  its index in its parent array. A nested edit marks its owning service (or consumer) modified.
- The dashboard needs no network: everything is computed from the loaded config.

## Out of scope

Creating or deleting entities in file mode (not supported today either), editing top-level `routes`
beyond what the route editor already offers.
