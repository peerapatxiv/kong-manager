# Kong Admin API Connection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `kong-config-viewer` connect directly to a running Kong Gateway's Admin API (DB-less mode) — pulling the live declarative config in as an alternative to a local file, and pushing edits back — while reusing all existing Browse/Edit/Compare/Export code untouched.

**Architecture:** A new pure-function transform (`kongConfigTransform.ts`) converts the expanded/flattened shape Kong's `GET /config` returns into the nested authoring shape the app already models; a small fetch client (`kongAdminApi.ts`) wraps `GET`/`POST /config` using that transform (pull) and the existing `serializeKongConfig` unchanged (push); the Pinia store gains two actions (`loadFromKongAdmin`, `pushToKongAdmin`) so a live connection becomes just another way to populate the same `LoadedFile`; two small UI pieces (a connect form on Load, a confirm-gated push modal in the header) are the only new user-facing surface.

**Tech Stack:** Vue 3 `<script setup>` + TypeScript, Pinia, Vitest, native `fetch` (no new dependencies).

**Spec:** `docs/superpowers/specs/2026-09-25-kong-admin-api-connection-design.md`

## Global Constraints

- DB-less Kong only — no per-entity REST client for database-backed Kong.
- No dev-proxy: the browser calls the Admin API base URL directly. Verified against a real Kong 3.7.1 container that its Admin API sends permissive CORS headers by default (`Access-Control-Allow-Origin` echoes the request origin, `Access-Control-Allow-Headers` echoes any requested custom header including `Kong-Admin-Token`).
- Connection is session-only: base URL and token live only in Pinia state, never written to localStorage/disk.
- Auth: optional `Kong-Admin-Token` header only — no other scheme in v1.
- `POST /config` replaces the entire live declarative config — every push flow requires an explicit two-step confirmation (warning shown, then a distinct "Confirm push" action) before sending.
- `GET /config` responds `{"config": "<yaml string>"}`; the inner YAML is Kong's expanded/flattened representation (routes/credentials/scoped-plugins at the top level, referencing their parent by a bare id string, e.g. a route has `service: "<uuid>"`). It must be denormalized via `denormalizeKongConfig` before use anywhere else in the app.
- `POST /config` accepts the existing nested authoring-shape YAML unchanged (produced by the existing `serializeKongConfig`), wrapped as `{"config": "<yaml string>"}`, sent as `application/json`.
- Bookkeeping fields (`id`, `created_at`, `updated_at`) and FK back-reference fields (`service`, `route`, `consumer`) are stripped when denormalizing an entity.

## Review Focus

- Base URL entered with a trailing slash (e.g. `http://localhost:8001/`) must not produce a double-slash `//config` request. → Task 2.
- A route or credential in a live config referencing a service/consumer id that doesn't resolve (partial/stale data) must not crash the load — unmatched routes surface in a top-level bucket, orphaned credentials are silently dropped rather than throwing. → Task 1.
- A non-2xx response (e.g. `401` from a missing/wrong Admin token) must surface the real status and response body to the user, not throw an opaque or unhandled error. → Task 2.
- Clicking "Connect" or "Push to Kong" with a blank/whitespace-only base URL must not fire a request. → Task 4, Task 6.
- Calling push when no config is loaded must fail loudly with a clear error rather than silently sending nothing (or a garbage payload) to a live gateway. → Task 3.

---

### Task 1: Kong config denormalize transform

**Files:**
- Create: `src/lib/kongConfigTransform.ts`
- Test: `src/lib/kongConfigTransform.test.ts`

**Interfaces:**
- Consumes: `KongConfig`, `KongService`, `KongRoute`, `KongConsumer`, `KongPlugin` from `src/types/kong.ts` (existing).
- Produces: `denormalizeKongConfig(expanded: Record<string, unknown>): KongConfig`, consumed by Task 2's `kongAdminApi.ts`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/kongConfigTransform.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { denormalizeKongConfig } from './kongConfigTransform'

const EXPANDED = {
  _format_version: '3.0',
  _transform: false,
  services: [
    { id: 'svc-1', name: 'billing-service', host: 'billing.internal', created_at: 1, updated_at: 1 },
    { id: 'svc-2', name: 'reporting-service', host: 'reporting.internal', created_at: 1, updated_at: 1 },
  ],
  routes: [
    { id: 'route-1', name: 'billing-route', service: 'svc-1', paths: ['/billing'], created_at: 1, updated_at: 1 },
    {
      id: 'route-orphan',
      name: 'orphan-route',
      service: 'svc-missing',
      paths: ['/orphan'],
      created_at: 1,
      updated_at: 1,
    },
  ],
  consumers: [{ id: 'cons-1', username: 'alice', created_at: 1, updated_at: 1 }],
  keyauth_credentials: [
    { id: 'cred-1', consumer: 'cons-1', key: 'abc123key', created_at: 1 },
    { id: 'cred-orphan', consumer: 'cons-missing', key: 'orphan-key', created_at: 1 },
  ],
  plugins: [
    {
      id: 'plug-global',
      name: 'rate-limiting',
      service: null,
      route: null,
      consumer: null,
      config: { minute: 100 },
      created_at: 1,
      updated_at: 1,
    },
    {
      id: 'plug-route',
      name: 'key-auth',
      service: null,
      route: 'route-1',
      consumer: null,
      config: {},
      created_at: 1,
      updated_at: 1,
    },
    {
      id: 'plug-service',
      name: 'cors',
      service: 'svc-2',
      route: null,
      consumer: null,
      config: {},
      created_at: 1,
      updated_at: 1,
    },
  ],
}

describe('denormalizeKongConfig', () => {
  it('nests routes under their owning service and strips bookkeeping/back-reference fields', () => {
    const config = denormalizeKongConfig(EXPANDED)

    const billing = config.services!.find((s) => s.name === 'billing-service')!
    expect(billing.routes).toHaveLength(1)
    expect(billing.routes![0]).toMatchObject({ name: 'billing-route', paths: ['/billing'] })
    expect(billing.routes![0]).not.toHaveProperty('service')
    expect(billing.routes![0]).not.toHaveProperty('id')
    expect(billing.routes![0]).not.toHaveProperty('created_at')
    expect(billing).not.toHaveProperty('id')
    expect(billing).not.toHaveProperty('created_at')
  })

  it('puts a route whose service id does not resolve into a top-level array instead of dropping it', () => {
    const config = denormalizeKongConfig(EXPANDED)

    expect(config.routes).toEqual([expect.objectContaining({ name: 'orphan-route' })])
  })

  it('nests keyauth credentials under their owning consumer', () => {
    const config = denormalizeKongConfig(EXPANDED)

    const alice = config.consumers!.find((c) => c.username === 'alice')!
    expect(alice.keyauth_credentials).toEqual([{ key: 'abc123key' }])
  })

  it('drops a credential whose consumer id does not resolve, instead of crashing', () => {
    const config = denormalizeKongConfig(EXPANDED)

    const allCredentials = config.consumers!.flatMap((c) => (c.keyauth_credentials as unknown[] | undefined) ?? [])
    expect(allCredentials).toHaveLength(1)
  })

  it('routes scoped plugins to their service or route, and leaves unscoped plugins global', () => {
    const config = denormalizeKongConfig(EXPANDED)

    expect(config.plugins).toEqual([expect.objectContaining({ name: 'rate-limiting' })])

    const billing = config.services!.find((s) => s.name === 'billing-service')!
    expect(billing.routes![0].plugins).toEqual([expect.objectContaining({ name: 'key-auth' })])

    const reporting = config.services!.find((s) => s.name === 'reporting-service')!
    expect(reporting.plugins).toEqual([expect.objectContaining({ name: 'cors' })])
  })

  it('preserves unrecognized top-level fields untouched', () => {
    const config = denormalizeKongConfig(EXPANDED)
    expect(config._transform).toBe(false)
  })

  it('omits the top-level routes key entirely when there are no unmatched routes', () => {
    const noOrphans = { ...EXPANDED, routes: EXPANDED.routes.filter((r) => r.service === 'svc-1') }
    const config = denormalizeKongConfig(noOrphans)
    expect(config.routes).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/kongConfigTransform.test.ts`
Expected: FAIL — `Cannot find module './kongConfigTransform'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/kongConfigTransform.ts`:

```ts
import type { KongConfig, KongConsumer, KongPlugin, KongRoute, KongService } from '../types/kong'

const BOOKKEEPING_KEYS = ['id', 'created_at', 'updated_at']

function stripKeys(entity: Record<string, unknown>, extraKeys: string[]): Record<string, unknown> {
  const drop = new Set([...BOOKKEEPING_KEYS, ...extraKeys])
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(entity)) {
    if (!drop.has(key)) result[key] = value
  }
  return result
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : []
}

// Kong's GET /config returns routes/credentials/scoped-plugins flattened at
// the top level, each referencing its parent by a bare id string. This
// rebuilds the nested authoring shape (services[].routes,
// consumers[].*_credentials, services/routes[].plugins) the rest of the app
// already understands.
export function denormalizeKongConfig(expanded: Record<string, unknown>): KongConfig {
  const rawServices = asArray(expanded.services)
  const rawRoutes = asArray(expanded.routes)
  const rawConsumers = asArray(expanded.consumers)
  const rawPlugins = asArray(expanded.plugins)

  const services: KongService[] = rawServices.map((svc) => stripKeys(svc, []) as KongService)
  const serviceById = new Map<string, KongService>(rawServices.map((svc, i) => [svc.id as string, services[i]]))

  const routes: KongRoute[] = []
  const routeById = new Map<string, KongRoute>()
  for (const raw of rawRoutes) {
    const route = stripKeys(raw, ['service']) as KongRoute
    routeById.set(raw.id as string, route)
    const owner = typeof raw.service === 'string' ? serviceById.get(raw.service) : undefined
    if (owner) {
      owner.routes = [...(owner.routes ?? []), route]
    } else {
      routes.push(route)
    }
  }

  const consumers: KongConsumer[] = rawConsumers.map((c) => stripKeys(c, []) as KongConsumer)
  const consumerById = new Map<string, KongConsumer>(rawConsumers.map((c, i) => [c.id as string, consumers[i]]))

  for (const [key, value] of Object.entries(expanded)) {
    if (!key.endsWith('_credentials') || !Array.isArray(value)) continue
    for (const raw of value as Record<string, unknown>[]) {
      const owner = typeof raw.consumer === 'string' ? consumerById.get(raw.consumer) : undefined
      if (!owner) continue
      const credential = stripKeys(raw, ['consumer'])
      const list = (owner[key] as Record<string, unknown>[] | undefined) ?? []
      owner[key] = [...list, credential]
    }
  }

  const globalPlugins: KongPlugin[] = []
  for (const raw of rawPlugins) {
    const plugin = stripKeys(raw, ['service', 'route', 'consumer']) as KongPlugin
    const routeOwner = typeof raw.route === 'string' ? routeById.get(raw.route) : undefined
    const serviceOwner = typeof raw.service === 'string' ? serviceById.get(raw.service) : undefined
    if (routeOwner) {
      routeOwner.plugins = [...(routeOwner.plugins ?? []), plugin]
    } else if (serviceOwner) {
      const existing = (serviceOwner.plugins as KongPlugin[] | undefined) ?? []
      serviceOwner.plugins = [...existing, plugin]
    } else {
      globalPlugins.push(plugin)
    }
  }

  const denormalized: KongConfig = {
    ...stripKeys(expanded, ['services', 'routes', 'consumers', 'plugins']),
    _format_version: (expanded._format_version as string | undefined) ?? '3.0',
    services,
    consumers,
    plugins: globalPlugins,
  }

  if (routes.length > 0) denormalized.routes = routes

  return denormalized
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/kongConfigTransform.test.ts`
Expected: PASS, all 7 tests.

- [ ] **Step 5: Type-check**

Run: `npx vue-tsc -b`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/kongConfigTransform.ts src/lib/kongConfigTransform.test.ts
git commit -m "feat: add Kong expanded-config denormalize transform"
```

---

### Task 2: Kong Admin API client

**Files:**
- Create: `src/lib/kongAdminApi.ts`
- Test: `src/lib/kongAdminApi.test.ts`

**Interfaces:**
- Consumes: `denormalizeKongConfig` (Task 1), `parseKongConfig`/`serializeKongConfig` from `src/lib/yaml.ts` (existing).
- Produces: `getConfig(baseUrl: string, token?: string): Promise<KongConfig>`, `setConfig(baseUrl: string, config: KongConfig, token?: string): Promise<void>`, `KongAdminApiError` class — consumed by Task 3's store actions.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/kongAdminApi.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { getConfig, setConfig, KongAdminApiError } from './kongAdminApi'

const EXPANDED_YAML = `_format_version: '3.0'
services:
- id: svc-1
  name: billing-service
  host: billing.internal
routes:
- id: route-1
  name: billing-route
  service: svc-1
  paths:
  - /billing
consumers: []
plugins: []
`

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getConfig', () => {
  it('fetches {baseUrl}/config, unwraps the config envelope, and denormalizes it', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ config: EXPANDED_YAML }) })
    vi.stubGlobal('fetch', fetchMock)

    const config = await getConfig('http://localhost:8001')

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8001/config')
    expect(config.services).toHaveLength(1)
    expect(config.services![0].routes).toHaveLength(1)
    expect(config.services![0].routes![0].name).toBe('billing-route')
  })

  it('strips a trailing slash from the base URL instead of requesting a double slash', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ config: EXPANDED_YAML }) })
    vi.stubGlobal('fetch', fetchMock)

    await getConfig('http://localhost:8001/')

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8001/config')
  })

  it('attaches the Kong-Admin-Token header when a token is given, and omits it otherwise', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ config: EXPANDED_YAML }) })
    vi.stubGlobal('fetch', fetchMock)

    await getConfig('http://localhost:8001', 'secret-token')
    const withToken = fetchMock.mock.calls[0][1] as RequestInit
    expect((withToken.headers as Record<string, string>)['Kong-Admin-Token']).toBe('secret-token')

    fetchMock.mockClear()
    await getConfig('http://localhost:8001')
    const withoutToken = fetchMock.mock.calls[0][1] as RequestInit
    expect((withoutToken.headers as Record<string, string>)['Kong-Admin-Token']).toBeUndefined()
  })

  it('throws KongAdminApiError with the status and body on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'Unauthorized' }))

    await expect(getConfig('http://localhost:8001')).rejects.toThrow(KongAdminApiError)
    await expect(getConfig('http://localhost:8001')).rejects.toThrow(/401/)
  })

  it('throws KongAdminApiError on a network error instead of an unhandled rejection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    await expect(getConfig('http://localhost:8001')).rejects.toThrow('network down')
  })
})

describe('setConfig', () => {
  it('POSTs the serialized config wrapped in a config field, as JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => '' })
    vi.stubGlobal('fetch', fetchMock)

    await setConfig('http://localhost:8001', { _format_version: '3.0', services: [] })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:8001/config')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    const body = JSON.parse(init.body as string)
    expect(body.config).toContain('_format_version')
  })

  it('throws KongAdminApiError on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => 'bad config' }))

    await expect(setConfig('http://localhost:8001', { _format_version: '3.0' })).rejects.toThrow(/400/)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/kongAdminApi.test.ts`
Expected: FAIL — `Cannot find module './kongAdminApi'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/kongAdminApi.ts`:

```ts
import { parseKongConfig, serializeKongConfig } from './yaml'
import { denormalizeKongConfig } from './kongConfigTransform'
import type { KongConfig } from '../types/kong'

export class KongAdminApiError extends Error {}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

function buildHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Kong-Admin-Token'] = token
  return headers
}

async function request(baseUrl: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${normalizeBaseUrl(baseUrl)}/config`, init)
  } catch (err) {
    throw new KongAdminApiError(err instanceof Error ? err.message : String(err))
  }
}

async function assertOk(response: Response): Promise<void> {
  if (!response.ok) {
    throw new KongAdminApiError(`Kong Admin API responded ${response.status}: ${await response.text()}`)
  }
}

export async function getConfig(baseUrl: string, token?: string): Promise<KongConfig> {
  const response = await request(baseUrl, { headers: buildHeaders(token) })
  await assertOk(response)
  const body = (await response.json()) as { config: string }
  const expanded = parseKongConfig(body.config)
  return denormalizeKongConfig(expanded)
}

export async function setConfig(baseUrl: string, config: KongConfig, token?: string): Promise<void> {
  const yamlText = serializeKongConfig(config)
  const response = await request(baseUrl, {
    method: 'POST',
    headers: buildHeaders(token),
    body: JSON.stringify({ config: yamlText }),
  })
  await assertOk(response)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/kongAdminApi.test.ts`
Expected: PASS, all 7 tests.

- [ ] **Step 5: Type-check**

Run: `npx vue-tsc -b`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/kongAdminApi.ts src/lib/kongAdminApi.test.ts
git commit -m "feat: add Kong Admin API GET/POST /config client"
```

---

### Task 3: Config store — load from and push to Kong Admin API

**Files:**
- Modify: `src/stores/config.ts` (all 53 lines — shown in full below)
- Modify: `src/stores/config.test.ts` (append new tests)

**Interfaces:**
- Consumes: `getConfig`, `setConfig` from `src/lib/kongAdminApi.ts` (Task 2).
- Produces: `LoadedFile` gains `origin: 'file' | 'kong-admin'` and optional `baseUrl`; new store actions `loadFromKongAdmin(baseUrl, token?)` and `pushToKongAdmin(baseUrl, token?)` — consumed by Task 4/5's `LoadView.vue` and Task 6's `PushToKongModal.vue`.

- [ ] **Step 1: Write the failing tests**

Add to the end of `src/stores/config.test.ts` (also change the top imports as shown — add `vi` to the vitest import and mock `kongAdminApi`):

```ts
// src/stores/config.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useConfigStore } from './config'
import * as kongAdminApi from '../lib/kongAdminApi'
import type { KongConfig } from '../types/kong'

vi.mock('../lib/kongAdminApi')

const SAMPLE = `_format_version: "3.0"
services:
- name: svc-a
  host: a.internal
  routes:
  - name: route-a
    paths:
    - /a
consumers:
- username: alice
plugins:
- name: rate-limiting
`

describe('useConfigStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  // ... existing tests unchanged ...

  describe('Kong Admin API integration', () => {
    it('loads a config pulled from a live Kong Admin API as the primary source', async () => {
      const store = useConfigStore()
      const pulled: KongConfig = { _format_version: '3.0', services: [{ host: 'live.internal', name: 'svc-live' }] }
      vi.mocked(kongAdminApi.getConfig).mockResolvedValue(pulled)

      await store.loadFromKongAdmin('http://localhost:8001', 'token-123')

      expect(kongAdminApi.getConfig).toHaveBeenCalledWith('http://localhost:8001', 'token-123')
      expect(store.isLoaded).toBe(true)
      expect(store.primary!.origin).toBe('kong-admin')
      expect(store.primary!.baseUrl).toBe('http://localhost:8001')
      expect(store.primary!.fileName).toBe('Kong Admin @ http://localhost:8001')
      expect(store.primary!.config).toEqual(pulled)
    })

    it('clears a stale compareTarget when loading from Kong Admin API', async () => {
      const store = useConfigStore()
      store.loadPrimary('sample.yaml', SAMPLE)
      store.loadCompareTarget('other.yaml', SAMPLE)
      vi.mocked(kongAdminApi.getConfig).mockResolvedValue({ _format_version: '3.0' })

      await store.loadFromKongAdmin('http://localhost:8001')

      expect(store.compareTarget).toBeNull()
    })

    it('propagates getConfig errors instead of silently loading nothing', async () => {
      const store = useConfigStore()
      vi.mocked(kongAdminApi.getConfig).mockRejectedValue(new Error('connection refused'))

      await expect(store.loadFromKongAdmin('http://localhost:8001')).rejects.toThrow('connection refused')
      expect(store.isLoaded).toBe(false)
    })

    it('pushes the current in-memory config to the given Kong Admin API', async () => {
      const store = useConfigStore()
      store.loadPrimary('kong-config.yaml', SAMPLE)
      store.primary!.config.services![0].host = 'edited.internal'
      vi.mocked(kongAdminApi.setConfig).mockResolvedValue(undefined)

      await store.pushToKongAdmin('http://localhost:8001', 'token-123')

      expect(kongAdminApi.setConfig).toHaveBeenCalledWith(
        'http://localhost:8001',
        expect.objectContaining({
          services: expect.arrayContaining([expect.objectContaining({ host: 'edited.internal' })]),
        }),
        'token-123',
      )
    })

    it('throws and leaves state untouched when pushing with nothing loaded', async () => {
      const store = useConfigStore()

      await expect(store.pushToKongAdmin('http://localhost:8001')).rejects.toThrow('No config loaded')
      expect(kongAdminApi.setConfig).not.toHaveBeenCalled()
    })

    it('marks file-loaded configs with origin "file" and no baseUrl', () => {
      const store = useConfigStore()
      store.loadPrimary('sample.yaml', SAMPLE)

      expect(store.primary!.origin).toBe('file')
      expect(store.primary!.baseUrl).toBeUndefined()
    })
  })
})
```

Note: keep every existing `it(...)` block in the file exactly as-is — only the top imports gain `vi` and the two new lines (`import * as kongAdminApi ...`, `vi.mock(...)`), the existing `beforeEach` gains `vi.clearAllMocks()`, and the new `describe('Kong Admin API integration', ...)` block is appended inside the existing outer `describe('useConfigStore', ...)`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/stores/config.test.ts`
Expected: FAIL — `store.loadFromKongAdmin is not a function` (and similarly for `pushToKongAdmin`).

- [ ] **Step 3: Write the implementation**

Replace `src/stores/config.ts` in full:

```ts
import { defineStore } from 'pinia'
import { parseKongConfig, serializeKongConfig } from '../lib/yaml'
import { getConfig, setConfig } from '../lib/kongAdminApi'
import type { KongConfig } from '../types/kong'

export type LoadedFile = {
  fileName: string
  origin: 'file' | 'kong-admin'
  baseUrl?: string
  config: KongConfig
}

export const useConfigStore = defineStore('config', {
  state: () => ({
    primary: null as LoadedFile | null,
    compareTarget: null as LoadedFile | null,
    modifiedKeys: new Set<string>(),
  }),
  getters: {
    isLoaded: (state): boolean => state.primary !== null,
    summary: (state) => {
      const config = state.primary?.config
      const services = config?.services ?? []
      return {
        services: services.length,
        routes: services.reduce((sum, s) => sum + (s.routes?.length ?? 0), 0),
        consumers: config?.consumers?.length ?? 0,
        globalPlugins: config?.plugins?.length ?? 0,
      }
    },
  },
  actions: {
    loadPrimary(fileName: string, text: string) {
      const config = parseKongConfig(text)
      this.primary = { fileName, origin: 'file', config }
      this.modifiedKeys = new Set()
      this.compareTarget = null
    },
    loadCompareTarget(fileName: string, text: string) {
      const config = parseKongConfig(text)
      this.compareTarget = { fileName, origin: 'file', config }
    },
    async loadFromKongAdmin(baseUrl: string, token?: string) {
      const config = await getConfig(baseUrl, token)
      this.primary = { fileName: `Kong Admin @ ${baseUrl}`, origin: 'kong-admin', baseUrl, config }
      this.modifiedKeys = new Set()
      this.compareTarget = null
    },
    async pushToKongAdmin(baseUrl: string, token?: string) {
      if (!this.primary) throw new Error('No config loaded')
      await setConfig(baseUrl, this.primary.config, token)
    },
    markModified(entityKey: string) {
      this.modifiedKeys.add(entityKey)
    },
    isModified(entityKey: string): boolean {
      return this.modifiedKeys.has(entityKey)
    },
    exportYaml(): { fileName: string; contents: string } {
      if (!this.primary) throw new Error('No config loaded')
      const contents = serializeKongConfig(this.primary.config)
      const base = this.primary.fileName.replace(/\.ya?ml$/i, '')
      return { fileName: `${base}-edited.yaml`, contents }
    },
  },
})
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/stores/config.test.ts`
Expected: PASS, all tests (existing + 6 new).

- [ ] **Step 5: Run the full suite and type-check**

Run: `npm run test`
Run: `npx vue-tsc -b`
Expected: both succeed — this confirms nothing that reads `LoadedFile.fileName` elsewhere (`AppSidebar.vue`, `CompareView.vue`, `ExportModal.vue`) broke from the new `origin`/`baseUrl` fields.

- [ ] **Step 6: Commit**

```bash
git add src/stores/config.ts src/stores/config.test.ts
git commit -m "feat: load from and push to a live Kong Admin API in the config store"
```

---

### Task 4: KongConnectForm component

**Files:**
- Create: `src/components/KongConnectForm.vue`
- Test: `src/components/KongConnectForm.test.ts`

**Interfaces:**
- Consumes: `src/components/shared/SecretField.vue` (existing).
- Produces: `KongConnectForm` — prop `connecting: boolean`, emits `connect: [{ baseUrl: string; token: string | undefined }]` — consumed by Task 5's `LoadView.vue`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/KongConnectForm.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import KongConnectForm from './KongConnectForm.vue'

describe('KongConnectForm', () => {
  it('emits connect with the entered base URL and token', async () => {
    const wrapper = mount(KongConnectForm, { props: { connecting: false } })

    await wrapper.find('input[placeholder="http://localhost:8001"]').setValue('http://localhost:8001')
    await wrapper.find('input[type="password"]').setValue('secret-token')
    await wrapper.find('button').trigger('click')

    expect(wrapper.emitted('connect')).toEqual([[{ baseUrl: 'http://localhost:8001', token: 'secret-token' }]])
  })

  it('trims the base URL and emits an undefined token when the token field is left blank', async () => {
    const wrapper = mount(KongConnectForm, { props: { connecting: false } })

    await wrapper.find('input[placeholder="http://localhost:8001"]').setValue('  http://localhost:8001  ')
    await wrapper.find('button').trigger('click')

    expect(wrapper.emitted('connect')).toEqual([[{ baseUrl: 'http://localhost:8001', token: undefined }]])
  })

  it('does not emit when the base URL is blank or whitespace-only', async () => {
    const wrapper = mount(KongConnectForm, { props: { connecting: false } })

    await wrapper.find('input[placeholder="http://localhost:8001"]').setValue('   ')
    await wrapper.find('button').trigger('click')

    expect(wrapper.emitted('connect')).toBeUndefined()
  })

  it('disables the Connect button while connecting is true', () => {
    const wrapper = mount(KongConnectForm, { props: { connecting: true } })
    expect((wrapper.find('button').element as HTMLButtonElement).disabled).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/KongConnectForm.test.ts`
Expected: FAIL — `Cannot find module './KongConnectForm.vue'`.

- [ ] **Step 3: Write the implementation**

Create `src/components/KongConnectForm.vue`:

```vue
<script setup lang="ts">
import { ref } from 'vue'
import SecretField from './shared/SecretField.vue'

defineProps<{ connecting: boolean }>()
const emit = defineEmits<{ connect: [payload: { baseUrl: string; token: string | undefined }] }>()

const baseUrl = ref('')
const token = ref<string | undefined>(undefined)

function submit() {
  const trimmed = baseUrl.value.trim()
  if (!trimmed) return
  emit('connect', { baseUrl: trimmed, token: token.value || undefined })
}
</script>

<template>
  <div class="card space-y-3 p-4">
    <h3 class="text-sm font-medium text-ink">Connect to Kong Admin API</h3>
    <p class="text-xs text-ink-muted">
      Pull the live declarative config from a running Kong instance (DB-less mode).
    </p>
    <label class="block">
      <span class="field-label">Admin API base URL</span>
      <input
        v-model="baseUrl"
        type="text"
        placeholder="http://localhost:8001"
        class="input-field font-mono"
        @keyup.enter="submit"
      />
    </label>
    <label class="block">
      <span class="field-label">Admin token (optional)</span>
      <SecretField v-model="token" />
    </label>
    <button type="button" class="btn-secondary" :disabled="connecting || !baseUrl.trim()" @click="submit">
      {{ connecting ? 'Connecting…' : 'Connect' }}
    </button>
  </div>
</template>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/KongConnectForm.test.ts`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/KongConnectForm.vue src/components/KongConnectForm.test.ts
git commit -m "feat: add KongConnectForm component"
```

---

### Task 5: Wire Kong connect into the Load view

**Files:**
- Modify: `src/views/LoadView.vue` (all 127 lines — shown in full below)
- Modify: `src/views/LoadView.test.ts` (append new tests)

**Interfaces:**
- Consumes: `KongConnectForm` (Task 4), `configStore.loadFromKongAdmin` (Task 3).
- Produces: nothing new consumed elsewhere — this is a leaf integration.

- [ ] **Step 1: Write the failing tests**

Add to `src/views/LoadView.test.ts` (change the top imports as shown — add `vi`/`flushPromises`, mock `kongAdminApi`):

```ts
// src/views/LoadView.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'
import LoadView from './LoadView.vue'
import FileDropZone from '../components/FileDropZone.vue'
import { useConfigStore } from '../stores/config'
import * as kongAdminApi from '../lib/kongAdminApi'

vi.mock('../lib/kongAdminApi')

function testRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: LoadView },
      { path: '/browse', component: { template: '<div />' } },
    ],
  })
}

const SAMPLE = `_format_version: "3.0"
services:
- name: svc-a
  host: a.internal
  routes:
  - name: route-a
    paths:
    - /a
consumers:
- username: alice
plugins:
- name: rate-limiting
`

describe('LoadView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  // ... existing two tests unchanged ...

  it('connects to a live Kong Admin API and shows it as the loaded source', async () => {
    vi.mocked(kongAdminApi.getConfig).mockResolvedValue({
      _format_version: '3.0',
      services: [{ host: 'live.internal', name: 'svc-live' }],
    })
    const wrapper = mount(LoadView, { global: { plugins: [testRouter()] } })

    await wrapper.find('input[placeholder="http://localhost:8001"]').setValue('http://localhost:8001')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Connect')!
      .trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Loaded: Kong Admin @ http://localhost:8001')
    expect(wrapper.text()).toContain('Services: 1')
  })

  it('shows a connect error banner instead of crashing when the connection fails', async () => {
    vi.mocked(kongAdminApi.getConfig).mockRejectedValue(new Error('connection refused'))
    const wrapper = mount(LoadView, { global: { plugins: [testRouter()] } })

    await wrapper.find('input[placeholder="http://localhost:8001"]').setValue('http://localhost:8001')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Connect')!
      .trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('connection refused')
    expect(wrapper.text()).not.toContain('Loaded:')
  })
})
```

Note: keep the existing two `it(...)` blocks (`shows the summary card...`, `shows the error banner instead of crashing...`) exactly as-is; only the imports/`beforeEach` change as shown, and the two new tests are appended.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/views/LoadView.test.ts`
Expected: FAIL — no `input[placeholder="http://localhost:8001"]` found (the connect form doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Replace `src/views/LoadView.vue` in full:

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import FileDropZone from '../components/FileDropZone.vue'
import KongConnectForm from '../components/KongConnectForm.vue'
import StatTile from '../components/shared/StatTile.vue'
import { useConfigStore } from '../stores/config'

const configStore = useConfigStore()
const router = useRouter()
const errorMessage = ref<string | null>(null)
const connectErrorMessage = ref<string | null>(null)
const connecting = ref(false)

function onFileSelected({ fileName, text }: { fileName: string; text: string }) {
  try {
    configStore.loadPrimary(fileName, text)
    errorMessage.value = null
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err)
  }
}

async function onConnect({ baseUrl, token }: { baseUrl: string; token: string | undefined }) {
  connecting.value = true
  connectErrorMessage.value = null
  try {
    await configStore.loadFromKongAdmin(baseUrl, token)
  } catch (err) {
    connectErrorMessage.value = err instanceof Error ? err.message : String(err)
  } finally {
    connecting.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-6 p-8">
    <div>
      <h2 class="text-xl font-bold text-ink">Load a Kong declarative config</h2>
      <p class="mt-1 text-sm text-ink-muted">Drop in a YAML file to browse, edit, and compare its entities.</p>
    </div>

    <FileDropZone label="Load your kong-config.yaml" @file-selected="onFileSelected" />

    <div
      v-if="errorMessage"
      class="rounded-xl border border-red-300 bg-red-50 p-3.5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
    >
      Failed to parse YAML: {{ errorMessage }}
    </div>

    <KongConnectForm :connecting="connecting" @connect="onConnect" />

    <div
      v-if="connectErrorMessage"
      class="rounded-xl border border-red-300 bg-red-50 p-3.5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
    >
      Failed to connect to Kong Admin API: {{ connectErrorMessage }}
    </div>

    <div v-if="!configStore.isLoaded" class="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div class="card space-y-2 p-4">
        <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent-secondary">
          <svg viewBox="0 0 20 20" fill="none" class="h-4 w-4">
            <rect x="3" y="4" width="14" height="3.2" rx="1" stroke="currentColor" stroke-width="1.5" />
            <rect x="3" y="9" width="14" height="3.2" rx="1" stroke="currentColor" stroke-width="1.5" />
            <rect x="3" y="14" width="8" height="3.2" rx="1" stroke="currentColor" stroke-width="1.5" />
          </svg>
        </div>
        <h3 class="text-sm font-medium text-ink">Browse</h3>
        <p class="text-xs text-ink-muted">Inspect services, routes, consumers, and global plugins.</p>
      </div>
      <div class="card space-y-2 p-4">
        <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent-secondary">
          <svg viewBox="0 0 20 20" fill="none" class="h-4 w-4">
            <path d="M4 6h9M4 10h6M4 14h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            <path d="M13 13l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>
        <h3 class="text-sm font-medium text-ink">Edit</h3>
        <p class="text-xs text-ink-muted">Use guided forms, or drop into raw YAML with syntax highlighting.</p>
      </div>
      <div class="card space-y-2 p-4">
        <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent-secondary">
          <svg viewBox="0 0 20 20" fill="none" class="h-4 w-4">
            <path d="M7 3v14M7 3L4 6M7 3l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M13 17V3M13 17l3-3M13 17l-3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>
        <h3 class="text-sm font-medium text-ink">Compare</h3>
        <p class="text-xs text-ink-muted">Diff two configs and see exactly what changed.</p>
      </div>
    </div>

    <div v-if="configStore.isLoaded" class="card space-y-5 p-5">
      <div class="flex items-center gap-2.5">
        <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent-secondary">
          <svg viewBox="0 0 16 16" fill="none" class="h-3.5 w-3.5">
            <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
        <h3 class="font-bold text-ink">
          Loaded: <span class="font-mono">{{ configStore.primary?.fileName }}</span>
        </h3>
      </div>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatTile label="Services" :value="configStore.summary.services">
          <template #icon>
            <svg viewBox="0 0 20 20" fill="none" class="h-4 w-4">
              <rect x="3" y="4" width="14" height="3.2" rx="1" stroke="currentColor" stroke-width="1.5" />
              <rect x="3" y="9" width="14" height="3.2" rx="1" stroke="currentColor" stroke-width="1.5" />
              <rect x="3" y="14" width="8" height="3.2" rx="1" stroke="currentColor" stroke-width="1.5" />
            </svg>
          </template>
        </StatTile>
        <StatTile label="Routes" :value="configStore.summary.routes">
          <template #icon>
            <svg viewBox="0 0 20 20" fill="none" class="h-4 w-4">
              <circle cx="4.5" cy="15" r="1.6" stroke="currentColor" stroke-width="1.4" />
              <circle cx="15.5" cy="5" r="1.6" stroke="currentColor" stroke-width="1.4" />
              <path d="M5.7 13.8L14.3 6.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="0.2 2.8" />
            </svg>
          </template>
        </StatTile>
        <StatTile label="Consumers" :value="configStore.summary.consumers">
          <template #icon>
            <svg viewBox="0 0 20 20" fill="none" class="h-4 w-4">
              <circle cx="10" cy="7" r="3" stroke="currentColor" stroke-width="1.5" />
              <path d="M3.5 17c0-3.3 3-6 6.5-6s6.5 2.7 6.5 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
          </template>
        </StatTile>
        <StatTile label="Global plugins" :value="configStore.summary.globalPlugins">
          <template #icon>
            <svg viewBox="0 0 20 20" fill="none" class="h-4 w-4">
              <path
                d="M7 3v3M13 3v3M5 7h10v3a5 5 0 01-5 5 5 5 0 01-5-5V7zM10 15v3"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </template>
        </StatTile>
      </div>

      <button type="button" class="btn-primary" @click="router.push('/browse')">Browse this config</button>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/views/LoadView.test.ts`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Run the full suite**

Run: `npm run test`
Expected: all suites pass.

- [ ] **Step 6: Commit**

```bash
git add src/views/LoadView.vue src/views/LoadView.test.ts
git commit -m "feat: add Kong Admin API connect flow to the Load view"
```

---

### Task 6: PushToKongModal component

**Files:**
- Create: `src/components/PushToKongModal.vue`
- Test: `src/components/PushToKongModal.test.ts`

**Interfaces:**
- Consumes: `useConfigStore` (`primary`, `pushToKongAdmin` — Task 3), `SecretField` (existing).
- Produces: `PushToKongModal` — prop `open: boolean`, emits `close: []` — consumed by Task 7's `AppShell.vue`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/PushToKongModal.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import PushToKongModal from './PushToKongModal.vue'
import { useConfigStore } from '../stores/config'
import * as kongAdminApi from '../lib/kongAdminApi'

vi.mock('../lib/kongAdminApi')

const SAMPLE = `_format_version: "3.0"
services:
- name: svc-a
  host: a.internal
`

describe('PushToKongModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    const store = useConfigStore()
    store.loadPrimary('kong-config.yaml', SAMPLE)
  })

  it('is hidden when closed', () => {
    const wrapper = mount(PushToKongModal, { props: { open: false } })
    expect(wrapper.find('input').exists()).toBe(false)
  })

  it('pre-fills the base URL when the current source is a live Kong connection', async () => {
    const store = useConfigStore()
    vi.mocked(kongAdminApi.getConfig).mockResolvedValue({ _format_version: '3.0', services: [] })
    await store.loadFromKongAdmin('http://localhost:8001')

    const wrapper = mount(PushToKongModal, { props: { open: true } })
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('http://localhost:8001')
  })

  it('leaves the base URL blank when the current source is a file', () => {
    const wrapper = mount(PushToKongModal, { props: { open: true } })
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('')
  })

  it('requires an explicit confirm step before pushing, showing a warning first', async () => {
    const wrapper = mount(PushToKongModal, { props: { open: true } })
    await wrapper.find('input').setValue('http://localhost:8001')

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Push to Kong')!
      .trigger('click')

    expect(wrapper.text()).toContain('replaces the entire declarative config')
    expect(kongAdminApi.setConfig).not.toHaveBeenCalled()

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Confirm push')!
      .trigger('click')
    await flushPromises()

    expect(kongAdminApi.setConfig).toHaveBeenCalledWith('http://localhost:8001', expect.any(Object), undefined)
    expect(wrapper.text()).toContain('Config pushed')
  })

  it('does not advance to the confirm step when the base URL is blank', async () => {
    const wrapper = mount(PushToKongModal, { props: { open: true } })

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Push to Kong')!
      .trigger('click')

    expect(wrapper.text()).not.toContain('replaces the entire declarative config')
  })

  it('shows an inline error and keeps the modal open when the push fails', async () => {
    vi.mocked(kongAdminApi.setConfig).mockRejectedValue(new Error('bad config'))
    const wrapper = mount(PushToKongModal, { props: { open: true } })
    await wrapper.find('input').setValue('http://localhost:8001')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Push to Kong')!
      .trigger('click')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Confirm push')!
      .trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('bad config')
    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('closing without pushing emits close and does not touch the remote instance', async () => {
    const wrapper = mount(PushToKongModal, { props: { open: true } })
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Cancel')!
      .trigger('click')

    expect(wrapper.emitted('close')).toBeTruthy()
    expect(kongAdminApi.setConfig).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/PushToKongModal.test.ts`
Expected: FAIL — `Cannot find module './PushToKongModal.vue'`.

- [ ] **Step 3: Write the implementation**

Create `src/components/PushToKongModal.vue`:

```vue
<script setup lang="ts">
import { ref, watch } from 'vue'
import { useConfigStore } from '../stores/config'
import SecretField from './shared/SecretField.vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const configStore = useConfigStore()

const baseUrl = ref('')
const token = ref<string | undefined>(undefined)
const confirming = ref(false)
const pushing = ref(false)
const errorMessage = ref<string | null>(null)
const success = ref(false)

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    baseUrl.value = configStore.primary?.origin === 'kong-admin' ? configStore.primary.baseUrl ?? '' : ''
    token.value = undefined
    confirming.value = false
    errorMessage.value = null
    success.value = false
  },
)

function requestConfirm() {
  if (!baseUrl.value.trim()) return
  confirming.value = true
}

async function confirmPush() {
  pushing.value = true
  errorMessage.value = null
  try {
    await configStore.pushToKongAdmin(baseUrl.value.trim(), token.value || undefined)
    success.value = true
    confirming.value = false
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err)
  } finally {
    pushing.value = false
  }
}

function close() {
  emit('close')
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
    @click.self="close"
  >
    <div class="card w-full max-w-md space-y-4 p-6">
      <h2 class="text-lg font-semibold text-ink">Push to Kong</h2>

      <template v-if="success">
        <p class="text-sm text-ink">Config pushed to <span class="font-mono">{{ baseUrl }}</span>.</p>
        <div class="flex justify-end pt-1">
          <button type="button" class="btn-primary" @click="close">Done</button>
        </div>
      </template>

      <template v-else>
        <label class="block">
          <span class="field-label">Admin API base URL</span>
          <input v-model="baseUrl" type="text" placeholder="http://localhost:8001" class="input-field font-mono" />
        </label>
        <label class="block">
          <span class="field-label">Admin token (optional)</span>
          <SecretField v-model="token" />
        </label>

        <div v-if="!confirming" class="flex justify-end gap-2 pt-1">
          <button type="button" class="btn-secondary" @click="close">Cancel</button>
          <button type="button" class="btn-primary" :disabled="!baseUrl.trim()" @click="requestConfirm">
            Push to Kong
          </button>
        </div>

        <div v-else class="space-y-3">
          <div class="rounded-xl border border-red-300 bg-red-50 p-3.5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
            This replaces the entire declarative config on <span class="font-mono">{{ baseUrl }}</span>. This cannot
            be undone from here.
          </div>
          <div
            v-if="errorMessage"
            class="rounded-xl border border-red-300 bg-red-50 p-3.5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
          >
            {{ errorMessage }}
          </div>
          <div class="flex justify-end gap-2">
            <button type="button" class="btn-secondary" :disabled="pushing" @click="confirming = false">Back</button>
            <button type="button" class="btn-primary" :disabled="pushing" @click="confirmPush">
              {{ pushing ? 'Pushing…' : 'Confirm push' }}
            </button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/PushToKongModal.test.ts`
Expected: PASS, all 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/PushToKongModal.vue src/components/PushToKongModal.test.ts
git commit -m "feat: add PushToKongModal with two-step confirm"
```

---

### Task 7: Wire Push to Kong into the app header

**Files:**
- Modify: `src/components/layout/AppShell.vue` (all 61 lines — shown in full below)

**Interfaces:**
- Consumes: `PushToKongModal` (Task 6).
- Produces: nothing new consumed elsewhere — this is the final integration point.

- [ ] **Step 1: Modify `src/components/layout/AppShell.vue`**

Replace it in full:

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useConfigStore } from '../../stores/config'
import AppSidebar from './AppSidebar.vue'
import ExportModal from '../ExportModal.vue'
import PushToKongModal from '../PushToKongModal.vue'

const configStore = useConfigStore()
const route = useRoute()
const exportModalOpen = ref(false)
const pushModalOpen = ref(false)
const mobileNavOpen = ref(false)

const pageTitle = computed(() => {
  if (route.path === '/browse') return 'Browse'
  if (route.path === '/compare') return 'Compare'
  return 'Load config'
})
</script>

<template>
  <div class="flex min-h-screen bg-bg">
    <div
      v-if="mobileNavOpen"
      class="fixed inset-0 z-30 bg-black/50 md:hidden"
      @click="mobileNavOpen = false"
    />
    <div
      class="fixed inset-y-0 left-0 z-40 transition-transform duration-200 md:static md:translate-x-0"
      :class="mobileNavOpen ? 'translate-x-0' : '-translate-x-full'"
    >
      <AppSidebar @navigate="mobileNavOpen = false" />
    </div>

    <div class="flex min-w-0 flex-1 flex-col">
      <header class="flex items-center gap-3 border-b border-border bg-surface px-4 py-4 md:px-6">
        <button
          type="button"
          aria-label="Open navigation"
          class="-ml-1 rounded-lg p-1.5 text-ink-muted hover:bg-elevated md:hidden"
          @click="mobileNavOpen = true"
        >
          <svg viewBox="0 0 20 20" fill="none" class="h-5 w-5">
            <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </button>
        <h1 class="text-lg font-bold text-ink">{{ pageTitle }}</h1>
        <div class="ml-auto flex gap-2">
          <button v-if="configStore.isLoaded" type="button" class="btn-secondary" @click="pushModalOpen = true">
            Push to Kong
          </button>
          <button v-if="configStore.isLoaded" type="button" class="btn-primary" @click="exportModalOpen = true">
            Generate new config
          </button>
        </div>
      </header>
      <main class="flex-1 overflow-y-auto">
        <slot />
      </main>
    </div>

    <ExportModal :open="exportModalOpen" @close="exportModalOpen = false" />
    <PushToKongModal :open="pushModalOpen" @close="pushModalOpen = false" />
  </div>
</template>
```

- [ ] **Step 2: Run the full test suite (regression check)**

Run: `npm run test`
Expected: all suites still pass — `AppShell.vue` has no dedicated test file (matching the existing precedent of `ExportModal`'s header wiring, which is also untested at the `AppShell` level; `PushToKongModal` itself is fully covered by Task 6).

- [ ] **Step 3: Type-check and build**

Run: `npx vue-tsc -b`
Run: `npm run build`
Expected: both succeed.

- [ ] **Step 4: Manual sanity check**

Run: `npm run dev -- --port 5183 &`, open the app in a browser.

1. Drop `fixtures/sample-a.yaml` onto the Load view.
2. In the header, click "Push to Kong".
   Expected: modal opens, base URL field is blank (source is a file), "Push to Kong" is disabled until a URL is typed.
3. Click "Cancel".
   Expected: modal closes, no request was made (no network tab activity to a Kong host).

Kill the background dev server when done.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/AppShell.vue
git commit -m "feat: add Push to Kong button to the app header"
```

---

### Task 8: Full-flow verification against a real Kong Admin API, and polish

**Files:**
- Modify: any file where the verification below surfaces a bug.

**Interfaces:**
- Consumes: everything built in Tasks 1–7.
- Produces: a verified, working feature — this closes out the spec's "Manual verification" testing-plan item, using the exact Docker setup already used to ground this plan's design.

- [ ] **Step 1: Run the full automated test suite**

Run: `npm run test`
Expected: every suite passes, including the new `kongConfigTransform`, `kongAdminApi`, `KongConnectForm`, and `PushToKongModal` suites, plus the extended `config` store and `LoadView` suites.

- [ ] **Step 2: Type-check and build**

Run: `npx vue-tsc -b`
Run: `npm run build`
Expected: both succeed with no TypeScript errors.

- [ ] **Step 3: Start a real DB-less Kong instance**

```bash
docker rm -f kong-verify 2>/dev/null
docker run -d --name kong-verify \
  -v "$(pwd)/fixtures/sample-a.yaml:/kong/declarative.yaml:ro" \
  -e "KONG_DATABASE=off" \
  -e "KONG_DECLARATIVE_CONFIG=/kong/declarative.yaml" \
  -e "KONG_ADMIN_LISTEN=0.0.0.0:8001" \
  -p 8001:8001 \
  kong:3.7
sleep 4
docker logs kong-verify 2>&1 | tail -5
```

Expected: logs show `declarative config loaded from /kong/declarative.yaml`.

- [ ] **Step 4: Full manual flow through the running app**

Run: `npm run dev -- --port 5183 &`, open the app in a browser.

1. On the Load view, enter `http://localhost:8001` in "Connect to Kong Admin API" and click "Connect".
   Expected: summary card appears labeled `Loaded: Kong Admin @ http://localhost:8001`, with counts matching `fixtures/sample-a.yaml` (1 consumer, 1 global plugin, and the services/routes it defines); no console errors.
2. Go to Browse → Services, confirm `billing-service`'s route (`billing-route`) is nested under it correctly (not missing, not duplicated) and its plugins render.
3. Go to Consumers, confirm `alice`'s `keyauth_credentials` entry (`abc123key`) renders masked with a reveal toggle.
4. Back in Services, edit `billing-service`'s `port` to a new value.
5. Click "Push to Kong" in the header.
   Expected: base URL is pre-filled with `http://localhost:8001` (current connection). Click "Push to Kong", confirm the warning appears, click "Confirm push".
   Expected: success message "Config pushed to http://localhost:8001."
6. Independently verify the push landed:
   ```bash
   curl -s http://localhost:8001/config | python3 -c "import json,sys; print(json.load(sys.stdin)['config'])" | grep -A2 "name: billing-service"
   ```
   Expected: the `port` value shown matches the edit made in step 4.

Kill the background dev server when done.

- [ ] **Step 5: Tear down the verification container**

```bash
docker rm -f kong-verify
```

- [ ] **Step 6: Confirm no stray files were left behind**

Run: `git status`
Expected: only intentional source changes from this task (if any fixes were needed); no downloaded YAML files or container artifacts.

- [ ] **Step 7: Commit any fixes found during verification**

```bash
git add -A -- ':!*-edited.yaml'
git commit -m "fix: address issues found during Kong Admin API full-flow verification"
```

(Skip this commit entirely if Step 4 found nothing to fix.)
