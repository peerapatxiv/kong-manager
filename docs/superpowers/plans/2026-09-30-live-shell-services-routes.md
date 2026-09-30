# Live Section: shell, services and routes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Live section where services and routes of a connected Kong Admin API can be listed, searched, created, edited, enabled/disabled (services) and deleted.

**Architecture:** Pure form modules (`src/lib/live/serviceForm.ts`, `routeForm.ts`) hold Primate's validation and payload rules. A `useLiveEntities` composable wraps the connection store's guarded entity client with paging, stale-response protection and error mapping. Thin views (`LiveServicesView`, `LiveRoutesView`) sit inside a `LiveGate` that handles the not-connected and DB-less states.

**Tech Stack:** Vue 3 (script setup), Pinia, vue-router, TypeScript, Tailwind classes already defined in `src/style.css`, Vitest with jsdom and `@vue/test-utils`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-30-live-shell-services-routes-design.md` (foundation it builds on: `docs/superpowers/specs/2026-09-30-admin-api-foundation-design.md`)

## Global Constraints

- No new dependencies. No changes to Browse, Compare, Load, Export or Push behaviour.
- Existing tests keep passing unchanged. In particular `AppSidebar.test.ts` asserts that before anything is loaded the only anchor is `Load`, so Live links are disabled `<span>` placeholders until a connection exists (like Browse and Compare).
- Write controls (New, Save, Delete, enabled toggles, all form inputs) are disabled when `connection.canWrite` is false.
- Client-side validation blocks Save and sends no request. Kong errors keep the form open and show in the banner.
- Create sends no `null` values. Update (PATCH) sends `null` for cleared fields so they are cleared on the server.
- Live writes always target the plain resource (`/services/:id`, `/routes/:id`); `service_routes` is used only to list a service's routes.
- Every Live view test stubs `fetch` and never touches the network.
- A browser check is not possible (Chrome extension declined); the final report says so.

## Spec deviations decided while planning (spec updated in Task 0)

1. Live sidebar links are disabled placeholders until connected, not always-visible links (existing sidebar test).
2. Route `headers` are edited as `Name: value1, value2` lines in a `ValueListEditor` (`RouteForm.headers: string[]`), not `DynamicKeyValueEditor`, which models arbitrary key/value config and does not fit header-name to value-list.
3. `udp` is added to route protocols and to the stream family (Kong supports it; Primate omitted it).
4. `ProtocolPicker` gets an optional `options` prop (default: existing `KONG_PROTOCOLS`) so routes can offer `tls_passthrough`.
5. `useLiveEntities` takes `options.listVia` (list through a different resource such as `service_routes`); all other calls use the plain resource.
6. Field clearing is computed per protocol: a field is sent as `null` when every selected protocol excludes it (for example `methods` for `grpc`, `sources`/`destinations` for `tls_passthrough`), which is Primate's exclusive-field rule applied to the selected set.

## Review Focus

1. Whitespace-only or padded `host`, `name` and list entries must be trimmed, never sent padded or as empty strings. Pinned in Tasks 2 and 3.
2. Route address entries: `ip:` (empty port), port `0` and `65536`, bare IPv6 `::1`, bracketed `[::1]:80`, and CIDR `10.0.0.0/8`. Pinned in Task 3.
3. Clearing the last value of a field on an existing entity must send `null`/empty on PATCH, while create must never send `null`. Pinned in Tasks 2 and 3.
4. Pressing Load more twice quickly, or reloading while a page is in flight, must not duplicate items or let a stale response overwrite newer data. Pinned in Task 4.
5. Switching selection, pressing New, or pressing Discard with unsaved edits must ask first, and cancelling must keep the edits. Pinned in Tasks 6 and 7.

---

### Task 0: Align the spec with the plan's deviations

**Files:**
- Modify: `docs/superpowers/specs/2026-09-30-live-shell-services-routes-design.md`

**Interfaces:**
- Consumes: nothing.
- Produces: a spec that matches the six deviations above.

- [ ] **Step 1: Apply the spec edits**

Run:

```bash
python3 - <<'E'
p = 'docs/superpowers/specs/2026-09-30-live-shell-services-routes-design.md'
s = open(p).read()

def rep(a, b):
    global s
    assert a in s, a
    s = s.replace(a, b, 1)

rep("- Sidebar: a \"Live\" group with Services and Routes links. Links are always visible; the views handle the unconnected state.",
    "- Sidebar: a \"Live\" group with Services and Routes. Like Browse and Compare, the links are disabled placeholders until a connection exists; the views still handle direct navigation while unconnected.")
rep("`headers` (`{ name: string; values: string[] }[]`)",
    "`headers` (`string[]`, one `Name: value1, value2` line per header)")
rep("`DynamicKeyValueEditor` for headers", "a `ValueListEditor` of `Name: value1, value2` lines for headers")
rep("fields that are mutually exclusive with the selected protocols are sent as `null`: `hosts`, `paths`, `methods` and `headers` are cleared when only stream protocols (`tcp`, `tls`, `tls_passthrough`) are selected, and `sources` and `destinations` are cleared when only http-family protocols (`http`, `https`, `grpc`, `grpcs`) are selected (`snis` is never cleared);",
    "fields that every selected protocol excludes are sent as `null`, from the set `methods`, `hosts`, `paths`, `headers`, `sources`, `destinations` (for example `methods` is cleared for `grpc`, and `sources`/`destinations` for `tls_passthrough`); `snis` is never cleared;")
rep("or the stream family `tcp`/`tls`/`tls_passthrough`", "or the stream family `tcp`/`tls`/`tls_passthrough`/`udp`")
rep("A `ReadOnlyError` is surfaced the same way.",
    "A `ReadOnlyError` is surfaced the same way. `options.listVia` lets the list call go through another resource (used to list a service's routes via `service_routes`) while create, save, remove and toggle always use the plain resource.")
rep("`ProtocolPicker`, `MethodPicker`", "`ProtocolPicker` (given a new optional `options` prop so routes can offer `tls_passthrough`), `MethodPicker`")
open(p, 'w').write(s)
E
git diff --stat docs/superpowers/specs
```

Expected: one file changed. (If the script raises an `AssertionError`, the spec wording drifted: edit the sentence it names by hand to match the deviation list, then re-run.)

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-09-30-live-shell-services-routes-design.md
git commit -m "docs: align live services/routes spec with planning decisions

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 1: `service_routes` resource

**Files:**
- Modify: `src/lib/kongAdmin/entities.ts`
- Modify: `src/lib/kongAdmin/entities.test.ts`

**Interfaces:**
- Consumes: existing `ENTITY_RESOURCES`, `createEntityClient` (foundation).
- Produces: `EntityResourceName` gains `'service_routes'`; `ENTITY_RESOURCES.service_routes = { path: 'services/:parentId/routes', nested: true, defaults: <same as routes> }`.

- [ ] **Step 1: Write the failing tests**

In `src/lib/kongAdmin/entities.test.ts`, run:

```bash
python3 - <<'E'
p = 'src/lib/kongAdmin/entities.test.ts'
s = open(p).read()

def rep(a, b):
    global s
    assert a in s, a
    s = s.replace(a, b, 1)

rep("has all nine collections", "has all ten collections")
rep("['ca_certificates', 'certificates', 'consumers', 'plugins', 'routes', 'services', 'snis', 'targets', 'upstreams'].sort()",
    "['ca_certificates', 'certificates', 'consumers', 'plugins', 'routes', 'service_routes', 'services', 'snis', 'targets', 'upstreams'].sort()")
rep("  it('throws at creation when a nested resource has no parent id', () => {",
    """  it('lists a service\\'s routes through the nested service_routes path, parent id encoded', async () => {
    const f = mockFetch({ data: [] })

    await createEntityClient(conn, 'service_routes', 'svc 1').list()

    expect(urlOf(f)).toBe('http://localhost:8001/services/svc%201/routes')
  })

  it('gives service_routes the same defaults as routes', () => {
    expect(ENTITY_RESOURCES.service_routes.nested).toBe(true)
    expect(ENTITY_RESOURCES.service_routes.defaults).toEqual(ENTITY_RESOURCES.routes.defaults)
  })

  it('throws at creation when a nested resource has no parent id', () => {""")
open(p, 'w').write(s)
E
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/kongAdmin/entities.test.ts`
Expected: FAIL (the collection-list test and the two new tests; `service_routes` does not exist).

- [ ] **Step 3: Write the implementation**

In `src/lib/kongAdmin/entities.ts`, run:

```bash
python3 - <<'E'
p = 'src/lib/kongAdmin/entities.ts'
s = open(p).read()

def rep(a, b):
    global s
    assert a in s, a
    s = s.replace(a, b, 1)

rep("  | 'routes'\n", "  | 'routes'\n  | 'service_routes'\n")

rep("// Defaults are ported from Primate's models.", """function routeDefaults(): Record<string, unknown> {
  return {
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
  }
}

// Defaults are ported from Primate's models.""")

start = s.index("  routes: {\n    path: 'routes',")
end = s.index("  upstreams: {")
s = s[:start] + """  routes: {
    path: 'routes',
    nested: false,
    defaults: routeDefaults(),
  },
  service_routes: {
    path: 'services/:parentId/routes',
    nested: true,
    defaults: routeDefaults(),
  },
""" + s[end:]
open(p, 'w').write(s)
E
```

- [ ] **Step 4: Run the tests and typecheck to verify they pass**

Run: `npx vitest run src/lib/kongAdmin && npx vue-tsc -b`
Expected: all `src/lib/kongAdmin` tests PASS; typecheck prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kongAdmin/entities.ts src/lib/kongAdmin/entities.test.ts
git commit -m "feat: add nested service_routes resource

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Service form module

**Files:**
- Create: `src/lib/live/serviceForm.ts`
- Create: `src/lib/live/serviceForm.test.ts`

**Interfaces:**
- Consumes: `ENTITY_RESOURCES.services.defaults` from `../kongAdmin/entities` (foundation).
- Produces (all exported from `src/lib/live/serviceForm.ts`):
  - `type ServiceForm = { name: string; protocol: string; host: string; port: number | ''; path: string; enabled: boolean; retries: number | ''; connect_timeout: number | ''; write_timeout: number | ''; read_timeout: number | ''; tags: string[]; client_certificate: string; ca_certificates: string[]; tls_verify: 'inherit' | 'true' | 'false'; tls_verify_depth: number | '' }`
  - `const SERVICE_PROTOCOLS: readonly string[]` (`http, https, grpc, grpcs, tcp, udp, tls, tls_passthrough`)
  - `serviceProtocolUsesPath(protocol: string): boolean` and `serviceProtocolUsesTls(protocol: string): boolean`
  - `fromEntity(entity: Record<string, unknown>): ServiceForm`
  - `newServiceForm(): ServiceForm`
  - `validateService(form: ServiceForm): string[]`
  - `toPayload(form: ServiceForm, mode: 'create' | 'update'): Record<string, unknown>`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/live/serviceForm.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  fromEntity,
  newServiceForm,
  serviceProtocolUsesPath,
  serviceProtocolUsesTls,
  toPayload,
  validateService,
} from './serviceForm'

const base = () => ({ ...newServiceForm(), host: 'api.internal' })

describe('newServiceForm', () => {
  it('starts from the Primate defaults', () => {
    expect(newServiceForm()).toMatchObject({
      name: '',
      protocol: 'http',
      host: '',
      port: 80,
      path: '/',
      enabled: true,
      retries: 5,
      tls_verify: 'inherit',
      tls_verify_depth: '',
      client_certificate: '',
      ca_certificates: [],
      tags: [],
    })
  })
})

describe('protocol helpers', () => {
  it('path applies to http, https and tls_passthrough only', () => {
    expect(['http', 'https', 'tls_passthrough'].every(serviceProtocolUsesPath)).toBe(true)
    expect(['grpc', 'grpcs', 'tcp', 'udp', 'tls'].some(serviceProtocolUsesPath)).toBe(false)
  })

  it('TLS verification fields apply to https only', () => {
    expect(serviceProtocolUsesTls('https')).toBe(true)
    expect(['http', 'grpc', 'grpcs', 'tcp', 'udp', 'tls', 'tls_passthrough'].some(serviceProtocolUsesTls)).toBe(false)
  })
})

describe('validateService', () => {
  it('accepts a protocol and a host', () => {
    expect(validateService(base())).toEqual([])
  })

  it.each([
    ['empty host', { host: '' }],
    ['whitespace-only host', { host: '   ' }],
    ['empty protocol', { protocol: '' }],
  ])('rejects %s with the Primate message', (_label, patch) => {
    expect(validateService({ ...base(), ...patch })).toEqual(['Please provide a valid protocol and host combination.'])
  })
})

describe('toPayload', () => {
  it('trims strings and omits an empty name', () => {
    const padded = toPayload({ ...base(), name: '  billing  ', host: '  api.internal ' }, 'update')
    expect(padded.name).toBe('billing')
    expect(padded.host).toBe('api.internal')

    const unnamed = toPayload({ ...base(), name: '   ' }, 'update')
    expect(unnamed).not.toHaveProperty('name')
  })

  it('on update clears TLS fields for http so a PATCH removes them', () => {
    expect(toPayload(base(), 'update')).toMatchObject({
      protocol: 'http',
      host: 'api.internal',
      port: 80,
      path: '/',
      client_certificate: null,
      ca_certificates: null,
      tls_verify: null,
      tls_verify_depth: null,
    })
  })

  it('maps https TLS fields: certificate id object, cleaned ca list, tri-state verify, depth', () => {
    const payload = toPayload(
      {
        ...base(),
        protocol: 'https',
        client_certificate: ' c1 ',
        ca_certificates: ['x', ' '],
        tls_verify: 'false',
        tls_verify_depth: 3,
      },
      'update',
    )
    expect(payload).toMatchObject({
      client_certificate: { id: 'c1' },
      ca_certificates: ['x'],
      tls_verify: false,
      tls_verify_depth: 3,
    })
    expect(toPayload({ ...base(), protocol: 'https', tls_verify: 'true' }, 'update').tls_verify).toBe(true)
  })

  it('https with nothing set clears certificate, ca list, verify and depth', () => {
    expect(toPayload({ ...base(), protocol: 'https' }, 'update')).toMatchObject({
      client_certificate: null,
      ca_certificates: null,
      tls_verify: null,
      tls_verify_depth: null,
    })
  })

  it('clears path for protocols that do not use it, and keeps it for tls_passthrough', () => {
    expect(toPayload({ ...base(), protocol: 'grpc' }, 'update').path).toBeNull()
    expect(toPayload({ ...base(), protocol: 'tcp' }, 'update').path).toBeNull()
    expect(toPayload({ ...base(), protocol: 'tls_passthrough' }, 'update').path).toBe('/')
  })

  it('an empty or whitespace path on http becomes null on update', () => {
    expect(toPayload({ ...base(), path: '  ' }, 'update').path).toBeNull()
  })

  it('create never sends null values', () => {
    const payload = toPayload(base(), 'create')
    expect(Object.values(payload).some((v) => v === null || v === undefined)).toBe(false)
    expect(payload).toMatchObject({ protocol: 'http', host: 'api.internal' })
    expect(payload).not.toHaveProperty('client_certificate')
  })

  it('omits empty numeric fields instead of sending empty strings', () => {
    const payload = toPayload({ ...base(), port: '', retries: '' }, 'update')
    expect(payload).not.toHaveProperty('port')
    expect(payload).not.toHaveProperty('retries')
  })

  it('trims tags and drops blank ones', () => {
    expect(toPayload({ ...base(), tags: [' a ', '', '  '] }, 'update').tags).toEqual(['a'])
  })
})

describe('fromEntity', () => {
  it('maps a Kong https service into the form', () => {
    const form = fromEntity({
      id: 's1',
      name: 'a',
      protocol: 'https',
      host: 'h',
      port: 443,
      client_certificate: { id: 'c1' },
      tls_verify: false,
      tls_verify_depth: null,
      ca_certificates: ['x'],
      tags: ['t'],
    })
    expect(form).toMatchObject({
      name: 'a',
      protocol: 'https',
      host: 'h',
      port: 443,
      client_certificate: 'c1',
      tls_verify: 'false',
      tls_verify_depth: '',
      ca_certificates: ['x'],
      tags: ['t'],
    })
  })

  it('round-trips an https service back to the same TLS payload', () => {
    const payload = toPayload(
      fromEntity({
        protocol: 'https',
        host: 'h',
        client_certificate: { id: 'c1' },
        tls_verify: false,
        tls_verify_depth: null,
        ca_certificates: ['x'],
      }),
      'update',
    )
    expect(payload).toMatchObject({
      client_certificate: { id: 'c1' },
      tls_verify: false,
      tls_verify_depth: null,
      ca_certificates: ['x'],
    })
  })

  it('tolerates missing fields, defaulting the protocol to http and enabled to true', () => {
    const form = fromEntity({ host: 'h' })
    expect(form.protocol).toBe('http')
    expect(form.enabled).toBe(true)
    expect(form.port).toBe('')
    expect(form.tls_verify).toBe('inherit')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/live/serviceForm.test.ts`
Expected: FAIL, cannot resolve `./serviceForm`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/live/serviceForm.ts`:

```ts
import { ENTITY_RESOURCES } from '../kongAdmin/entities'

export type ServiceForm = {
  name: string
  protocol: string
  host: string
  port: number | ''
  path: string
  enabled: boolean
  retries: number | ''
  connect_timeout: number | ''
  write_timeout: number | ''
  read_timeout: number | ''
  tags: string[]
  client_certificate: string
  ca_certificates: string[]
  tls_verify: 'inherit' | 'true' | 'false'
  tls_verify_depth: number | ''
}

export const SERVICE_PROTOCOLS = ['http', 'https', 'grpc', 'grpcs', 'tcp', 'udp', 'tls', 'tls_passthrough'] as const

const PATH_PROTOCOLS: readonly string[] = ['http', 'https', 'tls_passthrough']
const NUMERIC_FIELDS = ['port', 'retries', 'connect_timeout', 'write_timeout', 'read_timeout'] as const

export function serviceProtocolUsesPath(protocol: string): boolean {
  return PATH_PROTOCOLS.includes(protocol)
}

export function serviceProtocolUsesTls(protocol: string): boolean {
  return protocol === 'https'
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')
const numberOrEmpty = (value: unknown): number | '' => (typeof value === 'number' ? value : '')
const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

function cleanList(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean)
}

export function fromEntity(entity: Record<string, unknown>): ServiceForm {
  const certificate = entity.client_certificate as { id?: unknown } | null | undefined
  return {
    name: text(entity.name),
    protocol: text(entity.protocol) || 'http',
    host: text(entity.host),
    port: numberOrEmpty(entity.port),
    path: text(entity.path),
    enabled: typeof entity.enabled === 'boolean' ? entity.enabled : true,
    retries: numberOrEmpty(entity.retries),
    connect_timeout: numberOrEmpty(entity.connect_timeout),
    write_timeout: numberOrEmpty(entity.write_timeout),
    read_timeout: numberOrEmpty(entity.read_timeout),
    tags: stringList(entity.tags),
    client_certificate: typeof certificate?.id === 'string' ? certificate.id : '',
    ca_certificates: stringList(entity.ca_certificates),
    tls_verify: entity.tls_verify === true ? 'true' : entity.tls_verify === false ? 'false' : 'inherit',
    tls_verify_depth: numberOrEmpty(entity.tls_verify_depth),
  }
}

export function newServiceForm(): ServiceForm {
  return fromEntity(ENTITY_RESOURCES.services.defaults)
}

export function validateService(form: ServiceForm): string[] {
  if (!form.protocol || form.host.trim() === '') {
    return ['Please provide a valid protocol and host combination.']
  }
  return []
}

export function toPayload(form: ServiceForm, mode: 'create' | 'update'): Record<string, unknown> {
  const tls = serviceProtocolUsesTls(form.protocol)
  const certificate = form.client_certificate.trim()
  const caCertificates = cleanList(form.ca_certificates)

  const payload: Record<string, unknown> = {
    protocol: form.protocol,
    host: form.host.trim(),
    enabled: form.enabled,
    tags: cleanList(form.tags),
    path: serviceProtocolUsesPath(form.protocol) ? form.path.trim() || null : null,
    client_certificate: tls && certificate ? { id: certificate } : null,
    ca_certificates: tls && caCertificates.length > 0 ? caCertificates : null,
    tls_verify: tls ? { inherit: null, true: true, false: false }[form.tls_verify] : null,
    tls_verify_depth: tls && form.tls_verify_depth !== '' ? form.tls_verify_depth : null,
  }

  const name = form.name.trim()
  if (name) payload.name = name
  for (const key of NUMERIC_FIELDS) {
    if (form[key] !== '') payload[key] = form[key]
  }

  if (mode === 'create') {
    return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== null && value !== undefined))
  }
  return payload
}
```

- [ ] **Step 4: Run the tests and typecheck to verify they pass**

Run: `npx vitest run src/lib/live/serviceForm.test.ts && npx vue-tsc -b`
Expected: PASS; typecheck prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/live/serviceForm.ts src/lib/live/serviceForm.test.ts
git commit -m "feat: add service form module with Primate validation and payload rules

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Route form module

**Files:**
- Create: `src/lib/live/routeForm.ts`
- Create: `src/lib/live/routeForm.test.ts`

**Interfaces:**
- Consumes: `ENTITY_RESOURCES.routes.defaults` from `../kongAdmin/entities`.
- Produces (all exported from `src/lib/live/routeForm.ts`):
  - `type RouteForm = { name: string; protocols: string[]; methods: string[]; hosts: string[]; paths: string[]; headers: string[]; snis: string[]; sources: string[]; destinations: string[]; https_redirect_status_code: number | ''; regex_priority: number | ''; strip_path: boolean; path_handling: string; preserve_host: boolean; request_buffering: boolean; response_buffering: boolean; tags: string[]; service: string }`
  - `const ROUTE_PROTOCOLS: readonly string[]` (`http, https, grpc, grpcs, tcp, tls, tls_passthrough, udp`)
  - `type RouteFamily = 'http' | 'grpc' | 'stream'` and `routeFamily(protocols: string[]): RouteFamily | null` (null when no protocol is selected or the selection mixes families)
  - `parseAddress(entry: string): { ip: string; port?: number } | null`
  - `parseHeaderLine(line: string): { name: string; values: string[] } | null`
  - `fromEntity(entity: Record<string, unknown>): RouteForm`, `newRouteForm(): RouteForm`
  - `validateRoute(form: RouteForm): string[]`
  - `toPayload(form: RouteForm, mode: 'create' | 'update'): Record<string, unknown>`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/live/routeForm.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  fromEntity,
  newRouteForm,
  parseAddress,
  parseHeaderLine,
  routeFamily,
  toPayload,
  validateRoute,
} from './routeForm'

const http = (patch = {}) => ({ ...newRouteForm(), protocols: ['http'], paths: ['/a'], ...patch })

describe('newRouteForm', () => {
  it('starts from the Primate defaults', () => {
    expect(newRouteForm()).toMatchObject({
      name: '',
      protocols: [],
      https_redirect_status_code: 426,
      regex_priority: 0,
      strip_path: true,
      path_handling: 'v0',
      preserve_host: false,
      request_buffering: true,
      response_buffering: true,
      service: '',
      headers: [],
    })
  })
})

describe('routeFamily', () => {
  it('maps protocol selections to one family, or null when empty or mixed', () => {
    expect(routeFamily(['http', 'https'])).toBe('http')
    expect(routeFamily(['grpc'])).toBe('grpc')
    expect(routeFamily(['tcp', 'tls', 'tls_passthrough', 'udp'])).toBe('stream')
    expect(routeFamily([])).toBeNull()
    expect(routeFamily(['http', 'tcp'])).toBeNull()
  })
})

describe('parseAddress', () => {
  it.each([
    ['10.0.0.1', { ip: '10.0.0.1' }],
    ['10.0.0.1:80', { ip: '10.0.0.1', port: 80 }],
    ['10.0.0.1:65535', { ip: '10.0.0.1', port: 65535 }],
    ['10.0.0.0/8', { ip: '10.0.0.0/8' }],
    ['[::1]', { ip: '::1' }],
    ['[::1]:80', { ip: '::1', port: 80 }],
    ['  10.0.0.1:1  ', { ip: '10.0.0.1', port: 1 }],
  ])('accepts %s', (entry, expected) => {
    expect(parseAddress(entry)).toEqual(expected)
  })

  it.each(['', '   ', '10.0.0.1:', '10.0.0.1:0', '10.0.0.1:65536', '10.0.0.1:abc', '::1', ':80', '[::1]:', '[]'])(
    'rejects %j',
    (entry) => {
      expect(parseAddress(entry)).toBeNull()
    },
  )
})

describe('parseHeaderLine', () => {
  it('parses "Name: v1, v2" into a name and trimmed values', () => {
    expect(parseHeaderLine('X-Env: dev,  prod ')).toEqual({ name: 'X-Env', values: ['dev', 'prod'] })
  })

  it.each(['novalue', 'X: ', ': v', '  ', 'X: , ,'])('rejects %j', (line) => {
    expect(parseHeaderLine(line)).toBeNull()
  })
})

describe('validateRoute', () => {
  it('accepts an http route with a path', () => {
    expect(validateRoute(http())).toEqual([])
  })

  it('requires at least one protocol', () => {
    expect(validateRoute(newRouteForm())).toEqual(['Please check at least one protocol from the list.'])
  })

  it('rejects mixing protocol families and reports only that', () => {
    expect(validateRoute(http({ protocols: ['http', 'tcp'] }))).toEqual([
      'Choose protocols from one family: HTTP/HTTPS, GRPC/GRPCS, or TCP/TLS/TLS passthrough/UDP.',
    ])
  })

  it('requires one of the protocol\'s field groups', () => {
    expect(validateRoute(http({ paths: [] }))).toEqual([
      'At least one of methods, hosts, headers, paths is required, if HTTP is selected.',
    ])
    expect(validateRoute({ ...newRouteForm(), protocols: ['tcp'] })).toEqual([
      'At least one of sources, destinations is required, if TCP is selected.',
    ])
    expect(validateRoute({ ...newRouteForm(), protocols: ['tls_passthrough'] })).toEqual([
      'At least one of snis is required, if TLS_PASSTHROUGH is selected.',
    ])
    expect(validateRoute({ ...newRouteForm(), protocols: ['grpc'], methods: ['GET'] })).toEqual([
      'At least one of hosts, headers, paths is required, if GRPC is selected.',
    ])
  })

  it('treats whitespace-only entries as empty', () => {
    expect(validateRoute(http({ paths: ['  '] }))).toHaveLength(1)
  })

  it('flags malformed sources and destinations', () => {
    const errors = validateRoute({
      ...newRouteForm(),
      protocols: ['tcp'],
      sources: ['10.0.0.1:0', '10.0.0.2:80'],
      destinations: ['::1'],
    })
    expect(errors).toEqual([
      'Invalid sources entry "10.0.0.1:0": use ip or ip:port (port 1-65535), with IPv6 in brackets.',
      'Invalid destinations entry "::1": use ip or ip:port (port 1-65535), with IPv6 in brackets.',
    ])
  })

  it('flags malformed header lines', () => {
    expect(validateRoute(http({ headers: ['x-a: 1', 'broken'] }))).toEqual([
      'Header "broken" must look like "Name: value1, value2".',
    ])
  })
})

describe('toPayload', () => {
  it('trims list entries and keeps fields the http family uses', () => {
    const payload = toPayload(http({ hosts: [' a.com ', ''] }), 'update')
    expect(payload).toMatchObject({
      protocols: ['http'],
      paths: ['/a'],
      hosts: ['a.com'],
      methods: [],
      snis: [],
      headers: null,
      sources: null,
      destinations: null,
      strip_path: true,
      service: null,
      https_redirect_status_code: 426,
      regex_priority: 0,
    })
  })

  it('omits an empty name and trims a padded one', () => {
    expect(toPayload(http(), 'update')).not.toHaveProperty('name')
    expect(toPayload(http({ name: '  r1 ' }), 'update').name).toBe('r1')
  })

  it('clears http-family fields for tcp and parses addresses', () => {
    const payload = toPayload(
      { ...newRouteForm(), protocols: ['tcp'], sources: ['10.0.0.1:80', '[::1]'] },
      'update',
    )
    expect(payload).toMatchObject({
      sources: [{ ip: '10.0.0.1', port: 80 }, { ip: '::1' }],
      destinations: [],
      hosts: null,
      paths: null,
      methods: null,
      headers: null,
      snis: [],
    })
  })

  it('clears everything but snis for tls_passthrough', () => {
    expect(
      toPayload({ ...newRouteForm(), protocols: ['tls_passthrough'], snis: ['a.com'] }, 'update'),
    ).toMatchObject({
      snis: ['a.com'],
      sources: null,
      destinations: null,
      hosts: null,
      paths: null,
      methods: null,
      headers: null,
    })
  })

  it('clears methods for grpc and drops strip_path for grpc-only selections', () => {
    const grpc = toPayload({ ...newRouteForm(), protocols: ['grpc'], hosts: ['g.com'] }, 'update')
    expect(grpc.methods).toBeNull()
    expect(grpc.hosts).toEqual(['g.com'])
    expect(grpc).not.toHaveProperty('strip_path')
    expect(toPayload(http({ protocols: ['http', 'https'] }), 'update')).toHaveProperty('strip_path', true)
  })

  it('turns header lines into a name to values map, or null when there are none', () => {
    expect(toPayload(http({ headers: ['X-Env: dev, prod', 'x-a: 1'] }), 'update').headers).toEqual({
      'X-Env': ['dev', 'prod'],
      'x-a': ['1'],
    })
    expect(toPayload(http({ headers: [] }), 'update').headers).toBeNull()
  })

  it('sends the service as { id } or null', () => {
    expect(toPayload(http({ service: ' svc-1 ' }), 'update').service).toEqual({ id: 'svc-1' })
    expect(toPayload(http({ service: '' }), 'update').service).toBeNull()
  })

  it('omits empty numeric fields', () => {
    const payload = toPayload(http({ https_redirect_status_code: '', regex_priority: '' }), 'update')
    expect(payload).not.toHaveProperty('https_redirect_status_code')
    expect(payload).not.toHaveProperty('regex_priority')
  })

  it('create never sends null values', () => {
    const payload = toPayload(http(), 'create')
    expect(Object.values(payload).some((v) => v === null || v === undefined)).toBe(false)
    expect(payload).not.toHaveProperty('sources')
    expect(payload).not.toHaveProperty('headers')
    expect(payload).not.toHaveProperty('service')
    expect(payload).toMatchObject({ protocols: ['http'], paths: ['/a'] })
  })

  it('on update, removing the last host sends an empty list so the server clears it', () => {
    expect(toPayload(http({ hosts: [] }), 'update').hosts).toEqual([])
  })
})

describe('fromEntity', () => {
  const entity = {
    name: 'r',
    protocols: ['https'],
    hosts: ['a'],
    paths: ['/p'],
    methods: ['GET'],
    headers: { 'x-env': ['dev', 'prod'] },
    snis: ['s'],
    sources: [{ ip: '1.1.1.1', port: 80 }, { ip: '::1' }],
    destinations: [],
    https_redirect_status_code: 301,
    regex_priority: 5,
    strip_path: false,
    path_handling: 'v1',
    preserve_host: true,
    request_buffering: false,
    response_buffering: false,
    tags: ['t'],
    service: { id: 'svc-1' },
  }

  it('maps a Kong route into the form', () => {
    expect(fromEntity(entity)).toMatchObject({
      name: 'r',
      protocols: ['https'],
      hosts: ['a'],
      paths: ['/p'],
      methods: ['GET'],
      headers: ['x-env: dev, prod'],
      snis: ['s'],
      sources: ['1.1.1.1:80', '[::1]'],
      destinations: [],
      https_redirect_status_code: 301,
      regex_priority: 5,
      strip_path: false,
      path_handling: 'v1',
      preserve_host: true,
      request_buffering: false,
      response_buffering: false,
      tags: ['t'],
      service: 'svc-1',
    })
  })

  it('round-trips headers and addresses back to the Kong shapes', () => {
    const payload = toPayload(fromEntity(entity), 'update')
    expect(payload.headers).toEqual({ 'x-env': ['dev', 'prod'] })
    expect(payload.sources).toEqual([{ ip: '1.1.1.1', port: 80 }, { ip: '::1' }])
    expect(payload.service).toEqual({ id: 'svc-1' })
  })

  it('tolerates null and missing fields', () => {
    const form = fromEntity({ sources: null, headers: null, service: null, hosts: null })
    expect(form.sources).toEqual([])
    expect(form.headers).toEqual([])
    expect(form.hosts).toEqual([])
    expect(form.service).toBe('')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/live/routeForm.test.ts`
Expected: FAIL, cannot resolve `./routeForm`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/live/routeForm.ts`:

```ts
import { ENTITY_RESOURCES } from '../kongAdmin/entities'

export type RouteForm = {
  name: string
  protocols: string[]
  methods: string[]
  hosts: string[]
  paths: string[]
  /** One `Name: value1, value2` line per header. */
  headers: string[]
  snis: string[]
  /** `ip`, `ip:port`, `[ipv6]` or `[ipv6]:port`, one per entry. */
  sources: string[]
  destinations: string[]
  https_redirect_status_code: number | ''
  regex_priority: number | ''
  strip_path: boolean
  path_handling: string
  preserve_host: boolean
  request_buffering: boolean
  response_buffering: boolean
  tags: string[]
  service: string
}

export const ROUTE_PROTOCOLS = ['http', 'https', 'grpc', 'grpcs', 'tcp', 'tls', 'tls_passthrough', 'udp'] as const

export type RouteFamily = 'http' | 'grpc' | 'stream'

type ListField = 'methods' | 'hosts' | 'headers' | 'paths' | 'snis' | 'sources' | 'destinations'

// Primate's PROTOCOL_CONFIG: at least one of these groups must be filled per protocol.
const REQUIRED_FIELDS: Record<string, ListField[]> = {
  http: ['methods', 'hosts', 'headers', 'paths'],
  https: ['methods', 'hosts', 'headers', 'paths', 'snis'],
  tcp: ['sources', 'destinations'],
  udp: ['sources', 'destinations'],
  tls: ['sources', 'destinations', 'snis'],
  tls_passthrough: ['snis'],
  grpc: ['hosts', 'headers', 'paths'],
  grpcs: ['hosts', 'headers', 'paths', 'snis'],
}

// Fields a protocol can exclude, so they are sent as null when every selected protocol excludes them.
const EXCLUSIVE_FIELDS: ListField[] = ['methods', 'hosts', 'headers', 'paths', 'sources', 'destinations']

const MIXED_FAMILIES_MESSAGE =
  'Choose protocols from one family: HTTP/HTTPS, GRPC/GRPCS, or TCP/TLS/TLS passthrough/UDP.'

function familyOf(protocol: string): string {
  if (protocol === 'http' || protocol === 'https') return 'http'
  if (protocol === 'grpc' || protocol === 'grpcs') return 'grpc'
  if (['tcp', 'tls', 'tls_passthrough', 'udp'].includes(protocol)) return 'stream'
  return protocol
}

export function routeFamily(protocols: string[]): RouteFamily | null {
  const families = new Set(protocols.map(familyOf))
  if (families.size !== 1) return null
  const [family] = [...families]
  return family === 'http' || family === 'grpc' || family === 'stream' ? family : null
}

export function parseAddress(entry: string): { ip: string; port?: number } | null {
  const value = entry.trim()
  if (!value) return null

  let ip: string
  let portText: string | undefined
  const bracketed = /^\[([^\]]*)\](?::(.*))?$/.exec(value)
  if (bracketed) {
    ip = bracketed[1]
    portText = bracketed[2]
  } else {
    const parts = value.split(':')
    if (parts.length > 2) return null
    ip = parts[0]
    portText = parts[1]
  }

  ip = ip.trim()
  if (!ip) return null
  if (portText === undefined) return { ip }
  if (!/^\d+$/.test(portText)) return null
  const port = Number(portText)
  if (port < 1 || port > 65535) return null
  return { ip, port }
}

export function parseHeaderLine(line: string): { name: string; values: string[] } | null {
  const colon = line.indexOf(':')
  if (colon < 1) return null
  const name = line.slice(0, colon).trim()
  const values = line
    .slice(colon + 1)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  if (!name || values.length === 0) return null
  return { name, values }
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')
const numberOrEmpty = (value: unknown): number | '' => (typeof value === 'number' ? value : '')
const flag = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback)
const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

function cleanList(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean)
}

function addressesFromEntity(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const { ip, port } = (item ?? {}) as { ip?: unknown; port?: unknown }
    if (typeof ip !== 'string' || !ip) return []
    const host = ip.includes(':') ? `[${ip}]` : ip
    return [typeof port === 'number' ? `${host}:${port}` : host]
  })
}

function headersFromEntity(value: unknown): string[] {
  if (!value || typeof value !== 'object') return []
  return Object.entries(value as Record<string, unknown>).map(
    ([name, values]) => `${name}: ${stringList(values).join(', ')}`,
  )
}

export function fromEntity(entity: Record<string, unknown>): RouteForm {
  const service = entity.service as { id?: unknown } | null | undefined
  return {
    name: text(entity.name),
    protocols: stringList(entity.protocols),
    methods: stringList(entity.methods),
    hosts: stringList(entity.hosts),
    paths: stringList(entity.paths),
    headers: headersFromEntity(entity.headers),
    snis: stringList(entity.snis),
    sources: addressesFromEntity(entity.sources),
    destinations: addressesFromEntity(entity.destinations),
    https_redirect_status_code: numberOrEmpty(entity.https_redirect_status_code),
    regex_priority: numberOrEmpty(entity.regex_priority),
    strip_path: flag(entity.strip_path, true),
    path_handling: text(entity.path_handling) || 'v0',
    preserve_host: flag(entity.preserve_host, false),
    request_buffering: flag(entity.request_buffering, true),
    response_buffering: flag(entity.response_buffering, true),
    tags: stringList(entity.tags),
    service: typeof service?.id === 'string' ? service.id : '',
  }
}

export function newRouteForm(): RouteForm {
  return fromEntity(ENTITY_RESOURCES.routes.defaults)
}

export function validateRoute(form: RouteForm): string[] {
  if (form.protocols.length === 0) return ['Please check at least one protocol from the list.']
  if (new Set(form.protocols.map(familyOf)).size > 1) return [MIXED_FAMILIES_MESSAGE]

  const errors: string[] = []
  for (const protocol of form.protocols) {
    const required = REQUIRED_FIELDS[protocol]
    if (!required) continue
    if (!required.some((field) => cleanList(form[field]).length > 0)) {
      errors.push(`At least one of ${required.join(', ')} is required, if ${protocol.toUpperCase()} is selected.`)
    }
  }
  for (const field of ['sources', 'destinations'] as const) {
    for (const entry of form[field]) {
      if (entry.trim() && !parseAddress(entry)) {
        errors.push(`Invalid ${field} entry "${entry}": use ip or ip:port (port 1-65535), with IPv6 in brackets.`)
      }
    }
  }
  for (const line of form.headers) {
    if (line.trim() && !parseHeaderLine(line)) {
      errors.push(`Header "${line}" must look like "Name: value1, value2".`)
    }
  }
  return errors
}

export function toPayload(form: RouteForm, mode: 'create' | 'update'): Record<string, unknown> {
  const headerMap: Record<string, string[]> = {}
  for (const line of form.headers) {
    const header = parseHeaderLine(line)
    if (header) headerMap[header.name] = header.values
  }
  const addresses = (entries: string[]) =>
    entries.flatMap((entry) => {
      const address = parseAddress(entry)
      return address ? [address] : []
    })
  const service = form.service.trim()

  const payload: Record<string, unknown> = {
    protocols: form.protocols,
    methods: cleanList(form.methods),
    hosts: cleanList(form.hosts),
    paths: cleanList(form.paths),
    headers: Object.keys(headerMap).length > 0 ? headerMap : null,
    snis: cleanList(form.snis),
    sources: addresses(form.sources),
    destinations: addresses(form.destinations),
    strip_path: form.strip_path,
    path_handling: form.path_handling,
    preserve_host: form.preserve_host,
    request_buffering: form.request_buffering,
    response_buffering: form.response_buffering,
    tags: cleanList(form.tags),
    service: service ? { id: service } : null,
  }

  const name = form.name.trim()
  if (name) payload.name = name
  if (form.https_redirect_status_code !== '') payload.https_redirect_status_code = form.https_redirect_status_code
  if (form.regex_priority !== '') payload.regex_priority = form.regex_priority

  if (form.protocols.length > 0) {
    for (const field of EXCLUSIVE_FIELDS) {
      if (form.protocols.every((protocol) => !REQUIRED_FIELDS[protocol]?.includes(field))) payload[field] = null
    }
    if (form.protocols.every((protocol) => protocol === 'grpc' || protocol === 'grpcs')) delete payload.strip_path
  }

  if (mode === 'create') {
    return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== null && value !== undefined))
  }
  return payload
}
```

- [ ] **Step 4: Run the tests and typecheck to verify they pass**

Run: `npx vitest run src/lib/live/routeForm.test.ts && npx vue-tsc -b`
Expected: PASS; typecheck prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/live/routeForm.ts src/lib/live/routeForm.test.ts
git commit -m "feat: add route form module with protocol rules and address parsing

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `useLiveEntities` composable

**Files:**
- Create: `src/composables/useLiveEntities.ts`
- Create: `src/composables/useLiveEntities.test.ts`

**Interfaces:**
- Consumes: `useConnectionStore().client(resource, parentId?)` (foundation), `KongAdminApiError` from `../lib/kongAdmin/http`, `EntityClient`, `EntityResourceName` from `../lib/kongAdmin/entities`.
- Produces (exported from `src/composables/useLiveEntities.ts`):
  - `type LiveEntity = { id: string; [key: string]: unknown }`
  - `type LiveError = { message: string; fields?: Record<string, unknown> }`
  - `toLiveError(err: unknown): LiveError`
  - `type UseLiveEntitiesOptions = { parentId?: string | (() => string | undefined); listVia?: () => { resource: EntityResourceName; parentId?: string } | undefined }`
  - `useLiveEntities<T extends LiveEntity = LiveEntity>(resource: EntityResourceName, options?: UseLiveEntitiesOptions)` returning `{ items: Ref<T[]>; next: Ref<string | null>; loading: Ref<boolean>; error: Ref<LiveError | null>; tagFilter: Ref<string[]>; load(): Promise<void>; loadMore(): Promise<void>; create(body: Partial<T>): Promise<T>; save(id: string, patch: Partial<T>): Promise<T>; remove(id: string): Promise<void>; toggleEnabled(id: string, enabled: boolean): Promise<T> }`

- [ ] **Step 1: Write the failing tests**

Create `src/composables/useLiveEntities.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useLiveEntities, toLiveError } from './useLiveEntities'
import { useConnectionStore } from '../stores/connection'
import { KongAdminApiError } from '../lib/kongAdmin/http'
import { ReadOnlyError } from '../lib/kongAdmin/entities'

function connect(database = 'postgres') {
  const store = useConnectionStore()
  store.$patch({ active: { baseUrl: 'http://kong:8001' }, info: { version: '3.4.0', database } })
}

const json = (body: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('toLiveError', () => {
  it('prefers the Kong message and keeps field errors', () => {
    const err = new KongAdminApiError('Kong Admin API responded 400: ...', {
      status: 400,
      kind: 'validation',
      kongMessage: 'schema violation',
      fields: { host: 'required field missing' },
    })
    expect(toLiveError(err)).toEqual({ message: 'schema violation', fields: { host: 'required field missing' } })
  })

  it('falls back to the error message, and stringifies non-errors', () => {
    expect(toLiveError(new KongAdminApiError('boom'))).toEqual({ message: 'boom' })
    expect(toLiveError(new Error('plain'))).toEqual({ message: 'plain' })
    expect(toLiveError('oops')).toEqual({ message: 'oops' })
  })
})

describe('useLiveEntities', () => {
  it('load() fetches the first page with the tag filter and stores items and next', async () => {
    connect()
    const f = vi.fn().mockResolvedValue(json({ data: [{ id: '1' }], offset: 'o1' }))
    vi.stubGlobal('fetch', f)
    const live = useLiveEntities('services')
    live.tagFilter.value = ['a', 'b']

    await live.load()

    expect(f.mock.calls[0][0]).toBe('http://kong:8001/services?tags=a%2Cb')
    expect(live.items.value).toEqual([{ id: '1' }])
    expect(live.next.value).toBe('o1')
    expect(live.loading.value).toBe(false)
    expect(live.error.value).toBeNull()
  })

  it('loadMore() appends the next page and stops once there is no next offset', async () => {
    connect()
    const f = vi
      .fn()
      .mockResolvedValueOnce(json({ data: [{ id: '1' }], offset: 'o1' }))
      .mockResolvedValueOnce(json({ data: [{ id: '2' }] }))
    vi.stubGlobal('fetch', f)
    const live = useLiveEntities('services')

    await live.load()
    await live.loadMore()
    await live.loadMore()

    expect(f).toHaveBeenCalledTimes(2)
    expect(f.mock.calls[1][0]).toBe('http://kong:8001/services?offset=o1')
    expect(live.items.value.map((i) => i.id)).toEqual(['1', '2'])
    expect(live.next.value).toBeNull()
  })

  it('does not fetch twice when loadMore() is called again while a page is in flight', async () => {
    connect()
    const second = deferred<ReturnType<typeof json>>()
    const f = vi
      .fn()
      .mockResolvedValueOnce(json({ data: [{ id: '1' }], offset: 'o1' }))
      .mockReturnValueOnce(second.promise)
    vi.stubGlobal('fetch', f)
    const live = useLiveEntities('services')
    await live.load()

    const first = live.loadMore()
    const duplicate = live.loadMore()
    second.resolve(json({ data: [{ id: '2' }] }))
    await Promise.all([first, duplicate])

    expect(f).toHaveBeenCalledTimes(2)
    expect(live.items.value.map((i) => i.id)).toEqual(['1', '2'])
  })

  it('ignores a stale response when load() is started again', async () => {
    connect()
    const slow = deferred<ReturnType<typeof json>>()
    const f = vi
      .fn()
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce(json({ data: [{ id: 'fresh' }] }))
    vi.stubGlobal('fetch', f)
    const live = useLiveEntities('services')

    const stale = live.load()
    await live.load()
    slow.resolve(json({ data: [{ id: 'stale' }], offset: 'old' }))
    await stale

    expect(live.items.value).toEqual([{ id: 'fresh' }])
    expect(live.next.value).toBeNull()
    expect(live.loading.value).toBe(false)
  })

  it('create() inserts at the front, save() replaces by id, remove() deletes', async () => {
    connect()
    const f = vi
      .fn()
      .mockResolvedValueOnce(json({ data: [{ id: '1', name: 'a' }] }))
      .mockResolvedValueOnce(json({ id: '2', name: 'b' }, 201))
      .mockResolvedValueOnce(json({ id: '1', name: 'a2' }))
      .mockResolvedValueOnce({ ok: true, status: 204, text: async () => '' })
    vi.stubGlobal('fetch', f)
    const live = useLiveEntities('services')
    await live.load()

    await live.create({ name: 'b' })
    expect(live.items.value.map((i) => i.id)).toEqual(['2', '1'])
    expect(f.mock.calls[1][1]).toMatchObject({ method: 'POST' })

    await live.save('1', { name: 'a2' })
    expect(live.items.value.find((i) => i.id === '1')?.name).toBe('a2')
    expect(f.mock.calls[2][0]).toBe('http://kong:8001/services/1')
    expect(f.mock.calls[2][1]).toMatchObject({ method: 'PATCH' })

    await live.remove('2')
    expect(live.items.value.map((i) => i.id)).toEqual(['1'])
    expect(f.mock.calls[3][1]).toMatchObject({ method: 'DELETE' })
  })

  it('toggleEnabled() PATCHes only the enabled flag', async () => {
    connect()
    const f = vi
      .fn()
      .mockResolvedValueOnce(json({ data: [{ id: '1', enabled: true }] }))
      .mockResolvedValueOnce(json({ id: '1', enabled: false }))
    vi.stubGlobal('fetch', f)
    const live = useLiveEntities('services')
    await live.load()

    await live.toggleEnabled('1', false)

    expect(JSON.parse(f.mock.calls[1][1].body as string)).toEqual({ enabled: false })
    expect(live.items.value[0].enabled).toBe(false)
  })

  it('stores a Kong error with its fields and rethrows from write actions', async () => {
    connect()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () =>
          JSON.stringify({ message: 'schema violation', fields: { host: 'required field missing' } }),
      }),
    )
    const live = useLiveEntities('services')

    await expect(live.create({ name: 'x' })).rejects.toBeInstanceOf(KongAdminApiError)

    expect(live.error.value).toEqual({ message: 'schema violation', fields: { host: 'required field missing' } })
    expect(live.items.value).toEqual([])
  })

  it('reports read-only as an error on DB-less Kong without sending the write', async () => {
    connect('off')
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    const live = useLiveEntities('services')

    await expect(live.create({ name: 'x' })).rejects.toBeInstanceOf(ReadOnlyError)

    expect(live.error.value?.message).toMatch(/read-only/i)
    expect(f).not.toHaveBeenCalled()
  })

  it('load() records an error instead of throwing when not connected', async () => {
    const live = useLiveEntities('services')

    await live.load()

    expect(live.error.value?.message).toMatch(/not connected/i)
    expect(live.loading.value).toBe(false)
  })

  it('passes the parent id (plain or getter) to nested resources', async () => {
    connect()
    const f = vi.fn().mockResolvedValue(json({ data: [] }))
    vi.stubGlobal('fetch', f)
    let parent: string | undefined = 'u1'

    await useLiveEntities('targets', { parentId: 'u0' }).load()
    await useLiveEntities('targets', { parentId: () => parent }).load()
    parent = 'u2'
    await useLiveEntities('targets', { parentId: () => parent }).load()

    expect(f.mock.calls.map((c) => c[0])).toEqual([
      'http://kong:8001/upstreams/u0/targets',
      'http://kong:8001/upstreams/u1/targets',
      'http://kong:8001/upstreams/u2/targets',
    ])
  })

  it('listVia lists through another resource while writes keep using the plain one', async () => {
    connect()
    const f = vi
      .fn()
      .mockResolvedValueOnce(json({ data: [{ id: 'r1' }] }))
      .mockResolvedValueOnce(json({ id: 'r1', name: 'x' }))
    vi.stubGlobal('fetch', f)
    const live = useLiveEntities('routes', {
      listVia: () => ({ resource: 'service_routes', parentId: 'svc 1' }),
    })

    await live.load()
    await live.save('r1', { name: 'x' })

    expect(f.mock.calls[0][0]).toBe('http://kong:8001/services/svc%201/routes')
    expect(f.mock.calls[1][0]).toBe('http://kong:8001/routes/r1')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/composables/useLiveEntities.test.ts`
Expected: FAIL, cannot resolve `./useLiveEntities`.

- [ ] **Step 3: Write the implementation**

Create `src/composables/useLiveEntities.ts`:

```ts
import { ref } from 'vue'
import type { Ref } from 'vue'
import { KongAdminApiError } from '../lib/kongAdmin/http'
import type { EntityClient, EntityResourceName } from '../lib/kongAdmin/entities'
import { useConnectionStore } from '../stores/connection'

export type LiveEntity = { id: string; [key: string]: unknown }
export type LiveError = { message: string; fields?: Record<string, unknown> }

export function toLiveError(err: unknown): LiveError {
  if (err instanceof KongAdminApiError) {
    return { message: err.kongMessage ?? err.message, ...(err.fields ? { fields: err.fields } : {}) }
  }
  return { message: err instanceof Error ? err.message : String(err) }
}

export type UseLiveEntitiesOptions = {
  /** Parent id for nested resources such as targets. A getter is read on every call. */
  parentId?: string | (() => string | undefined)
  /** Lists through another resource (for example a service's routes) while writes use `resource`. */
  listVia?: () => { resource: EntityResourceName; parentId?: string } | undefined
}

export function useLiveEntities<T extends LiveEntity = LiveEntity>(
  resource: EntityResourceName,
  options: UseLiveEntitiesOptions = {},
) {
  const connection = useConnectionStore()
  const items = ref<T[]>([]) as Ref<T[]>
  const next = ref<string | null>(null)
  const loading = ref(false)
  const error = ref<LiveError | null>(null)
  const tagFilter = ref<string[]>([])
  let requestToken = 0

  const parentId = () => (typeof options.parentId === 'function' ? options.parentId() : options.parentId)
  const client = (): EntityClient<T> => connection.client<T>(resource, parentId())
  const listClient = (): EntityClient<T> => {
    const via = options.listVia?.()
    return via ? connection.client<T>(via.resource, via.parentId) : client()
  }

  async function load() {
    const token = ++requestToken
    loading.value = true
    error.value = null
    items.value = []
    next.value = null
    try {
      const page = await listClient().list({ tags: tagFilter.value })
      if (token !== requestToken) return
      items.value = page.data
      next.value = page.next
    } catch (err) {
      if (token === requestToken) error.value = toLiveError(err)
    } finally {
      if (token === requestToken) loading.value = false
    }
  }

  async function loadMore() {
    if (!next.value || loading.value) return
    const token = requestToken
    loading.value = true
    try {
      const page = await listClient().list({ tags: tagFilter.value, offset: next.value })
      if (token !== requestToken) return
      items.value = [...items.value, ...page.data]
      next.value = page.next
    } catch (err) {
      if (token === requestToken) error.value = toLiveError(err)
    } finally {
      if (token === requestToken) loading.value = false
    }
  }

  async function run<R>(action: () => Promise<R>): Promise<R> {
    error.value = null
    try {
      return await action()
    } catch (err) {
      error.value = toLiveError(err)
      throw err
    }
  }

  const create = (body: Partial<T>) =>
    run(async () => {
      const created = await client().create(body)
      items.value = [created, ...items.value]
      return created
    })

  const save = (id: string, patch: Partial<T>) =>
    run(async () => {
      const updated = await client().update(id, patch)
      items.value = items.value.map((item) => (item.id === id ? updated : item))
      return updated
    })

  const remove = (id: string) =>
    run(async () => {
      await client().remove(id)
      items.value = items.value.filter((item) => item.id !== id)
    })

  const toggleEnabled = (id: string, enabled: boolean) => save(id, { enabled } as unknown as Partial<T>)

  return { items, next, loading, error, tagFilter, load, loadMore, create, save, remove, toggleEnabled }
}
```

- [ ] **Step 4: Run the tests and typecheck to verify they pass**

Run: `npx vitest run src/composables/useLiveEntities.test.ts && npx vue-tsc -b`
Expected: PASS; typecheck prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/composables/useLiveEntities.ts src/composables/useLiveEntities.test.ts
git commit -m "feat: add useLiveEntities composable with paging and stale-response protection

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Live shell (gate, sidebar links, page titles)

**Files:**
- Create: `src/components/live/LiveGate.vue`
- Create: `src/components/live/LiveGate.test.ts`
- Create: `src/components/live/LiveErrorBanner.vue`
- Create: `src/components/live/FieldError.vue`
- Modify: `src/components/layout/AppSidebar.vue`
- Modify: `src/components/layout/AppSidebar.test.ts`
- Modify: `src/components/layout/AppShell.vue`

**Interfaces:**
- Consumes: `useConnectionStore()` (`isConnected`, `canWrite`); `LiveError` from `../../composables/useLiveEntities` (Task 4).
- Produces:
  - `LiveGate.vue`: no props; default slot rendered only when connected. Renders `data-testid="live-not-connected"` (with a link to `/`) when not connected and `data-testid="live-read-only"` when connected but `canWrite` is false.
  - `LiveErrorBanner.vue`: props `{ messages?: string[]; error?: LiveError | null }`, renders `role="alert"`.
  - `FieldError.vue`: prop `{ message?: string }`, renders nothing when empty.
  - Sidebar: Live links to `/live/services` and `/live/routes` as anchors when connected, disabled `<span title="Connect to a live Kong first">` placeholders otherwise.

- [ ] **Step 1: Write the failing tests**

Create `src/components/live/LiveGate.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { mount } from '@vue/test-utils'
import LiveGate from './LiveGate.vue'
import { useConnectionStore } from '../../stores/connection'

function mountGate() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] })
  return mount(LiveGate, { global: { plugins: [router] }, slots: { default: '<p data-testid="content">content</p>' } })
}

beforeEach(() => setActivePinia(createPinia()))

describe('LiveGate', () => {
  it('shows a connect prompt with a link to Load, and no content, when not connected', () => {
    const wrapper = mountGate()

    expect(wrapper.find('[data-testid="live-not-connected"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="content"]').exists()).toBe(false)
    expect(wrapper.find('a').attributes('href')).toBe('/')
  })

  it('shows the content without a notice when connected to a database-backed Kong', () => {
    useConnectionStore().$patch({ active: { baseUrl: 'http://kong:8001' }, info: { version: '3.4.0', database: 'postgres' } })
    const wrapper = mountGate()

    expect(wrapper.find('[data-testid="content"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="live-read-only"]').exists()).toBe(false)
  })

  it('shows the content plus a read-only notice on DB-less Kong', () => {
    useConnectionStore().$patch({ active: { baseUrl: 'http://kong:8001' }, info: { version: '3.4.0', database: 'off' } })
    const wrapper = mountGate()

    expect(wrapper.find('[data-testid="content"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="live-read-only"]').text()).toMatch(/read-only/i)
  })
})
```

In `src/components/layout/AppSidebar.test.ts`, add the import and two tests. Add this import next to the existing store import:

```ts
import { useConnectionStore } from '../../stores/connection'
```

Add these tests inside `describe('AppSidebar', ...)`, directly after its `beforeEach` line:

```ts
  it('shows Live links as disabled placeholders, not anchors, until a connection exists', () => {
    const wrapper = mount(AppSidebar, { global: { plugins: [testRouter()] } })

    expect(wrapper.text()).toContain('Live')
    expect(wrapper.findAll('a').map((a) => a.text())).toEqual(['Load'])
    expect(wrapper.findAll('span[title="Connect to a live Kong first"]')).toHaveLength(2)
  })

  it('links to the live services and routes once connected', () => {
    useConnectionStore().$patch({ active: { baseUrl: 'http://kong:8001' }, info: { version: '3.4.0', database: 'postgres' } })
    const wrapper = mount(AppSidebar, { global: { plugins: [testRouter()] } })

    const live = wrapper.findAll('a').filter((a) => a.attributes('href')?.startsWith('/live'))
    expect(live.map((a) => [a.text(), a.attributes('href')])).toEqual([
      ['Services', '/live/services'],
      ['Routes', '/live/routes'],
    ])
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/live/LiveGate.test.ts src/components/layout/AppSidebar.test.ts`
Expected: FAIL (`LiveGate.vue` does not exist; the two sidebar tests fail because there are no Live links). Existing sidebar tests still pass.

- [ ] **Step 3: Write the implementation**

Create `src/components/live/LiveGate.vue`:

```vue
<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { useConnectionStore } from '../../stores/connection'

const connection = useConnectionStore()
</script>

<template>
  <div
    v-if="!connection.isConnected"
    class="flex min-h-[16rem] flex-col items-center justify-center gap-3 p-6 text-center"
    data-testid="live-not-connected"
  >
    <p class="text-sm text-ink-muted">Live editing needs a connection to a Kong Admin API.</p>
    <RouterLink to="/" class="btn-primary">Connect on the Load page</RouterLink>
  </div>
  <div v-else class="flex flex-1 flex-col">
    <div
      v-if="!connection.canWrite"
      role="status"
      data-testid="live-read-only"
      class="border-b border-amber-300 bg-amber-50 px-6 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
    >
      Kong is running without a database (DB-less), so entities are read-only here.
    </div>
    <slot />
  </div>
</template>
```

Create `src/components/live/LiveErrorBanner.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { LiveError } from '../../composables/useLiveEntities'

const props = defineProps<{ messages?: string[]; error?: LiveError | null }>()

const fieldLines = computed(() =>
  Object.entries(props.error?.fields ?? {}).map(
    ([field, problem]) => `${field}: ${typeof problem === 'string' ? problem : JSON.stringify(problem)}`,
  ),
)
const visible = computed(() => (props.messages?.length ?? 0) > 0 || Boolean(props.error))
</script>

<template>
  <div
    v-if="visible"
    role="alert"
    class="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
  >
    <p v-for="message in messages ?? []" :key="message">{{ message }}</p>
    <template v-if="error">
      <p>{{ error.message }}</p>
      <ul v-if="fieldLines.length > 0" class="mt-1 list-disc pl-5 text-xs">
        <li v-for="line in fieldLines" :key="line">{{ line }}</li>
      </ul>
    </template>
  </div>
</template>
```

Create `src/components/live/FieldError.vue`:

```vue
<script setup lang="ts">
defineProps<{ message?: string }>()
</script>

<template>
  <p v-if="message" class="field-help !text-red-600 dark:!text-red-400">{{ message }}</p>
</template>
```

In `src/components/layout/AppSidebar.vue`, run:

```bash
python3 - <<'E'
p = 'src/components/layout/AppSidebar.vue'
s = open(p).read()

def rep(a, b):
    global s
    assert a in s, a
    s = s.replace(a, b, 1)

rep("import { useConfigStore } from '../../stores/config'\n",
    "import { useConfigStore } from '../../stores/config'\nimport { useConnectionStore } from '../../stores/connection'\n")
rep("const configStore = useConfigStore()\n",
    "const configStore = useConfigStore()\nconst connectionStore = useConnectionStore()\n")
rep("const linkBase =", """const liveLinks = [
  { to: '/live/services', label: 'Services' },
  { to: '/live/routes', label: 'Routes' },
]

const linkBase =""")
rep("    </nav>\n", """
      <p class="section-heading px-2.5 pb-1 pt-4">Live</p>
      <template v-for="link in liveLinks" :key="link.to">
        <RouterLink
          v-if="connectionStore.isConnected"
          :to="link.to"
          :class="linkBase"
          :active-class="linkActive"
          @click="emit('navigate')"
        >
          <svg viewBox="0 0 20 20" fill="none" class="h-4 w-4 shrink-0">
            <circle cx="10" cy="10" r="3" stroke="currentColor" stroke-width="1.5" />
            <path d="M10 3v2M10 15v2M3 10h2M15 10h2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
          {{ link.label }}
        </RouterLink>
        <span v-else :class="linkDisabled" title="Connect to a live Kong first">
          <svg viewBox="0 0 20 20" fill="none" class="h-4 w-4 shrink-0">
            <circle cx="10" cy="10" r="3" stroke="currentColor" stroke-width="1.5" />
            <path d="M10 3v2M10 15v2M3 10h2M15 10h2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
          {{ link.label }}
          <svg viewBox="0 0 20 20" fill="none" class="ml-auto h-3.5 w-3.5 shrink-0">
            <rect x="5" y="9" width="10" height="7" rx="1.5" stroke="currentColor" stroke-width="1.5" />
            <path d="M7.5 9V6.5a2.5 2.5 0 015 0V9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </span>
      </template>
    </nav>
""")
open(p, 'w').write(s)

p = 'src/components/layout/AppShell.vue'
s = open(p).read()
rep("  if (route.path === '/compare') return 'Compare'\n",
    "  if (route.path === '/compare') return 'Compare'\n  if (route.path === '/live/services') return 'Live services'\n  if (route.path === '/live/routes') return 'Live routes'\n")
open(p, 'w').write(s)
E
```

- [ ] **Step 4: Run the tests and typecheck to verify they pass**

Run: `npx vitest run src/components/live src/components/layout && npx vue-tsc -b`
Expected: PASS (new and existing sidebar/shell tests); typecheck prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/components/live src/components/layout
git commit -m "feat: add Live gate, error banner and sidebar links

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Live services view

**Files:**
- Create: `src/components/live/ServiceForm.vue`
- Create: `src/views/live/LiveServicesView.vue`
- Create: `src/views/live/LiveServicesView.test.ts`
- Modify: `src/router/index.ts`

**Interfaces:**
- Consumes: `useLiveEntities`, `LiveEntity` (Task 4); `fromEntity`, `newServiceForm`, `toPayload`, `validateService`, `SERVICE_PROTOCOLS`, `serviceProtocolUsesPath`, `serviceProtocolUsesTls`, `ServiceForm` type (Task 2); `LiveGate`, `LiveErrorBanner`, `FieldError` (Task 5); shared `ValueListEditor`, `ToggleSwitch`, `TagInput`, `SearchInput`.
- Produces: routes `/live` (redirect to `/live/services`) and `/live/services`; `ServiceForm.vue` with props `{ modelValue: ServiceForm; disabled?: boolean; fieldErrors?: Record<string, string> }`; test ids used by tests: `service-row`, `new-service`, `tag-filter`, `load-more`, `save`, `discard`, `delete`, `service-name`, `service-protocol`, `service-host`, `service-port`.

- [ ] **Step 1: Write the failing tests**

Create `src/views/live/LiveServicesView.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { flushPromises, mount } from '@vue/test-utils'
import LiveServicesView from './LiveServicesView.vue'
import { useConnectionStore } from '../../stores/connection'

type Call = { method: string; url: string; body?: Record<string, unknown> }

function fakeKong(services: Record<string, unknown>[], failCreateWith?: { status: number; body: unknown }) {
  const calls: Call[] = []
  const reply = (body: unknown, status = 200) => ({
    ok: status < 400,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET'
      const body = init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : undefined
      calls.push({ method, url, body })
      if (method === 'GET' && url.includes('/services')) return reply({ data: services })
      if (method === 'POST') {
        if (failCreateWith) return reply(failCreateWith.body, failCreateWith.status)
        return reply({ id: 'new-1', ...body }, 201)
      }
      if (method === 'PATCH') {
        const id = url.split('/services/')[1]
        return reply({ ...services.find((s) => s.id === id), ...body })
      }
      if (method === 'DELETE') return { ok: true, status: 204, text: async () => '' }
      return reply({}, 404)
    }),
  )
  return calls
}

const SERVICES = [
  { id: 'svc-1', name: 'billing', protocol: 'http', host: 'billing.internal', port: 8080, path: '/', enabled: true, tags: ['prod'] },
  { id: 'svc-2', name: 'reports', protocol: 'https', host: 'reports.internal', port: 443, enabled: false, tags: [] },
]

function connect(database = 'postgres') {
  useConnectionStore().$patch({ active: { baseUrl: 'http://kong:8001' }, info: { version: '3.4.0', database } })
}

async function mountView() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] })
  const wrapper = mount(LiveServicesView, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

const byId = (wrapper: Awaited<ReturnType<typeof mountView>>, id: string) => wrapper.find(`[data-testid="${id}"]`)

beforeEach(() => setActivePinia(createPinia()))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('LiveServicesView', () => {
  it('shows the connect prompt and sends no request when not connected', async () => {
    const calls = fakeKong(SERVICES)

    const wrapper = await mountView()

    expect(byId(wrapper, 'live-not-connected').exists()).toBe(true)
    expect(calls).toHaveLength(0)
  })

  it('lists services from the API and filters the loaded ones by the search box', async () => {
    connect()
    fakeKong(SERVICES)

    const wrapper = await mountView()

    const rows = wrapper.findAll('[data-testid="service-row"]')
    expect(rows.map((r) => r.text())).toEqual([expect.stringContaining('billing'), expect.stringContaining('reports')])

    await wrapper.find('input[placeholder="Search loaded services…"]').setValue('report')
    expect(wrapper.findAll('[data-testid="service-row"]')).toHaveLength(1)
    expect(wrapper.find('[data-testid="service-row"]').text()).toContain('reports')
  })

  it('applies the tag filter through the API on Enter', async () => {
    connect()
    const calls = fakeKong(SERVICES)
    const wrapper = await mountView()

    const input = byId(wrapper, 'tag-filter')
    await input.setValue('prod, eu')
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()

    expect(calls.at(-1)?.url).toBe('http://kong:8001/services?tags=prod%2Ceu')
  })

  it('on DB-less Kong shows the notice and disables every write control', async () => {
    connect('off')
    fakeKong(SERVICES)
    const wrapper = await mountView()

    expect(byId(wrapper, 'live-read-only').exists()).toBe(true)
    expect(byId(wrapper, 'new-service').attributes('disabled')).toBeDefined()

    await wrapper.findAll('[data-testid="service-row"]')[0].trigger('click')
    expect(byId(wrapper, 'save').attributes('disabled')).toBeDefined()
    expect(byId(wrapper, 'delete').attributes('disabled')).toBeDefined()
    expect(wrapper.find('fieldset').attributes('disabled')).toBeDefined()
  })

  it('edits a service and saves it with a PATCH carrying the change', async () => {
    connect()
    const calls = fakeKong(SERVICES)
    const wrapper = await mountView()

    await wrapper.findAll('[data-testid="service-row"]')[0].trigger('click')
    expect((byId(wrapper, 'service-host').element as HTMLInputElement).value).toBe('billing.internal')
    expect(byId(wrapper, 'save').attributes('disabled')).toBeDefined()

    await byId(wrapper, 'service-host').setValue('new.internal')
    await byId(wrapper, 'save').trigger('click')
    await flushPromises()

    const patch = calls.find((c) => c.method === 'PATCH')!
    expect(patch.url).toBe('http://kong:8001/services/svc-1')
    expect(patch.body).toMatchObject({ host: 'new.internal', protocol: 'http', name: 'billing' })
    expect(byId(wrapper, 'save').attributes('disabled')).toBeDefined()
  })

  it('creates a service with a POST and adds it to the list', async () => {
    connect()
    const calls = fakeKong(SERVICES)
    const wrapper = await mountView()

    await byId(wrapper, 'new-service').trigger('click')
    await byId(wrapper, 'service-name').setValue('  fresh ')
    await byId(wrapper, 'service-host').setValue('fresh.internal')
    await byId(wrapper, 'save').trigger('click')
    await flushPromises()

    const post = calls.find((c) => c.method === 'POST')!
    expect(post.url).toBe('http://kong:8001/services')
    expect(post.body).toMatchObject({ name: 'fresh', host: 'fresh.internal', protocol: 'http' })
    expect(Object.values(post.body!).includes(null)).toBe(false)
    expect(wrapper.findAll('[data-testid="service-row"]')[0].text()).toContain('fresh')
  })

  it('blocks Save with a banner and sends nothing when the host is empty', async () => {
    connect()
    const calls = fakeKong(SERVICES)
    const wrapper = await mountView()

    await byId(wrapper, 'new-service').trigger('click')
    await byId(wrapper, 'save').trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toContain('Please provide a valid protocol and host combination.')
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('shows Kong field errors in the banner and under the field, keeping the form open', async () => {
    connect()
    fakeKong(SERVICES, {
      status: 400,
      body: { message: 'schema violation (host: invalid value)', fields: { host: 'invalid value' } },
    })
    const wrapper = await mountView()

    await byId(wrapper, 'new-service').trigger('click')
    await byId(wrapper, 'service-host').setValue('bad host')
    await byId(wrapper, 'save').trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toContain('schema violation (host: invalid value)')
    expect(wrapper.find('[role="alert"]').text()).toContain('host: invalid value')
    expect(wrapper.text()).toContain('invalid value')
    expect((byId(wrapper, 'service-host').element as HTMLInputElement).value).toBe('bad host')
  })

  it('deletes the selected service after confirmation and removes it from the list', async () => {
    connect()
    const calls = fakeKong(SERVICES)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const wrapper = await mountView()

    await wrapper.findAll('[data-testid="service-row"]')[0].trigger('click')
    await byId(wrapper, 'delete').trigger('click')
    await flushPromises()

    expect(calls.find((c) => c.method === 'DELETE')?.url).toBe('http://kong:8001/services/svc-1')
    expect(wrapper.findAll('[data-testid="service-row"]')).toHaveLength(1)
  })

  it('does not delete when the confirmation is cancelled', async () => {
    connect()
    const calls = fakeKong(SERVICES)
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const wrapper = await mountView()

    await wrapper.findAll('[data-testid="service-row"]')[0].trigger('click')
    await byId(wrapper, 'delete').trigger('click')
    await flushPromises()

    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
  })

  it('asks before discarding edits when switching selection, and keeps them on cancel', async () => {
    connect()
    fakeKong(SERVICES)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const wrapper = await mountView()

    const rows = () => wrapper.findAll('[data-testid="service-row"]')
    await rows()[0].trigger('click')
    await byId(wrapper, 'service-host').setValue('edited.internal')
    await rows()[1].trigger('click')

    expect(confirm).toHaveBeenCalled()
    expect((byId(wrapper, 'service-host').element as HTMLInputElement).value).toBe('edited.internal')

    confirm.mockReturnValue(true)
    await rows()[1].trigger('click')
    expect((byId(wrapper, 'service-host').element as HTMLInputElement).value).toBe('reports.internal')
  })

  it('Discard reverts edits only after confirmation', async () => {
    connect()
    fakeKong(SERVICES)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const wrapper = await mountView()

    await wrapper.findAll('[data-testid="service-row"]')[0].trigger('click')
    await byId(wrapper, 'service-host').setValue('edited.internal')
    await byId(wrapper, 'discard').trigger('click')
    expect((byId(wrapper, 'service-host').element as HTMLInputElement).value).toBe('edited.internal')

    confirm.mockReturnValue(true)
    await byId(wrapper, 'discard').trigger('click')
    expect((byId(wrapper, 'service-host').element as HTMLInputElement).value).toBe('billing.internal')
  })

  it('toggles a service enabled flag from the list with a PATCH of only that flag', async () => {
    connect()
    const calls = fakeKong(SERVICES)
    const wrapper = await mountView()

    await wrapper.findAll('[data-testid="service-row"]')[0].find('input[type="checkbox"]').setValue(false)
    await flushPromises()

    const patch = calls.find((c) => c.method === 'PATCH')!
    expect(patch.url).toBe('http://kong:8001/services/svc-1')
    expect(patch.body).toEqual({ enabled: false })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/views/live/LiveServicesView.test.ts`
Expected: FAIL, cannot resolve `./LiveServicesView.vue`.

- [ ] **Step 3: Write the implementation**

Create `src/components/live/ServiceForm.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { SERVICE_PROTOCOLS, serviceProtocolUsesPath, serviceProtocolUsesTls } from '../../lib/live/serviceForm'
import type { ServiceForm } from '../../lib/live/serviceForm'
import FieldError from './FieldError.vue'
import TagInput from '../shared/TagInput.vue'
import ToggleSwitch from '../shared/ToggleSwitch.vue'
import ValueListEditor from '../shared/ValueListEditor.vue'

const props = defineProps<{ modelValue: ServiceForm; disabled?: boolean; fieldErrors?: Record<string, string> }>()
const emit = defineEmits<{ 'update:modelValue': [value: ServiceForm] }>()

function set<K extends keyof ServiceForm>(key: K, value: ServiceForm[K]) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}
function text(event: Event): string {
  return (event.target as HTMLInputElement).value
}
function numeric(event: Event): number | '' {
  const value = text(event)
  return value === '' ? '' : Number(value)
}

const usesPath = computed(() => serviceProtocolUsesPath(props.modelValue.protocol))
const usesTls = computed(() => serviceProtocolUsesTls(props.modelValue.protocol))
</script>

<template>
  <fieldset :disabled="disabled" class="space-y-5 border-0 p-0">
    <section class="space-y-3">
      <h4 class="section-heading">Service</h4>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label>
          <span class="field-label">Name</span>
          <input
            type="text"
            class="input-field"
            data-testid="service-name"
            placeholder="(unnamed service)"
            :value="modelValue.name"
            @input="set('name', text($event))"
          />
          <FieldError :message="fieldErrors?.name" />
        </label>
        <label>
          <span class="field-label">Protocol</span>
          <select
            class="input-field"
            data-testid="service-protocol"
            :value="modelValue.protocol"
            @change="set('protocol', text($event))"
          >
            <option v-for="protocol in SERVICE_PROTOCOLS" :key="protocol" :value="protocol">{{ protocol }}</option>
          </select>
          <FieldError :message="fieldErrors?.protocol" />
        </label>
        <label>
          <span class="field-label">Host</span>
          <input
            type="text"
            class="input-field font-mono"
            data-testid="service-host"
            spellcheck="false"
            :value="modelValue.host"
            @input="set('host', text($event))"
          />
          <FieldError :message="fieldErrors?.host" />
        </label>
        <label>
          <span class="field-label">Port</span>
          <input
            type="number"
            class="input-field"
            data-testid="service-port"
            :value="modelValue.port"
            @input="set('port', numeric($event))"
          />
          <FieldError :message="fieldErrors?.port" />
        </label>
        <label v-if="usesPath">
          <span class="field-label">Path</span>
          <input
            type="text"
            class="input-field font-mono"
            data-testid="service-path"
            :value="modelValue.path"
            @input="set('path', text($event))"
          />
          <FieldError :message="fieldErrors?.path" />
        </label>
        <div class="flex items-end pb-1">
          <ToggleSwitch
            label="Enabled"
            show-status
            :model-value="modelValue.enabled"
            @update:model-value="(value) => set('enabled', value)"
          />
        </div>
      </div>
    </section>

    <section class="space-y-3 border-t border-border pt-4">
      <h4 class="section-heading">Timeouts and retries</h4>
      <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
        <label>
          <span class="field-label">Retries</span>
          <input type="number" class="input-field" :value="modelValue.retries" @input="set('retries', numeric($event))" />
        </label>
        <label>
          <span class="field-label">Connect timeout (ms)</span>
          <input
            type="number"
            class="input-field"
            :value="modelValue.connect_timeout"
            @input="set('connect_timeout', numeric($event))"
          />
        </label>
        <label>
          <span class="field-label">Write timeout (ms)</span>
          <input
            type="number"
            class="input-field"
            :value="modelValue.write_timeout"
            @input="set('write_timeout', numeric($event))"
          />
        </label>
        <label>
          <span class="field-label">Read timeout (ms)</span>
          <input
            type="number"
            class="input-field"
            :value="modelValue.read_timeout"
            @input="set('read_timeout', numeric($event))"
          />
        </label>
      </div>
    </section>

    <section v-if="usesTls" class="space-y-3 border-t border-border pt-4">
      <h4 class="section-heading">TLS</h4>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label>
          <span class="field-label">Client certificate id</span>
          <input
            type="text"
            class="input-field font-mono"
            spellcheck="false"
            :value="modelValue.client_certificate"
            @input="set('client_certificate', text($event))"
          />
          <FieldError :message="fieldErrors?.client_certificate" />
        </label>
        <label>
          <span class="field-label">Verify upstream certificate</span>
          <select
            class="input-field"
            :value="modelValue.tls_verify"
            @change="set('tls_verify', text($event) as ServiceForm['tls_verify'])"
          >
            <option value="inherit">Use Kong default</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </label>
        <label>
          <span class="field-label">Verify depth</span>
          <input
            type="number"
            class="input-field"
            :value="modelValue.tls_verify_depth"
            @input="set('tls_verify_depth', numeric($event))"
          />
        </label>
        <div>
          <span class="field-label">CA certificate ids</span>
          <ValueListEditor
            add-label="Add id"
            placeholder="certificate id"
            :model-value="modelValue.ca_certificates"
            @update:model-value="(value) => set('ca_certificates', value)"
          />
        </div>
      </div>
    </section>

    <section class="space-y-3 border-t border-border pt-4">
      <h4 class="section-heading">Tags</h4>
      <TagInput :model-value="modelValue.tags" @update:model-value="(value) => set('tags', value)" />
    </section>
  </fieldset>
</template>
```

Create `src/views/live/LiveServicesView.vue`:

```vue
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useConnectionStore } from '../../stores/connection'
import { useLiveEntities } from '../../composables/useLiveEntities'
import type { LiveEntity } from '../../composables/useLiveEntities'
import { fromEntity, newServiceForm, toPayload, validateService } from '../../lib/live/serviceForm'
import type { ServiceForm as ServiceFormModel } from '../../lib/live/serviceForm'
import LiveGate from '../../components/live/LiveGate.vue'
import LiveErrorBanner from '../../components/live/LiveErrorBanner.vue'
import ServiceForm from '../../components/live/ServiceForm.vue'
import SearchInput from '../../components/shared/SearchInput.vue'
import ToggleSwitch from '../../components/shared/ToggleSwitch.vue'

const connection = useConnectionStore()
const {
  items,
  next,
  loading,
  error,
  tagFilter,
  load,
  loadMore,
  create: createEntity,
  save: saveEntity,
  remove: removeEntity,
  toggleEnabled: toggleEntity,
} = useLiveEntities<LiveEntity>('services')

const search = ref('')
const tagText = ref('')
const selectedId = ref<string | null>(null)
const creating = ref(false)
const form = ref<ServiceFormModel | null>(null)
const baseline = ref('')
const validationErrors = ref<string[]>([])
const busy = ref(false)

const dirty = computed(() => form.value !== null && JSON.stringify(form.value) !== baseline.value)
const canSave = computed(
  () => connection.canWrite && !busy.value && form.value !== null && (creating.value || dirty.value),
)

function label(service: LiveEntity): string {
  return typeof service.name === 'string' && service.name ? service.name : `${service.host}:${service.port ?? ''}`
}

const filtered = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return items.value
  return items.value.filter((service) => {
    const tags = Array.isArray(service.tags) ? (service.tags as string[]) : []
    const haystack = [service.name, service.host, service.path, ...tags].filter(Boolean).join(' ').toLowerCase()
    return haystack.includes(query)
  })
})

const fieldErrors = computed(() =>
  Object.fromEntries(
    Object.entries(error.value?.fields ?? {}).map(([field, problem]) => [
      field,
      typeof problem === 'string' ? problem : JSON.stringify(problem),
    ]),
  ),
)

function setForm(next: ServiceFormModel | null) {
  form.value = next
  baseline.value = next ? JSON.stringify(next) : ''
  validationErrors.value = []
}

function confirmDiscard(): boolean {
  return !dirty.value || window.confirm('Discard your unsaved changes?')
}

function select(service: LiveEntity) {
  if (!confirmDiscard()) return
  creating.value = false
  selectedId.value = service.id
  setForm(fromEntity(service))
}

function startCreate() {
  if (!confirmDiscard()) return
  creating.value = true
  selectedId.value = null
  setForm(newServiceForm())
}

function discard() {
  if (!dirty.value || !window.confirm('Discard your unsaved changes?')) return
  form.value = JSON.parse(baseline.value) as ServiceFormModel
  validationErrors.value = []
}

async function save() {
  if (!form.value) return
  const errors = validateService(form.value)
  validationErrors.value = errors
  if (errors.length > 0) return
  busy.value = true
  try {
    if (creating.value) {
      const created = await createEntity(toPayload(form.value, 'create'))
      creating.value = false
      selectedId.value = created.id
      setForm(fromEntity(created))
    } else if (selectedId.value) {
      const updated = await saveEntity(selectedId.value, toPayload(form.value, 'update'))
      setForm(fromEntity(updated))
    }
  } catch {
    // The error is already in `error` and shown in the banner; the form stays open.
  } finally {
    busy.value = false
  }
}

async function remove() {
  if (!selectedId.value || !window.confirm('Delete this service?')) return
  try {
    await removeEntity(selectedId.value)
    selectedId.value = null
    setForm(null)
  } catch {
    // Shown in the banner.
  }
}

async function toggle(service: LiveEntity, enabled: boolean) {
  try {
    await toggleEntity(service.id, enabled)
  } catch {
    return
  }
  const updated = items.value.find((item) => item.id === service.id)
  if (updated && selectedId.value === service.id && !dirty.value) setForm(fromEntity(updated))
}

function applyTagFilter() {
  tagFilter.value = tagText.value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
  void load()
}

onMounted(() => {
  if (connection.isConnected) void load()
})
watch(
  () => connection.active?.baseUrl,
  (baseUrl) => {
    selectedId.value = null
    setForm(null)
    if (baseUrl) void load()
  },
)
</script>

<template>
  <LiveGate>
    <div class="flex flex-1 flex-col lg:h-[calc(100vh-4rem)] lg:flex-row lg:overflow-hidden">
      <div
        class="flex w-full shrink-0 flex-col border-b border-border bg-surface lg:w-80 lg:border-b-0 lg:border-r"
        data-testid="live-list-panel"
      >
        <div class="space-y-2 p-3">
          <div class="flex items-center gap-2">
            <div class="min-w-0 flex-1">
              <SearchInput v-model="search" placeholder="Search loaded services…" />
            </div>
            <button
              type="button"
              class="btn-primary"
              data-testid="new-service"
              :disabled="!connection.canWrite"
              @click="startCreate"
            >
              New
            </button>
          </div>
          <input
            v-model="tagText"
            type="text"
            class="input-field text-xs"
            data-testid="tag-filter"
            placeholder="Filter by tags (comma separated), Enter to apply"
            @keydown.enter.prevent="applyTagFilter"
          />
        </div>

        <ul class="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
          <li
            v-for="service in filtered"
            :key="service.id"
            data-testid="service-row"
            class="flex cursor-pointer items-center gap-2 rounded-lg border-l-2 py-1.5 pl-2 pr-2 text-sm transition-colors duration-150"
            :class="
              service.id === selectedId
                ? 'border-accent bg-accent/10 font-medium text-link'
                : 'border-transparent text-ink-muted hover:bg-elevated'
            "
            @click="select(service)"
          >
            <span class="min-w-0 flex-1 truncate font-mono" :title="label(service)">{{ label(service) }}</span>
            <fieldset :disabled="!connection.canWrite" class="contents" @click.stop>
              <ToggleSwitch
                :model-value="service.enabled !== false"
                @update:model-value="(value) => toggle(service, value)"
              />
            </fieldset>
          </li>
        </ul>
        <p v-if="loading" class="px-3 pb-2 text-xs text-ink-muted">Loading…</p>
        <p v-else-if="filtered.length === 0" class="px-3 pb-2 text-xs text-ink-muted">No services.</p>
        <button
          v-if="next"
          type="button"
          class="btn-secondary mx-3 mb-3"
          data-testid="load-more"
          :disabled="loading"
          @click="loadMore"
        >
          Load more
        </button>
      </div>

      <div class="flex-1 space-y-4 overflow-y-auto p-6">
        <LiveErrorBanner :messages="validationErrors" :error="error" />
        <div v-if="form" class="max-w-3xl space-y-4">
          <ServiceForm v-model="form" :disabled="!connection.canWrite" :field-errors="fieldErrors" />
          <div class="flex flex-wrap items-center gap-2">
            <button
              v-if="!creating"
              type="button"
              class="btn-danger-ghost"
              data-testid="delete"
              :disabled="!connection.canWrite || busy"
              @click="remove"
            >
              Delete
            </button>
            <span v-if="dirty" class="inline-flex items-center gap-1 text-[11px] font-medium text-ink-muted">
              <span class="h-1.5 w-1.5 rounded-full bg-accent" />
              Unsaved changes
            </span>
            <div class="ml-auto flex gap-2">
              <button type="button" class="btn-secondary" data-testid="discard" :disabled="!dirty" @click="discard">
                Discard
              </button>
              <button type="button" class="btn-primary" data-testid="save" :disabled="!canSave" @click="save">
                {{ creating ? 'Create' : 'Save' }}
              </button>
            </div>
          </div>
        </div>
        <div v-else class="flex h-full min-h-[16rem] items-center justify-center text-center">
          <p class="text-sm text-ink-muted">Select a service from the list, or create a new one.</p>
        </div>
      </div>
    </div>
  </LiveGate>
</template>
```

In `src/router/index.ts`, run:

```bash
python3 - <<'E'
p = 'src/router/index.ts'
s = open(p).read()

def rep(a, b):
    global s
    assert a in s, a
    s = s.replace(a, b, 1)

rep("import CompareView from '../views/CompareView.vue'\n",
    "import CompareView from '../views/CompareView.vue'\nimport LiveServicesView from '../views/live/LiveServicesView.vue'\n")
rep("    { path: '/compare', name: 'compare', component: CompareView },\n",
    "    { path: '/compare', name: 'compare', component: CompareView },\n    { path: '/live', redirect: '/live/services' },\n    { path: '/live/services', name: 'live-services', component: LiveServicesView },\n")
open(p, 'w').write(s)
E
```

- [ ] **Step 4: Run the tests and typecheck to verify they pass**

Run: `npx vitest run src/views/live && npx vue-tsc -b`
Expected: PASS; typecheck prints nothing.

- [ ] **Step 5: Run the whole suite and commit**

Run: `npx vitest run`
Expected: all tests PASS.

```bash
git add src/components/live/ServiceForm.vue src/views/live src/router/index.ts
git commit -m "feat: add live services view with create, edit, toggle and delete

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Live routes view

**Files:**
- Modify: `src/components/shared/ProtocolPicker.vue`
- Create: `src/components/live/ServicePicker.vue`
- Create: `src/components/live/RouteForm.vue`
- Create: `src/views/live/LiveRoutesView.vue`
- Create: `src/views/live/LiveRoutesView.test.ts`
- Modify: `src/router/index.ts`

**Interfaces:**
- Consumes: Task 4 (`useLiveEntities`, `LiveEntity`), Task 3 (`fromEntity`, `newRouteForm`, `toPayload`, `validateRoute`, `ROUTE_PROTOCOLS`, `routeFamily`, `RouteForm` type), Task 5 (`LiveGate`, `LiveErrorBanner`, `FieldError`), shared `ValueListEditor`, `MethodPicker`, `ToggleSwitch`, `TagInput`, `SearchInput`, `ProtocolPicker`.
- Produces: route `/live/routes` (query `?service=<id>` filters to one service's routes); `ProtocolPicker` optional prop `options?: readonly string[]`; `ServicePicker.vue` with props `{ modelValue: string; options: { id: string; label: string }[]; disabled?: boolean }`; `RouteForm.vue` with props `{ modelValue: RouteForm; serviceOptions: { id: string; label: string }[]; disabled?: boolean; fieldErrors?: Record<string, string> }`; test ids `route-row`, `new-route`, `service-filter`, `route-name`, `route-service`, `route-paths`, `route-hosts`, `save`, `discard`, `delete`.

- [ ] **Step 1: Write the failing tests**

Create `src/views/live/LiveRoutesView.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { flushPromises, mount } from '@vue/test-utils'
import LiveRoutesView from './LiveRoutesView.vue'
import ProtocolPicker from '../../components/shared/ProtocolPicker.vue'
import { useConnectionStore } from '../../stores/connection'

type Call = { method: string; url: string; body?: Record<string, unknown> }

const SERVICES = [
  { id: 'svc-1', name: 'billing', host: 'billing.internal' },
  { id: 'svc-2', name: 'reports', host: 'reports.internal' },
]
const ROUTES = [
  { id: 'r-1', name: 'billing-route', protocols: ['http'], paths: ['/billing'], hosts: [], methods: [], service: { id: 'svc-1' } },
  { id: 'r-2', name: 'reports-route', protocols: ['https'], paths: ['/reports'], hosts: ['r.example.com'], methods: ['GET'], service: { id: 'svc-2' } },
]

function fakeKong(failCreateWith?: { status: number; body: unknown }) {
  const calls: Call[] = []
  const reply = (body: unknown, status = 200) => ({
    ok: status < 400,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET'
      const body = init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : undefined
      calls.push({ method, url, body })
      if (method === 'GET' && url.endsWith('/services')) return reply({ data: SERVICES })
      if (method === 'GET' && url.endsWith('/services/svc-1/routes')) return reply({ data: [ROUTES[0]] })
      if (method === 'GET' && url.endsWith('/routes')) return reply({ data: ROUTES })
      if (method === 'POST') {
        if (failCreateWith) return reply(failCreateWith.body, failCreateWith.status)
        return reply({ id: 'new-1', ...body }, 201)
      }
      if (method === 'PATCH') return reply({ ...ROUTES.find((r) => url.endsWith(`/routes/${r.id}`)), ...body })
      if (method === 'DELETE') return { ok: true, status: 204, text: async () => '' }
      return reply({}, 404)
    }),
  )
  return calls
}

function connect(database = 'postgres') {
  useConnectionStore().$patch({ active: { baseUrl: 'http://kong:8001' }, info: { version: '3.4.0', database } })
}

async function mountView(query = '') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/live/routes', component: { template: '<div />' } },
    ],
  })
  router.push(`/live/routes${query}`)
  await router.isReady()
  const wrapper = mount(LiveRoutesView, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

type Wrapper = Awaited<ReturnType<typeof mountView>>
const byId = (wrapper: Wrapper, id: string) => wrapper.find(`[data-testid="${id}"]`)
const rows = (wrapper: Wrapper) => wrapper.findAll('[data-testid="route-row"]')
const valueOf = (wrapper: Wrapper, id: string) => (byId(wrapper, id).element as HTMLInputElement).value

beforeEach(() => setActivePinia(createPinia()))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ProtocolPicker options', () => {
  it('offers the given options instead of the default list', () => {
    const wrapper = mount(ProtocolPicker, { props: { modelValue: [], options: ['tcp', 'tls_passthrough'] } })

    expect(wrapper.findAll('button').map((b) => b.text())).toEqual(['tcp', 'tls_passthrough'])
  })

  it('still lists the default protocols when no options are given', () => {
    const wrapper = mount(ProtocolPicker, { props: { modelValue: [] } })

    expect(wrapper.findAll('button').map((b) => b.text())).toContain('http')
  })
})

describe('LiveRoutesView', () => {
  it('shows the connect prompt and sends no request when not connected', async () => {
    const calls = fakeKong()

    const wrapper = await mountView()

    expect(byId(wrapper, 'live-not-connected').exists()).toBe(true)
    expect(calls).toHaveLength(0)
  })

  it('lists routes with their service names', async () => {
    connect()
    fakeKong()

    const wrapper = await mountView()

    expect(rows(wrapper)).toHaveLength(2)
    expect(rows(wrapper)[0].text()).toContain('billing-route')
    expect(rows(wrapper)[0].text()).toContain('billing')
    expect(rows(wrapper)[1].text()).toContain('reports')
  })

  it('lists only one service\'s routes through service_routes when ?service= is given', async () => {
    connect()
    const calls = fakeKong()

    const wrapper = await mountView('?service=svc-1')

    expect(calls.some((c) => c.url === 'http://kong:8001/services/svc-1/routes')).toBe(true)
    expect(rows(wrapper)).toHaveLength(1)
    expect((byId(wrapper, 'service-filter').element as HTMLSelectElement).value).toBe('svc-1')
  })

  it('on DB-less Kong shows the notice and disables every write control', async () => {
    connect('off')
    fakeKong()
    const wrapper = await mountView()

    expect(byId(wrapper, 'live-read-only').exists()).toBe(true)
    expect(byId(wrapper, 'new-route').attributes('disabled')).toBeDefined()
    await rows(wrapper)[0].trigger('click')
    expect(byId(wrapper, 'save').attributes('disabled')).toBeDefined()
    expect(byId(wrapper, 'delete').attributes('disabled')).toBeDefined()
    expect(wrapper.find('fieldset').attributes('disabled')).toBeDefined()
  })

  it('edits a route and saves it with a PATCH to the plain route endpoint', async () => {
    connect()
    const calls = fakeKong()
    const wrapper = await mountView('?service=svc-1')

    await rows(wrapper)[0].trigger('click')
    expect(valueOf(wrapper, 'route-name')).toBe('billing-route')
    expect(valueOf(wrapper, 'route-service')).toBe('svc-1')

    await byId(wrapper, 'route-name').setValue('renamed')
    await byId(wrapper, 'save').trigger('click')
    await flushPromises()

    const patch = calls.find((c) => c.method === 'PATCH')!
    expect(patch.url).toBe('http://kong:8001/routes/r-1')
    expect(patch.body).toMatchObject({ name: 'renamed', protocols: ['http'], paths: ['/billing'], service: { id: 'svc-1' } })
  })

  it('creates a route with a POST to /routes, never sending null values', async () => {
    connect()
    const calls = fakeKong()
    const wrapper = await mountView()

    await byId(wrapper, 'new-route').trigger('click')
    await byId(wrapper, 'route-name').setValue('fresh')
    await wrapper.findAll('button[aria-pressed]').find((b) => b.text() === 'http')!.trigger('click')
    await byId(wrapper, 'route-service').setValue('svc-2')
    const pathInput = wrapper.find('[data-testid="route-paths"] input[placeholder*="Add path"]')
    await pathInput.setValue('/fresh')
    await pathInput.trigger('keydown', { key: 'Enter' })
    await byId(wrapper, 'save').trigger('click')
    await flushPromises()

    const post = calls.find((c) => c.method === 'POST')!
    expect(post.url).toBe('http://kong:8001/routes')
    expect(post.body).toMatchObject({ name: 'fresh', protocols: ['http'], paths: ['/fresh'], service: { id: 'svc-2' } })
    expect(Object.values(post.body!).includes(null)).toBe(false)
    expect(rows(wrapper)[0].text()).toContain('fresh')
  })

  it('preselects the filtered service for a new route', async () => {
    connect()
    fakeKong()
    const wrapper = await mountView('?service=svc-1')

    await byId(wrapper, 'new-route').trigger('click')

    expect(valueOf(wrapper, 'route-service')).toBe('svc-1')
  })

  it('blocks Save with the Primate message when no protocol is selected', async () => {
    connect()
    const calls = fakeKong()
    const wrapper = await mountView()

    await byId(wrapper, 'new-route').trigger('click')
    await byId(wrapper, 'save').trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toContain('Please check at least one protocol from the list.')
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('blocks Save when a selected protocol has none of its required fields', async () => {
    connect()
    const calls = fakeKong()
    const wrapper = await mountView()

    await byId(wrapper, 'new-route').trigger('click')
    await wrapper.findAll('button[aria-pressed]').find((b) => b.text() === 'tcp')!.trigger('click')
    await byId(wrapper, 'save').trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toContain(
      'At least one of sources, destinations is required, if TCP is selected.',
    )
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('shows Kong field errors in the banner and keeps the form open', async () => {
    connect()
    fakeKong({ status: 400, body: { message: 'schema violation (paths: invalid)', fields: { paths: 'invalid' } } })
    const wrapper = await mountView()

    await byId(wrapper, 'new-route').trigger('click')
    await wrapper.findAll('button[aria-pressed]').find((b) => b.text() === 'http')!.trigger('click')
    const pathInput = wrapper.find('[data-testid="route-paths"] input[placeholder*="Add path"]')
    await pathInput.setValue('nope')
    await pathInput.trigger('keydown', { key: 'Enter' })
    await byId(wrapper, 'save').trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toContain('schema violation (paths: invalid)')
    expect(byId(wrapper, 'save').exists()).toBe(true)
  })

  it('deletes the selected route after confirmation, and not when cancelled', async () => {
    connect()
    const calls = fakeKong()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const wrapper = await mountView()

    await rows(wrapper)[0].trigger('click')
    await byId(wrapper, 'delete').trigger('click')
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)

    confirm.mockReturnValue(true)
    await byId(wrapper, 'delete').trigger('click')
    await flushPromises()
    expect(calls.find((c) => c.method === 'DELETE')?.url).toBe('http://kong:8001/routes/r-1')
    expect(rows(wrapper)).toHaveLength(1)
  })

  it('asks before discarding edits on selection change and on Discard, keeping them on cancel', async () => {
    connect()
    fakeKong()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const wrapper = await mountView()

    await rows(wrapper)[0].trigger('click')
    await byId(wrapper, 'route-name').setValue('edited')
    await rows(wrapper)[1].trigger('click')
    expect(confirm).toHaveBeenCalled()
    expect(valueOf(wrapper, 'route-name')).toBe('edited')

    await byId(wrapper, 'discard').trigger('click')
    expect(valueOf(wrapper, 'route-name')).toBe('edited')

    confirm.mockReturnValue(true)
    await byId(wrapper, 'discard').trigger('click')
    expect(valueOf(wrapper, 'route-name')).toBe('billing-route')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/views/live/LiveRoutesView.test.ts`
Expected: FAIL, cannot resolve `./LiveRoutesView.vue`.

- [ ] **Step 3: Write the implementation**

In `src/components/shared/ProtocolPicker.vue`, run:

```bash
python3 - <<'E'
p = 'src/components/shared/ProtocolPicker.vue'
s = open(p).read()

def rep(a, b):
    global s
    assert a in s, a
    s = s.replace(a, b, 1)

rep("const props = defineProps<{ modelValue: string[] | undefined }>()",
    "const props = defineProps<{ modelValue: string[] | undefined; options?: readonly string[] }>()")
rep('v-for="protocol in KONG_PROTOCOLS"', 'v-for="protocol in options ?? KONG_PROTOCOLS"')
open(p, 'w').write(s)
E
```

Create `src/components/live/ServicePicker.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'

export type ServiceOption = { id: string; label: string }

const props = defineProps<{ modelValue: string; options: ServiceOption[]; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const query = ref('')
const visible = computed(() => {
  const needle = query.value.trim().toLowerCase()
  return props.options.filter(
    (option) => !needle || option.label.toLowerCase().includes(needle) || option.id === props.modelValue,
  )
})
const unknownSelected = computed(() => props.modelValue !== '' && !props.options.some((o) => o.id === props.modelValue))
</script>

<template>
  <div class="space-y-1.5">
    <input
      v-model="query"
      type="text"
      class="input-field text-xs"
      placeholder="Search services…"
      data-testid="service-picker-search"
      :disabled="disabled"
    />
    <select
      class="input-field"
      data-testid="route-service"
      :disabled="disabled"
      :value="modelValue"
      @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <option value="">(no service)</option>
      <option v-for="option in visible" :key="option.id" :value="option.id">{{ option.label }}</option>
      <option v-if="unknownSelected" :value="modelValue">{{ modelValue }}</option>
    </select>
  </div>
</template>
```

Create `src/components/live/RouteForm.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { ROUTE_PROTOCOLS, routeFamily } from '../../lib/live/routeForm'
import type { RouteForm } from '../../lib/live/routeForm'
import FieldError from './FieldError.vue'
import ServicePicker from './ServicePicker.vue'
import type { ServiceOption } from './ServicePicker.vue'
import MethodPicker from '../shared/MethodPicker.vue'
import ProtocolPicker from '../shared/ProtocolPicker.vue'
import TagInput from '../shared/TagInput.vue'
import ToggleSwitch from '../shared/ToggleSwitch.vue'
import ValueListEditor from '../shared/ValueListEditor.vue'

const props = defineProps<{
  modelValue: RouteForm
  serviceOptions: ServiceOption[]
  disabled?: boolean
  fieldErrors?: Record<string, string>
}>()
const emit = defineEmits<{ 'update:modelValue': [value: RouteForm] }>()

function set<K extends keyof RouteForm>(key: K, value: RouteForm[K]) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}
function text(event: Event): string {
  return (event.target as HTMLInputElement).value
}
function numeric(event: Event): number | '' {
  const value = text(event)
  return value === '' ? '' : Number(value)
}

const family = computed(() => routeFamily(props.modelValue.protocols))
const showHttpFields = computed(() => family.value !== 'stream')
const showMethods = computed(() => family.value !== 'stream' && family.value !== 'grpc')
const showStreamFields = computed(() => family.value === 'stream' || family.value === null)
</script>

<template>
  <fieldset :disabled="disabled" class="space-y-5 border-0 p-0">
    <section class="space-y-3">
      <h4 class="section-heading">Route</h4>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label>
          <span class="field-label">Name</span>
          <input
            type="text"
            class="input-field"
            data-testid="route-name"
            placeholder="(unnamed route)"
            :value="modelValue.name"
            @input="set('name', text($event))"
          />
          <FieldError :message="fieldErrors?.name" />
        </label>
        <div>
          <span class="field-label">Service</span>
          <ServicePicker
            :model-value="modelValue.service"
            :options="serviceOptions"
            @update:model-value="(value) => set('service', value)"
          />
          <FieldError :message="fieldErrors?.service" />
        </div>
      </div>
      <div>
        <span class="field-label">Protocols</span>
        <ProtocolPicker
          :model-value="modelValue.protocols"
          :options="ROUTE_PROTOCOLS"
          @update:model-value="(value) => set('protocols', value)"
        />
        <FieldError :message="fieldErrors?.protocols" />
      </div>
    </section>

    <section class="space-y-3 border-t border-border pt-4">
      <h4 class="section-heading">Matching</h4>
      <div v-if="showHttpFields" class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div data-testid="route-hosts">
          <span class="field-label">Hosts</span>
          <ValueListEditor
            add-label="Add host"
            placeholder="api.example.com"
            :model-value="modelValue.hosts"
            @update:model-value="(value) => set('hosts', value)"
          />
          <FieldError :message="fieldErrors?.hosts" />
        </div>
        <div data-testid="route-paths">
          <span class="field-label">Paths</span>
          <ValueListEditor
            add-label="Add path"
            placeholder="/v1/resource"
            :model-value="modelValue.paths"
            @update:model-value="(value) => set('paths', value)"
          />
          <FieldError :message="fieldErrors?.paths" />
        </div>
        <div v-if="showMethods">
          <span class="field-label">Methods</span>
          <MethodPicker :model-value="modelValue.methods" @update:model-value="(value) => set('methods', value)" />
          <FieldError :message="fieldErrors?.methods" />
        </div>
        <div>
          <span class="field-label">Headers</span>
          <ValueListEditor
            add-label="Add header"
            placeholder="X-Env: dev, prod"
            :model-value="modelValue.headers"
            @update:model-value="(value) => set('headers', value)"
          />
          <FieldError :message="fieldErrors?.headers" />
        </div>
      </div>
      <div v-if="showStreamFields" class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <span class="field-label">Sources</span>
          <ValueListEditor
            add-label="Add source"
            placeholder="10.0.0.1:80"
            :model-value="modelValue.sources"
            @update:model-value="(value) => set('sources', value)"
          />
          <FieldError :message="fieldErrors?.sources" />
        </div>
        <div>
          <span class="field-label">Destinations</span>
          <ValueListEditor
            add-label="Add destination"
            placeholder="10.0.0.2:443"
            :model-value="modelValue.destinations"
            @update:model-value="(value) => set('destinations', value)"
          />
          <FieldError :message="fieldErrors?.destinations" />
        </div>
      </div>
      <div>
        <span class="field-label">SNIs</span>
        <ValueListEditor
          add-label="Add SNI"
          placeholder="example.com"
          :model-value="modelValue.snis"
          @update:model-value="(value) => set('snis', value)"
        />
        <FieldError :message="fieldErrors?.snis" />
      </div>
    </section>

    <section class="space-y-3 border-t border-border pt-4">
      <h4 class="section-heading">Behavior</h4>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label>
          <span class="field-label">HTTPS redirect status</span>
          <select
            class="input-field"
            :value="modelValue.https_redirect_status_code"
            @change="set('https_redirect_status_code', numeric($event))"
          >
            <option v-for="code in [426, 301, 302, 307, 308]" :key="code" :value="code">{{ code }}</option>
          </select>
        </label>
        <label>
          <span class="field-label">Regex priority</span>
          <input
            type="number"
            class="input-field"
            :value="modelValue.regex_priority"
            @input="set('regex_priority', numeric($event))"
          />
        </label>
        <label>
          <span class="field-label">Path handling</span>
          <select class="input-field" :value="modelValue.path_handling" @change="set('path_handling', text($event))">
            <option value="v0">v0</option>
            <option value="v1">v1</option>
          </select>
        </label>
      </div>
      <div class="flex flex-wrap gap-x-6 gap-y-2">
        <ToggleSwitch label="Strip path" :model-value="modelValue.strip_path" @update:model-value="(v) => set('strip_path', v)" />
        <ToggleSwitch label="Preserve host" :model-value="modelValue.preserve_host" @update:model-value="(v) => set('preserve_host', v)" />
        <ToggleSwitch label="Request buffering" :model-value="modelValue.request_buffering" @update:model-value="(v) => set('request_buffering', v)" />
        <ToggleSwitch label="Response buffering" :model-value="modelValue.response_buffering" @update:model-value="(v) => set('response_buffering', v)" />
      </div>
    </section>

    <section class="space-y-3 border-t border-border pt-4">
      <h4 class="section-heading">Tags</h4>
      <TagInput :model-value="modelValue.tags" @update:model-value="(value) => set('tags', value)" />
    </section>
  </fieldset>
</template>
```

Create `src/views/live/LiveRoutesView.vue`:

```vue
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useConnectionStore } from '../../stores/connection'
import { useLiveEntities } from '../../composables/useLiveEntities'
import type { LiveEntity } from '../../composables/useLiveEntities'
import { fromEntity, newRouteForm, toPayload, validateRoute } from '../../lib/live/routeForm'
import type { RouteForm as RouteFormModel } from '../../lib/live/routeForm'
import LiveGate from '../../components/live/LiveGate.vue'
import LiveErrorBanner from '../../components/live/LiveErrorBanner.vue'
import RouteForm from '../../components/live/RouteForm.vue'
import SearchInput from '../../components/shared/SearchInput.vue'

const connection = useConnectionStore()
const route = useRoute()
const router = useRouter()

const serviceFilter = ref(typeof route.query.service === 'string' ? route.query.service : '')
const services = ref<LiveEntity[]>([])

const {
  items,
  next,
  loading,
  error,
  tagFilter,
  load,
  loadMore,
  create: createEntity,
  save: saveEntity,
  remove: removeEntity,
} = useLiveEntities<LiveEntity>('routes', {
  listVia: () =>
    serviceFilter.value ? { resource: 'service_routes', parentId: serviceFilter.value } : undefined,
})

const search = ref('')
const tagText = ref('')
const selectedId = ref<string | null>(null)
const creating = ref(false)
const form = ref<RouteFormModel | null>(null)
const baseline = ref('')
const validationErrors = ref<string[]>([])
const busy = ref(false)

const dirty = computed(() => form.value !== null && JSON.stringify(form.value) !== baseline.value)
const canSave = computed(
  () => connection.canWrite && !busy.value && form.value !== null && (creating.value || dirty.value),
)

function serviceLabel(service: LiveEntity): string {
  return typeof service.name === 'string' && service.name ? service.name : String(service.host ?? service.id)
}
const serviceOptions = computed(() => services.value.map((s) => ({ id: s.id, label: serviceLabel(s) })))

function serviceNameOf(routeEntity: LiveEntity): string {
  const id = (routeEntity.service as { id?: string } | null | undefined)?.id
  if (!id) return ''
  return serviceOptions.value.find((option) => option.id === id)?.label ?? id
}

function label(routeEntity: LiveEntity): string {
  if (typeof routeEntity.name === 'string' && routeEntity.name) return routeEntity.name
  const paths = Array.isArray(routeEntity.paths) ? (routeEntity.paths as string[]) : []
  return paths[0] ?? routeEntity.id
}

const filtered = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return items.value
  return items.value.filter((routeEntity) => {
    const list = (value: unknown) => (Array.isArray(value) ? (value as string[]) : [])
    const haystack = [
      routeEntity.name,
      serviceNameOf(routeEntity),
      ...list(routeEntity.paths),
      ...list(routeEntity.hosts),
      ...list(routeEntity.tags),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return haystack.includes(query)
  })
})

const fieldErrors = computed(() =>
  Object.fromEntries(
    Object.entries(error.value?.fields ?? {}).map(([field, problem]) => [
      field,
      typeof problem === 'string' ? problem : JSON.stringify(problem),
    ]),
  ),
)

function setForm(next: RouteFormModel | null) {
  form.value = next
  baseline.value = next ? JSON.stringify(next) : ''
  validationErrors.value = []
}

function confirmDiscard(): boolean {
  return !dirty.value || window.confirm('Discard your unsaved changes?')
}

function select(routeEntity: LiveEntity) {
  if (!confirmDiscard()) return
  creating.value = false
  selectedId.value = routeEntity.id
  setForm(fromEntity(routeEntity))
}

function startCreate() {
  if (!confirmDiscard()) return
  creating.value = true
  selectedId.value = null
  setForm({ ...newRouteForm(), service: serviceFilter.value })
}

function discard() {
  if (!dirty.value || !window.confirm('Discard your unsaved changes?')) return
  form.value = JSON.parse(baseline.value) as RouteFormModel
  validationErrors.value = []
}

async function save() {
  if (!form.value) return
  const errors = validateRoute(form.value)
  validationErrors.value = errors
  if (errors.length > 0) return
  busy.value = true
  try {
    if (creating.value) {
      const created = await createEntity(toPayload(form.value, 'create'))
      creating.value = false
      selectedId.value = created.id
      setForm(fromEntity(created))
    } else if (selectedId.value) {
      const updated = await saveEntity(selectedId.value, toPayload(form.value, 'update'))
      setForm(fromEntity(updated))
    }
  } catch {
    // The error is already in `error` and shown in the banner; the form stays open.
  } finally {
    busy.value = false
  }
}

async function remove() {
  if (!selectedId.value || !window.confirm('Delete this route?')) return
  try {
    await removeEntity(selectedId.value)
    selectedId.value = null
    setForm(null)
  } catch {
    // Shown in the banner.
  }
}

function applyTagFilter() {
  tagFilter.value = tagText.value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
  void load()
}

async function loadServices() {
  try {
    services.value = await connection.client<LiveEntity>('services').listAll()
  } catch {
    services.value = []
  }
}

function start() {
  void loadServices()
  void load()
}

onMounted(() => {
  if (connection.isConnected) start()
})
watch(
  () => connection.active?.baseUrl,
  (baseUrl) => {
    selectedId.value = null
    setForm(null)
    if (baseUrl) start()
  },
)
watch(serviceFilter, (id) => {
  router.replace({ query: { ...route.query, service: id || undefined } })
  void load()
})
</script>

<template>
  <LiveGate>
    <div class="flex flex-1 flex-col lg:h-[calc(100vh-4rem)] lg:flex-row lg:overflow-hidden">
      <div
        class="flex w-full shrink-0 flex-col border-b border-border bg-surface lg:w-80 lg:border-b-0 lg:border-r"
        data-testid="live-list-panel"
      >
        <div class="space-y-2 p-3">
          <div class="flex items-center gap-2">
            <div class="min-w-0 flex-1">
              <SearchInput v-model="search" placeholder="Search loaded routes…" />
            </div>
            <button
              type="button"
              class="btn-primary"
              data-testid="new-route"
              :disabled="!connection.canWrite"
              @click="startCreate"
            >
              New
            </button>
          </div>
          <select v-model="serviceFilter" class="input-field text-xs" data-testid="service-filter">
            <option value="">All services</option>
            <option v-for="option in serviceOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
          </select>
          <input
            v-model="tagText"
            type="text"
            class="input-field text-xs"
            data-testid="tag-filter"
            placeholder="Filter by tags (comma separated), Enter to apply"
            @keydown.enter.prevent="applyTagFilter"
          />
        </div>

        <ul class="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
          <li
            v-for="routeEntity in filtered"
            :key="routeEntity.id"
            data-testid="route-row"
            class="cursor-pointer rounded-lg border-l-2 py-1.5 pl-2 pr-2 text-sm transition-colors duration-150"
            :class="
              routeEntity.id === selectedId
                ? 'border-accent bg-accent/10 font-medium text-link'
                : 'border-transparent text-ink-muted hover:bg-elevated'
            "
            @click="select(routeEntity)"
          >
            <span class="block truncate font-mono" :title="label(routeEntity)">{{ label(routeEntity) }}</span>
            <span v-if="serviceNameOf(routeEntity)" class="block truncate text-[11px] text-ink-muted">
              {{ serviceNameOf(routeEntity) }}
            </span>
          </li>
        </ul>
        <p v-if="loading" class="px-3 pb-2 text-xs text-ink-muted">Loading…</p>
        <p v-else-if="filtered.length === 0" class="px-3 pb-2 text-xs text-ink-muted">No routes.</p>
        <button
          v-if="next"
          type="button"
          class="btn-secondary mx-3 mb-3"
          data-testid="load-more"
          :disabled="loading"
          @click="loadMore"
        >
          Load more
        </button>
      </div>

      <div class="flex-1 space-y-4 overflow-y-auto p-6">
        <LiveErrorBanner :messages="validationErrors" :error="error" />
        <div v-if="form" class="max-w-3xl space-y-4">
          <RouteForm
            v-model="form"
            :service-options="serviceOptions"
            :disabled="!connection.canWrite"
            :field-errors="fieldErrors"
          />
          <div class="flex flex-wrap items-center gap-2">
            <button
              v-if="!creating"
              type="button"
              class="btn-danger-ghost"
              data-testid="delete"
              :disabled="!connection.canWrite || busy"
              @click="remove"
            >
              Delete
            </button>
            <span v-if="dirty" class="inline-flex items-center gap-1 text-[11px] font-medium text-ink-muted">
              <span class="h-1.5 w-1.5 rounded-full bg-accent" />
              Unsaved changes
            </span>
            <div class="ml-auto flex gap-2">
              <button type="button" class="btn-secondary" data-testid="discard" :disabled="!dirty" @click="discard">
                Discard
              </button>
              <button type="button" class="btn-primary" data-testid="save" :disabled="!canSave" @click="save">
                {{ creating ? 'Create' : 'Save' }}
              </button>
            </div>
          </div>
        </div>
        <div v-else class="flex h-full min-h-[16rem] items-center justify-center text-center">
          <p class="text-sm text-ink-muted">Select a route from the list, or create a new one.</p>
        </div>
      </div>
    </div>
  </LiveGate>
</template>
```

In `src/router/index.ts`, run:

```bash
python3 - <<'E'
p = 'src/router/index.ts'
s = open(p).read()

def rep(a, b):
    global s
    assert a in s, a
    s = s.replace(a, b, 1)

rep("import LiveServicesView from '../views/live/LiveServicesView.vue'\n",
    "import LiveServicesView from '../views/live/LiveServicesView.vue'\nimport LiveRoutesView from '../views/live/LiveRoutesView.vue'\n")
rep("    { path: '/live/services', name: 'live-services', component: LiveServicesView },\n",
    "    { path: '/live/services', name: 'live-services', component: LiveServicesView },\n    { path: '/live/routes', name: 'live-routes', component: LiveRoutesView },\n")
open(p, 'w').write(s)
E
```

- [ ] **Step 4: Run the tests and typecheck to verify they pass**

Run: `npx vitest run src/views/live src/components && npx vue-tsc -b`
Expected: PASS; typecheck prints nothing.

- [ ] **Step 5: Run the whole suite, build, and commit**

Run: `npx vitest run && npm run build`
Expected: all tests PASS; the build finishes with `built in`.

```bash
git add src/components/shared/ProtocolPicker.vue src/components/live/ServicePicker.vue src/components/live/RouteForm.vue src/views/live/LiveRoutesView.vue src/views/live/LiveRoutesView.test.ts src/router/index.ts
git commit -m "feat: add live routes view with service filter and protocol-aware form

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-review notes

- **Spec coverage:** navigation and gating (spec 1) is Tasks 5 to 7 (`LiveGate`, sidebar, router, titles); data layer (spec 2) is Task 4; `service_routes` (spec 3) is Task 1; service and route form rules (spec 4) are Tasks 2 and 3; UI (spec 5) is Tasks 6 and 7; testing (spec 6) is inline in every task. Error-handling table: client validation (Tasks 6/7 tests), Kong field errors (Tasks 6/7 tests), DB-less (Tasks 5/6/7 tests), not connected (Tasks 5/6/7 tests). "Delete of a service that still has routes" relies on Kong's error reaching the banner via `run`/`toLiveError`, covered by the Task 4 error test and the Task 6 field-error test.
- **Type consistency:** `LiveEntity`, `LiveError`, `useLiveEntities` return names (`items`, `next`, `loading`, `error`, `tagFilter`, `load`, `loadMore`, `create`, `save`, `remove`, `toggleEnabled`), `ServiceForm`/`RouteForm` field names, `toPayload(form, mode)`, `fromEntity`, `newServiceForm`/`newRouteForm`, `validateService`/`validateRoute`, `ServiceOption` and all `data-testid` values match across the tasks that define and consume them.
- **Known limits, not gaps:** `client_certificate` and `ca_certificates` are plain id fields until step 2d; route `snis` are never cleared by design; no browser check is possible in this session.
