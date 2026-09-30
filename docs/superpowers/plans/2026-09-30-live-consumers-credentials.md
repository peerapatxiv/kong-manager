# Live Consumers and Credentials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add live consumers (list, search, create, edit, delete) with a data-driven credentials panel for key-auth, basic-auth, oauth2, hmac-auth, jwt and acls.

**Architecture:** Six nested credential resources join the entity registry. Two pure modules hold the rules: `consumerForm.ts` (Primate's username-or-custom-id rule and null/omit payloads) and `credentials.ts` (one descriptor per credential type). `LiveConsumersView` follows `LiveServicesView`; `CredentialsPanel` renders one `CredentialSection` per type, each driven by its descriptor and `useLiveEntities`.

**Tech Stack:** Vue 3 (script setup), Pinia, vue-router, TypeScript, Vitest with jsdom and `@vue/test-utils`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-30-live-consumers-credentials-design.md` (builds on the foundation and live shell specs in the same folder)

## Global Constraints

- No new dependencies. No changes to Browse, Compare, Load, services or routes behaviour.
- Existing tests keep passing, except the two deliberate updates named in Tasks 1 and 4 (registry list, sidebar Live links).
- Write controls (New, Save, Delete, credential add and delete, every input) are disabled when `connection.canWrite` is false.
- Client-side validation blocks the request and shows a banner. Kong errors keep the form open.
- Consumer create never sends `null`; update sends `null` for a cleared username or custom ID.
- Credentials are create-and-delete only; payloads never contain `null`. Secret values (`kind: 'secret'`) are never trimmed and are masked until revealed.
- Every view test stubs `fetch`; none touches the network.
- No browser check is possible (Chrome extension declined); the final report says so.

## Review Focus

1. A blank or whitespace-only username and custom ID must block Save with Primate's message, and clearing one of them on an existing consumer must send `null`. Pinned in Tasks 2 and 4.
2. Secret values: a password with leading or trailing spaces is sent exactly as typed, and secrets are masked in the list until the row is revealed. Pinned in Tasks 3 and 5.
3. A consumer or credential id with spaces, slashes or `%` must be URL-encoded in every credential path. Pinned in Task 1.
4. Credentials must not leak across consumers: switching consumer clears the rows and the add form, and requests go to the new consumer's path. Pinned in Task 5.
5. A required credential field left blank (basic-auth username and password) must block the request with one banner message per field. Pinned in Tasks 3 and 5.

---

### Task 1: Credential resources in the registry

**Files:**
- Modify: `src/lib/kongAdmin/entities.ts`
- Modify: `src/lib/kongAdmin/entities.test.ts`

**Interfaces:**
- Consumes: existing `ENTITY_RESOURCES`, `createEntityClient`.
- Produces: `EntityResourceName` gains `'key_auth' | 'basic_auth' | 'oauth2_credentials' | 'hmac_auth' | 'jwt_credentials' | 'acls'`; each is nested with path `consumers/:parentId/<segment>` (`key-auth`, `basic-auth`, `oauth2`, `hmac-auth`, `jwt`, `acls`) and `defaults: {}`.

- [ ] **Step 1: Write the failing tests**

Run:

```bash
python3 - <<'E'
p = 'src/lib/kongAdmin/entities.test.ts'
s = open(p).read()

def rep(a, b):
    global s
    assert a in s, a
    s = s.replace(a, b, 1)

rep("has all ten collections", "has all sixteen collections")
rep("['ca_certificates', 'certificates', 'consumers', 'plugins', 'routes', 'service_routes', 'services', 'snis', 'targets', 'upstreams'].sort()",
    "['acls', 'basic_auth', 'ca_certificates', 'certificates', 'consumers', 'hmac_auth', 'jwt_credentials', 'key_auth', 'oauth2_credentials', 'plugins', 'routes', 'service_routes', 'services', 'snis', 'targets', 'upstreams'].sort()")
rep("  it('throws at creation when a nested resource has no parent id', () => {", """  it.each([
    ['key_auth', 'key-auth'],
    ['basic_auth', 'basic-auth'],
    ['oauth2_credentials', 'oauth2'],
    ['hmac_auth', 'hmac-auth'],
    ['jwt_credentials', 'jwt'],
    ['acls', 'acls'],
  ] as const)('lists %s under the consumer at /consumers/:id/%s, with the parent id encoded', async (resource, segment) => {
    const f = mockFetch({ data: [] })

    await createEntityClient(conn, resource, 'con 1/x%').list()

    expect(urlOf(f)).toBe(`http://localhost:8001/consumers/con%201%2Fx%25/${segment}`)
  })

  it('encodes a credential id when deleting it, and requires a parent id', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, status: 204, text: async () => '' })
    vi.stubGlobal('fetch', f)

    await createEntityClient(conn, 'key_auth', 'c1').remove('k 1')

    expect(urlOf(f)).toBe('http://localhost:8001/consumers/c1/key-auth/k%201')
    expect(initOf(f).method).toBe('DELETE')
    expect(() => createEntityClient(conn, 'jwt_credentials')).toThrow(/parentId/)
  })

  it('throws at creation when a nested resource has no parent id', () => {""")
open(p, 'w').write(s)
E
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/kongAdmin/entities.test.ts`
Expected: FAIL (the collection list and the new credential tests).

- [ ] **Step 3: Write the implementation**

Run:

```bash
python3 - <<'E'
p = 'src/lib/kongAdmin/entities.ts'
s = open(p).read()

def rep(a, b):
    global s
    assert a in s, a
    s = s.replace(a, b, 1)

rep("  | 'snis'\n", """  | 'snis'
  | 'key_auth'
  | 'basic_auth'
  | 'oauth2_credentials'
  | 'hmac_auth'
  | 'jwt_credentials'
  | 'acls'
""")
rep("""    defaults: { name: '', tags: [] },
  },
}
""", """    defaults: { name: '', tags: [] },
  },
  key_auth: { path: 'consumers/:parentId/key-auth', nested: true, defaults: {} },
  basic_auth: { path: 'consumers/:parentId/basic-auth', nested: true, defaults: {} },
  oauth2_credentials: { path: 'consumers/:parentId/oauth2', nested: true, defaults: {} },
  hmac_auth: { path: 'consumers/:parentId/hmac-auth', nested: true, defaults: {} },
  jwt_credentials: { path: 'consumers/:parentId/jwt', nested: true, defaults: {} },
  acls: { path: 'consumers/:parentId/acls', nested: true, defaults: {} },
}
""")
open(p, 'w').write(s)
E
```

- [ ] **Step 4: Run the tests and typecheck to verify they pass**

Run: `npx vitest run src/lib/kongAdmin && npx vue-tsc -b`
Expected: PASS; typecheck prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kongAdmin/entities.ts src/lib/kongAdmin/entities.test.ts
git commit -m "feat: add nested credential resources to the entity registry

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Consumer form module

**Files:**
- Create: `src/lib/live/consumerForm.ts`
- Create: `src/lib/live/consumerForm.test.ts`

**Interfaces:**
- Consumes: `ENTITY_RESOURCES.consumers.defaults`.
- Produces (exported from `src/lib/live/consumerForm.ts`): `type ConsumerForm = { username: string; custom_id: string; tags: string[] }`; `fromEntity(entity: Record<string, unknown>): ConsumerForm`; `newConsumerForm(): ConsumerForm`; `validateConsumer(form: ConsumerForm): string[]`; `toPayload(form: ConsumerForm, mode: 'create' | 'update'): Record<string, unknown>`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/live/consumerForm.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { fromEntity, newConsumerForm, toPayload, validateConsumer } from './consumerForm'

const MESSAGE = 'Please provide either a username or a custom ID.'

describe('newConsumerForm', () => {
  it('starts empty', () => {
    expect(newConsumerForm()).toEqual({ username: '', custom_id: '', tags: [] })
  })
})

describe('validateConsumer', () => {
  it.each([
    ['both empty', { username: '', custom_id: '' }],
    ['both whitespace-only', { username: '   ', custom_id: ' \\t ' }],
  ])('rejects %s with the Primate message', (_label, patch) => {
    expect(validateConsumer({ ...newConsumerForm(), ...patch })).toEqual([MESSAGE])
  })

  it.each([
    ['only a username', { username: 'alice', custom_id: '' }],
    ['only a custom ID', { username: '', custom_id: 'ext-1' }],
    ['both', { username: 'alice', custom_id: 'ext-1' }],
  ])('accepts %s', (_label, patch) => {
    expect(validateConsumer({ ...newConsumerForm(), ...patch })).toEqual([])
  })
})

describe('toPayload', () => {
  it('trims strings and cleans tags', () => {
    expect(toPayload({ username: '  alice ', custom_id: ' ext-1 ', tags: [' a ', '', '  '] }, 'update')).toEqual({
      username: 'alice',
      custom_id: 'ext-1',
      tags: ['a'],
    })
  })

  it('on update, sends null for a cleared username or custom ID so the server clears it', () => {
    expect(toPayload({ username: '   ', custom_id: 'ext-1', tags: [] }, 'update')).toMatchObject({
      username: null,
      custom_id: 'ext-1',
    })
    expect(toPayload({ username: 'alice', custom_id: '', tags: [] }, 'update')).toMatchObject({
      username: 'alice',
      custom_id: null,
    })
  })

  it('on create, never sends null values', () => {
    const payload = toPayload({ username: 'alice', custom_id: '', tags: [] }, 'create')

    expect(payload).toEqual({ username: 'alice', tags: [] })
    expect(Object.values(payload).some((v) => v === null || v === undefined)).toBe(false)
  })
})

describe('fromEntity', () => {
  it('maps a Kong consumer into the form', () => {
    expect(fromEntity({ id: 'c1', username: 'alice', custom_id: 'ext-1', tags: ['t'] })).toEqual({
      username: 'alice',
      custom_id: 'ext-1',
      tags: ['t'],
    })
  })

  it('tolerates null and missing fields, and round-trips back to the same payload', () => {
    expect(fromEntity({ username: null, custom_id: null, tags: null })).toEqual({ username: '', custom_id: '', tags: [] })
    expect(toPayload(fromEntity({ username: 'alice', custom_id: null, tags: ['t'] }), 'update')).toEqual({
      username: 'alice',
      custom_id: null,
      tags: ['t'],
    })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/live/consumerForm.test.ts`
Expected: FAIL, cannot resolve `./consumerForm`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/live/consumerForm.ts`:

```ts
import { ENTITY_RESOURCES } from '../kongAdmin/entities'

export type ConsumerForm = {
  username: string
  custom_id: string
  tags: string[]
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')
const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

export function fromEntity(entity: Record<string, unknown>): ConsumerForm {
  return {
    username: text(entity.username),
    custom_id: text(entity.custom_id),
    tags: stringList(entity.tags),
  }
}

export function newConsumerForm(): ConsumerForm {
  return fromEntity(ENTITY_RESOURCES.consumers.defaults)
}

export function validateConsumer(form: ConsumerForm): string[] {
  if (form.username.trim() === '' && form.custom_id.trim() === '') {
    return ['Please provide either a username or a custom ID.']
  }
  return []
}

export function toPayload(form: ConsumerForm, mode: 'create' | 'update'): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    username: form.username.trim() || null,
    custom_id: form.custom_id.trim() || null,
    tags: form.tags.map((tag) => tag.trim()).filter(Boolean),
  }
  if (mode === 'create') {
    return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== null))
  }
  return payload
}
```

- [ ] **Step 4: Run the tests and typecheck to verify they pass**

Run: `npx vitest run src/lib/live/consumerForm.test.ts && npx vue-tsc -b`
Expected: PASS; typecheck prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/live/consumerForm.ts src/lib/live/consumerForm.test.ts
git commit -m "feat: add consumer form module with Primate's username-or-custom-id rule

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Credential descriptors

**Files:**
- Create: `src/lib/live/credentials.ts`
- Create: `src/lib/live/credentials.test.ts`

**Interfaces:**
- Consumes: `ENTITY_RESOURCES`, `EntityResourceName` from `../kongAdmin/entities` (Task 1).
- Produces (exported from `src/lib/live/credentials.ts`):
  - `type CredentialTypeId = 'key-auth' | 'basic-auth' | 'oauth2' | 'hmac-auth' | 'jwt' | 'acls'`
  - `type CredentialFieldKind = 'text' | 'secret' | 'number' | 'boolean' | 'select' | 'list' | 'textarea'`
  - `type CredentialField = { key: string; label: string; kind: CredentialFieldKind; required?: boolean; options?: readonly string[]; default?: string | boolean }`
  - `type CredentialType = { id: CredentialTypeId; label: string; resource: EntityResourceName; fields: CredentialField[]; summaryKeys: string[] }`
  - `type CredentialForm = Record<string, string | number | boolean | string[]>`
  - `CREDENTIAL_TYPES: CredentialType[]`, `credentialType(id: CredentialTypeId): CredentialType`, `newCredentialForm(type): CredentialForm`, `validateCredential(type, form): string[]`, `toCredentialPayload(type, form): Record<string, unknown>`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/live/credentials.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ENTITY_RESOURCES } from '../kongAdmin/entities'
import {
  CREDENTIAL_TYPES,
  credentialType,
  newCredentialForm,
  toCredentialPayload,
  validateCredential,
} from './credentials'

const type = (id: Parameters<typeof credentialType>[0]) => credentialType(id)

describe('CREDENTIAL_TYPES', () => {
  it('has the six Primate types, each mapped to a nested registry resource', () => {
    expect(CREDENTIAL_TYPES.map((t) => t.id)).toEqual(['key-auth', 'basic-auth', 'oauth2', 'hmac-auth', 'jwt', 'acls'])
    for (const t of CREDENTIAL_TYPES) {
      expect(ENTITY_RESOURCES[t.resource].nested).toBe(true)
      expect(ENTITY_RESOURCES[t.resource].path).toContain('consumers/:parentId/')
      expect(t.fields.some((f) => f.key === 'tags' && f.kind === 'list')).toBe(true)
      for (const key of t.summaryKeys) expect(t.fields.some((f) => f.key === key)).toBe(true)
    }
  })

  it('marks the secret fields', () => {
    const secrets = (id: Parameters<typeof credentialType>[0]) =>
      type(id).fields.filter((f) => f.kind === 'secret').map((f) => f.key)
    expect(secrets('key-auth')).toEqual(['key'])
    expect(secrets('basic-auth')).toEqual(['password'])
    expect(secrets('oauth2')).toEqual(['client_secret'])
    expect(secrets('hmac-auth')).toEqual(['secret'])
    expect(secrets('jwt')).toEqual(['secret'])
    expect(secrets('acls')).toEqual([])
  })
})

describe('newCredentialForm', () => {
  it('starts every field at its default: empty text, false booleans, empty lists, jwt HS256', () => {
    expect(newCredentialForm(type('key-auth'))).toEqual({ key: '', ttl: '', tags: [] })
    expect(newCredentialForm(type('oauth2'))).toMatchObject({ name: '', hash_secret: false, redirect_uris: [], client_type: '' })
    expect(newCredentialForm(type('jwt'))).toMatchObject({ algorithm: 'HS256', key: '', secret: '', rsa_public_key: '' })
  })
})

describe('validateCredential', () => {
  it('reports one message per blank required field', () => {
    expect(validateCredential(type('basic-auth'), newCredentialForm(type('basic-auth')))).toEqual([
      'Username is required.',
      'Password is required.',
    ])
    expect(validateCredential(type('acls'), newCredentialForm(type('acls')))).toEqual(['Group is required.'])
  })

  it('treats a whitespace-only required text field as blank', () => {
    const form = { ...newCredentialForm(type('hmac-auth')), username: '   ' }
    expect(validateCredential(type('hmac-auth'), form)).toEqual(['Username is required.'])
  })

  it('accepts filled required fields, and types with no required field', () => {
    expect(validateCredential(type('basic-auth'), { ...newCredentialForm(type('basic-auth')), username: 'u', password: 'p' })).toEqual([])
    expect(validateCredential(type('key-auth'), newCredentialForm(type('key-auth')))).toEqual([])
    expect(validateCredential(type('jwt'), newCredentialForm(type('jwt')))).toEqual([])
  })
})

describe('toCredentialPayload', () => {
  it('omits blank fields so Kong can generate them', () => {
    expect(toCredentialPayload(type('key-auth'), newCredentialForm(type('key-auth')))).toEqual({})
  })

  it('sends a number only when set, including zero', () => {
    expect(toCredentialPayload(type('key-auth'), { ...newCredentialForm(type('key-auth')), ttl: 3600 })).toEqual({ ttl: 3600 })
    expect(toCredentialPayload(type('key-auth'), { ...newCredentialForm(type('key-auth')), ttl: 0 })).toEqual({ ttl: 0 })
  })

  it('trims text but sends a secret exactly as typed', () => {
    const payload = toCredentialPayload(type('basic-auth'), {
      ...newCredentialForm(type('basic-auth')),
      username: '  alice ',
      password: '  pass word  ',
    })
    expect(payload).toEqual({ username: 'alice', password: '  pass word  ' })
  })

  it('omits a secret that is only whitespace', () => {
    expect(toCredentialPayload(type('key-auth'), { ...newCredentialForm(type('key-auth')), key: '   ' })).toEqual({})
  })

  it('sends a boolean only when true, and lists only when non-empty and cleaned', () => {
    const base = { ...newCredentialForm(type('oauth2')), name: ' app ' }
    expect(toCredentialPayload(type('oauth2'), base)).toEqual({ name: 'app' })
    expect(
      toCredentialPayload(type('oauth2'), {
        ...base,
        hash_secret: true,
        redirect_uris: [' https://a.example/cb ', ''],
        tags: [' t '],
        client_type: 'confidential',
      }),
    ).toEqual({
      name: 'app',
      hash_secret: true,
      redirect_uris: ['https://a.example/cb'],
      tags: ['t'],
      client_type: 'confidential',
    })
  })

  it('keeps the jwt algorithm and trims a multi-line public key', () => {
    const payload = toCredentialPayload(type('jwt'), {
      ...newCredentialForm(type('jwt')),
      algorithm: 'RS256',
      rsa_public_key: '\n-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----\n',
    })
    expect(payload).toEqual({
      algorithm: 'RS256',
      rsa_public_key: '-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----',
    })
  })

  it('never sends null or undefined', () => {
    for (const t of CREDENTIAL_TYPES) {
      const payload = toCredentialPayload(t, newCredentialForm(t))
      expect(Object.values(payload).some((v) => v === null || v === undefined)).toBe(false)
    }
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/live/credentials.test.ts`
Expected: FAIL, cannot resolve `./credentials`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/live/credentials.ts`:

```ts
import type { EntityResourceName } from '../kongAdmin/entities'

export type CredentialTypeId = 'key-auth' | 'basic-auth' | 'oauth2' | 'hmac-auth' | 'jwt' | 'acls'
export type CredentialFieldKind = 'text' | 'secret' | 'number' | 'boolean' | 'select' | 'list' | 'textarea'

export type CredentialField = {
  key: string
  label: string
  kind: CredentialFieldKind
  required?: boolean
  options?: readonly string[]
  default?: string | boolean
}

export type CredentialType = {
  id: CredentialTypeId
  label: string
  resource: EntityResourceName
  fields: CredentialField[]
  /** Field keys shown on each row of the credential list. */
  summaryKeys: string[]
}

export type CredentialForm = Record<string, string | number | boolean | string[]>

const TAGS: CredentialField = { key: 'tags', label: 'Tags', kind: 'list' }

// Fields follow Primate's user-auth-model. Anything Kong can generate (keys, client ids,
// secrets) is optional, so a blank field is omitted and Kong fills it in.
export const CREDENTIAL_TYPES: CredentialType[] = [
  {
    id: 'key-auth',
    label: 'Key auth',
    resource: 'key_auth',
    fields: [
      { key: 'key', label: 'Key', kind: 'secret' },
      { key: 'ttl', label: 'TTL (seconds)', kind: 'number' },
      TAGS,
    ],
    summaryKeys: ['key'],
  },
  {
    id: 'basic-auth',
    label: 'Basic auth',
    resource: 'basic_auth',
    fields: [
      { key: 'username', label: 'Username', kind: 'text', required: true },
      { key: 'password', label: 'Password', kind: 'secret', required: true },
      TAGS,
    ],
    summaryKeys: ['username'],
  },
  {
    id: 'oauth2',
    label: 'OAuth 2.0',
    resource: 'oauth2_credentials',
    fields: [
      { key: 'name', label: 'Name', kind: 'text', required: true },
      { key: 'client_id', label: 'Client ID', kind: 'text' },
      { key: 'client_secret', label: 'Client secret', kind: 'secret' },
      { key: 'client_type', label: 'Client type', kind: 'select', options: ['confidential', 'public'] },
      { key: 'hash_secret', label: 'Hash secret', kind: 'boolean' },
      { key: 'redirect_uris', label: 'Redirect URIs', kind: 'list' },
      TAGS,
    ],
    summaryKeys: ['name', 'client_id'],
  },
  {
    id: 'hmac-auth',
    label: 'HMAC auth',
    resource: 'hmac_auth',
    fields: [
      { key: 'username', label: 'Username', kind: 'text', required: true },
      { key: 'secret', label: 'Secret', kind: 'secret' },
      TAGS,
    ],
    summaryKeys: ['username'],
  },
  {
    id: 'jwt',
    label: 'JWT',
    resource: 'jwt_credentials',
    fields: [
      {
        key: 'algorithm',
        label: 'Algorithm',
        kind: 'select',
        options: ['HS256', 'HS384', 'HS512', 'RS256', 'ES256'],
        default: 'HS256',
      },
      { key: 'key', label: 'Key', kind: 'text' },
      { key: 'secret', label: 'Secret', kind: 'secret' },
      { key: 'rsa_public_key', label: 'RSA public key', kind: 'textarea' },
      TAGS,
    ],
    summaryKeys: ['key', 'algorithm'],
  },
  {
    id: 'acls',
    label: 'ACL groups',
    resource: 'acls',
    fields: [{ key: 'group', label: 'Group', kind: 'text', required: true }, TAGS],
    summaryKeys: ['group'],
  },
]

export function credentialType(id: CredentialTypeId): CredentialType {
  const found = CREDENTIAL_TYPES.find((type) => type.id === id)
  if (!found) throw new Error(`Unknown credential type "${id}"`)
  return found
}

export function newCredentialForm(type: CredentialType): CredentialForm {
  const form: CredentialForm = {}
  for (const field of type.fields) {
    if (field.default !== undefined) form[field.key] = field.default
    else if (field.kind === 'boolean') form[field.key] = false
    else if (field.kind === 'list') form[field.key] = []
    else form[field.key] = ''
  }
  return form
}

const asText = (value: unknown): string => (typeof value === 'string' ? value : '')

export function validateCredential(type: CredentialType, form: CredentialForm): string[] {
  return type.fields
    .filter((field) => field.required && asText(form[field.key]).trim() === '')
    .map((field) => `${field.label} is required.`)
}

export function toCredentialPayload(type: CredentialType, form: CredentialForm): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  for (const field of type.fields) {
    const value = form[field.key]
    switch (field.kind) {
      case 'secret':
        // Exact as typed: a password may legitimately start or end with a space.
        if (asText(value).trim() !== '') payload[field.key] = value
        break
      case 'text':
      case 'select':
      case 'textarea':
        if (asText(value).trim() !== '') payload[field.key] = asText(value).trim()
        break
      case 'number':
        if (typeof value === 'number') payload[field.key] = value
        break
      case 'boolean':
        if (value === true) payload[field.key] = true
        break
      case 'list': {
        const items = Array.isArray(value) ? value.map((item) => item.trim()).filter(Boolean) : []
        if (items.length > 0) payload[field.key] = items
        break
      }
    }
  }
  return payload
}
```

- [ ] **Step 4: Run the tests and typecheck to verify they pass**

Run: `npx vitest run src/lib/live/credentials.test.ts && npx vue-tsc -b`
Expected: PASS; typecheck prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/live/credentials.ts src/lib/live/credentials.test.ts
git commit -m "feat: add credential descriptors with per-type validation and payload rules

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Consumers view, form and navigation

**Files:**
- Create: `src/components/live/ConsumerForm.vue`
- Create: `src/views/live/LiveConsumersView.vue`
- Create: `src/views/live/LiveConsumersView.test.ts`
- Modify: `src/router/index.ts`
- Modify: `src/components/layout/AppShell.vue`
- Modify: `src/components/layout/AppSidebar.vue`
- Modify: `src/components/layout/AppSidebar.test.ts`

**Interfaces:**
- Consumes: `useLiveEntities`, `LiveEntity` (live shell); `fromEntity`, `newConsumerForm`, `toPayload`, `validateConsumer`, `ConsumerForm` type (Task 2); `LiveGate`, `LiveErrorBanner`, `FieldError`; shared `TagInput`, `SearchInput`.
- Produces: route `/live/consumers`; `ConsumerForm.vue` with props `{ modelValue: ConsumerForm; disabled?: boolean; fieldErrors?: Record<string, string> }`; sidebar Live link Consumers; test ids `consumer-row`, `new-consumer`, `tag-filter`, `consumer-username`, `consumer-custom-id`, `save`, `discard`, `delete`.

- [ ] **Step 1: Write the failing tests**

Create `src/views/live/LiveConsumersView.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { flushPromises, mount } from '@vue/test-utils'
import LiveConsumersView from './LiveConsumersView.vue'
import { useConnectionStore } from '../../stores/connection'

type Call = { method: string; url: string; body?: Record<string, unknown> }
type Reply = { ok: boolean; status: number; json?: () => Promise<unknown>; text: () => Promise<string> }

const CONSUMERS = [
  { id: 'c-1', username: 'alice', custom_id: null, tags: ['vip'] },
  { id: 'c-2', username: null, custom_id: 'ext-2', tags: [] },
]

function fakeKong(failCreateWith?: { status: number; body: unknown }) {
  const calls: Call[] = []
  const reply = (body: unknown, status = 200): Reply => ({
    ok: status < 400,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}): Promise<Reply> => {
      const method = init.method ?? 'GET'
      const body = init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : undefined
      calls.push({ method, url, body })
      if (method === 'GET' && url.includes('/consumers/')) return reply({ data: [] })
      if (method === 'GET' && url.includes('/consumers')) return reply({ data: CONSUMERS })
      if (method === 'POST') {
        if (failCreateWith) return reply(failCreateWith.body, failCreateWith.status)
        return reply({ id: 'new-1', ...body }, 201)
      }
      if (method === 'PATCH') return reply({ ...CONSUMERS.find((c) => url.endsWith(`/consumers/${c.id}`)), ...body })
      if (method === 'DELETE') return { ok: true, status: 204, text: async () => '' }
      return reply({}, 404)
    }),
  )
  return calls
}

function connect(database = 'postgres') {
  useConnectionStore().$patch({ active: { baseUrl: 'http://kong:8001' }, info: { version: '3.4.0', database } })
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>home</div>' } },
      { path: '/live/consumers', component: LiveConsumersView },
    ],
  })
}

async function mountView() {
  const router = makeRouter()
  const wrapper = mount(LiveConsumersView, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

type Wrapper = Awaited<ReturnType<typeof mountView>>
const byId = (wrapper: Wrapper, id: string) => wrapper.find(`[data-testid="${id}"]`)
const rows = (wrapper: Wrapper) => wrapper.findAll('[data-testid="consumer-row"]')
const valueOf = (wrapper: Wrapper, id: string) => (byId(wrapper, id).element as HTMLInputElement).value

beforeEach(() => setActivePinia(createPinia()))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('LiveConsumersView', () => {
  it('shows the connect prompt and sends no request when not connected', async () => {
    const calls = fakeKong()

    const wrapper = await mountView()

    expect(byId(wrapper, 'live-not-connected').exists()).toBe(true)
    expect(calls).toHaveLength(0)
  })

  it('lists consumers labelled by username, else custom ID, and filters the loaded ones by search', async () => {
    connect()
    fakeKong()

    const wrapper = await mountView()

    expect(rows(wrapper).map((r) => r.text())).toEqual([expect.stringContaining('alice'), expect.stringContaining('ext-2')])
    await wrapper.find('input[placeholder="Search loaded consumers…"]').setValue('ext')
    expect(rows(wrapper)).toHaveLength(1)
    expect(rows(wrapper)[0].text()).toContain('ext-2')
  })

  it('applies the tag filter through the API on Enter', async () => {
    connect()
    const calls = fakeKong()
    const wrapper = await mountView()

    const input = byId(wrapper, 'tag-filter')
    await input.setValue('vip, eu')
    await input.trigger('keydown', { key: 'Enter' })
    await flushPromises()

    expect(calls.at(-1)?.url).toBe('http://kong:8001/consumers?tags=vip%2Ceu')
  })

  it('on DB-less Kong shows the notice and disables every write control', async () => {
    connect('off')
    fakeKong()
    const wrapper = await mountView()

    expect(byId(wrapper, 'live-read-only').exists()).toBe(true)
    expect(byId(wrapper, 'new-consumer').attributes('disabled')).toBeDefined()
    await rows(wrapper)[0].trigger('click')
    expect(byId(wrapper, 'save').attributes('disabled')).toBeDefined()
    expect(byId(wrapper, 'delete').attributes('disabled')).toBeDefined()
    expect(wrapper.find('fieldset').attributes('disabled')).toBeDefined()
  })

  it('edits a consumer and saves with a PATCH carrying the change', async () => {
    connect()
    const calls = fakeKong()
    const wrapper = await mountView()

    await rows(wrapper)[0].trigger('click')
    expect(valueOf(wrapper, 'consumer-username')).toBe('alice')
    expect(byId(wrapper, 'save').attributes('disabled')).toBeDefined()

    await byId(wrapper, 'consumer-username').setValue('alice2')
    await byId(wrapper, 'save').trigger('click')
    await flushPromises()

    const patch = calls.find((c) => c.method === 'PATCH')!
    expect(patch.url).toBe('http://kong:8001/consumers/c-1')
    expect(patch.body).toMatchObject({ username: 'alice2', custom_id: null, tags: ['vip'] })
  })

  it('clearing the username on a consumer that has a custom ID sends null for the username', async () => {
    connect()
    const calls = fakeKong()
    const wrapper = await mountView()

    await rows(wrapper)[1].trigger('click')
    await byId(wrapper, 'consumer-username').setValue('temp')
    await byId(wrapper, 'consumer-username').setValue('')
    await byId(wrapper, 'consumer-custom-id').setValue('ext-2b')
    await byId(wrapper, 'save').trigger('click')
    await flushPromises()

    expect(calls.find((c) => c.method === 'PATCH')?.body).toMatchObject({ username: null, custom_id: 'ext-2b' })
  })

  it('creates a consumer with a POST, never sending null values', async () => {
    connect()
    const calls = fakeKong()
    const wrapper = await mountView()

    await byId(wrapper, 'new-consumer').trigger('click')
    await byId(wrapper, 'consumer-username').setValue('  bob ')
    await byId(wrapper, 'save').trigger('click')
    await flushPromises()

    const post = calls.find((c) => c.method === 'POST')!
    expect(post.url).toBe('http://kong:8001/consumers')
    expect(post.body).toEqual({ username: 'bob', tags: [] })
    expect(rows(wrapper)[0].text()).toContain('bob')
  })

  it('blocks Save with the Primate message when both username and custom ID are blank', async () => {
    connect()
    const calls = fakeKong()
    const wrapper = await mountView()

    await byId(wrapper, 'new-consumer').trigger('click')
    await byId(wrapper, 'consumer-username').setValue('   ')
    await byId(wrapper, 'save').trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toContain('Please provide either a username or a custom ID.')
    expect(calls.some((c) => c.method === 'POST')).toBe(false)
  })

  it('shows Kong field errors in the banner and keeps the form open', async () => {
    connect()
    fakeKong({ status: 409, body: { message: 'UNIQUE violation detected on username', fields: { username: 'already exists' } } })
    const wrapper = await mountView()

    await byId(wrapper, 'new-consumer').trigger('click')
    await byId(wrapper, 'consumer-username').setValue('alice')
    await byId(wrapper, 'save').trigger('click')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toContain('UNIQUE violation detected on username')
    expect(wrapper.text()).toContain('already exists')
    expect(valueOf(wrapper, 'consumer-username')).toBe('alice')
  })

  it('deletes after confirming that credentials go too, and not when cancelled', async () => {
    connect()
    const calls = fakeKong()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const wrapper = await mountView()

    await rows(wrapper)[0].trigger('click')
    await byId(wrapper, 'delete').trigger('click')
    expect(confirm).toHaveBeenCalledWith('Delete this consumer? Its credentials are deleted too.')
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)

    confirm.mockReturnValue(true)
    await byId(wrapper, 'delete').trigger('click')
    await flushPromises()
    expect(calls.find((c) => c.method === 'DELETE')?.url).toBe('http://kong:8001/consumers/c-1')
    expect(rows(wrapper)).toHaveLength(1)
  })

  it('asks before discarding edits on selection change and on Discard, keeping them on cancel', async () => {
    connect()
    fakeKong()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const wrapper = await mountView()

    await rows(wrapper)[0].trigger('click')
    await byId(wrapper, 'consumer-username').setValue('edited')
    await rows(wrapper)[1].trigger('click')
    expect(confirm).toHaveBeenCalled()
    expect(valueOf(wrapper, 'consumer-username')).toBe('edited')

    await byId(wrapper, 'discard').trigger('click')
    expect(valueOf(wrapper, 'consumer-username')).toBe('edited')

    confirm.mockReturnValue(true)
    await byId(wrapper, 'discard').trigger('click')
    expect(valueOf(wrapper, 'consumer-username')).toBe('alice')
  })

  it('asks before leaving the page with unsaved edits, and stays when cancelled', async () => {
    connect()
    fakeKong()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const router = makeRouter()
    router.push('/live/consumers')
    await router.isReady()
    const wrapper = mount({ template: '<RouterView />' }, { global: { plugins: [router] } })
    await flushPromises()

    await wrapper.findAll('[data-testid="consumer-row"]')[0].trigger('click')
    await wrapper.find('[data-testid="consumer-username"]').setValue('edited')
    await router.push('/')
    expect(confirm).toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/live/consumers')

    confirm.mockReturnValue(true)
    await router.push('/')
    expect(router.currentRoute.value.path).toBe('/')
  })
})
```

In `src/components/layout/AppSidebar.test.ts`, update the existing connected-links test (a deliberate change: Consumers joins the group). Run:

```bash
python3 - <<'E'
p = 'src/components/layout/AppSidebar.test.ts'
s = open(p).read()
a = "      ['Routes', '/live/routes'],\n"
assert a in s
s = s.replace(a, a + "      ['Consumers', '/live/consumers'],\n", 1)
s = s.replace("links to the live services and routes once connected", "links to the live services, routes and consumers once connected", 1)
open(p, 'w').write(s)
E
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/views/live/LiveConsumersView.test.ts src/components/layout/AppSidebar.test.ts`
Expected: FAIL (the view does not exist; the sidebar test lacks the Consumers link). Other sidebar tests still pass.

- [ ] **Step 3: Write the implementation**

Create `src/components/live/ConsumerForm.vue`:

```vue
<script setup lang="ts">
import type { ConsumerForm } from '../../lib/live/consumerForm'
import FieldError from './FieldError.vue'
import TagInput from '../shared/TagInput.vue'

const props = defineProps<{ modelValue: ConsumerForm; disabled?: boolean; fieldErrors?: Record<string, string> }>()
const emit = defineEmits<{ 'update:modelValue': [value: ConsumerForm] }>()

function set<K extends keyof ConsumerForm>(key: K, value: ConsumerForm[K]) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}
function text(event: Event): string {
  return (event.target as HTMLInputElement).value
}
</script>

<template>
  <fieldset :disabled="disabled" class="space-y-5 border-0 p-0">
    <section class="space-y-3">
      <h4 class="section-heading">Consumer</h4>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label>
          <span class="field-label">Username</span>
          <input
            type="text"
            class="input-field"
            data-testid="consumer-username"
            :value="modelValue.username"
            @input="set('username', text($event))"
          />
          <FieldError :message="fieldErrors?.username" />
        </label>
        <label>
          <span class="field-label">Custom ID</span>
          <input
            type="text"
            class="input-field font-mono"
            data-testid="consumer-custom-id"
            spellcheck="false"
            :value="modelValue.custom_id"
            @input="set('custom_id', text($event))"
          />
          <FieldError :message="fieldErrors?.custom_id" />
        </label>
      </div>
      <p class="field-help">A consumer needs a username, a custom ID, or both.</p>
    </section>

    <section class="space-y-3 border-t border-border pt-4">
      <h4 class="section-heading">Tags</h4>
      <TagInput :model-value="modelValue.tags" @update:model-value="(value) => set('tags', value)" />
    </section>
  </fieldset>
</template>
```

Create `src/views/live/LiveConsumersView.vue`:

```vue
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useConnectionStore } from '../../stores/connection'
import { useLiveEntities } from '../../composables/useLiveEntities'
import type { LiveEntity } from '../../composables/useLiveEntities'
import { fromEntity, newConsumerForm, toPayload, validateConsumer } from '../../lib/live/consumerForm'
import type { ConsumerForm as ConsumerFormModel } from '../../lib/live/consumerForm'
import LiveGate from '../../components/live/LiveGate.vue'
import LiveErrorBanner from '../../components/live/LiveErrorBanner.vue'
import ConsumerForm from '../../components/live/ConsumerForm.vue'
import SearchInput from '../../components/shared/SearchInput.vue'

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
} = useLiveEntities<LiveEntity>('consumers')

const search = ref('')
const tagText = ref('')
const selectedId = ref<string | null>(null)
const creating = ref(false)
const form = ref<ConsumerFormModel | null>(null)
const baseline = ref('')
const validationErrors = ref<string[]>([])
const busy = ref(false)

const dirty = computed(() => form.value !== null && JSON.stringify(form.value) !== baseline.value)
const canSave = computed(
  () => connection.canWrite && !busy.value && form.value !== null && (creating.value || dirty.value),
)

function label(consumer: LiveEntity): string {
  if (typeof consumer.username === 'string' && consumer.username) return consumer.username
  if (typeof consumer.custom_id === 'string' && consumer.custom_id) return consumer.custom_id
  return consumer.id.slice(0, 8)
}

const filtered = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return items.value
  return items.value.filter((consumer) => {
    const tags = Array.isArray(consumer.tags) ? (consumer.tags as string[]) : []
    const haystack = [consumer.username, consumer.custom_id, ...tags].filter(Boolean).join(' ').toLowerCase()
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

function setForm(next: ConsumerFormModel | null) {
  form.value = next
  baseline.value = next ? JSON.stringify(next) : ''
  validationErrors.value = []
}

function confirmDiscard(): boolean {
  return !dirty.value || window.confirm('Discard your unsaved changes?')
}

function select(consumer: LiveEntity) {
  if (!confirmDiscard()) return
  creating.value = false
  selectedId.value = consumer.id
  setForm(fromEntity(consumer))
}

function startCreate() {
  if (!confirmDiscard()) return
  creating.value = true
  selectedId.value = null
  setForm(newConsumerForm())
}

function discard() {
  if (!dirty.value || !window.confirm('Discard your unsaved changes?')) return
  form.value = JSON.parse(baseline.value) as ConsumerFormModel
  validationErrors.value = []
}

async function save() {
  if (!form.value) return
  const errors = validateConsumer(form.value)
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
  if (!selectedId.value || !window.confirm('Delete this consumer? Its credentials are deleted too.')) return
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

// Leaving the page would silently drop unsaved edits, so ask first (false cancels).
onBeforeRouteLeave(() => confirmDiscard())

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
              <SearchInput v-model="search" placeholder="Search loaded consumers…" />
            </div>
            <button
              type="button"
              class="btn-primary"
              data-testid="new-consumer"
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
            v-for="consumer in filtered"
            :key="consumer.id"
            data-testid="consumer-row"
            class="cursor-pointer rounded-lg border-l-2 py-1.5 pl-2 pr-2 text-sm transition-colors duration-150"
            :class="
              consumer.id === selectedId
                ? 'border-accent bg-accent/10 font-medium text-link'
                : 'border-transparent text-ink-muted hover:bg-elevated'
            "
            @click="select(consumer)"
          >
            <span class="block truncate font-mono" :title="label(consumer)">{{ label(consumer) }}</span>
          </li>
        </ul>
        <p v-if="loading" class="px-3 pb-2 text-xs text-ink-muted">Loading…</p>
        <p v-else-if="filtered.length === 0" class="px-3 pb-2 text-xs text-ink-muted">No consumers.</p>
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
          <ConsumerForm v-model="form" :disabled="!connection.canWrite" :field-errors="fieldErrors" />
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
          <p class="text-sm text-ink-muted">Select a consumer from the list, or create a new one.</p>
        </div>
      </div>
    </div>
  </LiveGate>
</template>
```

Then wire navigation. Run:

```bash
python3 - <<'E'
def edit(path, pairs):
    s = open(path).read()
    for a, b in pairs:
        assert a in s, (path, a)
        s = s.replace(a, b, 1)
    open(path, 'w').write(s)

edit('src/router/index.ts', [
    ("import LiveRoutesView from '../views/live/LiveRoutesView.vue'\n",
     "import LiveRoutesView from '../views/live/LiveRoutesView.vue'\nimport LiveConsumersView from '../views/live/LiveConsumersView.vue'\n"),
    ("    { path: '/live/routes', name: 'live-routes', component: LiveRoutesView },\n",
     "    { path: '/live/routes', name: 'live-routes', component: LiveRoutesView },\n    { path: '/live/consumers', name: 'live-consumers', component: LiveConsumersView },\n"),
])
edit('src/components/layout/AppShell.vue', [
    ("  if (route.path === '/live/routes') return 'Live routes'\n",
     "  if (route.path === '/live/routes') return 'Live routes'\n  if (route.path === '/live/consumers') return 'Live consumers'\n"),
])
edit('src/components/layout/AppSidebar.vue', [
    ("  { to: '/live/routes', label: 'Routes' },\n",
     "  { to: '/live/routes', label: 'Routes' },\n  { to: '/live/consumers', label: 'Consumers' },\n"),
])
E
```

- [ ] **Step 4: Run the tests and typecheck to verify they pass**

Run: `npx vitest run src/views/live src/components/layout && npx vue-tsc -b`
Expected: PASS; typecheck prints nothing.

- [ ] **Step 5: Run the whole suite and commit**

Run: `npx vitest run`
Expected: all tests PASS.

```bash
git add src/components/live/ConsumerForm.vue src/views/live/LiveConsumersView.vue src/views/live/LiveConsumersView.test.ts src/router/index.ts src/components/layout
git commit -m "feat: add live consumers view with create, edit and delete

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Credentials panel

**Files:**
- Create: `src/components/live/CredentialSection.vue`
- Create: `src/components/live/CredentialsPanel.vue`
- Modify: `src/views/live/LiveConsumersView.vue`
- Modify: `src/views/live/LiveConsumersView.test.ts`

**Interfaces:**
- Consumes: `useLiveEntities`, `LiveEntity`; `CREDENTIAL_TYPES`, `credentialType`, `newCredentialForm`, `toCredentialPayload`, `validateCredential`, `CredentialType`, `CredentialForm` (Task 3); `LiveErrorBanner`, `FieldError`; shared `SecretField`, `ToggleSwitch`, `ValueListEditor`.
- Produces: `CredentialsPanel.vue` with props `{ consumerId: string; disabled?: boolean }`; `CredentialSection.vue` with props `{ consumerId: string; type: CredentialType; disabled?: boolean }` and emit `loaded: [count: number]`; test ids `cred-tab-<typeId>`, `cred-row`, `cred-add`, `cred-delete`, `cred-reveal`, `cred-<fieldKey>` (wrapper around each add-form field).

- [ ] **Step 1: Write the failing tests**

In `src/views/live/LiveConsumersView.test.ts`, extend the fake Kong so credential paths return data. Replace the `fakeKong` function's GET-consumer branch and add credential handling. Run:

```bash
python3 - <<'E'
p = 'src/views/live/LiveConsumersView.test.ts'
s = open(p).read()

def rep(a, b):
    global s
    assert a in s, a
    s = s.replace(a, b, 1)

rep("""const CONSUMERS = [""", """const CREDENTIALS: Record<string, Record<string, unknown>[]> = {
  'key-auth': [{ id: 'k-1', key: 'secret-key-123', ttl: null }],
  jwt: [{ id: 'j-1', key: 'iss-1', algorithm: 'HS256', secret: 's3cr3t' }],
}

const CONSUMERS = [""")
rep("""      if (method === 'GET' && url.includes('/consumers/')) return reply({ data: [] })
""", """      const credential = /\\/consumers\\/([^/]+)\\/([^/]+)(?:\\/([^/]+))?$/.exec(url)
      if (credential && method === 'GET') return reply({ data: credential[1] === 'c-1' ? (CREDENTIALS[credential[2]] ?? []) : [] })
      if (credential && method === 'POST') return reply({ id: 'cred-new', ...body }, 201)
      if (credential && method === 'DELETE') return { ok: true, status: 204, text: async () => '' }
""")

idx = s.rstrip().rfind('})')
tests = """
describe('credentials panel', () => {
  const tab = (wrapper: Wrapper, id: string) => byId(wrapper, `cred-tab-${id}`)
  const credRows = (wrapper: Wrapper) => wrapper.findAll('[data-testid="cred-row"]')

  it('is absent while creating a consumer, and present for a saved one', async () => {
    connect()
    fakeKong()
    const wrapper = await mountView()

    await byId(wrapper, 'new-consumer').trigger('click')
    expect(tab(wrapper, 'key-auth').exists()).toBe(false)

    await rows(wrapper)[0].trigger('click')
    expect(tab(wrapper, 'key-auth').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid^="cred-tab-"]')).toHaveLength(6)
  })

  it('loads the key-auth credentials of the selected consumer and masks the key until revealed', async () => {
    connect()
    const calls = fakeKong()
    const wrapper = await mountView()

    await rows(wrapper)[0].trigger('click')
    await flushPromises()

    expect(calls.some((c) => c.method === 'GET' && c.url === 'http://kong:8001/consumers/c-1/key-auth')).toBe(true)
    expect(credRows(wrapper)).toHaveLength(1)
    expect(credRows(wrapper)[0].text()).not.toContain('secret-key-123')

    await byId(wrapper, 'cred-reveal').trigger('click')
    expect(credRows(wrapper)[0].text()).toContain('secret-key-123')
    await byId(wrapper, 'cred-reveal').trigger('click')
    expect(credRows(wrapper)[0].text()).not.toContain('secret-key-123')
  })

  it('shows the credential count on a tab once it has loaded, and loads another type when opened', async () => {
    connect()
    const calls = fakeKong()
    const wrapper = await mountView()

    await rows(wrapper)[0].trigger('click')
    await flushPromises()
    expect(tab(wrapper, 'key-auth').text()).toContain('1')

    await tab(wrapper, 'jwt').trigger('click')
    await flushPromises()

    expect(calls.some((c) => c.method === 'GET' && c.url === 'http://kong:8001/consumers/c-1/jwt')).toBe(true)
    expect(credRows(wrapper)[0].text()).toContain('iss-1')
    expect(credRows(wrapper)[0].text()).toContain('HS256')
    expect(credRows(wrapper)[0].text()).not.toContain('s3cr3t')
  })

  it('adds a key-auth credential with only the filled fields, leaving the key for Kong to generate', async () => {
    connect()
    const calls = fakeKong()
    const wrapper = await mountView()
    await rows(wrapper)[0].trigger('click')
    await flushPromises()

    await wrapper.find('[data-testid="cred-ttl"] input').setValue('3600')
    await byId(wrapper, 'cred-add').trigger('click')
    await flushPromises()

    const post = calls.find((c) => c.method === 'POST' && c.url === 'http://kong:8001/consumers/c-1/key-auth')!
    expect(post.body).toEqual({ ttl: 3600 })
    expect(credRows(wrapper)).toHaveLength(2)
    expect((wrapper.find('[data-testid="cred-ttl"] input').element as HTMLInputElement).value).toBe('')
  })

  it('blocks adding a basic-auth credential without a username and password, one message per field', async () => {
    connect()
    const calls = fakeKong()
    const wrapper = await mountView()
    await rows(wrapper)[0].trigger('click')
    await flushPromises()

    await tab(wrapper, 'basic-auth').trigger('click')
    await flushPromises()
    await byId(wrapper, 'cred-add').trigger('click')
    await flushPromises()

    const alert = wrapper.findAll('[role="alert"]').map((a) => a.text()).join(' ')
    expect(alert).toContain('Username is required.')
    expect(alert).toContain('Password is required.')
    expect(calls.some((c) => c.method === 'POST' && c.url.includes('/basic-auth'))).toBe(false)
  })

  it('sends a password exactly as typed, including surrounding spaces', async () => {
    connect()
    const calls = fakeKong()
    const wrapper = await mountView()
    await rows(wrapper)[0].trigger('click')
    await flushPromises()

    await tab(wrapper, 'basic-auth').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="cred-username"] input').setValue(' alice ')
    await wrapper.find('[data-testid="cred-password"] input').setValue(' pass word ')
    await byId(wrapper, 'cred-add').trigger('click')
    await flushPromises()

    expect(calls.find((c) => c.method === 'POST' && c.url.endsWith('/basic-auth'))?.body).toEqual({
      username: 'alice',
      password: ' pass word ',
    })
  })

  it('deletes a credential after confirmation with an encoded path, and not when cancelled', async () => {
    connect()
    const calls = fakeKong()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const wrapper = await mountView()
    await rows(wrapper)[0].trigger('click')
    await flushPromises()

    await byId(wrapper, 'cred-delete').trigger('click')
    expect(confirm).toHaveBeenCalledWith('Delete this credential?')
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)

    confirm.mockReturnValue(true)
    await byId(wrapper, 'cred-delete').trigger('click')
    await flushPromises()
    expect(calls.find((c) => c.method === 'DELETE')?.url).toBe('http://kong:8001/consumers/c-1/key-auth/k-1')
    expect(credRows(wrapper)).toHaveLength(0)
  })

  it('on DB-less Kong disables adding and deleting credentials', async () => {
    connect('off')
    fakeKong()
    const wrapper = await mountView()
    await rows(wrapper)[0].trigger('click')
    await flushPromises()

    expect(byId(wrapper, 'cred-add').attributes('disabled')).toBeDefined()
    expect(byId(wrapper, 'cred-delete').attributes('disabled')).toBeDefined()
  })

  it('switching consumer clears the rows and loads the new consumer\\'s credentials', async () => {
    connect()
    const calls = fakeKong()
    const wrapper = await mountView()

    await rows(wrapper)[0].trigger('click')
    await flushPromises()
    expect(credRows(wrapper)).toHaveLength(1)

    await rows(wrapper)[1].trigger('click')
    await flushPromises()

    expect(calls.some((c) => c.method === 'GET' && c.url === 'http://kong:8001/consumers/c-2/key-auth')).toBe(true)
    expect(credRows(wrapper)).toHaveLength(0)
  })
})
"""
s = s[:idx].rstrip('\n') + '\n' + tests + s[idx:]
open(p, 'w').write(s)
E
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/views/live/LiveConsumersView.test.ts`
Expected: FAIL (every test in `credentials panel`; the earlier consumer tests still pass).

- [ ] **Step 3: Write the implementation**

Create `src/components/live/CredentialSection.vue`:

```vue
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useLiveEntities } from '../../composables/useLiveEntities'
import type { LiveEntity } from '../../composables/useLiveEntities'
import { newCredentialForm, toCredentialPayload, validateCredential } from '../../lib/live/credentials'
import type { CredentialForm, CredentialType } from '../../lib/live/credentials'
import FieldError from './FieldError.vue'
import LiveErrorBanner from './LiveErrorBanner.vue'
import SecretField from '../shared/SecretField.vue'
import ToggleSwitch from '../shared/ToggleSwitch.vue'
import ValueListEditor from '../shared/ValueListEditor.vue'

const props = defineProps<{ consumerId: string; type: CredentialType; disabled?: boolean }>()
const emit = defineEmits<{ loaded: [count: number] }>()

const { items, loading, error, load, create, remove } = useLiveEntities<LiveEntity>(props.type.resource, {
  parentId: () => props.consumerId,
})

const form = ref<CredentialForm>(newCredentialForm(props.type))
const validationErrors = ref<string[]>([])
const busy = ref(false)
const revealed = ref<Set<string>>(new Set())

const secretKeys = computed(() => new Set(props.type.fields.filter((f) => f.kind === 'secret').map((f) => f.key)))
const hasSecretSummary = computed(() => props.type.summaryKeys.some((key) => secretKeys.value.has(key)))
const fieldErrors = computed(() =>
  Object.fromEntries(
    Object.entries(error.value?.fields ?? {}).map(([field, problem]) => [
      field,
      typeof problem === 'string' ? problem : JSON.stringify(problem),
    ]),
  ),
)

function summary(item: LiveEntity, key: string): string {
  const value = item[key]
  if (value === null || value === undefined || value === '') return '-'
  if (secretKeys.value.has(key) && !revealed.value.has(item.id)) return '••••••••'
  return String(value)
}

function toggleReveal(id: string) {
  const next = new Set(revealed.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  revealed.value = next
}

function setField(key: string, value: string | number | boolean | string[]) {
  form.value = { ...form.value, [key]: value }
}
function inputText(event: Event): string {
  return (event.target as HTMLInputElement).value
}
function inputNumber(event: Event): number | '' {
  const value = inputText(event)
  return value === '' ? '' : Number(value)
}
const textOf = (key: string): string => String(form.value[key] ?? '')
const listOf = (key: string): string[] => (Array.isArray(form.value[key]) ? (form.value[key] as string[]) : [])

async function add() {
  const errors = validateCredential(props.type, form.value)
  validationErrors.value = errors
  if (errors.length > 0) return
  busy.value = true
  try {
    await create(toCredentialPayload(props.type, form.value))
    form.value = newCredentialForm(props.type)
  } catch {
    // Shown in the banner; the form keeps what was typed.
  } finally {
    busy.value = false
  }
}

async function removeCredential(id: string) {
  if (!window.confirm('Delete this credential?')) return
  try {
    await remove(id)
  } catch {
    // Shown in the banner.
  }
}

watch(items, (list) => emit('loaded', list.length))
onMounted(() => void load())
</script>

<template>
  <div class="space-y-4">
    <LiveErrorBanner :messages="validationErrors" :error="error" />

    <ul v-if="items.length > 0" class="space-y-1.5">
      <li
        v-for="item in items"
        :key="item.id"
        data-testid="cred-row"
        class="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm"
      >
        <div class="min-w-0 flex-1 space-y-0.5">
          <p v-for="key in type.summaryKeys" :key="key" class="truncate font-mono text-xs text-ink">
            <span class="text-ink-muted">{{ key }}:</span> {{ summary(item, key) }}
          </p>
        </div>
        <button
          v-if="hasSecretSummary"
          type="button"
          data-testid="cred-reveal"
          class="shrink-0 text-xs font-medium text-link underline hover:text-accent-hover"
          :aria-label="revealed.has(item.id) ? 'Hide credential' : 'Reveal credential'"
          @click="toggleReveal(item.id)"
        >
          {{ revealed.has(item.id) ? 'Hide' : 'Reveal' }}
        </button>
        <button
          type="button"
          data-testid="cred-delete"
          class="btn-danger-ghost shrink-0 !px-2 !py-1 text-xs"
          :disabled="disabled"
          @click="removeCredential(item.id)"
        >
          Delete
        </button>
      </li>
    </ul>
    <p v-else-if="loading" class="text-xs text-ink-muted">Loading…</p>
    <p v-else class="text-xs text-ink-muted">No {{ type.label }} credentials yet.</p>

    <fieldset :disabled="disabled" class="space-y-3 border-t border-border pt-4">
      <h4 class="section-heading">Add {{ type.label }} credential</h4>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div v-for="field in type.fields" :key="field.key" :data-testid="`cred-${field.key}`">
          <ToggleSwitch
            v-if="field.kind === 'boolean'"
            :label="field.label"
            :model-value="form[field.key] === true"
            @update:model-value="(value) => setField(field.key, value)"
          />
          <label v-else class="block">
            <span class="field-label">{{ field.label }}<span v-if="field.required"> *</span></span>
            <input
              v-if="field.kind === 'text'"
              type="text"
              class="input-field"
              :value="textOf(field.key)"
              @input="setField(field.key, inputText($event))"
            />
            <SecretField
              v-else-if="field.kind === 'secret'"
              :model-value="textOf(field.key)"
              placeholder="Leave blank to let Kong generate"
              @update:model-value="(value) => setField(field.key, value)"
            />
            <input
              v-else-if="field.kind === 'number'"
              type="number"
              class="input-field"
              :value="form[field.key] as number | string"
              @input="setField(field.key, inputNumber($event))"
            />
            <select
              v-else-if="field.kind === 'select'"
              class="input-field"
              :value="textOf(field.key)"
              @change="setField(field.key, inputText($event))"
            >
              <option v-if="field.default === undefined" value="">(default)</option>
              <option v-for="option in field.options" :key="option" :value="option">{{ option }}</option>
            </select>
            <textarea
              v-else-if="field.kind === 'textarea'"
              rows="4"
              class="input-field font-mono text-xs"
              spellcheck="false"
              :value="textOf(field.key)"
              @input="setField(field.key, inputText($event))"
            />
            <ValueListEditor
              v-else-if="field.kind === 'list'"
              :add-label="`Add ${field.label.toLowerCase()}`"
              :placeholder="field.label.toLowerCase()"
              :model-value="listOf(field.key)"
              @update:model-value="(value) => setField(field.key, value)"
            />
            <FieldError :message="fieldErrors[field.key]" />
          </label>
        </div>
      </div>
      <div class="flex justify-end">
        <button
          type="button"
          class="btn-primary"
          data-testid="cred-add"
          :disabled="disabled || busy"
          @click="add"
        >
          Add credential
        </button>
      </div>
    </fieldset>
  </div>
</template>
```

Create `src/components/live/CredentialsPanel.vue`:

```vue
<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { CREDENTIAL_TYPES, credentialType } from '../../lib/live/credentials'
import type { CredentialTypeId } from '../../lib/live/credentials'
import CredentialSection from './CredentialSection.vue'

defineProps<{ consumerId: string; disabled?: boolean }>()

const active = ref<CredentialTypeId>(CREDENTIAL_TYPES[0].id)
const counts = reactive<Partial<Record<CredentialTypeId, number>>>({})
const activeType = computed(() => credentialType(active.value))
</script>

<template>
  <section class="space-y-3 border-t border-border pt-5">
    <h4 class="section-heading">Credentials</h4>
    <div class="flex flex-wrap gap-1.5" role="tablist">
      <button
        v-for="type in CREDENTIAL_TYPES"
        :key="type.id"
        type="button"
        role="tab"
        :aria-selected="active === type.id"
        :data-testid="`cred-tab-${type.id}`"
        class="pill-tab inline-flex items-center gap-1.5"
        :class="active === type.id ? 'pill-tab-active' : 'pill-tab-inactive'"
        @click="active = type.id"
      >
        {{ type.label }}
        <span
          v-if="counts[type.id] !== undefined"
          class="rounded-full bg-elevated px-1.5 text-[10px] font-semibold tabular-nums text-ink-muted"
        >
          {{ counts[type.id] }}
        </span>
      </button>
    </div>
    <CredentialSection
      :key="`${consumerId}-${active}`"
      :consumer-id="consumerId"
      :type="activeType"
      :disabled="disabled"
      @loaded="(count) => (counts[active] = count)"
    />
  </section>
</template>
```

In `src/views/live/LiveConsumersView.vue`, mount the panel for a saved consumer. Run:

```bash
python3 - <<'E'
p = 'src/views/live/LiveConsumersView.vue'
s = open(p).read()

def rep(a, b):
    global s
    assert a in s, a
    s = s.replace(a, b, 1)

rep("import ConsumerForm from '../../components/live/ConsumerForm.vue'\n",
    "import ConsumerForm from '../../components/live/ConsumerForm.vue'\nimport CredentialsPanel from '../../components/live/CredentialsPanel.vue'\n")
rep("""          </div>
        </div>
        <div v-else class="flex h-full min-h-[16rem] items-center justify-center text-center">
          <p class="text-sm text-ink-muted">Select a consumer from the list, or create a new one.</p>""",
"""          </div>
          <CredentialsPanel
            v-if="!creating && selectedId"
            :key="selectedId"
            :consumer-id="selectedId"
            :disabled="!connection.canWrite"
          />
        </div>
        <div v-else class="flex h-full min-h-[16rem] items-center justify-center text-center">
          <p class="text-sm text-ink-muted">Select a consumer from the list, or create a new one.</p>""")
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
git add src/components/live/CredentialSection.vue src/components/live/CredentialsPanel.vue src/views/live/LiveConsumersView.vue src/views/live/LiveConsumersView.test.ts
git commit -m "feat: add the credentials panel for key-auth, basic-auth, oauth2, hmac-auth, jwt and acls

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-review notes

- **Spec coverage:** navigation (spec 1) is Task 4; registry resources (spec 2) Task 1; consumer form (spec 3) Task 2; credential descriptors (spec 4) Task 3; views and components (spec 5) Tasks 4 and 5; testing (spec 6) inline in every task. Error-handling table: no connection, DB-less, consumer validation, credential required fields and Kong field errors all have tests.
- **Type consistency:** `CredentialType`, `CredentialForm`, `CredentialTypeId`, `newCredentialForm`, `validateCredential`, `toCredentialPayload` and all test ids match across the tasks that define and consume them. Resource names match between the registry (Task 1) and the descriptors (Task 3).
- **Deliberate changes to existing tests:** the registry collection list (Task 1, now sixteen) and the sidebar connected-links test (Task 4, Consumers added).
- **Known limits, not gaps:** credentials are create-and-delete only (as in Primate); plugins on consumers arrive in 2c-2; no browser check is possible in this session.
