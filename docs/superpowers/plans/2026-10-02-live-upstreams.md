# Live Upstreams, Targets and Health Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Live Upstreams page (upstream CRUD, target management, read-only per-target health) and an Upstreams tile with an on-demand health check to the Overview dashboard.

**Architecture:** The entity client already knows `upstreams` and `targets`; this adds the UI on top of it, copying the `LiveServicesView` / `ServiceRoutesPanel` patterns. Pure logic (forms, health parsing, summaries) lives in `src/lib/`, request state in composables, markup in `src/components/live/`. Health is a separate, failure-tolerant read that never blocks CRUD.

**Tech Stack:** Vue 3 (`<script setup>`), Pinia, vue-router, Vitest + `@vue/test-utils`, Tailwind classes already used in the repo.

**Spec:** `docs/superpowers/specs/2026-10-02-live-upstreams-design.md`

## Global Constraints

- Healthchecks config is never edited: omitted on create, left alone on update (PATCH only sends the fields in the form).
- No mark-healthy/unhealthy calls, no polling.
- Dashboard health: nothing fetched until the user clicks "Check health"; at most 10 upstreams in flight.
- Health errors never replace the list, detail, or other dashboard tiles.
- Status is never colour-only: every health badge shows its label text.
- Kong targets are append-only; the UI shows the newest row per address and hides weight `0`.
- Do not refactor existing live views.
- Before the work is called done, run it in a real browser against a real Kong (Task 8). Typecheck and tests alone are not enough.
- Run commands from `/Users/peerapat.padtawaro/Documents/kong-manager`. Test command: `npx vitest run <path>`. Typecheck: `npx vue-tsc -b`.

## Review Focus

1. **Target history after delete:** deleting a target by address must not resurrect an older row of the same address after reload. Pinned in Task 8 (browser check); the panel deletes by address, not row id.
2. **"Set weight" on an existing address:** Kong may answer 409 instead of appending. The error must show in the panel and the list must stay unchanged. Pinned by a panel test (Task 5) and checked against real Kong (Task 8).
3. **Health call failing or returning garbage:** `{}`, `null`, a string, or rows without `target` must give "No health data", never a thrown error. Pinned in Task 1 and Task 5.
4. **Upstream selection changing while a health or target request is in flight:** the slower, older response must not overwrite the new selection. Pinned in Task 4.
5. **Hash options on edit:** an upstream saved with `hash_on: "header"` (not offered for new ones) must keep that value when edited, not be silently rewritten. Pinned in Task 2.

---

### Task 1: Health API and parser

**Files:**
- Create: `src/lib/kongAdmin/health.ts`
- Test: `src/lib/kongAdmin/health.test.ts`
- Modify: `docs/superpowers/specs/2026-10-02-live-upstreams-design.md` (section 2: return type)

**Interfaces:**
- Consumes: `adminJson(conn, method, path)` and `KongAdminConnection` from `./http`.
- Produces:
  - `type TargetHealth = { target: string; weight: number | undefined; health: string | undefined }`
  - `parseUpstreamHealth(raw: unknown): TargetHealth[]`
  - `getUpstreamHealth(conn: KongAdminConnection, upstreamId: string): Promise<TargetHealth[]>`

- [ ] **Step 1: Write the failing test**

Create `src/lib/kongAdmin/health.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { getUpstreamHealth, parseUpstreamHealth } from './health'

const json = (body: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
  headers: new Headers(),
})

afterEach(() => vi.unstubAllGlobals())

describe('parseUpstreamHealth', () => {
  it('reads target, weight and health from each row', () => {
    const rows = parseUpstreamHealth({
      data: [
        { target: 'a.internal:80', weight: 100, health: 'HEALTHY', created_at: 1 },
        { target: 'b.internal:80', weight: 50, health: 'UNHEALTHY' },
      ],
    })
    expect(rows).toEqual([
      { target: 'a.internal:80', weight: 100, health: 'HEALTHY' },
      { target: 'b.internal:80', weight: 50, health: 'UNHEALTHY' },
    ])
  })

  it('reads the weight from a { total } object, as newer Kong versions send it', () => {
    const rows = parseUpstreamHealth({ data: [{ target: 'a:80', weight: { total: 70, available: 70, unavailable: 0 }, health: 'HEALTHY' }] })
    expect(rows[0].weight).toBe(70)
  })

  it.each([null, undefined, 'x', 42, {}, { data: 'x' }, { data: null }])('returns [] for a malformed body (%j)', (raw) => {
    expect(parseUpstreamHealth(raw)).toEqual([])
  })

  it('skips rows without a usable target and passes unknown health strings through', () => {
    const rows = parseUpstreamHealth({ data: [null, 'x', { health: 'HEALTHY' }, { target: '' }, { target: 'a:80', health: 'SOMETHING_NEW' }, { target: 'b:80' }] })
    expect(rows).toEqual([
      { target: 'a:80', weight: undefined, health: 'SOMETHING_NEW' },
      { target: 'b:80', weight: undefined, health: undefined },
    ])
  })
})

describe('getUpstreamHealth', () => {
  it('requests the encoded upstream id and parses the rows', async () => {
    const fetchMock = vi.fn(async () => json({ data: [{ target: 'a:80', weight: 100, health: 'HEALTHY' }] }))
    vi.stubGlobal('fetch', fetchMock)

    const rows = await getUpstreamHealth({ baseUrl: 'http://kong:8001' }, 'up 1')

    expect((fetchMock.mock.calls[0] as unknown[])[0]).toBe('http://kong:8001/upstreams/up%201/health')
    expect(rows).toEqual([{ target: 'a:80', weight: 100, health: 'HEALTHY' }])
  })

  it('rejects when Kong answers with an error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ message: 'boom' }, 500)))
    await expect(getUpstreamHealth({ baseUrl: 'http://kong:8001' }, 'up-1')).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/kongAdmin/health.test.ts`
Expected: FAIL (cannot resolve `./health`).

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/kongAdmin/health.ts`:

```ts
import { adminJson } from './http'
import type { KongAdminConnection } from './http'

export type TargetHealth = { target: string; weight: number | undefined; health: string | undefined }

function readWeight(value: unknown): number | undefined {
  if (typeof value === 'number') return value
  const total = (value as { total?: unknown } | null | undefined)?.total
  return typeof total === 'number' ? total : undefined
}

/** Reads Kong's `/upstreams/{id}/health` body, tolerating anything unexpected by skipping it. */
export function parseUpstreamHealth(raw: unknown): TargetHealth[] {
  if (typeof raw !== 'object' || raw === null) return []
  const data = (raw as { data?: unknown }).data
  if (!Array.isArray(data)) return []
  const rows: TargetHealth[] = []
  for (const item of data) {
    if (typeof item !== 'object' || item === null) continue
    const row = item as { target?: unknown; weight?: unknown; health?: unknown }
    if (typeof row.target !== 'string' || row.target === '') continue
    rows.push({
      target: row.target,
      weight: readWeight(row.weight),
      health: typeof row.health === 'string' ? row.health : undefined,
    })
  }
  return rows
}

export async function getUpstreamHealth(conn: KongAdminConnection, upstreamId: string): Promise<TargetHealth[]> {
  const body = await adminJson<unknown>(conn, 'GET', `/upstreams/${encodeURIComponent(upstreamId)}/health`)
  return parseUpstreamHealth(body)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/kongAdmin/health.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Update the spec's return type**

In `docs/superpowers/specs/2026-10-02-live-upstreams-design.md` section 2, replace the sentence `and returns `{ data: TargetHealth[] }`, where `TargetHealth` is `{ target: string; weight: number; health: string }` (other fields ignored).` with `and returns `TargetHealth[]`, where `TargetHealth` is `{ target: string; weight: number | undefined; health: string | undefined }` (other fields ignored).`

- [ ] **Step 6: Commit**

```bash
git add src/lib/kongAdmin/health.ts src/lib/kongAdmin/health.test.ts docs/superpowers/specs/2026-10-02-live-upstreams-design.md
git commit -m "feat: read per-target upstream health from the Admin API

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Upstream and target form modules

**Files:**
- Create: `src/lib/live/upstreamForm.ts`, `src/lib/live/targetForm.ts`
- Test: `src/lib/live/upstreamForm.test.ts`, `src/lib/live/targetForm.test.ts`

**Interfaces:**
- Consumes: `ENTITY_RESOURCES` from `../kongAdmin/entities`.
- Produces (`upstreamForm.ts`):
  - `type UpstreamForm = { name: string; algorithm: string; hash_on: string; hash_fallback: string; slots: number | ''; host_header: string; tags: string[] }`
  - `UPSTREAM_ALGORITHMS: readonly ['round-robin','consistent-hashing','least-connections','latency']`
  - `hashOptions(current: string): string[]`
  - `fromEntity(entity: Record<string, unknown>): UpstreamForm`, `newUpstreamForm(): UpstreamForm`
  - `validateUpstream(form: UpstreamForm): string[]`
  - `toPayload(form: UpstreamForm, mode: 'create' | 'update'): Record<string, unknown>`
- Produces (`targetForm.ts`):
  - `type TargetForm = { target: string; weight: number | ''; tags: string[] }`
  - `newTargetForm(): TargetForm`, `validateTarget(form: TargetForm): string[]`, `toTargetPayload(form: TargetForm): Record<string, unknown>`
  - `type TargetLike = { target?: unknown; weight?: unknown; created_at?: unknown; upstream?: unknown }`
  - `targetsByAddress<T extends TargetLike>(targets: T[]): T[]`
  - `countTargetsByUpstream(targets: TargetLike[]): Record<string, number>`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/live/upstreamForm.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { fromEntity, hashOptions, newUpstreamForm, toPayload, validateUpstream } from './upstreamForm'

const base = () => ({ ...newUpstreamForm(), name: 'billing' })

describe('newUpstreamForm', () => {
  it('starts from the defaults, without healthchecks', () => {
    expect(newUpstreamForm()).toEqual({
      name: '',
      algorithm: 'round-robin',
      hash_on: 'none',
      hash_fallback: 'none',
      slots: 10000,
      host_header: '',
      tags: [],
    })
  })
})

describe('fromEntity', () => {
  it('maps an upstream and ignores healthchecks and unknown fields', () => {
    const form = fromEntity({ id: 'u1', name: 'api', algorithm: 'latency', hash_on: 'ip', slots: 1000, host_header: 'h', tags: ['a', 3], healthchecks: { x: 1 } })
    expect(form).toEqual({ name: 'api', algorithm: 'latency', hash_on: 'ip', hash_fallback: 'none', slots: 1000, host_header: 'h', tags: ['a'] })
  })
})

describe('hashOptions', () => {
  it('offers the options that need no extra field', () => {
    expect(hashOptions('none')).toEqual(['none', 'consumer', 'ip'])
  })

  it('keeps a value the form does not offer, so editing never rewrites it', () => {
    expect(hashOptions('header')).toEqual(['none', 'consumer', 'ip', 'header'])
  })
})

describe('validateUpstream', () => {
  it('requires a name', () => {
    expect(validateUpstream({ ...base(), name: '  ' })).toEqual(['Please provide a name for the upstream.'])
  })

  it.each([9, 65537, 1.5])('rejects slots %s', (slots) => {
    expect(validateUpstream({ ...base(), slots })).toEqual(['Slots must be a whole number from 10 to 65536.'])
  })

  it('accepts a valid form and an empty slots field', () => {
    expect(validateUpstream(base())).toEqual([])
    expect(validateUpstream({ ...base(), slots: '' })).toEqual([])
  })
})

describe('toPayload', () => {
  it('trims, cleans tags and leaves out an empty host_header on create', () => {
    const payload = toPayload({ ...base(), name: ' billing ', tags: [' a ', ''], host_header: '' }, 'create')
    expect(payload).toEqual({ name: 'billing', algorithm: 'round-robin', hash_on: 'none', hash_fallback: 'none', slots: 10000, tags: ['a'] })
    expect(payload).not.toHaveProperty('healthchecks')
  })

  it('sends host_header null on update when it was cleared, so Kong unsets it', () => {
    expect(toPayload({ ...base(), host_header: '' }, 'update')).toMatchObject({ host_header: null })
  })

  it('omits slots when the field is empty', () => {
    expect(toPayload({ ...base(), slots: '' }, 'create')).not.toHaveProperty('slots')
  })
})
```

Create `src/lib/live/targetForm.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { countTargetsByUpstream, newTargetForm, targetsByAddress, toTargetPayload, validateTarget } from './targetForm'

const form = (target: string, weight: number | '' = 100) => ({ target, weight, tags: [] as string[] })

describe('validateTarget', () => {
  it.each(['api.internal', 'api.internal:8080', '10.0.0.1:80', '[::1]:8080', 'a'])('accepts %s', (target) => {
    expect(validateTarget(form(target))).toEqual([])
  })

  it.each(['', '  ', 'a b', 'host:0', 'host:70000', '::1', 'host:', ':80'])('rejects %j', (target) => {
    expect(validateTarget(form(target))).toEqual(['Please provide a target as host, host:port or [ipv6]:port.'])
  })

  it.each([-1, 1.5, 65536])('rejects weight %s', (weight) => {
    expect(validateTarget(form('a:80', weight))).toEqual(['Weight must be a whole number from 0 to 65535.'])
  })

  it('accepts weight 0, 65535 and an empty weight (Kong defaults it)', () => {
    for (const weight of [0, 65535, ''] as const) expect(validateTarget(form('a:80', weight))).toEqual([])
  })
})

describe('toTargetPayload', () => {
  it('trims the target and omits an empty weight', () => {
    expect(toTargetPayload({ target: ' a:80 ', weight: '', tags: [' x ', ''] })).toEqual({ target: 'a:80', tags: ['x'] })
    expect(toTargetPayload(newTargetForm())).toEqual({ target: '', weight: 100, tags: [] })
  })
})

describe('targetsByAddress', () => {
  it('keeps the newest row per address and hides removed (weight 0) ones, sorted by address', () => {
    const rows = [
      { id: '1', target: 'b:80', weight: 100, created_at: 1 },
      { id: '2', target: 'a:80', weight: 100, created_at: 1 },
      { id: '3', target: 'a:80', weight: 50, created_at: 2 },
      { id: '4', target: 'c:80', weight: 100, created_at: 1 },
      { id: '5', target: 'c:80', weight: 0, created_at: 2 },
    ]
    expect(targetsByAddress(rows).map((row) => [row.id, row.weight])).toEqual([['3', 50], ['1', 100]])
  })

  it('lets the later row win a created_at tie and ignores rows without an address', () => {
    const rows = [{ id: '1', target: 'a:80', created_at: 1, weight: 1 }, { id: '2', target: 'a:80', created_at: 1, weight: 2 }, { id: '3' }]
    expect(targetsByAddress(rows).map((row) => row.id)).toEqual(['2'])
  })
})

describe('countTargetsByUpstream', () => {
  it('counts the current targets of each upstream', () => {
    const rows = [
      { target: 'a:80', weight: 100, created_at: 1, upstream: { id: 'u1' } },
      { target: 'a:80', weight: 50, created_at: 2, upstream: { id: 'u1' } },
      { target: 'b:80', weight: 100, created_at: 1, upstream: { id: 'u1' } },
      { target: 'a:80', weight: 100, created_at: 1, upstream: { id: 'u2' } },
      { target: 'z:80', weight: 100, created_at: 1 },
    ]
    expect(countTargetsByUpstream(rows)).toEqual({ u1: 2, u2: 1 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/live/upstreamForm.test.ts src/lib/live/targetForm.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Write the implementation**

Create `src/lib/live/upstreamForm.ts`:

```ts
import { ENTITY_RESOURCES } from '../kongAdmin/entities'

export type UpstreamForm = {
  name: string
  algorithm: string
  hash_on: string
  hash_fallback: string
  slots: number | ''
  host_header: string
  tags: string[]
}

export const UPSTREAM_ALGORITHMS = ['round-robin', 'consistent-hashing', 'least-connections', 'latency'] as const

// Only the hash sources that need no extra field (header name, cookie, query arg) are offered.
const HASH_SOURCES = ['none', 'consumer', 'ip']

/** The hash sources to offer, plus the current one if it is not among them, so editing never rewrites it. */
export function hashOptions(current: string): string[] {
  return HASH_SOURCES.includes(current) || current === '' ? [...HASH_SOURCES] : [...HASH_SOURCES, current]
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')
const numberOrEmpty = (value: unknown): number | '' => (typeof value === 'number' ? value : '')
const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

export function fromEntity(entity: Record<string, unknown>): UpstreamForm {
  return {
    name: text(entity.name),
    algorithm: text(entity.algorithm) || 'round-robin',
    hash_on: text(entity.hash_on) || 'none',
    hash_fallback: text(entity.hash_fallback) || 'none',
    slots: numberOrEmpty(entity.slots),
    host_header: text(entity.host_header),
    tags: stringList(entity.tags),
  }
}

export function newUpstreamForm(): UpstreamForm {
  return fromEntity(ENTITY_RESOURCES.upstreams.defaults)
}

export function validateUpstream(form: UpstreamForm): string[] {
  const errors: string[] = []
  if (form.name.trim() === '') errors.push('Please provide a name for the upstream.')
  if (form.slots !== '' && (!Number.isInteger(form.slots) || form.slots < 10 || form.slots > 65536)) {
    errors.push('Slots must be a whole number from 10 to 65536.')
  }
  return errors
}

/** `healthchecks` is never sent: Kong applies its defaults on create and a PATCH leaves it as it is. */
export function toPayload(form: UpstreamForm, mode: 'create' | 'update'): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: form.name.trim(),
    algorithm: form.algorithm,
    hash_on: form.hash_on,
    hash_fallback: form.hash_fallback,
    tags: form.tags.map((tag) => tag.trim()).filter(Boolean),
  }
  if (form.slots !== '') payload.slots = form.slots
  const hostHeader = form.host_header.trim()
  if (hostHeader) payload.host_header = hostHeader
  else if (mode === 'update') payload.host_header = null
  return payload
}
```

Create `src/lib/live/targetForm.ts`:

```ts
export type TargetForm = { target: string; weight: number | ''; tags: string[] }

export type TargetLike = { target?: unknown; weight?: unknown; created_at?: unknown; upstream?: unknown }

export function newTargetForm(): TargetForm {
  return { target: '', weight: 100, tags: [] }
}

// host, IPv4 or [IPv6], optionally followed by :port.
const TARGET_PATTERN = /^(?:[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?|\[[0-9A-Fa-f:.]+\])(?::(\d{1,5}))?$/

export function validateTarget(form: TargetForm): string[] {
  const errors: string[] = []
  const match = TARGET_PATTERN.exec(form.target.trim())
  const port = match?.[1] === undefined ? undefined : Number(match[1])
  if (!match || (port !== undefined && (port < 1 || port > 65535))) {
    errors.push('Please provide a target as host, host:port or [ipv6]:port.')
  }
  if (form.weight !== '' && (!Number.isInteger(form.weight) || form.weight < 0 || form.weight > 65535)) {
    errors.push('Weight must be a whole number from 0 to 65535.')
  }
  return errors
}

export function toTargetPayload(form: TargetForm): Record<string, unknown> {
  return {
    target: form.target.trim(),
    ...(form.weight !== '' ? { weight: form.weight } : {}),
    tags: form.tags.map((tag) => tag.trim()).filter(Boolean),
  }
}

const createdAt = (entry: TargetLike): number => (typeof entry.created_at === 'number' ? entry.created_at : 0)

/**
 * Kong lists a target's whole history: changing a weight adds a row and removing one adds a
 * weight 0 row. The newest row per address is the current one, and weight 0 means it is gone.
 */
export function targetsByAddress<T extends TargetLike>(targets: T[]): T[] {
  const newest = new Map<string, T>()
  for (const entry of targets) {
    if (typeof entry.target !== 'string') continue
    const seen = newest.get(entry.target)
    if (!seen || createdAt(entry) >= createdAt(seen)) newest.set(entry.target, entry)
  }
  return [...newest.values()]
    .filter((entry) => entry.weight !== 0)
    .sort((a, b) => String(a.target).localeCompare(String(b.target)))
}

/** How many current targets each upstream has, from one listing of every target. */
export function countTargetsByUpstream(targets: TargetLike[]): Record<string, number> {
  const byUpstream = new Map<string, TargetLike[]>()
  for (const entry of targets) {
    const id = (entry.upstream as { id?: unknown } | null | undefined)?.id
    if (typeof id !== 'string') continue
    byUpstream.set(id, [...(byUpstream.get(id) ?? []), entry])
  }
  return Object.fromEntries([...byUpstream].map(([id, rows]) => [id, targetsByAddress(rows).length]))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/live/upstreamForm.test.ts src/lib/live/targetForm.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/live/upstreamForm.ts src/lib/live/upstreamForm.test.ts src/lib/live/targetForm.ts src/lib/live/targetForm.test.ts
git commit -m "feat: add upstream and target form modules

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Dashboard health helpers

**Files:**
- Modify: `src/lib/live/dashboard.ts` (append)
- Test: `src/lib/live/dashboard.test.ts` (append)

**Interfaces:**
- Consumes: `TargetHealth` from `../kongAdmin/health`.
- Produces:
  - `type UpstreamHealthSummary = { upstreams: number; targets: number; unhealthy: number; unknown: number }`
  - `summarizeUpstreamHealth(results: (TargetHealth[] | null)[]): UpstreamHealthSummary` (`null` = that upstream's request failed)
  - `mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]>`

- [ ] **Step 1: Write the failing tests**

Change the import line at the top of `src/lib/live/dashboard.test.ts` to:

```ts
import { summarizeServices, countRouteProtocols, topPlugins, parseNodeStatus, summarizeUpstreamHealth, mapLimit } from './dashboard'
```

Append:

```ts
describe('summarizeUpstreamHealth', () => {
  const row = (health: string | undefined) => ({ target: 't', weight: 1, health })

  it('counts upstreams, targets, unhealthy and unknown targets', () => {
    const summary = summarizeUpstreamHealth([
      [row('HEALTHY'), row('UNHEALTHY'), row('DNS_ERROR')],
      [row('HEALTHCHECKS_OFF'), row(undefined), row('HEALTHY')],
    ])
    expect(summary).toEqual({ upstreams: 2, targets: 6, unhealthy: 2, unknown: 2 })
  })

  it('counts an upstream whose request failed as one unknown, without adding targets', () => {
    expect(summarizeUpstreamHealth([[row('HEALTHY')], null])).toEqual({ upstreams: 2, targets: 1, unhealthy: 0, unknown: 1 })
  })

  it('handles no upstreams', () => {
    expect(summarizeUpstreamHealth([])).toEqual({ upstreams: 0, targets: 0, unhealthy: 0, unknown: 0 })
  })
})

describe('mapLimit', () => {
  it('keeps the order of the results and never runs more than the limit at once', async () => {
    let running = 0
    let peak = 0
    const results = await mapLimit([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      running += 1
      peak = Math.max(peak, running)
      await new Promise((resolve) => setTimeout(resolve, 5))
      running -= 1
      return n * 2
    })
    expect(results).toEqual([2, 4, 6, 8, 10, 12, 14])
    expect(peak).toBe(3)
  })

  it('returns [] for no items', async () => {
    expect(await mapLimit([], 3, async (n: number) => n)).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/live/dashboard.test.ts`
Expected: FAIL (`summarizeUpstreamHealth` / `mapLimit` not exported).

- [ ] **Step 3: Implement**

Add to the top of `src/lib/live/dashboard.ts`, under the existing `type Entity` line:

```ts
import type { TargetHealth } from '../kongAdmin/health'
```

Append to the file:

```ts
export type UpstreamHealthSummary = { upstreams: number; targets: number; unhealthy: number; unknown: number }

const UNHEALTHY_STATES = ['UNHEALTHY', 'DNS_ERROR']

/**
 * Rolls per-upstream health up for the dashboard. `null` stands for an upstream whose request
 * failed: it counts as one unknown and adds no targets.
 */
export function summarizeUpstreamHealth(results: (TargetHealth[] | null)[]): UpstreamHealthSummary {
  const summary: UpstreamHealthSummary = { upstreams: results.length, targets: 0, unhealthy: 0, unknown: 0 }
  for (const result of results) {
    if (result === null) {
      summary.unknown += 1
      continue
    }
    for (const row of result) {
      summary.targets += 1
      if (row.health !== undefined && UNHEALTHY_STATES.includes(row.health)) summary.unhealthy += 1
      else if (row.health !== 'HEALTHY') summary.unknown += 1
    }
  }
  return summary
}

/** Maps `items` through `fn` with at most `limit` calls running at once; results keep the input order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/live/dashboard.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/live/dashboard.ts src/lib/live/dashboard.test.ts
git commit -m "feat: summarise upstream health for the dashboard

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `useUpstreamHealth` composable

**Files:**
- Create: `src/composables/useUpstreamHealth.ts`
- Test: `src/composables/useUpstreamHealth.test.ts`

**Interfaces:**
- Consumes: `getUpstreamHealth`, `TargetHealth` from `../lib/kongAdmin/health`; `toLiveError` from `./useLiveEntities`; `useConnectionStore`.
- Produces: `useUpstreamHealth(upstreamId: () => string | undefined)` returning `{ health: Ref<TargetHealth[]>; loading: Ref<boolean>; error: Ref<string | null>; updatedAt: Ref<Date | null>; refresh: () => Promise<void> }`. It loads whenever the id changes (immediately too) and clears itself when the id is `undefined`.

- [ ] **Step 1: Write the failing test**

Create `src/composables/useUpstreamHealth.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useUpstreamHealth } from './useUpstreamHealth'
import { useConnectionStore } from '../stores/connection'

const json = (body: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
  headers: new Headers(),
})

const health = (target: string, state = 'HEALTHY') => json({ data: [{ target, weight: 100, health: state }] })

beforeEach(() => {
  setActivePinia(createPinia())
  useConnectionStore().$patch({ active: { baseUrl: 'http://kong:8001' }, info: { version: '3.5.0', database: 'postgres' } })
})
afterEach(() => vi.unstubAllGlobals())

describe('useUpstreamHealth', () => {
  it('loads health for the selected upstream and stamps the time', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => health('a:80')))
    const id = ref<string | undefined>('u1')
    const result = useUpstreamHealth(() => id.value)
    await flushPromises()

    expect(result.health.value).toEqual([{ target: 'a:80', weight: 100, health: 'HEALTHY' }])
    expect(result.updatedAt.value).toBeInstanceOf(Date)
    expect(result.error.value).toBeNull()
    expect(result.loading.value).toBe(false)
  })

  it('reloads when the upstream changes, and clears when there is none', async () => {
    const fetchMock = vi.fn(async (url: string) => health(url.includes('/u2/') ? 'b:80' : 'a:80'))
    vi.stubGlobal('fetch', fetchMock)
    const id = ref<string | undefined>('u1')
    const result = useUpstreamHealth(() => id.value)
    await flushPromises()

    id.value = 'u2'
    await nextTick()
    await flushPromises()
    expect(result.health.value[0].target).toBe('b:80')

    id.value = undefined
    await nextTick()
    await flushPromises()
    expect(result.health.value).toEqual([])
    expect(result.updatedAt.value).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('keeps a failure in `error` and leaves the rows empty', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ message: 'boom' }, 500)))
    const result = useUpstreamHealth(() => 'u1')
    await flushPromises()

    expect(result.error.value).toContain('boom')
    expect(result.health.value).toEqual([])
    expect(result.loading.value).toBe(false)
  })

  it('treats a garbage body as no rows, without an error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json('nope')))
    const result = useUpstreamHealth(() => 'u1')
    await flushPromises()

    expect(result.health.value).toEqual([])
    expect(result.error.value).toBeNull()
  })

  it('drops a slow response for an upstream that is no longer selected', async () => {
    const release: Record<string, () => void> = {}
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const which = url.includes('/u1/') ? 'u1' : 'u2'
        if (which === 'u1') await new Promise<void>((resolve) => (release.u1 = resolve))
        return health(which === 'u1' ? 'old:80' : 'new:80')
      }),
    )
    const id = ref<string | undefined>('u1')
    const result = useUpstreamHealth(() => id.value)
    await flushPromises()

    id.value = 'u2'
    await nextTick()
    await flushPromises()
    release.u1()
    await flushPromises()

    expect(result.health.value.map((row) => row.target)).toEqual(['new:80'])
  })

  it('refresh() asks again', async () => {
    const fetchMock = vi.fn(async () => health('a:80'))
    vi.stubGlobal('fetch', fetchMock)
    const result = useUpstreamHealth(() => 'u1')
    await flushPromises()
    await result.refresh()

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/composables/useUpstreamHealth.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/composables/useUpstreamHealth.ts`:

```ts
import { ref, watch } from 'vue'
import { getUpstreamHealth } from '../lib/kongAdmin/health'
import type { TargetHealth } from '../lib/kongAdmin/health'
import { toLiveError } from './useLiveEntities'
import { useConnectionStore } from '../stores/connection'

/**
 * The per-target health of one upstream. It reloads whenever the id changes and only the
 * newest request may write results, so a slow answer for a previous selection is dropped.
 * Its error stays separate from the entity lists: health is optional information.
 */
export function useUpstreamHealth(upstreamId: () => string | undefined) {
  const connection = useConnectionStore()
  const health = ref<TargetHealth[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const updatedAt = ref<Date | null>(null)
  let token = 0

  async function refresh() {
    const id = upstreamId()
    const mine = ++token
    health.value = []
    error.value = null
    updatedAt.value = null
    if (!id || !connection.active) {
      loading.value = false
      return
    }
    loading.value = true
    try {
      const rows = await getUpstreamHealth(connection.active, id)
      if (mine !== token) return
      health.value = rows
      updatedAt.value = new Date()
    } catch (err) {
      if (mine === token) error.value = toLiveError(err).message
    } finally {
      if (mine === token) loading.value = false
    }
  }

  watch(upstreamId, () => void refresh(), { immediate: true })

  return { health, loading, error, updatedAt, refresh }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/composables/useUpstreamHealth.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/composables/useUpstreamHealth.ts src/composables/useUpstreamHealth.test.ts
git commit -m "feat: add useUpstreamHealth composable

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Badge, form and targets panel components

**Files:**
- Create: `src/components/live/TargetHealthBadge.vue`, `src/components/live/UpstreamForm.vue`, `src/components/live/UpstreamTargetsPanel.vue`
- Test: `src/components/live/TargetHealthBadge.test.ts`, `src/components/live/UpstreamForm.test.ts`, `src/components/live/UpstreamTargetsPanel.test.ts`

**Interfaces:**
- Consumes: `useUpstreamHealth` (Task 4); `newTargetForm`, `targetsByAddress`, `toTargetPayload`, `validateTarget`, `TargetForm` (Task 2); `UpstreamForm` type, `UPSTREAM_ALGORITHMS`, `hashOptions` (Task 2); existing `FieldError`, `AppSelect`, `TagInput`, `AppIcon`, `toLiveError`, `useConnectionStore`.
- Produces:
  - `<TargetHealthBadge :health="string | undefined" />` (root has `data-testid="target-health"` and `data-health`).
  - `<UpstreamForm v-model="UpstreamForm" :disabled? :field-errors? />` with test ids `upstream-name`, `upstream-algorithm`, `upstream-hash-on`, `upstream-hash-fallback`, `upstream-slots`, `upstream-host-header`.
  - `<UpstreamTargetsPanel :upstream-id="string" />` with test ids `upstream-targets`, `upstream-targets-count`, `target-row`, `target-address`, `target-weight`, `target-set-weight`, `target-delete`, `target-add-input`, `target-add-weight`, `target-add`, `target-errors`, `target-write-error`, `health-refresh`, `health-error`, `health-updated`, `target-health` (badge).

- [ ] **Step 1: Write the failing tests**

Create `src/components/live/TargetHealthBadge.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TargetHealthBadge from './TargetHealthBadge.vue'

const badge = (health?: string) => mount(TargetHealthBadge, { props: { health } })

describe('TargetHealthBadge', () => {
  it.each([
    ['HEALTHY', 'Healthy'],
    ['UNHEALTHY', 'Unhealthy'],
    ['DNS_ERROR', 'DNS error'],
    ['HEALTHCHECKS_OFF', 'Checks off'],
  ])('shows %s as the text "%s", never colour alone', (state, label) => {
    const wrapper = badge(state)
    expect(wrapper.text()).toBe(label)
    expect(wrapper.attributes('data-health')).toBe(state)
  })

  it('shows a dash for a missing or unknown state', () => {
    expect(badge(undefined).text()).toBe('–')
    expect(badge('SOMETHING_NEW').text()).toBe('–')
    expect(badge(undefined).attributes('title')).toBe('No health data')
  })
})
```

Create `src/components/live/UpstreamForm.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import UpstreamForm from './UpstreamForm.vue'
import { newUpstreamForm } from '../../lib/live/upstreamForm'

describe('UpstreamForm', () => {
  it('emits the whole form with the changed field', async () => {
    const wrapper = mount(UpstreamForm, { props: { modelValue: newUpstreamForm() } })
    await wrapper.find('[data-testid="upstream-name"]').setValue('billing')

    const emitted = wrapper.emitted('update:modelValue')!
    expect(emitted[0][0]).toMatchObject({ name: 'billing', algorithm: 'round-robin', slots: 10000 })
  })

  it('emits a number for slots and an empty string when it is cleared', async () => {
    const wrapper = mount(UpstreamForm, { props: { modelValue: newUpstreamForm() } })
    await wrapper.find('[data-testid="upstream-slots"]').setValue('500')
    await wrapper.find('[data-testid="upstream-slots"]').setValue('')

    const emitted = wrapper.emitted('update:modelValue')!
    expect(emitted[0][0]).toMatchObject({ slots: 500 })
    expect(emitted[1][0]).toMatchObject({ slots: '' })
  })

  it('shows the field error Kong returned under the field', () => {
    const wrapper = mount(UpstreamForm, { props: { modelValue: newUpstreamForm(), fieldErrors: { name: 'already in use' } } })
    expect(wrapper.text()).toContain('already in use')
  })

  it('disables every field when disabled', () => {
    const wrapper = mount(UpstreamForm, { props: { modelValue: newUpstreamForm(), disabled: true } })
    expect(wrapper.find('fieldset').attributes('disabled')).toBeDefined()
  })
})
```

Create `src/components/live/UpstreamTargetsPanel.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import UpstreamTargetsPanel from './UpstreamTargetsPanel.vue'
import { useConnectionStore } from '../../stores/connection'

type Call = { method: string; path: string; body?: Record<string, unknown> }

const HISTORY = [
  { id: 't1', target: 'a.internal:80', weight: 100, created_at: 1 },
  { id: 't2', target: 'a.internal:80', weight: 50, created_at: 2 },
  { id: 't3', target: 'b.internal:80', weight: 100, created_at: 1 },
  { id: 't4', target: 'gone.internal:80', weight: 100, created_at: 1 },
  { id: 't5', target: 'gone.internal:80', weight: 0, created_at: 2 },
]

const reply = (body: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
  headers: new Headers(),
})

function fakeKong(options: { healthStatus?: number; postStatus?: number } = {}) {
  const calls: Call[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET'
      const path = new URL(url).pathname
      const body = init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : undefined
      calls.push({ method, path, body })
      if (method === 'GET' && path === '/upstreams/up-1/targets') return reply({ data: HISTORY })
      if (method === 'GET' && path === '/upstreams/up-1/health') {
        if (options.healthStatus) return reply({ message: 'health unavailable' }, options.healthStatus)
        return reply({
          data: [
            { target: 'a.internal:80', weight: 50, health: 'HEALTHY' },
            { target: 'b.internal:80', weight: 100, health: 'UNHEALTHY' },
          ],
        })
      }
      if (method === 'POST' && path === '/upstreams/up-1/targets') {
        return options.postStatus ? reply({ message: 'already exists' }, options.postStatus) : reply({ id: 'new', ...body }, 201)
      }
      if (method === 'DELETE') return { ok: true, status: 204, text: async () => '', headers: new Headers() }
      return reply({}, 404)
    }),
  )
  return calls
}

function connect(database = 'postgres') {
  useConnectionStore().$patch({ active: { baseUrl: 'http://kong:8001' }, info: { version: '3.5.0', database } })
}

async function mountPanel() {
  const wrapper = mount(UpstreamTargetsPanel, { props: { upstreamId: 'up-1' } })
  await flushPromises()
  return wrapper
}

const byId = (wrapper: Awaited<ReturnType<typeof mountPanel>>, id: string) => wrapper.find(`[data-testid="${id}"]`)

beforeEach(() => setActivePinia(createPinia()))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('UpstreamTargetsPanel', () => {
  it('shows one row per address with the newest weight and its health, hiding removed targets', async () => {
    fakeKong()
    connect()
    const wrapper = await mountPanel()

    const rows = wrapper.findAll('[data-testid="target-row"]')
    expect(rows.map((row) => row.find('[data-testid="target-address"]').text())).toEqual(['a.internal:80', 'b.internal:80'])
    expect((rows[0].find('[data-testid="target-weight"]').element as HTMLInputElement).value).toBe('50')
    expect(rows.map((row) => row.find('[data-testid="target-health"]').text())).toEqual(['Healthy', 'Unhealthy'])
    expect(byId(wrapper, 'upstream-targets-count').text()).toBe('2')
  })

  it('still lists targets and says there is no health data when the health call fails', async () => {
    fakeKong({ healthStatus: 500 })
    connect()
    const wrapper = await mountPanel()

    expect(wrapper.findAll('[data-testid="target-row"]')).toHaveLength(2)
    expect(byId(wrapper, 'health-error').text()).toContain('No health data')
    expect(wrapper.findAll('[data-testid="target-health"]').map((badge) => badge.text())).toEqual(['–', '–'])
  })

  it('refreshes health on demand', async () => {
    const calls = fakeKong()
    connect()
    const wrapper = await mountPanel()
    const before = calls.filter((call) => call.path.endsWith('/health')).length

    await byId(wrapper, 'health-refresh').trigger('click')
    await flushPromises()

    expect(calls.filter((call) => call.path.endsWith('/health')).length).toBe(before + 1)
  })

  it('adds a target with a POST and reloads the targets and health', async () => {
    const calls = fakeKong()
    connect()
    const wrapper = await mountPanel()

    await byId(wrapper, 'target-add-input').setValue(' c.internal:8080 ')
    await byId(wrapper, 'target-add-weight').setValue('25')
    await byId(wrapper, 'target-add').trigger('click')
    await flushPromises()

    const post = calls.find((call) => call.method === 'POST')!
    expect(post.path).toBe('/upstreams/up-1/targets')
    expect(post.body).toMatchObject({ target: 'c.internal:8080', weight: 25 })
    expect(calls.filter((call) => call.method === 'GET' && call.path.endsWith('/targets')).length).toBe(2)
    expect((byId(wrapper, 'target-add-input').element as HTMLInputElement).value).toBe('')
  })

  it('blocks an invalid target with a message and sends nothing', async () => {
    const calls = fakeKong()
    connect()
    const wrapper = await mountPanel()

    await byId(wrapper, 'target-add-input').setValue('bad target')
    await byId(wrapper, 'target-add').trigger('click')

    expect(byId(wrapper, 'target-errors').text()).toContain('host:port')
    expect(calls.some((call) => call.method === 'POST')).toBe(false)
  })

  it('sets a weight by posting the same address with the new weight', async () => {
    const calls = fakeKong()
    connect()
    const wrapper = await mountPanel()
    const row = wrapper.findAll('[data-testid="target-row"]')[1]

    expect(row.find('[data-testid="target-set-weight"]').attributes('disabled')).toBeDefined()
    await row.find('[data-testid="target-weight"]').setValue('75')
    await row.find('[data-testid="target-set-weight"]').trigger('click')
    await flushPromises()

    const post = calls.find((call) => call.method === 'POST')!
    expect(post.body).toEqual({ target: 'b.internal:80', weight: 75 })
  })

  it('shows Kong\'s error and leaves the list alone when setting a weight is refused', async () => {
    fakeKong({ postStatus: 409 })
    connect()
    const wrapper = await mountPanel()
    const row = wrapper.findAll('[data-testid="target-row"]')[1]

    await row.find('[data-testid="target-weight"]').setValue('75')
    await row.find('[data-testid="target-set-weight"]').trigger('click')
    await flushPromises()

    expect(byId(wrapper, 'target-write-error').text()).toContain('already exists')
    expect(wrapper.findAll('[data-testid="target-row"]')).toHaveLength(2)
  })

  it('removes a target by address after confirming', async () => {
    const calls = fakeKong()
    connect()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const wrapper = await mountPanel()

    await wrapper.findAll('[data-testid="target-delete"]')[0].trigger('click')
    await flushPromises()

    const del = calls.find((call) => call.method === 'DELETE')!
    expect(del.path).toBe('/upstreams/up-1/targets/a.internal%3A80')
  })

  it('does not remove anything when the confirmation is declined', async () => {
    const calls = fakeKong()
    connect()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const wrapper = await mountPanel()

    await wrapper.findAll('[data-testid="target-delete"]')[0].trigger('click')

    expect(calls.some((call) => call.method === 'DELETE')).toBe(false)
  })

  it('on DB-less Kong shows no add form and disables the row controls', async () => {
    fakeKong()
    connect('off')
    const wrapper = await mountPanel()

    expect(byId(wrapper, 'target-add-input').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="target-delete"]').every((button) => button.attributes('disabled') !== undefined)).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/components/live/TargetHealthBadge.test.ts src/components/live/UpstreamForm.test.ts src/components/live/UpstreamTargetsPanel.test.ts`
Expected: FAIL (components not found).

- [ ] **Step 3: Implement the badge**

Create `src/components/live/TargetHealthBadge.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ health?: string }>()

const STATES: Record<string, { label: string; dot: string; chip: string }> = {
  HEALTHY: { label: 'Healthy', dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' },
  UNHEALTHY: { label: 'Unhealthy', dot: 'bg-red-500', chip: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300' },
  DNS_ERROR: { label: 'DNS error', dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' },
  HEALTHCHECKS_OFF: { label: 'Checks off', dot: 'bg-ink-muted', chip: 'bg-elevated text-ink-muted' },
}

const state = computed(() => (props.health ? STATES[props.health] : undefined))
</script>

<template>
  <span
    data-testid="target-health"
    :data-health="health"
    :title="state ? undefined : 'No health data'"
    class="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
    :class="state ? state.chip : 'text-ink-muted'"
  >
    <span v-if="state" class="h-1.5 w-1.5 rounded-full" :class="state.dot" />
    {{ state ? state.label : '–' }}
  </span>
</template>
```

- [ ] **Step 4: Implement the form**

Create `src/components/live/UpstreamForm.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { UPSTREAM_ALGORITHMS, hashOptions } from '../../lib/live/upstreamForm'
import type { UpstreamForm } from '../../lib/live/upstreamForm'
import FieldError from './FieldError.vue'
import AppSelect from '../shared/AppSelect.vue'
import TagInput from '../shared/TagInput.vue'

const props = defineProps<{ modelValue: UpstreamForm; disabled?: boolean; fieldErrors?: Record<string, string> }>()
const emit = defineEmits<{ 'update:modelValue': [value: UpstreamForm] }>()

function set<K extends keyof UpstreamForm>(key: K, value: UpstreamForm[K]) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}
function text(event: Event): string {
  return (event.target as HTMLInputElement).value
}
function numeric(event: Event): number | '' {
  const value = text(event)
  return value === '' ? '' : Number(value)
}

const hashOnOptions = computed(() => hashOptions(props.modelValue.hash_on).map((value) => ({ value, label: value })))
const hashFallbackOptions = computed(() => hashOptions(props.modelValue.hash_fallback).map((value) => ({ value, label: value })))
</script>

<template>
  <fieldset :disabled="disabled" class="space-y-5 border-0 p-0">
    <section class="space-y-3">
      <h4 class="section-heading">Upstream</h4>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label>
          <span class="field-label">Name</span>
          <input
            type="text"
            class="input-field"
            data-testid="upstream-name"
            spellcheck="false"
            :value="modelValue.name"
            @input="set('name', text($event))"
          />
          <FieldError :message="fieldErrors?.name" />
        </label>
        <div>
          <span class="field-label">Algorithm</span>
          <AppSelect
            :model-value="modelValue.algorithm"
            :options="UPSTREAM_ALGORITHMS.map((algorithm) => ({ value: algorithm, label: algorithm }))"
            aria-label="Algorithm"
            data-testid="upstream-algorithm"
            @update:model-value="(value) => set('algorithm', value)"
          />
          <FieldError :message="fieldErrors?.algorithm" />
        </div>
        <div>
          <span class="field-label">Hash on</span>
          <AppSelect
            :model-value="modelValue.hash_on"
            :options="hashOnOptions"
            aria-label="Hash on"
            data-testid="upstream-hash-on"
            @update:model-value="(value) => set('hash_on', value)"
          />
          <FieldError :message="fieldErrors?.hash_on" />
        </div>
        <div>
          <span class="field-label">Hash fallback</span>
          <AppSelect
            :model-value="modelValue.hash_fallback"
            :options="hashFallbackOptions"
            aria-label="Hash fallback"
            data-testid="upstream-hash-fallback"
            @update:model-value="(value) => set('hash_fallback', value)"
          />
          <FieldError :message="fieldErrors?.hash_fallback" />
        </div>
        <label>
          <span class="field-label">Slots</span>
          <input
            type="number"
            class="input-field"
            data-testid="upstream-slots"
            :value="modelValue.slots"
            @input="set('slots', numeric($event))"
          />
          <FieldError :message="fieldErrors?.slots" />
        </label>
        <label>
          <span class="field-label">Host header</span>
          <input
            type="text"
            class="input-field font-mono"
            data-testid="upstream-host-header"
            spellcheck="false"
            :value="modelValue.host_header"
            @input="set('host_header', text($event))"
          />
          <FieldError :message="fieldErrors?.host_header" />
        </label>
      </div>
    </section>
    <section class="space-y-3">
      <h4 class="section-heading">Tags</h4>
      <TagInput :model-value="modelValue.tags" @update:model-value="(value) => set('tags', value)" />
    </section>
  </fieldset>
</template>
```

- [ ] **Step 5: Implement the targets panel**

Create `src/components/live/UpstreamTargetsPanel.vue`:

```vue
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useConnectionStore } from '../../stores/connection'
import { toLiveError } from '../../composables/useLiveEntities'
import type { LiveEntity, LiveError } from '../../composables/useLiveEntities'
import { useUpstreamHealth } from '../../composables/useUpstreamHealth'
import { newTargetForm, targetsByAddress, toTargetPayload, validateTarget } from '../../lib/live/targetForm'
import type { TargetForm } from '../../lib/live/targetForm'
import AppIcon from '../shared/AppIcon.vue'
import TargetHealthBadge from './TargetHealthBadge.vue'

const props = defineProps<{ upstreamId: string }>()

const connection = useConnectionStore()
const history = ref<LiveEntity[]>([])
const loading = ref(false)
const loadError = ref<LiveError | null>(null)
const writeError = ref<LiveError | null>(null)
const formErrors = ref<string[]>([])
const busy = ref(false)
const adding = ref<TargetForm>(newTargetForm())
const weightEdits = reactive<Record<string, number | ''>>({})
let token = 0

const targets = computed(() => targetsByAddress(history.value))
const { health, loading: healthLoading, error: healthError, updatedAt, refresh: refreshHealth } = useUpstreamHealth(
  () => props.upstreamId,
)
const healthByTarget = computed(() => new Map(health.value.map((row) => [row.target, row.health])))
const updatedLabel = computed(() => updatedAt.value?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }))

const client = () => connection.client('targets', props.upstreamId)
const address = (target: LiveEntity) => String(target.target)

async function load() {
  const current = ++token
  loading.value = true
  loadError.value = null
  try {
    const all = await connection.client<LiveEntity>('targets', props.upstreamId).listAll()
    if (current !== token) return
    history.value = all
    for (const key of Object.keys(weightEdits)) delete weightEdits[key]
  } catch (err) {
    if (current === token) {
      history.value = []
      loadError.value = toLiveError(err)
    }
  } finally {
    if (current === token) loading.value = false
  }
}

/** Runs a write, then reloads the targets and their health; a refusal from Kong is shown and nothing else changes. */
async function write(action: () => Promise<unknown>): Promise<boolean> {
  busy.value = true
  writeError.value = null
  formErrors.value = []
  try {
    await action()
  } catch (err) {
    writeError.value = toLiveError(err)
    busy.value = false
    return false
  }
  await Promise.all([load(), refreshHealth()])
  busy.value = false
  return true
}

async function add() {
  const errors = validateTarget(adding.value)
  formErrors.value = errors
  if (errors.length > 0) return
  if (await write(() => client().create(toTargetPayload(adding.value)))) adding.value = newTargetForm()
}

function editWeight(target: LiveEntity, event: Event) {
  const raw = (event.target as HTMLInputElement).value
  weightEdits[address(target)] = raw === '' ? '' : Number(raw)
}

function weightOf(target: LiveEntity): number | '' {
  return weightEdits[address(target)] ?? (typeof target.weight === 'number' ? target.weight : '')
}

function canSetWeight(target: LiveEntity): boolean {
  const edit = weightEdits[address(target)]
  return connection.canWrite && !busy.value && edit !== undefined && edit !== '' && edit !== target.weight
}

// Kong targets are append-only, so a new weight is a new row for the same address.
async function setWeight(target: LiveEntity) {
  const edit = weightEdits[address(target)]
  if (edit === undefined || edit === '') return
  const errors = validateTarget({ target: address(target), weight: edit, tags: [] })
  formErrors.value = errors
  if (errors.length > 0) return
  await write(() => client().create({ target: address(target), weight: edit }))
}

// By address, not row id: deleting one history row could bring an older weight back.
async function remove(target: LiveEntity) {
  if (!window.confirm(`Remove target ${address(target)}?`)) return
  await write(() => client().remove(address(target)))
}

onMounted(load)
watch(
  () => props.upstreamId,
  () => {
    formErrors.value = []
    writeError.value = null
    adding.value = newTargetForm()
    void load()
  },
)
</script>

<template>
  <section class="space-y-3" data-testid="upstream-targets">
    <div class="flex items-center justify-between gap-3">
      <h4 class="section-heading flex items-center gap-2">
        Targets
        <span
          v-if="!loading && !loadError"
          data-testid="upstream-targets-count"
          class="inline-flex h-5 min-w-[1.5rem] items-center justify-center rounded-full bg-accent/15 px-2 text-[11px] font-semibold tabular-nums text-accent-secondary ring-1 ring-inset ring-accent/40 dark:bg-accent/20 dark:text-accent"
        >
          {{ targets.length.toLocaleString('en-US') }}
        </span>
      </h4>
      <div class="flex items-center gap-2">
        <span v-if="updatedLabel" data-testid="health-updated" class="text-xs text-ink-muted">Health as of {{ updatedLabel }}</span>
        <button type="button" class="btn-secondary btn-sm" data-testid="health-refresh" :disabled="healthLoading" @click="refreshHealth">
          <AppIcon name="refresh" class="h-3.5 w-3.5" :class="healthLoading ? 'animate-spin' : ''" />
          Refresh health
        </button>
      </div>
    </div>

    <p v-if="healthError" data-testid="health-error" class="text-xs text-ink-muted">No health data: {{ healthError }}</p>
    <p v-if="writeError" data-testid="target-write-error" role="alert" class="text-xs text-red-700 dark:text-red-300">
      {{ writeError.message }}
    </p>
    <ul v-if="formErrors.length > 0" data-testid="target-errors" role="alert" class="space-y-0.5 text-xs text-red-700 dark:text-red-300">
      <li v-for="message in formErrors" :key="message">{{ message }}</li>
    </ul>

    <p v-if="loading" class="text-xs text-ink-muted">Loading…</p>
    <p v-else-if="loadError" class="text-xs text-red-700 dark:text-red-300">Could not load targets: {{ loadError.message }}</p>
    <p v-else-if="targets.length === 0" class="text-xs text-ink-muted">This upstream has no targets.</p>
    <ul v-else class="space-y-2">
      <li v-for="target in targets" :key="address(target)" data-testid="target-row" class="card flex flex-wrap items-center gap-3 px-3.5 py-2.5">
        <p class="min-w-0 flex-1 truncate font-mono text-sm text-ink" data-testid="target-address" :title="address(target)">
          {{ address(target) }}
        </p>
        <TargetHealthBadge :health="healthByTarget.get(address(target))" />
        <label class="flex items-center gap-1.5 text-xs text-ink-muted">
          Weight
          <input
            type="number"
            min="0"
            max="65535"
            class="input-field !w-24"
            data-testid="target-weight"
            :value="weightOf(target)"
            :disabled="!connection.canWrite"
            @input="editWeight(target, $event)"
          />
        </label>
        <button type="button" class="btn-secondary btn-sm" data-testid="target-set-weight" :disabled="!canSetWeight(target)" @click="setWeight(target)">
          Set weight
        </button>
        <button
          type="button"
          class="btn-secondary btn-sm"
          data-testid="target-delete"
          :aria-label="`Remove ${address(target)}`"
          :disabled="!connection.canWrite || busy"
          @click="remove(target)"
        >
          <AppIcon name="trash" class="h-3.5 w-3.5" />
        </button>
      </li>
    </ul>

    <form v-if="connection.canWrite" class="flex flex-wrap items-end gap-2" @submit.prevent="add">
      <label class="min-w-[12rem] flex-1">
        <span class="field-label">Add target</span>
        <input
          v-model="adding.target"
          type="text"
          class="input-field font-mono"
          data-testid="target-add-input"
          placeholder="host:port"
          spellcheck="false"
        />
      </label>
      <label>
        <span class="field-label">Weight</span>
        <input v-model.number="adding.weight" type="number" min="0" max="65535" class="input-field !w-24" data-testid="target-add-weight" />
      </label>
      <button type="submit" class="btn-primary" data-testid="target-add" :disabled="busy">Add</button>
    </form>
  </section>
</template>
```

- [ ] **Step 6: Run to verify they pass**

Run: `npx vitest run src/components/live/TargetHealthBadge.test.ts src/components/live/UpstreamForm.test.ts src/components/live/UpstreamTargetsPanel.test.ts`
Expected: PASS. If `target-add` does not submit under jsdom, trigger `submit` on the form in the test instead of `click`; the component stays as is.

- [ ] **Step 7: Typecheck**

Run: `npx vue-tsc -b`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/live/TargetHealthBadge.vue src/components/live/TargetHealthBadge.test.ts src/components/live/UpstreamForm.vue src/components/live/UpstreamForm.test.ts src/components/live/UpstreamTargetsPanel.vue src/components/live/UpstreamTargetsPanel.test.ts
git commit -m "feat: add upstream form, targets panel and health badge

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Live Upstreams page, route and navigation

**Files:**
- Modify: `src/lib/kongAdmin/entities.ts` (add `all_targets`), `src/lib/kongAdmin/entities.test.ts:158`, `src/router/index.ts`, `src/router/routes.test.ts`, `src/components/layout/AppSidebar.vue`, `src/components/layout/AppSidebar.test.ts`, `src/components/layout/AppShell.vue`, `src/components/layout/AppShell.test.ts`
- Create: `src/views/live/LiveUpstreamsView.vue`
- Test: `src/views/live/LiveUpstreamsView.test.ts`

**Interfaces:**
- Consumes: Task 2 forms (`fromEntity`, `newUpstreamForm`, `toPayload`, `validateUpstream`, `countTargetsByUpstream`), Task 5 `UpstreamForm` and `UpstreamTargetsPanel`; existing `LiveGate`, `LiveWorkspace`, `LiveListToolbar`, `LiveActionBar`, `LiveErrorBanner`, `ListRow`, `EmptyState`, `DetailHeader`, `useLiveEntities`, `usePageCount`.
- Produces: route name `live-upstreams` at `/live/upstreams`; resource `all_targets` (path `targets`, not nested) for the list-wide target count.

- [ ] **Step 1: Write the failing tests**

Create `src/views/live/LiveUpstreamsView.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { flushPromises, mount } from '@vue/test-utils'
import LiveUpstreamsView from './LiveUpstreamsView.vue'
import { useConnectionStore } from '../../stores/connection'
import { usePageMetaStore } from '../../stores/pageMeta'

type Call = { method: string; path: string; body?: Record<string, unknown> }

const UPSTREAMS = [
  { id: 'up-1', name: 'api', algorithm: 'round-robin', hash_on: 'none', hash_fallback: 'none', slots: 10000, tags: ['prod'] },
  { id: 'up-2', name: 'billing', algorithm: 'least-connections', hash_on: 'none', hash_fallback: 'none', slots: 10000, tags: [] },
]

const ALL_TARGETS = [
  { id: 't1', target: 'a:80', weight: 100, created_at: 1, upstream: { id: 'up-1' } },
  { id: 't2', target: 'b:80', weight: 100, created_at: 1, upstream: { id: 'up-1' } },
  { id: 't3', target: 'a:80', weight: 0, created_at: 2, upstream: { id: 'up-1' } },
]

const reply = (body: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
  headers: new Headers(),
})

function fakeKong(options: { allTargetsStatus?: number; createFailure?: { status: number; body: unknown } } = {}) {
  const calls: Call[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET'
      const path = new URL(url).pathname
      const body = init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : undefined
      calls.push({ method, path, body })
      if (method === 'GET' && path === '/upstreams/up-1/health') return reply({ data: [{ target: 'b:80', weight: 100, health: 'HEALTHY' }] })
      if (method === 'GET' && path === '/upstreams/up-1/targets') return reply({ data: ALL_TARGETS })
      if (method === 'GET' && path === '/targets') return options.allTargetsStatus ? reply({ message: 'boom' }, options.allTargetsStatus) : reply({ data: ALL_TARGETS })
      if (method === 'GET' && path === '/upstreams') return reply({ data: UPSTREAMS })
      if (method === 'POST' && path === '/upstreams') {
        if (options.createFailure) return reply(options.createFailure.body, options.createFailure.status)
        return reply({ id: 'new-1', ...body }, 201)
      }
      if (method === 'PATCH') return reply({ ...UPSTREAMS[0], ...body })
      if (method === 'DELETE') return { ok: true, status: 204, text: async () => '', headers: new Headers() }
      return reply({}, 404)
    }),
  )
  return calls
}

function connect(database = 'postgres') {
  useConnectionStore().$patch({ active: { baseUrl: 'http://kong:8001' }, info: { version: '3.4.0', database } })
}

async function mountView() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] })
  const wrapper = mount(LiveUpstreamsView, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

const byId = (wrapper: Awaited<ReturnType<typeof mountView>>, id: string) => wrapper.find(`[data-testid="${id}"]`)

beforeEach(() => setActivePinia(createPinia()))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('LiveUpstreamsView', () => {
  it('shows the connect prompt and sends no request when not connected', async () => {
    const calls = fakeKong()
    const wrapper = await mountView()

    expect(byId(wrapper, 'live-not-connected').exists()).toBe(true)
    expect(calls).toHaveLength(0)
  })

  it('lists upstreams with their algorithm and how many targets each has', async () => {
    fakeKong()
    connect()
    const wrapper = await mountView()

    const rows = wrapper.findAll('[data-testid="upstream-row"]')
    expect(rows.map((row) => row.text())).toEqual([expect.stringContaining('api'), expect.stringContaining('billing')])
    expect(rows[1].text()).toContain('least-connections')
    expect(wrapper.findAll('[data-testid="upstream-target-count"]').map((count) => count.text())).toEqual(['1', '0'])
  })

  it('still lists upstreams, without counts, when the all-targets request fails', async () => {
    fakeKong({ allTargetsStatus: 500 })
    connect()
    const wrapper = await mountView()

    expect(wrapper.findAll('[data-testid="upstream-row"]')).toHaveLength(2)
    expect(wrapper.findAll('[data-testid="upstream-target-count"]')).toHaveLength(0)
  })

  it('filters the loaded upstreams by the search box', async () => {
    fakeKong()
    connect()
    const wrapper = await mountView()

    await wrapper.find('input[placeholder="Search loaded upstreams…"]').setValue('bill')
    expect(wrapper.findAll('[data-testid="upstream-row"]')).toHaveLength(1)
    expect(wrapper.find('[data-testid="upstream-row"]').text()).toContain('billing')
  })

  it('shows the form and the targets with health for the selected upstream', async () => {
    const calls = fakeKong()
    connect()
    const wrapper = await mountView()

    await wrapper.findAll('[data-testid="upstream-row"]')[0].trigger('click')
    await flushPromises()

    expect((byId(wrapper, 'upstream-name').element as HTMLInputElement).value).toBe('api')
    expect(calls.some((call) => call.path === '/upstreams/up-1/targets')).toBe(true)
    expect(calls.some((call) => call.path === '/upstreams/up-1/health')).toBe(true)
    expect(byId(wrapper, 'upstream-targets').exists()).toBe(true)
  })

  it('on DB-less Kong shows the notice and disables every write control', async () => {
    fakeKong()
    connect('off')
    const wrapper = await mountView()

    expect(byId(wrapper, 'live-read-only').exists()).toBe(true)
    expect(byId(wrapper, 'new-upstream').attributes('disabled')).toBeDefined()
    await wrapper.findAll('[data-testid="upstream-row"]')[0].trigger('click')
    expect(byId(wrapper, 'save').attributes('disabled')).toBeDefined()
    expect(byId(wrapper, 'delete').attributes('disabled')).toBeDefined()
  })

  it('edits an upstream and saves it with a PATCH carrying only form fields', async () => {
    const calls = fakeKong()
    connect()
    const wrapper = await mountView()

    await wrapper.findAll('[data-testid="upstream-row"]')[0].trigger('click')
    expect(byId(wrapper, 'save').attributes('disabled')).toBeDefined()
    await byId(wrapper, 'upstream-slots').setValue('500')
    await byId(wrapper, 'save').trigger('click')
    await flushPromises()

    const patch = calls.find((call) => call.method === 'PATCH')!
    expect(patch.path).toBe('/upstreams/up-1')
    expect(patch.body).toMatchObject({ name: 'api', slots: 500 })
    expect(patch.body).not.toHaveProperty('healthchecks')
  })

  it('creates an upstream with a POST and adds it to the list', async () => {
    const calls = fakeKong()
    connect()
    const wrapper = await mountView()

    await byId(wrapper, 'new-upstream').trigger('click')
    await byId(wrapper, 'upstream-name').setValue('  fresh ')
    await byId(wrapper, 'save').trigger('click')
    await flushPromises()

    const post = calls.find((call) => call.method === 'POST')!
    expect(post.path).toBe('/upstreams')
    expect(post.body).toMatchObject({ name: 'fresh', algorithm: 'round-robin' })
    expect(post.body).not.toHaveProperty('healthchecks')
    expect(wrapper.findAll('[data-testid="upstream-row"]')[0].text()).toContain('fresh')
  })

  it('blocks Save with a banner and sends nothing when the name is empty', async () => {
    const calls = fakeKong()
    connect()
    const wrapper = await mountView()

    await byId(wrapper, 'new-upstream').trigger('click')
    await byId(wrapper, 'save').trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toContain('Please provide a name for the upstream.')
    expect(calls.some((call) => call.method === 'POST')).toBe(false)
  })

  it('shows Kong field errors under the field and keeps the form open', async () => {
    fakeKong({ createFailure: { status: 400, body: { message: 'schema violation (name: already in use)', fields: { name: 'already in use' } } } })
    connect()
    const wrapper = await mountView()

    await byId(wrapper, 'new-upstream').trigger('click')
    await byId(wrapper, 'upstream-name').setValue('api')
    await byId(wrapper, 'save').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('already in use')
    expect(byId(wrapper, 'upstream-name').exists()).toBe(true)
  })

  it('deletes the selected upstream after confirming and drops it from the list', async () => {
    const calls = fakeKong()
    connect()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const wrapper = await mountView()

    await wrapper.findAll('[data-testid="upstream-row"]')[0].trigger('click')
    await byId(wrapper, 'delete').trigger('click')
    await flushPromises()

    expect(calls.find((call) => call.method === 'DELETE')!.path).toBe('/upstreams/up-1')
    expect(wrapper.findAll('[data-testid="upstream-row"]')).toHaveLength(1)
  })

  it('puts the upstream count in the page title', async () => {
    fakeKong()
    connect()
    await mountView()

    expect(usePageMetaStore().count).toBe(2)
  })
})
```

- [ ] **Step 2: Add the all-targets resource and update the tests that enumerate resources and routes**

In `src/lib/kongAdmin/entities.ts`, add `| 'all_targets'` to `EntityResourceName` after `'targets'`, and add this entry after `targets` in `ENTITY_RESOURCES`:

```ts
  // Every target of every upstream, for the per-upstream counts in the list.
  all_targets: { path: 'targets', nested: false, defaults: {} },
```

In `src/lib/kongAdmin/entities.test.ts` (the `Object.keys(ENTITY_RESOURCES)` expectation near line 158), add `'all_targets'` to the expected list.

In `src/router/routes.test.ts`, change the loop to include `'upstreams'`:

```ts
    for (const page of ['services', 'routes', 'consumers', 'plugins', 'upstreams']) expect(byPath(`/live/${page}`)).toBeTruthy()
```

In `src/components/layout/AppSidebar.test.ts`, change the `testRouter` live route to also include `{ path: '/live/upstreams', component: { template: '<div />' } }`, rename the test to `'links to the live services, upstreams, routes, consumers and plugins once connected'`, and change the expected list to:

```ts
      ['Services', '/live/services'],
      ['Upstreams', '/live/upstreams'],
      ['Routes', '/live/routes'],
      ['Consumers', '/live/consumers'],
      ['Plugins', '/live/plugins'],
```

In `src/components/layout/AppShell.test.ts`, add `['/live/upstreams', 'Live upstreams'],` after the `['/live/plugins', 'Live plugins'],` row of the title table, and add `'/live/upstreams'` to that file's `testRouter` routes if it lists live paths explicitly (check the file; the test table calls `router.push(path)`).

- [ ] **Step 3: Run to verify the new and changed tests fail**

Run: `npx vitest run src/views/live/LiveUpstreamsView.test.ts src/router/routes.test.ts src/components/layout src/lib/kongAdmin/entities.test.ts`
Expected: the view test and the route/sidebar/shell expectations FAIL; the entities test passes once `all_targets` is added in step 2.

- [ ] **Step 4: Implement the page**

Create `src/views/live/LiveUpstreamsView.vue`:

```vue
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useConnectionStore } from '../../stores/connection'
import { useLiveEntities } from '../../composables/useLiveEntities'
import { usePageCount } from '../../composables/usePageCount'
import type { LiveEntity } from '../../composables/useLiveEntities'
import { fromEntity, newUpstreamForm, toPayload, validateUpstream } from '../../lib/live/upstreamForm'
import type { UpstreamForm as UpstreamFormModel } from '../../lib/live/upstreamForm'
import { countTargetsByUpstream } from '../../lib/live/targetForm'
import LiveGate from '../../components/live/LiveGate.vue'
import LiveErrorBanner from '../../components/live/LiveErrorBanner.vue'
import UpstreamForm from '../../components/live/UpstreamForm.vue'
import UpstreamTargetsPanel from '../../components/live/UpstreamTargetsPanel.vue'
import LiveWorkspace from '../../components/live/LiveWorkspace.vue'
import LiveListToolbar from '../../components/live/LiveListToolbar.vue'
import LiveActionBar from '../../components/live/LiveActionBar.vue'
import ListRow from '../../components/shared/ListRow.vue'
import EmptyState from '../../components/shared/EmptyState.vue'
import DetailHeader from '../../components/shared/DetailHeader.vue'

const connection = useConnectionStore()
const {
  items,
  next,
  total,
  loading,
  error,
  load,
  loadMore,
  create: createEntity,
  save: saveEntity,
  remove: removeEntity,
} = useLiveEntities<LiveEntity>('upstreams', { withTotal: true })

// How many targets each upstream has, from one listing of every target. Empty until it
// arrives (or if it fails), in which case the rows simply show no number.
const targetCounts = ref<Record<string, number>>({})

async function loadTargetCounts() {
  try {
    targetCounts.value = countTargetsByUpstream(await connection.client<LiveEntity>('all_targets').listAll())
  } catch {
    targetCounts.value = {}
  }
}

const search = ref('')
const selectedId = ref<string | null>(null)
const creating = ref(false)
const form = ref<UpstreamFormModel | null>(null)
const baseline = ref('')
const validationErrors = ref<string[]>([])
const busy = ref(false)

const dirty = computed(() => form.value !== null && JSON.stringify(form.value) !== baseline.value)
const canSave = computed(
  () => connection.canWrite && !busy.value && form.value !== null && (creating.value || dirty.value),
)

function label(upstream: LiveEntity): string {
  return typeof upstream.name === 'string' && upstream.name ? upstream.name : upstream.id
}

const filtered = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return items.value
  return items.value.filter((upstream) => {
    const tags = Array.isArray(upstream.tags) ? (upstream.tags as string[]) : []
    const haystack = [upstream.name, upstream.algorithm, ...tags].filter(Boolean).join(' ').toLowerCase()
    return haystack.includes(query)
  })
})

usePageCount(() => ({ count: total.value ?? items.value.length, approximate: total.value === null && next.value !== null }))

const fieldErrors = computed(() =>
  Object.fromEntries(
    Object.entries(error.value?.fields ?? {}).map(([field, problem]) => [
      field,
      typeof problem === 'string' ? problem : JSON.stringify(problem),
    ]),
  ),
)

function setForm(value: UpstreamFormModel | null) {
  form.value = value
  baseline.value = value ? JSON.stringify(value) : ''
  validationErrors.value = []
}

function confirmDiscard(): boolean {
  return !dirty.value || window.confirm('Discard your unsaved changes?')
}

function select(upstream: LiveEntity) {
  if (!confirmDiscard()) return
  creating.value = false
  selectedId.value = upstream.id
  setForm(fromEntity(upstream))
}

function startCreate() {
  if (!confirmDiscard()) return
  creating.value = true
  selectedId.value = null
  setForm(newUpstreamForm())
}

function discard() {
  if (!dirty.value || !window.confirm('Discard your unsaved changes?')) return
  form.value = JSON.parse(baseline.value) as UpstreamFormModel
  validationErrors.value = []
}

async function save() {
  if (!form.value) return
  const errors = validateUpstream(form.value)
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
  if (!selectedId.value || !window.confirm('Delete this upstream?')) return
  try {
    await removeEntity(selectedId.value)
    selectedId.value = null
    setForm(null)
  } catch {
    // Shown in the banner.
  }
}

// Leaving the page would silently drop unsaved edits, so ask first (false cancels).
onBeforeRouteLeave(() => confirmDiscard())

onMounted(() => {
  if (connection.isConnected) {
    void load()
    void loadTargetCounts()
  }
})
watch(
  () => connection.active?.baseUrl,
  (baseUrl) => {
    selectedId.value = null
    setForm(null)
    targetCounts.value = {}
    if (baseUrl) {
      void load()
      void loadTargetCounts()
    }
  },
)
</script>

<template>
  <LiveGate>
    <LiveWorkspace storage-key="kong-config:live-upstreams-panel-width" :has-more="Boolean(next)" :loading="loading" @load-more="loadMore">
      <template #toolbar>
        <LiveListToolbar
          v-model:search="search"
          placeholder="Search loaded upstreams…"
          new-testid="new-upstream"
          :can-create="connection.canWrite"
          @create="startCreate"
        />
      </template>

      <template #list>
        <ul class="space-y-0.5 px-2 pb-3">
          <ListRow
            v-for="upstream in filtered"
            :key="upstream.id"
            data-testid="upstream-row"
            :title="label(upstream)"
            :selected="upstream.id === selectedId"
            @click="select(upstream)"
          >
            {{ label(upstream) }}
            <span class="ml-2 text-xs font-normal text-ink-muted">{{ upstream.algorithm }}</span>
            <template v-if="Object.keys(targetCounts).length > 0" #trail>
              <span
                data-testid="upstream-target-count"
                :title="`${targetCounts[upstream.id] ?? 0} targets`"
                class="inline-flex h-5 min-w-[1.5rem] shrink-0 items-center justify-center rounded-full bg-elevated px-2 text-[11px] font-semibold tabular-nums text-ink-muted"
              >
                {{ (targetCounts[upstream.id] ?? 0).toLocaleString('en-US') }}
              </span>
            </template>
          </ListRow>
        </ul>
      </template>

      <template #footer>
        <p v-if="loading" class="px-3 pb-2 text-xs text-ink-muted">Loading…</p>
        <p v-else-if="filtered.length === 0" class="px-3 pb-2 text-xs text-ink-muted">No upstreams.</p>
      </template>

      <template #detail>
        <LiveErrorBanner :messages="validationErrors" :error="error" />
        <div v-if="form" class="space-y-4">
          <div class="card space-y-5 p-5">
            <DetailHeader
              :initial="(form.name || '?').charAt(0)"
              :title="creating ? 'New upstream' : form.name || 'Upstream'"
              :subtitle="!creating && selectedId ? selectedId : undefined"
            />
            <UpstreamForm v-model="form" :disabled="!connection.canWrite" :field-errors="fieldErrors" />
          </div>
          <div v-if="!creating && selectedId" class="card p-5">
            <UpstreamTargetsPanel :upstream-id="selectedId" />
          </div>
        </div>
        <EmptyState v-else icon="link" title="Select an upstream from the list, or create a new one." />
      </template>

      <template v-if="form" #detail-footer>
        <LiveActionBar
          :creating="creating"
          :dirty="dirty"
          :can-save="canSave"
          :can-write="connection.canWrite"
          :busy="busy"
          @delete="remove"
          @discard="discard"
          @save="save"
        />
      </template>
    </LiveWorkspace>
  </LiveGate>
</template>
```

- [ ] **Step 5: Wire the route, the sidebar link and the title**

In `src/router/index.ts` add the import `import LiveUpstreamsView from '../views/live/LiveUpstreamsView.vue'` after the `LiveServicesView` import, and add this entry after the `live-services` route:

```ts
    { path: '/live/upstreams', name: 'live-upstreams', component: LiveUpstreamsView },
```

In `src/components/layout/AppSidebar.vue`, add after the `/live/services` entry of `liveLinks`:

```ts
  { to: '/live/upstreams', label: 'Upstreams', icon: 'link' },
```

In `src/components/layout/AppShell.vue`, add after the `'/live/services'` title line:

```ts
  if (route.path === '/live/upstreams') return 'Live upstreams'
```

- [ ] **Step 6: Run to verify everything passes**

Run: `npx vitest run src/views/live/LiveUpstreamsView.test.ts src/router src/components/layout src/lib/kongAdmin/entities.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck**

Run: `npx vue-tsc -b`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/views/live/LiveUpstreamsView.vue src/views/live/LiveUpstreamsView.test.ts src/lib/kongAdmin/entities.ts src/lib/kongAdmin/entities.test.ts src/router src/components/layout
git commit -m "feat: add the Live Upstreams page with targets and health

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Dashboard upstreams tile and on-demand health check

**Files:**
- Modify: `src/composables/useLiveDashboard.ts`, `src/composables/useLiveDashboard.test.ts`, `src/components/live/LiveDashboard.vue`, `src/components/live/LiveDashboard.test.ts`

**Interfaces:**
- Consumes: `getUpstreamHealth` (Task 1); `summarizeUpstreamHealth`, `mapLimit`, `UpstreamHealthSummary` (Task 3); `DashboardTile` with a `link` icon.
- Produces: from `useLiveDashboard()`: `upstreams: Ref<Section<LiveEntity[]>>`, `upstreamHealth: Ref<Section<UpstreamHealthSummary>>`, `checkHealth(): Promise<void>`. `refresh()` also reloads `upstreams` and resets `upstreamHealth` to idle. Dashboard test ids: `tile-upstreams`, `card-upstream-health`, `check-upstream-health`.

- [ ] **Step 1: Write the failing composable tests**

In `src/composables/useLiveDashboard.test.ts`, add this entry to `DATA`:

```ts
  '/upstreams': [{ id: 'u1' }, { id: 'u2' }],
```

Append inside the `describe('useLiveDashboard', ...)` block:

```ts
  it('loads the upstreams list too', async () => {
    stubKong(ok)
    const dash = useLiveDashboard()
    await dash.refresh()

    expect(dash.upstreams.value.data).toHaveLength(2)
  })

  it('fetches no health until asked', async () => {
    const calls = stubKong(ok)
    const dash = useLiveDashboard()
    await dash.refresh()

    expect(calls.some((call) => call.endsWith('/health'))).toBe(false)
    expect(dash.upstreamHealth.value.data).toBeNull()
  })

  it('checks every upstream on demand and summarises the result, counting a failed one as unknown', async () => {
    const calls = stubKong((url) => {
      if (url.pathname === '/upstreams/u1/health') {
        return json({ data: [{ target: 'a:80', health: 'HEALTHY' }, { target: 'b:80', health: 'UNHEALTHY' }] })
      }
      if (url.pathname === '/upstreams/u2/health') return json({ message: 'boom' }, 500)
      return ok(url)
    })
    const dash = useLiveDashboard()
    await dash.refresh()
    await dash.checkHealth()

    expect(calls.filter((call) => call.endsWith('/health'))).toHaveLength(2)
    expect(dash.upstreamHealth.value.data).toEqual({ upstreams: 2, targets: 2, unhealthy: 1, unknown: 1 })
    expect(dash.upstreamHealth.value.loading).toBe(false)
  })

  it('never has more than 10 health requests in flight', async () => {
    let running = 0
    let peak = 0
    stubKong(async (url) => {
      if (url.pathname === '/upstreams') return json({ data: Array.from({ length: 25 }, (_, i) => ({ id: `u${i}` })), offset: null })
      if (url.pathname.endsWith('/health')) {
        running += 1
        peak = Math.max(peak, running)
        await new Promise((resolve) => setTimeout(resolve, 5))
        running -= 1
        return json({ data: [] })
      }
      return ok(url)
    })
    const dash = useLiveDashboard()
    await dash.refresh()
    await dash.checkHealth()

    expect(peak).toBeLessThanOrEqual(10)
    expect(dash.upstreamHealth.value.data?.upstreams).toBe(25)
  })

  it('forgets an earlier health result when the dashboard refreshes', async () => {
    stubKong((url) => (url.pathname.endsWith('/health') ? json({ data: [{ target: 'a:80', health: 'HEALTHY' }] }) : ok(url)))
    const dash = useLiveDashboard()
    await dash.refresh()
    await dash.checkHealth()
    expect(dash.upstreamHealth.value.data).not.toBeNull()

    await dash.refresh()
    expect(dash.upstreamHealth.value.data).toBeNull()
  })

  it('keeps an upstreams failure to its own section', async () => {
    stubKong((url) => (url.pathname === '/upstreams' ? json({ message: 'boom' }, 500) : ok(url)))
    const dash = useLiveDashboard()
    await dash.refresh()

    expect(dash.upstreams.value.error).toContain('boom')
    expect(dash.services.value.data).toHaveLength(2)
  })
```

Note that `stubKong`'s handler in this file is typed `Handler`, returning a response or a promise of one; the async handlers above fit.

- [ ] **Step 2: Write the failing dashboard component tests**

In `src/components/live/LiveDashboard.test.ts`: add `'/live/upstreams'` to the router routes list in `mountDashboard`, add this entry to `DATA`:

```ts
  '/upstreams': [{ id: 'u1', name: 'api' }, { id: 'u2', name: 'billing' }],
```

and append inside `describe('LiveDashboard', ...)`:

```ts
  it('shows the number of upstreams and links the tile to the upstreams page', async () => {
    stubKong()
    const wrapper = await mountDashboard()

    expect(tile(wrapper, 'upstreams').text()).toContain('2')
    expect(tile(wrapper, 'upstreams').attributes('href')).toBe('/live/upstreams')
  })

  it('fetches no health on load, and shows the summary after "Check health"', async () => {
    const calls = stubKong((url) =>
      url.pathname.endsWith('/health')
        ? json({ data: [{ target: 'a:80', health: 'HEALTHY' }, { target: 'b:80', health: 'UNHEALTHY' }] })
        : (undefined as never),
    )
    const wrapper = await mountDashboard()
    expect(calls.some((call) => call.endsWith('/health'))).toBe(false)
    expect(wrapper.find('[data-testid="card-upstream-health"]').text()).toContain('Check health')

    await wrapper.find('[data-testid="check-upstream-health"]').trigger('click')
    await flushPromises()

    const card = wrapper.find('[data-testid="card-upstream-health"]').text()
    expect(card).toContain('4 targets')
    expect(card).toContain('2 unhealthy')
  })

  it('shows a calm message when there are no upstreams', async () => {
    stubKong((url) => (url.pathname === '/upstreams' ? json({ data: [], offset: null }) : (undefined as never)))
    const wrapper = await mountDashboard()

    expect(wrapper.find('[data-testid="card-upstream-health"]').text()).toContain('No upstreams yet')
    expect(wrapper.find('[data-testid="check-upstream-health"]').exists()).toBe(false)
  })
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run src/composables/useLiveDashboard.test.ts src/components/live/LiveDashboard.test.ts`
Expected: the new tests FAIL (`upstreams` / `checkHealth` not defined, tile missing).

- [ ] **Step 4: Implement the composable changes**

In `src/composables/useLiveDashboard.ts`:

Add imports:

```ts
import { getUpstreamHealth } from '../lib/kongAdmin/health'
import { mapLimit, parseNodeStatus, summarizeUpstreamHealth } from '../lib/live/dashboard'
import type { NodeStatus, UpstreamHealthSummary } from '../lib/live/dashboard'
```

(replace the existing `parseNodeStatus` / `NodeStatus` import lines with these).

Add below `const PAGE_SIZE = 1000`:

```ts
// How many upstream health requests run at once when the user asks for a health check.
const HEALTH_CONCURRENCY = 10
```

Add after the `plugins` ref:

```ts
  const upstreams = ref(idle<LiveEntity[]>()) as Ref<Section<LiveEntity[]>>
  const upstreamHealth = ref(idle<UpstreamHealthSummary>()) as Ref<Section<UpstreamHealthSummary>>
```

Add `upstreams` to the `loading` computed array (it already lists `services, routes, consumers, plugins, node`):

```ts
    [services, routes, consumers, plugins, upstreams, node, upstreamHealth].some((section) => section.value.loading),
```

In `refresh`, add the line after the `plugins` load and reset the health at the start (before `Promise.all`):

```ts
    upstreamHealth.value = idle()
```

```ts
      load(upstreams, mine, list('upstreams')),
```

Add before `return`:

```ts
  /** One health request per upstream, a few at a time. A failed one is counted, not thrown. */
  async function checkHealth() {
    const connectionNow = connection.active
    const mine = token
    const targets = upstreams.value.data ?? []
    if (!connectionNow || targets.length === 0) return
    upstreamHealth.value = { data: null, loading: true, error: null }
    const results = await mapLimit(targets, HEALTH_CONCURRENCY, (upstream) =>
      getUpstreamHealth(connectionNow, upstream.id).catch(() => null),
    )
    if (mine === token) upstreamHealth.value = { data: summarizeUpstreamHealth(results), loading: false, error: null }
  }
```

Change the return to:

```ts
  return { services, routes, consumers, plugins, upstreams, upstreamHealth, node, updatedAt, loading, refresh, checkHealth }
```

- [ ] **Step 5: Implement the dashboard UI**

In `src/components/live/LiveDashboard.vue`:

Change the destructuring line to:

```ts
const { services, routes, consumers, plugins, upstreams, upstreamHealth, node, updatedAt, loading, refresh, checkHealth } = useLiveDashboard()
```

Add a computed after `requests`:

```ts
const healthSummary = computed(() => upstreamHealth.value.data)
```

Change the tiles grid class to `grid grid-cols-2 gap-3 lg:grid-cols-5` and add the tile after the Services tile:

```vue
      <DashboardTile data-testid="tile-upstreams" label="Upstreams" icon="link" :section="upstreams" to="/live/upstreams" />
```

Add this card between the three-card grid and the node card:

```vue
    <div class="card space-y-3 p-4" data-testid="card-upstream-health">
      <div class="flex items-center justify-between gap-3">
        <p class="section-heading">Upstream health</p>
        <button
          v-if="(upstreams.data?.length ?? 0) > 0"
          type="button"
          class="btn-secondary btn-sm"
          data-testid="check-upstream-health"
          :disabled="upstreamHealth.loading"
          @click="checkHealth"
        >
          <AppIcon name="refresh" class="h-3.5 w-3.5" :class="upstreamHealth.loading ? 'animate-spin' : ''" />
          Check health
        </button>
      </div>
      <p v-if="upstreams.error" class="text-sm text-ink-muted">Unavailable</p>
      <p v-else-if="upstreams.loading && upstreams.data === null" class="text-sm text-ink-muted">Loading…</p>
      <p v-else-if="(upstreams.data?.length ?? 0) === 0" class="text-sm text-ink-muted">No upstreams yet</p>
      <p v-else-if="upstreamHealth.loading" class="text-sm text-ink-muted">Checking…</p>
      <p v-else-if="healthSummary" class="text-sm text-ink" data-testid="upstream-health-summary">
        {{ healthSummary.upstreams }} upstreams · {{ healthSummary.targets }} targets ·
        <span :class="healthSummary.unhealthy > 0 ? 'font-semibold text-red-600 dark:text-red-400' : ''">{{ healthSummary.unhealthy }} unhealthy</span>
        <template v-if="healthSummary.unknown > 0"> · {{ healthSummary.unknown }} unknown</template>
      </p>
      <p v-else class="text-sm text-ink-muted">Not checked yet. Health is fetched only when you ask.</p>
    </div>
```

Why the test expects "4 targets" and "2 unhealthy": the stub answers every upstream's health with two targets (one healthy, one unhealthy), and there are two upstreams.

- [ ] **Step 6: Run to verify they pass**

Run: `npx vitest run src/composables/useLiveDashboard.test.ts src/components/live/LiveDashboard.test.ts`
Expected: PASS, including the existing dashboard tests (the `before * 2` refresh test still holds because refresh now makes one extra request each time).

- [ ] **Step 7: Typecheck and run the whole suite**

Run: `npx vue-tsc -b && npx vitest run`
Expected: no type errors; all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/composables/useLiveDashboard.ts src/composables/useLiveDashboard.test.ts src/components/live/LiveDashboard.vue src/components/live/LiveDashboard.test.ts
git commit -m "feat: add an Upstreams tile and on-demand health check to the dashboard

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Run it for real against Kong

Typecheck and tests do not prove this works. This task is a browser check; it changes code only to fix what it finds. Read `docs/running-locally.md` first for how to start the app.

**Files:**
- Modify only if a defect turns up (and add a failing test for it first).

- [ ] **Step 1: Start a Kong with a database**

Run a Kong 3.x with Postgres (the repo's `docs/running-locally.md` says how; otherwise use `docker run` for `kong:3` with a Postgres container and `KONG_ADMIN_LISTEN=0.0.0.0:8001`). Confirm: `curl -s localhost:8001/ | head -c 200` returns JSON.

- [ ] **Step 2: Seed data**

```bash
curl -s -X POST localhost:8001/upstreams -d name=api -d algorithm=round-robin
curl -s -X POST localhost:8001/upstreams/api/targets -d target=127.0.0.1:8001 -d weight=100
curl -s -X POST localhost:8001/upstreams/api/targets -d target=127.0.0.1:1 -d weight=100
curl -s -X POST localhost:8001/upstreams -d name=empty
```

To get real health states, give `api` an active health check: `curl -s -X PATCH localhost:8001/upstreams/api -H 'Content-Type: application/json' -d '{"healthchecks":{"active":{"http_path":"/","healthy":{"interval":2,"successes":1},"unhealthy":{"interval":2,"tcp_failures":1,"timeouts":1,"http_failures":1}}}}'`. Wait about 10 seconds.

- [ ] **Step 3: Start the app and walk through every behaviour**

Run `npm run dev:proxy`, open the URL it prints in a browser, connect to `http://localhost:8001`, and check each of these, noting what you actually see:

1. Sidebar has **Upstreams** under Live; the page title is "Live upstreams".
2. The list shows `api` (count 2) and `empty` (count 0) with their algorithm.
3. Selecting `api` shows the form and two targets; `127.0.0.1:8001` reads Healthy and `127.0.0.1:1` reads Unhealthy (or "Checks off" if checks were not enabled). "Refresh health" updates the "Health as of" time.
4. Add a target `127.0.0.1:2`, weight 10: it appears after the reload.
5. **Review Focus 2:** change that target's weight to 50 with "Set weight". Record what Kong does (a 409 error shown in the panel, or the weight changes). If it errors, the error text must show in the panel and the list must stay as it was.
6. **Review Focus 1:** remove `127.0.0.1:2`, then reload the browser page, reconnect, and reopen `api`. It must not come back. If it does, switch `remove` to delete by the id of every history row for that address and add a test for it.
7. Create an upstream, edit its slots, then delete it.
8. **Review Focus 5:** `curl -X PATCH localhost:8001/upstreams/empty -d algorithm=consistent-hashing -d hash_on=header -d hash_on_header=X-Id`, reload, open `empty`, change only the tags and save. Check with `curl localhost:8001/upstreams/empty` that `hash_on` is still `header`.
9. Overview: the Upstreams tile shows the right count and links to the page; "Check health" shows the targets and unhealthy counts; nothing is fetched before the click (watch the network tab).
10. At a narrow width, the five tiles and the new card do not overflow. If `lg:grid-cols-5` looks cramped, change it to `lg:grid-cols-3 xl:grid-cols-5`.
11. Dark mode: the badges stay readable.
12. Stop Kong's database (or connect to a DB-less Kong): the notice appears and every write control is disabled.

- [ ] **Step 4: Fix anything found, test-first**

For each defect: write a failing test, fix, rerun `npx vitest run` and `npx vue-tsc -b`.

- [ ] **Step 5: Final full run and commit any fixes**

Run: `npx vue-tsc -b && npx vitest run`
Expected: clean.

```bash
git add -A
git commit -m "fix: issues found while running the upstreams UI against Kong

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

(Skip the commit if nothing changed.)
