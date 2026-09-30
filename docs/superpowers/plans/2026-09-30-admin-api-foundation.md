# Admin API Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a typed, tested client for Kong's per-entity Admin API plus an active-connection store that detects Kong's version and database mode and gates writes.

**Architecture:** A low-level `adminFetch` (auth headers, timeout, typed errors) sits under a generic `createEntityClient(resource)` and a registry of Kong's nine collections. A Pinia `connection` store probes `GET /`, exposes `canWrite`, and hands out entity clients whose write methods are guarded. The existing `/config` flow is refactored onto `adminFetch` without changing behaviour.

**Tech Stack:** Vue 3, Pinia, TypeScript, Vitest (jsdom for component tests, node for lib/store tests), `@vue/test-utils`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-30-admin-api-foundation-design.md`

## Global Constraints

- No new dependencies.
- No new UI in this plan (steps 2-5 of the Primate port own UI).
- 20 second request timeout via `AbortController`.
- Error message format stays `Kong Admin API responded <status>: <body>`.
- Error kinds are exactly `network | auth | notFound | conflict | validation | server`; 401/403 auth, 404 notFound, 409 conflict, 400 validation, 5xx server.
- `KongAdminAuth` and `KongAdminApiError` are re-exported from `src/lib/kongAdminApi.ts` so existing imports keep working.
- `connect` does not touch saved connections (`LoadView` already upserts them).
- Write methods are blocked with `ReadOnlyError` when `database === 'off'`; reads are never blocked.
- Existing tests (`kongAdminApi.test.ts`, `LoadView.test.ts`, everything else) keep passing unchanged, except for the additions listed in Task 4.
- Primate's `'__none__'` sentinels are not carried into entity defaults.

## Review Focus

1. A base URL with a path prefix or trailing slash (`http://host/kong-admin/`) must produce exactly one slash between base and path. Pinned in Task 1.
2. A non-JSON error body (an HTML 502 from a reverse proxy) must still raise `KongAdminApiError` with the status, not crash on JSON parsing. Pinned in Task 1.
3. Entity ids or names with spaces, slashes or `%` must be URL-encoded, never break the path or hit another endpoint. Pinned in Task 2.
4. DELETE answers `204` with no body; `remove` must resolve without trying to parse JSON. An empty `tags` array must send no `tags` parameter. Pinned in Task 2.
5. `GET /` with no `configuration` block (hardened or proxied admin) must not crash `connect`; the database mode becomes `'unknown'` and writes stay allowed. A failed reconnect must keep the previous connection. Pinned in Task 3.

---

### Task 1: Low-level HTTP client

**Files:**
- Create: `src/lib/kongAdmin/http.ts`
- Create: `src/lib/kongAdmin/http.test.ts`
- Modify: `src/lib/kongAdminApi.ts` (whole file)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces (all exported from `src/lib/kongAdmin/http.ts`):
  - `type KongAdminAuth = { token?: string; username?: string; password?: string }`
  - `type KongAdminConnection = { baseUrl: string; auth?: KongAdminAuth }`
  - `type KongAdminApiErrorKind = 'network' | 'auth' | 'notFound' | 'conflict' | 'validation' | 'server'`
  - `class KongAdminApiError extends Error { status: number; kind: KongAdminApiErrorKind; kongMessage?: string; fields?: Record<string, unknown> }`
  - `type AdminFetchOptions = { query?: Record<string, string | number | boolean | null | undefined>; body?: unknown }`
  - `adminFetch(conn: KongAdminConnection, method: string, path: string, options?: AdminFetchOptions): Promise<Response>`
  - `adminJson<T>(conn, method, path, options?): Promise<T>`
  - `src/lib/kongAdminApi.ts` keeps exporting `getConfig`, `setConfig`, `KongAdminApiError`, `KongAdminAuth` with unchanged behaviour.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/kongAdmin/http.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { adminFetch, adminJson, KongAdminApiError } from './http'

const conn = { baseUrl: 'http://localhost:8001' }

function okResponse(body: unknown = {}) {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('adminFetch', () => {
  it('joins base URL and path with a single slash and omits null/undefined query values', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    vi.stubGlobal('fetch', fetchMock)

    await adminFetch({ baseUrl: 'http://localhost:8001/' }, 'GET', '/services', {
      query: { size: 10, offset: null, tags: undefined, q: 'a b' },
    })

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8001/services?size=10&q=a+b')
  })

  it('keeps a path prefix on the base URL and still uses exactly one slash', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    vi.stubGlobal('fetch', fetchMock)

    await adminFetch({ baseUrl: 'http://host/kong-admin//' }, 'GET', '/services')

    expect(fetchMock.mock.calls[0][0]).toBe('http://host/kong-admin/services')
  })

  it('sends no query string when there are no query values', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    vi.stubGlobal('fetch', fetchMock)

    await adminFetch(conn, 'GET', '/services', { query: { offset: undefined } })

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8001/services')
  })

  it('sends token and Basic auth headers together, and neither when auth is absent', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    vi.stubGlobal('fetch', fetchMock)

    await adminFetch(
      { baseUrl: conn.baseUrl, auth: { token: 't0k', username: 'admin', password: 'hunter2' } },
      'GET',
      '/',
    )
    const withAuth = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>
    expect(withAuth['Kong-Admin-Token']).toBe('t0k')
    expect(withAuth['Authorization']).toBe(`Basic ${btoa('admin:hunter2')}`)

    await adminFetch(conn, 'GET', '/')
    const without = (fetchMock.mock.calls[1][1] as RequestInit).headers as Record<string, string>
    expect(without['Kong-Admin-Token']).toBeUndefined()
    expect(without['Authorization']).toBeUndefined()
    expect(without['Content-Type']).toBe('application/json')
  })

  it('sends the method and a JSON-stringified body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    vi.stubGlobal('fetch', fetchMock)

    await adminFetch(conn, 'POST', '/services', { body: { name: 'svc', host: 'h' } })

    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ name: 'svc', host: 'h' })
  })

  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [404, 'notFound'],
    [409, 'conflict'],
    [400, 'validation'],
    [500, 'server'],
    [502, 'server'],
  ])('maps HTTP %i to kind %s and keeps the status and message format', async (status, kind) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status, text: async () => 'nope' }))

    const err = await adminFetch(conn, 'GET', '/x').catch((e) => e)

    expect(err).toBeInstanceOf(KongAdminApiError)
    expect(err.kind).toBe(kind)
    expect(err.status).toBe(status)
    expect(err.message).toBe(`Kong Admin API responded ${status}: nope`)
  })

  it("parses Kong's JSON error body into kongMessage and fields", async () => {
    const body = JSON.stringify({
      name: 'schema violation',
      code: 2,
      message: 'schema violation (host: required field missing)',
      fields: { host: 'required field missing' },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => body }))

    const err = await adminFetch(conn, 'POST', '/services').catch((e) => e)

    expect(err.kongMessage).toBe('schema violation (host: required field missing)')
    expect(err.fields).toEqual({ host: 'required field missing' })
  })

  it('still raises KongAdminApiError when the error body is not JSON (HTML from a proxy)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 502, text: async () => '<html>Bad Gateway</html>' }),
    )

    const err = await adminFetch(conn, 'GET', '/services').catch((e) => e)

    expect(err).toBeInstanceOf(KongAdminApiError)
    expect(err.status).toBe(502)
    expect(err.kongMessage).toBeUndefined()
    expect(err.fields).toBeUndefined()
    expect(err.message).toContain('502')
  })

  it('raises a network-kind error with status 0 when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    const err = await adminFetch(conn, 'GET', '/').catch((e) => e)

    expect(err).toBeInstanceOf(KongAdminApiError)
    expect(err.kind).toBe('network')
    expect(err.status).toBe(0)
    expect(err.message).toBe('network down')
  })

  it('aborts after 20 seconds and reports a timeout as a network error', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
          }),
      ),
    )

    const assertion = expect(adminFetch(conn, 'GET', '/')).rejects.toMatchObject({
      kind: 'network',
      status: 0,
      message: expect.stringMatching(/timed out/i),
    })
    await vi.advanceTimersByTimeAsync(20000)
    await assertion
  })
})

describe('adminJson', () => {
  it('returns the parsed JSON body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse({ version: '3.4.1' })))

    await expect(adminJson<{ version: string }>(conn, 'GET', '/')).resolves.toEqual({ version: '3.4.1' })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/kongAdmin/http.test.ts`
Expected: FAIL, cannot resolve `./http`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/kongAdmin/http.ts`:

```ts
export type KongAdminAuth = {
  token?: string
  username?: string
  password?: string
}

export type KongAdminConnection = {
  baseUrl: string
  auth?: KongAdminAuth
}

export type KongAdminApiErrorKind = 'network' | 'auth' | 'notFound' | 'conflict' | 'validation' | 'server'

export class KongAdminApiError extends Error {
  status: number
  kind: KongAdminApiErrorKind
  kongMessage?: string
  fields?: Record<string, unknown>

  constructor(
    message: string,
    init: {
      status?: number
      kind?: KongAdminApiErrorKind
      kongMessage?: string
      fields?: Record<string, unknown>
    } = {},
  ) {
    super(message)
    this.name = 'KongAdminApiError'
    this.status = init.status ?? 0
    this.kind = init.kind ?? 'network'
    this.kongMessage = init.kongMessage
    this.fields = init.fields
  }
}

export type AdminFetchOptions = {
  query?: Record<string, string | number | boolean | null | undefined>
  body?: unknown
}

const TIMEOUT_MS = 20000

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

function buildHeaders(auth?: KongAdminAuth): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (auth?.token) headers['Kong-Admin-Token'] = auth.token
  if (auth?.username) headers['Authorization'] = `Basic ${btoa(`${auth.username}:${auth.password ?? ''}`)}`
  return headers
}

function buildUrl(baseUrl: string, path: string, query?: AdminFetchOptions['query']): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== null && value !== undefined) params.append(key, String(value))
  }
  const queryString = params.toString()
  return `${normalizeBaseUrl(baseUrl)}${path}${queryString ? `?${queryString}` : ''}`
}

function kindForStatus(status: number): KongAdminApiErrorKind {
  if (status === 401 || status === 403) return 'auth'
  if (status === 404) return 'notFound'
  if (status === 409) return 'conflict'
  if (status >= 500) return 'server'
  return 'validation'
}

async function toApiError(response: Response): Promise<KongAdminApiError> {
  const text = await response.text()
  let kongMessage: string | undefined
  let fields: Record<string, unknown> | undefined
  try {
    const parsed = JSON.parse(text) as { message?: unknown; fields?: unknown }
    if (typeof parsed.message === 'string') kongMessage = parsed.message
    if (parsed.fields && typeof parsed.fields === 'object') fields = parsed.fields as Record<string, unknown>
  } catch {
    // Not JSON (for example an HTML error page from a proxy); keep only the raw text.
  }
  return new KongAdminApiError(`Kong Admin API responded ${response.status}: ${text}`, {
    status: response.status,
    kind: kindForStatus(response.status),
    kongMessage,
    fields,
  })
}

export async function adminFetch(
  conn: KongAdminConnection,
  method: string,
  path: string,
  options: AdminFetchOptions = {},
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(buildUrl(conn.baseUrl, path, options.query), {
      method,
      headers: buildHeaders(conn.auth),
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    })
  } catch (err) {
    const message = controller.signal.aborted
      ? `Request timed out after ${TIMEOUT_MS / 1000}s`
      : err instanceof Error
        ? err.message
        : String(err)
    throw new KongAdminApiError(message, { status: 0, kind: 'network' })
  } finally {
    clearTimeout(timer)
  }
  if (!response.ok) throw await toApiError(response)
  return response
}

export async function adminJson<T>(
  conn: KongAdminConnection,
  method: string,
  path: string,
  options?: AdminFetchOptions,
): Promise<T> {
  const response = await adminFetch(conn, method, path, options)
  return (await response.json()) as T
}
```

Replace the whole of `src/lib/kongAdminApi.ts` with:

```ts
import { parseKongConfig, serializeKongConfig } from './yaml'
import { denormalizeKongConfig } from './kongConfigTransform'
import { adminFetch, adminJson } from './kongAdmin/http'
import type { KongAdminAuth } from './kongAdmin/http'
import type { KongConfig } from '../types/kong'

export { KongAdminApiError } from './kongAdmin/http'
export type { KongAdminAuth } from './kongAdmin/http'

export async function getConfig(baseUrl: string, auth?: KongAdminAuth): Promise<KongConfig> {
  const body = await adminJson<{ config: string }>({ baseUrl, auth }, 'GET', '/config')
  const expanded = parseKongConfig(body.config)
  return denormalizeKongConfig(expanded)
}

export async function setConfig(baseUrl: string, config: KongConfig, auth?: KongAdminAuth): Promise<void> {
  const yamlText = serializeKongConfig(config)
  await adminFetch({ baseUrl, auth }, 'POST', '/config', { body: { config: yamlText } })
}
```

- [ ] **Step 4: Run the new and existing tests to verify they pass**

Run: `npx vitest run src/lib/kongAdmin/http.test.ts src/lib/kongAdminApi.test.ts`
Expected: PASS (new http tests and all existing `kongAdminApi` tests).

- [ ] **Step 5: Typecheck and commit**

Run: `npx vue-tsc -b`
Expected: no output.

```bash
git add src/lib/kongAdmin/http.ts src/lib/kongAdmin/http.test.ts src/lib/kongAdminApi.ts
git commit -m "feat: add adminFetch client with typed errors and timeout

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Entity client, registry and write guard

**Files:**
- Create: `src/lib/kongAdmin/entities.ts`
- Create: `src/lib/kongAdmin/entities.test.ts`

**Interfaces:**
- Consumes: `adminFetch`, `adminJson`, `KongAdminConnection` from `./http` (Task 1).
- Produces (all exported from `src/lib/kongAdmin/entities.ts`):
  - `type EntityResourceName = 'services' | 'routes' | 'upstreams' | 'targets' | 'consumers' | 'plugins' | 'certificates' | 'ca_certificates' | 'snis'`
  - `type EntityResourceConfig = { path: string; nested: boolean; defaults: Record<string, unknown> }`
  - `const ENTITY_RESOURCES: Record<EntityResourceName, EntityResourceConfig>`
  - `type ListOptions = { size?: number; offset?: string; tags?: string[] }`
  - `type ListPage<T> = { data: T[]; next: string | null }`
  - `type EntityClient<T> = { list(opts?: ListOptions): Promise<ListPage<T>>; listAll(opts?: Omit<ListOptions, 'offset'>): Promise<T[]>; get(idOrName: string): Promise<T>; create(body: Partial<T>): Promise<T>; update(idOrName: string, patch: Partial<T>): Promise<T>; upsert(idOrName: string, body: Partial<T>): Promise<T>; remove(idOrName: string): Promise<void> }`
  - `createEntityClient<T = Record<string, unknown>>(conn: KongAdminConnection, resource: EntityResourceName, parentId?: string): EntityClient<T>`
  - `class ReadOnlyError extends Error`
  - `guardWrites<T>(client: EntityClient<T>, canWrite: () => boolean): EntityClient<T>`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/kongAdmin/entities.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  createEntityClient,
  guardWrites,
  ReadOnlyError,
  ENTITY_RESOURCES,
  type EntityResourceName,
} from './entities'

const conn = { baseUrl: 'http://localhost:8001' }

function mockFetch(body: unknown = {}) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => '',
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const urlOf = (f: ReturnType<typeof vi.fn>, i = 0) => f.mock.calls[i][0] as string
const initOf = (f: ReturnType<typeof vi.fn>, i = 0) => f.mock.calls[i][1] as RequestInit

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createEntityClient', () => {
  it('lists with size, offset and comma-joined tags, and returns the next offset', async () => {
    const f = mockFetch({ data: [{ id: '1' }], offset: 'abc' })

    const page = await createEntityClient(conn, 'services').list({ size: 5, offset: 'xyz', tags: ['a', 'b'] })

    expect(urlOf(f)).toBe('http://localhost:8001/services?size=5&offset=xyz&tags=a%2Cb')
    expect(initOf(f).method).toBe('GET')
    expect(page).toEqual({ data: [{ id: '1' }], next: 'abc' })
  })

  it('sends no tags parameter for an empty tags array, and next is null on the last page', async () => {
    const f = mockFetch({ data: [], next: null })

    const page = await createEntityClient(conn, 'routes').list({ tags: [] })

    expect(urlOf(f)).toBe('http://localhost:8001/routes')
    expect(page).toEqual({ data: [], next: null })
  })

  it('listAll follows the offset across pages until Kong stops returning one', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: [{ id: '1' }], offset: 'o1' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: [{ id: '2' }], offset: 'o2' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: [{ id: '3' }] }) })
    vi.stubGlobal('fetch', f)

    const all = await createEntityClient(conn, 'consumers').listAll({ size: 1 })

    expect(all).toEqual([{ id: '1' }, { id: '2' }, { id: '3' }])
    expect(f).toHaveBeenCalledTimes(3)
    expect(urlOf(f, 0)).toBe('http://localhost:8001/consumers?size=1')
    expect(urlOf(f, 1)).toBe('http://localhost:8001/consumers?size=1&offset=o1')
    expect(urlOf(f, 2)).toBe('http://localhost:8001/consumers?size=1&offset=o2')
  })

  it('URL-encodes ids and names so they cannot break the path', async () => {
    const f = mockFetch({})

    await createEntityClient(conn, 'services').get('my svc/1%')

    expect(urlOf(f)).toBe('http://localhost:8001/services/my%20svc%2F1%25')
  })

  it('create POSTs, update PATCHes and upsert PUTs, each with a JSON body', async () => {
    const f = mockFetch({})
    const client = createEntityClient(conn, 'services')

    await client.create({ name: 'a' })
    await client.update('a', { host: 'h' })
    await client.upsert('a', { name: 'a', host: 'h' })

    expect(initOf(f, 0).method).toBe('POST')
    expect(urlOf(f, 0)).toBe('http://localhost:8001/services')
    expect(JSON.parse(initOf(f, 0).body as string)).toEqual({ name: 'a' })
    expect(initOf(f, 1).method).toBe('PATCH')
    expect(urlOf(f, 1)).toBe('http://localhost:8001/services/a')
    expect(initOf(f, 2).method).toBe('PUT')
    expect(urlOf(f, 2)).toBe('http://localhost:8001/services/a')
  })

  it('remove DELETEs and resolves on a 204 with no body to parse', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, status: 204, text: async () => '' })
    vi.stubGlobal('fetch', f)

    await expect(createEntityClient(conn, 'plugins').remove('p1')).resolves.toBeUndefined()

    expect(initOf(f).method).toBe('DELETE')
    expect(urlOf(f)).toBe('http://localhost:8001/plugins/p1')
  })

  it('builds nested paths from the parent id, encoded', async () => {
    const f = mockFetch({ data: [] })

    await createEntityClient(conn, 'targets', 'up 1').list()

    expect(urlOf(f)).toBe('http://localhost:8001/upstreams/up%201/targets')
  })

  it('throws at creation when a nested resource has no parent id', () => {
    expect(() => createEntityClient(conn, 'targets')).toThrow(/parentId/)
  })
})

describe('ENTITY_RESOURCES', () => {
  it('has all nine collections, each with a defaults object free of "__none__" sentinels', () => {
    const names = Object.keys(ENTITY_RESOURCES).sort()
    expect(names).toEqual(
      ['ca_certificates', 'certificates', 'consumers', 'plugins', 'routes', 'services', 'snis', 'targets', 'upstreams'].sort(),
    )
    for (const name of names as EntityResourceName[]) {
      expect(typeof ENTITY_RESOURCES[name].defaults).toBe('object')
      expect(JSON.stringify(ENTITY_RESOURCES[name].defaults)).not.toContain('__none__')
    }
  })

  it('ports Primate defaults: service retries 5, target weight 100, route https redirect 426', () => {
    expect(ENTITY_RESOURCES.services.defaults).toMatchObject({ retries: 5, protocol: 'http', port: 80 })
    expect(ENTITY_RESOURCES.targets.defaults).toMatchObject({ target: '', weight: 100 })
    expect(ENTITY_RESOURCES.routes.defaults).toMatchObject({ https_redirect_status_code: 426, strip_path: true })
    expect(ENTITY_RESOURCES.targets.nested).toBe(true)
    expect(ENTITY_RESOURCES.services.nested).toBe(false)
  })
})

describe('guardWrites', () => {
  it('rejects every write with ReadOnlyError and sends no request, but still allows reads', async () => {
    const f = mockFetch({ data: [], id: '1' })
    const guarded = guardWrites(createEntityClient(conn, 'services'), () => false)

    await expect(guarded.create({ name: 'a' })).rejects.toBeInstanceOf(ReadOnlyError)
    await expect(guarded.update('a', {})).rejects.toBeInstanceOf(ReadOnlyError)
    await expect(guarded.upsert('a', {})).rejects.toBeInstanceOf(ReadOnlyError)
    await expect(guarded.remove('a')).rejects.toBeInstanceOf(ReadOnlyError)
    expect(f).not.toHaveBeenCalled()

    await guarded.list()
    await guarded.get('a')
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('reads canWrite lazily, at call time', async () => {
    const f = mockFetch({})
    let writable = false
    const guarded = guardWrites(createEntityClient(conn, 'services'), () => writable)

    await expect(guarded.create({ name: 'a' })).rejects.toBeInstanceOf(ReadOnlyError)
    writable = true
    await guarded.create({ name: 'a' })

    expect(f).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/kongAdmin/entities.test.ts`
Expected: FAIL, cannot resolve `./entities`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/kongAdmin/entities.ts`:

```ts
import { adminFetch, adminJson } from './http'
import type { KongAdminConnection } from './http'

export type EntityResourceName =
  | 'services'
  | 'routes'
  | 'upstreams'
  | 'targets'
  | 'consumers'
  | 'plugins'
  | 'certificates'
  | 'ca_certificates'
  | 'snis'

export type EntityResourceConfig = {
  path: string
  nested: boolean
  defaults: Record<string, unknown>
}

// Defaults are ported from Primate's models. Its '__none__' sentinels for unset
// references are dropped: an unset reference is simply an omitted key.
export const ENTITY_RESOURCES: Record<EntityResourceName, EntityResourceConfig> = {
  services: {
    path: 'services',
    nested: false,
    defaults: {
      name: '',
      enabled: true,
      retries: 5,
      protocol: 'http',
      host: '',
      port: 80,
      path: '/',
      connect_timeout: 60000,
      write_timeout: 60000,
      read_timeout: 60000,
      ca_certificates: [],
      tags: [],
    },
  },
  routes: {
    path: 'routes',
    nested: false,
    defaults: {
      name: '',
      protocols: [],
      methods: [],
      hosts: [],
      paths: [],
      headers: {},
      https_redirect_status_code: 426,
      regex_priority: 0,
      strip_path: true,
      path_handling: 'v0',
      preserve_host: false,
      request_buffering: true,
      response_buffering: true,
      snis: [],
      sources: [],
      destinations: [],
      tags: [],
    },
  },
  upstreams: {
    path: 'upstreams',
    nested: false,
    defaults: {
      name: '',
      algorithm: 'round-robin',
      hash_on: 'none',
      hash_on_value: '',
      hash_fallback: 'none',
      hash_fallback_value: '',
      slots: 10000,
      healthchecks: {
        passive: {
          type: 'http',
          healthy: { successes: 0, http_statuses: [] },
          unhealthy: { tcp_failures: 0, http_statuses: [], http_failures: 0, timeouts: 0 },
        },
        active: {
          http_path: '/',
          timeout: 1,
          concurrency: 10,
          https_sni: '',
          type: 'http',
          headers: {},
          healthy: { interval: 0, http_statuses: [], successes: 0 },
          https_verify_certificate: true,
          unhealthy: { tcp_failures: 0, http_statuses: [], http_failures: 0, interval: 0, timeouts: 0 },
        },
        threshold: 0,
      },
      tags: [],
      host_header: '',
    },
  },
  targets: {
    path: 'upstreams/:parentId/targets',
    nested: true,
    defaults: { target: '', weight: 100, tags: [] },
  },
  consumers: {
    path: 'consumers',
    nested: false,
    defaults: { username: '', custom_id: '', tags: [] },
  },
  plugins: {
    path: 'plugins',
    nested: false,
    defaults: { name: '', config: {}, protocols: ['http', 'https', 'grpc', 'grpcs'], enabled: true, tags: [] },
  },
  certificates: {
    path: 'certificates',
    nested: false,
    defaults: { cert: '', key: '', cert_alt: '', key_alt: '', tags: [], snis: [] },
  },
  ca_certificates: {
    path: 'ca_certificates',
    nested: false,
    defaults: { cert: '', cert_digest: '', tags: [] },
  },
  snis: {
    path: 'snis',
    nested: false,
    defaults: { name: '', tags: [] },
  },
}

export type ListOptions = { size?: number; offset?: string; tags?: string[] }
export type ListPage<T> = { data: T[]; next: string | null }

export type EntityClient<T> = {
  list(opts?: ListOptions): Promise<ListPage<T>>
  listAll(opts?: Omit<ListOptions, 'offset'>): Promise<T[]>
  get(idOrName: string): Promise<T>
  create(body: Partial<T>): Promise<T>
  update(idOrName: string, patch: Partial<T>): Promise<T>
  upsert(idOrName: string, body: Partial<T>): Promise<T>
  remove(idOrName: string): Promise<void>
}

export class ReadOnlyError extends Error {
  constructor() {
    super('Kong is running without a database (DB-less), so entities are read-only.')
    this.name = 'ReadOnlyError'
  }
}

export function createEntityClient<T = Record<string, unknown>>(
  conn: KongAdminConnection,
  resource: EntityResourceName,
  parentId?: string,
): EntityClient<T> {
  const config = ENTITY_RESOURCES[resource]
  if (config.nested && !parentId) {
    throw new Error(`The "${resource}" resource is nested and needs a parentId`)
  }
  const base = `/${config.path.replace(':parentId', encodeURIComponent(parentId ?? ''))}`
  const itemPath = (idOrName: string) => `${base}/${encodeURIComponent(idOrName)}`

  async function list(opts: ListOptions = {}): Promise<ListPage<T>> {
    const body = await adminJson<{ data?: T[]; offset?: string | null }>(conn, 'GET', base, {
      query: {
        size: opts.size,
        offset: opts.offset,
        tags: opts.tags && opts.tags.length > 0 ? opts.tags.join(',') : undefined,
      },
    })
    return { data: body.data ?? [], next: body.offset ?? null }
  }

  async function listAll(opts: Omit<ListOptions, 'offset'> = {}): Promise<T[]> {
    const all: T[] = []
    let offset: string | undefined
    do {
      const page = await list({ ...opts, offset })
      all.push(...page.data)
      offset = page.next ?? undefined
    } while (offset)
    return all
  }

  return {
    list,
    listAll,
    get: (idOrName) => adminJson<T>(conn, 'GET', itemPath(idOrName)),
    create: (body) => adminJson<T>(conn, 'POST', base, { body }),
    update: (idOrName, patch) => adminJson<T>(conn, 'PATCH', itemPath(idOrName), { body: patch }),
    upsert: (idOrName, body) => adminJson<T>(conn, 'PUT', itemPath(idOrName), { body }),
    remove: async (idOrName) => {
      await adminFetch(conn, 'DELETE', itemPath(idOrName))
    },
  }
}

export function guardWrites<T>(client: EntityClient<T>, canWrite: () => boolean): EntityClient<T> {
  const guard =
    <A extends unknown[], R>(fn: (...args: A) => Promise<R>) =>
    (...args: A): Promise<R> =>
      canWrite() ? fn(...args) : Promise.reject(new ReadOnlyError())

  return {
    ...client,
    create: guard(client.create),
    update: guard(client.update),
    upsert: guard(client.upsert),
    remove: guard(client.remove),
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/kongAdmin/entities.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `npx vue-tsc -b`
Expected: no output.

```bash
git add src/lib/kongAdmin/entities.ts src/lib/kongAdmin/entities.test.ts
git commit -m "feat: add generic Kong entity client, registry and write guard

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Connection store

**Files:**
- Create: `src/stores/connection.ts`
- Create: `src/stores/connection.test.ts`

**Interfaces:**
- Consumes: `adminJson`, `KongAdminConnection` from `../lib/kongAdmin/http` (Task 1); `createEntityClient`, `guardWrites`, `EntityClient`, `EntityResourceName` from `../lib/kongAdmin/entities` (Task 2).
- Produces: `useConnectionStore()` with
  - state `active: KongAdminConnection | null`, `info: { version: string; database: string } | null`
  - getters `isConnected: boolean`, `canWrite: boolean`
  - actions `connect(conn: KongAdminConnection): Promise<void>`, `disconnect(): void`, `client<T = Record<string, unknown>>(resource: EntityResourceName, parentId?: string): EntityClient<T>`

- [ ] **Step 1: Write the failing tests**

Create `src/stores/connection.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useConnectionStore } from './connection'
import { KongAdminApiError } from '../lib/kongAdmin/http'
import { ReadOnlyError } from '../lib/kongAdmin/entities'

const conn = { baseUrl: 'http://localhost:8001' }

function rootResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body, text: async () => '' }
}

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useConnectionStore', () => {
  it('connects to a database-backed Kong and allows writes', async () => {
    const f = vi
      .fn()
      .mockResolvedValue(rootResponse({ version: '3.4.1', configuration: { database: 'postgres' } }))
    vi.stubGlobal('fetch', f)
    const store = useConnectionStore()

    await store.connect(conn)

    expect(f.mock.calls[0][0]).toBe('http://localhost:8001/')
    expect(store.isConnected).toBe(true)
    expect(store.canWrite).toBe(true)
    expect(store.info).toEqual({ version: '3.4.1', database: 'postgres' })
  })

  it('treats DB-less Kong as connected but read-only, and blocks writes before any request', async () => {
    const f = vi.fn().mockResolvedValue(rootResponse({ version: '3.4.1', configuration: { database: 'off' } }))
    vi.stubGlobal('fetch', f)
    const store = useConnectionStore()
    await store.connect(conn)

    expect(store.isConnected).toBe(true)
    expect(store.canWrite).toBe(false)
    await expect(store.client('services').create({ name: 'a' })).rejects.toBeInstanceOf(ReadOnlyError)
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('does not crash when GET / has no configuration block; database is unknown and writes stay allowed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(rootResponse({ version: '2.8.1' })))
    const store = useConnectionStore()

    await store.connect(conn)

    expect(store.info).toEqual({ version: '2.8.1', database: 'unknown' })
    expect(store.canWrite).toBe(true)
  })

  it('keeps the previous connection when a later connect fails, and rethrows the error', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(rootResponse({ version: '3.4.1', configuration: { database: 'postgres' } }))
      .mockRejectedValueOnce(new Error('connection refused'))
    vi.stubGlobal('fetch', f)
    const store = useConnectionStore()
    await store.connect(conn)

    await expect(store.connect({ baseUrl: 'http://other:8001' })).rejects.toBeInstanceOf(KongAdminApiError)

    expect(store.active).toEqual(conn)
    expect(store.info?.database).toBe('postgres')
  })

  it('leaves the store disconnected when the very first connect fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')))
    const store = useConnectionStore()

    await expect(store.connect(conn)).rejects.toThrow('connection refused')

    expect(store.isConnected).toBe(false)
    expect(store.canWrite).toBe(false)
  })

  it('disconnect clears the connection and info', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(rootResponse({ version: '3.4.1', configuration: { database: 'postgres' } })),
    )
    const store = useConnectionStore()
    await store.connect(conn)

    store.disconnect()

    expect(store.isConnected).toBe(false)
    expect(store.info).toBeNull()
  })

  it('client() throws when not connected, and otherwise targets the active connection', async () => {
    const store = useConnectionStore()
    expect(() => store.client('services')).toThrow(/not connected/i)

    const f = vi
      .fn()
      .mockResolvedValueOnce(rootResponse({ version: '3.4.1', configuration: { database: 'postgres' } }))
      .mockResolvedValueOnce(rootResponse({ data: [] }))
    vi.stubGlobal('fetch', f)
    await store.connect({ baseUrl: 'http://kong.internal:8001', auth: { token: 'abc' } })

    await store.client('services').list()

    expect(f.mock.calls[1][0]).toBe('http://kong.internal:8001/services')
    const headers = (f.mock.calls[1][1] as RequestInit).headers as Record<string, string>
    expect(headers['Kong-Admin-Token']).toBe('abc')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/stores/connection.test.ts`
Expected: FAIL, cannot resolve `./connection`.

- [ ] **Step 3: Write the implementation**

Create `src/stores/connection.ts`:

```ts
import { defineStore } from 'pinia'
import { adminJson } from '../lib/kongAdmin/http'
import type { KongAdminConnection } from '../lib/kongAdmin/http'
import { createEntityClient, guardWrites } from '../lib/kongAdmin/entities'
import type { EntityClient, EntityResourceName } from '../lib/kongAdmin/entities'

export type KongNodeInfo = {
  version: string
  database: string
}

export const useConnectionStore = defineStore('connection', {
  state: () => ({
    active: null as KongAdminConnection | null,
    info: null as KongNodeInfo | null,
  }),
  getters: {
    isConnected: (state): boolean => state.active !== null,
    canWrite: (state): boolean => state.active !== null && state.info !== null && state.info.database !== 'off',
  },
  actions: {
    async connect(conn: KongAdminConnection) {
      const root = await adminJson<{ version: string; configuration?: { database?: string } }>(conn, 'GET', '/')
      this.active = conn
      this.info = { version: root.version, database: root.configuration?.database ?? 'unknown' }
    },
    disconnect() {
      this.active = null
      this.info = null
    },
    client<T = Record<string, unknown>>(resource: EntityResourceName, parentId?: string): EntityClient<T> {
      if (!this.active) throw new Error('Not connected to a Kong Admin API')
      return guardWrites(createEntityClient<T>(this.active, resource, parentId), () => this.canWrite)
    },
  },
})
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/stores/connection.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `npx vue-tsc -b`
Expected: no output.

```bash
git add src/stores/connection.ts src/stores/connection.test.ts
git commit -m "feat: add connection store with database-mode detection and write gating

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Wire the connection into LoadView

**Files:**
- Modify: `src/views/LoadView.vue` (imports near line 8-10, `onConnect` at lines 31-43)
- Modify: `src/views/LoadView.test.ts` (imports, mocks, `beforeEach`, plus two new tests)

**Interfaces:**
- Consumes: `useConnectionStore().connect({ baseUrl, auth })` (Task 3); `adminJson` from `../lib/kongAdmin/http` (Task 1, mocked in tests).
- Produces: after a successful `/config` load, the connection store is probed in the background. A failed probe never affects the loaded config or the error banner.

- [ ] **Step 1: Write the failing tests**

In `src/views/LoadView.test.ts`:

Add to the imports and mocks (after the existing `import * as kongAdminApi ...` and `vi.mock('../lib/kongAdminApi')` lines):

```ts
import { useConnectionStore } from '../stores/connection'
import { adminJson } from '../lib/kongAdmin/http'

vi.mock('../lib/kongAdmin/http', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/kongAdmin/http')>()),
  adminJson: vi.fn(),
}))
```

In the existing `beforeEach`, after `vi.clearAllMocks()`, add:

```ts
    vi.mocked(adminJson).mockResolvedValue({ version: '3.4.0', configuration: { database: 'off' } })
```

Add these two tests inside the `describe('LoadView', ...)` block, directly after the `'auto-saves the connection after a successful connect'` test:

```ts
  it('probes the Kong node after connecting so live editing can be gated on database mode', async () => {
    vi.mocked(kongAdminApi.getConfig).mockResolvedValue({ _format_version: '3.0', services: [] })
    const wrapper = mount(LoadView, { global: { plugins: [testRouter()] } })

    await wrapper.find('input[placeholder="http://localhost:8001"]').setValue('http://localhost:8001')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Connect')!
      .trigger('click')
    await flushPromises()

    const connectionStore = useConnectionStore()
    expect(connectionStore.isConnected).toBe(true)
    expect(connectionStore.canWrite).toBe(false)
    expect(connectionStore.active?.baseUrl).toBe('http://localhost:8001')
  })

  it('still shows the loaded config, with no error banner, when the node probe fails', async () => {
    vi.mocked(kongAdminApi.getConfig).mockResolvedValue({
      _format_version: '3.0',
      services: [{ host: 'live.internal', name: 'svc-live' }],
    })
    vi.mocked(adminJson).mockRejectedValue(new Error('probe failed'))
    const wrapper = mount(LoadView, { global: { plugins: [testRouter()] } })

    await wrapper.find('input[placeholder="http://localhost:8001"]').setValue('http://localhost:8001')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Connect')!
      .trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Loaded: Kong Admin @ http://localhost:8001')
    expect(wrapper.text()).not.toContain('Failed to connect')
    expect(useConnectionStore().isConnected).toBe(false)
  })
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npx vitest run src/views/LoadView.test.ts`
Expected: the two new tests FAIL (`isConnected` is false in the first because `LoadView` does not call `connect` yet); the existing tests still PASS.

- [ ] **Step 3: Write the implementation**

In `src/views/LoadView.vue`, add the import next to the other store imports:

```ts
import { useConnectionStore } from '../stores/connection'
```

Add next to the other store instances (after `const savedConnectionsStore = useSavedConnectionsStore()`):

```ts
const connectionStore = useConnectionStore()
```

In `onConnect`, after the `savedConnectionsStore.upsert(...)` line and before `formExpanded.value = false`, add:

```ts
    // Probe the node in the background so live editing can be enabled; a failed
    // probe must not affect the config that was just loaded.
    void connectionStore.connect({ baseUrl, auth }).catch(() => undefined)
```

- [ ] **Step 4: Run the full suite and typecheck**

Run: `npx vitest run && npx vue-tsc -b`
Expected: all tests PASS (the previous 150 plus the new ones from Tasks 1-4), typecheck prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/views/LoadView.vue src/views/LoadView.test.ts
git commit -m "feat: probe the Kong node after connect to detect database mode

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-review notes

- **Spec coverage:** section 1 (`adminFetch`, error kinds, refactor) is Task 1; section 2 (entity client, registry, nested paths, defaults) is Task 2; section 3 (store, capability detection, `LoadView` hookup) is Tasks 3-4; section 4 (write guard) is Task 2 (`guardWrites`) used by Task 3 (`client`); section 5 (testing) is inline in each task.
- **Type consistency:** `KongAdminConnection`, `EntityClient<T>`, `EntityResourceName`, `guardWrites`, `ReadOnlyError` and `adminJson` have the same names and signatures everywhere they are used.
- **Deviations from the spec, already applied to it:** `adminFetch` returns `Response` with `adminJson` alongside; `client()` is an action; `connect` does not upsert saved connections.
