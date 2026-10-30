# Kong Manager

A browser-based tool for viewing and editing [Kong Gateway](https://konghq.com/) configuration.
Open a declarative config file, or connect to a running Kong through its Admin API, and work
with services, routes, consumers and plugins without reading raw YAML or JSON.

Hosted version: https://peerapatxiv.github.io/kong-manager/

## Features

### File mode

- Open a Kong declarative config file (`kong.yaml`, format 3.0) by dragging it in or choosing it.
- Browse services, routes, consumers (with their credentials) and global plugins.
- Edit any field, including plugin config, without losing data the UI doesn't model.
- Export the edited config as YAML.
- Push a config to a DB-less Kong (`POST /config`).

The file stays in your browser and is never uploaded.

### Live mode

- Connect to a Kong Admin API, optionally with basic auth.
- Dashboard with an overview of what's configured.
- List, search, create, edit and delete services, routes, plugins and consumers.
- Manage consumer credentials: key-auth, basic-auth, OAuth2, HMAC, JWT and ACL groups.
- See each service's routes from its detail panel.
- Saved Connections remember Admin API addresses for next time.

On a DB-less Kong (`database = off`) live mode is read-only, because Kong itself refuses writes there.

### Compare

Load two config files (for example staging and production, or before and after a change) and
see which services, routes, consumers and plugins were added, removed or changed.

## Getting started

You need Node.js 20 or newer.

```bash
npm install
npm run dev:proxy
```

Then open http://localhost:5173/kong-manager/.

### Commands

| Command | What it does |
|---|---|
| `npm run dev:proxy` | Dev server with hot reload and the local Kong proxy. Use this for day-to-day work. |
| `npm run dev` | Dev server without the proxy. File mode works; live mode needs Kong to allow CORS. |
| `npm start` | Typechecks, builds and serves the production build with the proxy at http://localhost:4173/kong-manager/ |
| `npm test` | Runs the test suite (Vitest) once |
| `npm run build` | Typechecks and builds the hosted version into `dist/` |
| `npm run preview` | Serves the `dist/` build |

## Connecting to Kong

Browsers block calls to Kong's Admin API from another site unless Kong sends CORS headers,
and by default it doesn't. Running locally avoids this: `npm run dev:proxy` and `npm start`
forward Kong requests through the local server, where CORS doesn't apply. The connect panel
says *"Requests go through the local proxy, so CORS does not apply."* when the proxy is on.

Type the Admin API address as your machine reaches it, for example `http://localhost:8001`
or `https://kong.internal:8444`. A path prefix such as `gateway.internal/kong-admin` also works.

> **Safety:** the proxy forwards to any address it is given. Keep it on your own machine and
> don't start it with `--host` or otherwise expose it to other machines.

The hosted site has no server and can't proxy. To use it with your Kong, Kong has to allow
`https://peerapatxiv.github.io` through the `cors` plugin, and the address must be `https`
(or `localhost`).

More detail: [docs/running-locally.md](docs/running-locally.md).

### Saved Connections

Saved Connections are kept in your browser's `localStorage` with no expiry. They stay until you
delete them or clear the site's data. Each address and port has its own list (for example,
port 5173 and port 4173 keep separate lists). Passwords are stored as plain text, so only save
credentials on a machine you trust.

## Tech stack

Vue 3, TypeScript, Vite, Pinia, Vue Router, Tailwind CSS, js-yaml, and Vitest with Vue Test Utils.

## Project layout

```
src/
  views/         Pages: load screen, file mode, live mode, compare
  components/    UI components, grouped by area (file, live, compare, layout, shared)
  composables/   Reusable Vue logic (live entity lists, dashboard, upstream health)
  stores/        Pinia stores (loaded config, Kong connection, saved connections)
  lib/           Logic without UI: YAML, diff, Admin API client, form helpers
  router/        Routes
tools/
  kongProxy.ts   Local proxy to the Kong Admin API, used by dev:proxy and start
fixtures/        Sample config files
docs/            Running locally, plus design specs and implementation plans
```

Tests sit next to the code they cover as `*.test.ts`.

## Deployment

Every push to `main` runs the tests, builds the app and publishes it to GitHub Pages
(`.github/workflows/deploy.yml`).

## Roadmap

Live upstreams, targets and health checks are in progress. See
[the design](docs/superpowers/specs/2026-10-02-live-upstreams-design.md) and
[the plan](docs/superpowers/plans/2026-10-02-live-upstreams.md).
