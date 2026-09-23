# Kong Config Viewer/Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Kong declarative-config viewer/editor described in the design spec: a client-only Vue 3 SPA that loads a Kong YAML file, lets you browse and edit services/routes/consumers/global plugins, diffs two files, and exports edited YAML.

**Architecture:** Vue 3 (`<script setup>`, TypeScript) + Vite + Tailwind CSS + Pinia + Vue Router, no backend. A small set of framework-free `src/lib/*.ts` modules (YAML wrapping, diffing, secret-field detection, value-type inference) carry all the logic that needs unit tests; Vue components are thin rendering/editing layers over a single Pinia store that holds the parsed YAML object as the mutable source of truth.

**Tech Stack:** Vue 3, Vite, TypeScript, Tailwind CSS 3, Pinia 2, Vue Router 4, js-yaml 4, Vitest 2.

**Spec:** `docs/superpowers/specs/2026-09-23-kong-config-viewer-design.md`

## Global Constraints

- No backend, no server writes — the app is a static Vite build, everything happens in the browser.
- No YAML comment/anchor/alias preservation on export — known `js-yaml` limitation, already accepted in the spec.
- Round-trip fidelity: the parsed `js-yaml.load` object is the single source of truth, mutated in place. Never reconstruct entities from scratch when rendering — always bind forms directly to the loaded object's fields so unmodeled keys survive.
- `js-yaml.dump(obj, { sortKeys: false })` on export, so JS key insertion order (preserved by `js-yaml.load`) is what comes back out.
- Entity identity for matching: `name` for services, routes, and scoped plugins; `username` for consumers. Missing the natural key → that entity goes to an "unmatched" bucket, never guessed by position.
- Secret-field heuristic: case-insensitive substring match on `password`, `key`, `secret`, `token` in the field's own key, OR being an entry under a `*_credentials` list. Applied identically in Browse and Compare.
- Styling: Tailwind utility classes only, neutral slate palette, no external component kit. Keep it dense and functional — this is an internal ops tool, not a marketing page.
- `fixtures/sample-a.yaml` and `fixtures/sample-b.yaml` already exist at the repo root (synthetic, no real secrets) — use them for manual smoke-testing Load/Browse/Compare during development. The real `kong-config.yaml` (gitignored, contains live secrets) is reserved for the final full-flow pass in Task 15.

## Review Focus

- Editing a `null`-valued plugin-config field to an empty string, then exporting, must serialize back as `null`, not `""` — spec's "null → text input that treats empty as null" rule. Covered by Task 9's `DynamicKeyValueEditor` null round-trip check.
- An entity (service/route/consumer) missing its natural key must land in an "unmatched" bucket in Compare and never silently pair with an unrelated entity by position. Covered by Task 5's diff-engine unmatched-key tests.
- Loading syntactically valid YAML that isn't Kong-shaped (no `services`/`consumers`/`plugins`) must show empty-state tabs in Browse, not crash or show a blank screen. Covered by Task 8/11 manual checks and a Task 4 parse test.
- Secret fields (`keyauth_credentials[].key`, `basicauth_credentials[].password`, plugin config secrets) must render masked by default in *both* Browse and Compare, not just Browse. Covered explicitly in Task 12 (Browse) and Task 14 (Compare) manual checks.
- Export must re-emit top-level keys the UI never renders (e.g. `upstreams`) untouched, proving round-trip fidelity isn't just a services/consumers/plugins special case. Covered by Task 4's round-trip test using a fixture with an extra top-level key, and Task 15's real-file export check.

---

## File Structure

```
index.html
vite.config.ts
tailwind.config.ts
postcss.config.js
tsconfig.json
tsconfig.node.json
package.json
fixtures/
  sample-a.yaml            # already created
  sample-b.yaml            # already created
src/
  main.ts
  App.vue
  style.css
  types/
    kong.ts
  router/
    index.ts
  stores/
    config.ts
    config.test.ts
  lib/
    yaml.ts
    yaml.test.ts
    diff.ts
    diff.test.ts
    secretFields.ts
    secretFields.test.ts
    valueType.ts
    valueType.test.ts
  components/
    FileDropZone.vue
    layout/
      AppShell.vue
      Sidebar.vue
    browse/
      ServiceList.vue
      ServiceDetail.vue
      RouteCard.vue
      ConsumerList.vue
      ConsumerDetail.vue
      CredentialEditor.vue
    shared/
      PluginEditor.vue
      DynamicKeyValueEditor.vue
      SecretField.vue
      TagInput.vue
      Badge.vue
    compare/
      DiffSummary.vue
      DiffEntityList.vue
      DiffField.vue
    ExportModal.vue
  views/
    LoadView.vue
    BrowseView.vue
    CompareView.vue
```

---

### Task 1: Project scaffold & build tooling

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `tailwind.config.ts`
- Create: `postcss.config.js`
- Create: `index.html`
- Create: `src/main.ts`
- Create: `src/App.vue`
- Create: `src/style.css`
- Create: `src/vite-env.d.ts`

**Interfaces:**
- Produces: a working `npm run dev` / `npm run build` / `npm run test` toolchain that every later task builds on. No app-level exports yet.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "kong-config-viewer",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "js-yaml": "^4.1.0",
    "pinia": "^2.2.6",
    "vue": "^3.5.12",
    "vue-router": "^4.4.5"
  },
  "devDependencies": {
    "@types/js-yaml": "^4.0.9",
    "@types/node": "^22.7.5",
    "@vitejs/plugin-vue": "^5.1.4",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.13",
    "typescript": "^5.6.3",
    "vite": "^5.4.9",
    "vitest": "^2.1.3",
    "vue-tsc": "^2.1.6"
  }
}
```

- [ ] **Step 2: Write `vite.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
```

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "preserve",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src/**/*.ts", "src/**/*.vue"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 4: Write `tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 5: Write `tailwind.config.ts`**

```ts
import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config
```

- [ ] **Step 6: Write `postcss.config.js`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 7: Write `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Kong Config Viewer</title>
  </head>
  <body class="bg-slate-50 text-slate-900">
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 8: Write `src/style.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 9: Write `src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 10: Write `src/App.vue`**

```vue
<script setup lang="ts"></script>

<template>
  <div class="min-h-screen">Kong Config Viewer scaffold OK</div>
</template>
```

- [ ] **Step 11: Write `src/main.ts`**

```ts
import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

createApp(App).mount('#app')
```

- [ ] **Step 12: Install and verify the build**

Run: `npm install`
Run: `npm run build`
Expected: build succeeds, `dist/index.html` exists and references a built JS bundle.

- [ ] **Step 13: Verify the dev server boots**

Run: `npm run dev -- --port 5183 &` then `curl -s http://localhost:5183/ | grep -o '<title>[^<]*</title>'`, then kill the background dev server.
Expected: prints `<title>Kong Config Viewer</title>`.

- [ ] **Step 14: Commit**

```bash
git add package.json vite.config.ts tsconfig.json tsconfig.node.json tailwind.config.ts postcss.config.js index.html src/main.ts src/App.vue src/style.css src/vite-env.d.ts package-lock.json fixtures/
git commit -m "chore: scaffold Vite/Vue/TS/Tailwind project"
```

---

### Task 2: Kong types + value-type inference

**Files:**
- Create: `src/types/kong.ts`
- Create: `src/lib/valueType.ts`
- Test: `src/lib/valueType.test.ts`

**Interfaces:**
- Produces: `KongConfig`, `KongService`, `KongRoute`, `KongConsumer`, `KongPlugin` types (used by every later task); `inferValueType(key, value): ValueType` and `isMultilineString(key, value): boolean` (used by Task 9's `DynamicKeyValueEditor`).

- [ ] **Step 1: Write `src/types/kong.ts`**

```ts
export type KongPlugin = {
  name: string
  enabled?: boolean
  protocols?: string[]
  config?: Record<string, unknown>
  tags?: string[]
  [key: string]: unknown
}

export type KongRoute = {
  name?: string
  hosts?: string[]
  paths?: string[]
  methods?: string[]
  protocols?: string[]
  strip_path?: boolean
  preserve_host?: boolean
  path_handling?: string
  https_redirect_status_code?: number
  regex_priority?: number
  request_buffering?: boolean
  response_buffering?: boolean
  tags?: string[]
  plugins?: KongPlugin[]
  [key: string]: unknown
}

export type KongService = {
  name?: string
  host: string
  port?: number
  protocol?: string
  path?: string
  connect_timeout?: number
  read_timeout?: number
  write_timeout?: number
  retries?: number
  enabled?: boolean
  tags?: string[]
  routes?: KongRoute[]
  [key: string]: unknown
}

export type KongConsumer = {
  username?: string
  custom_id?: string
  tags?: string[]
  [key: string]: unknown
}

export type KongConfig = {
  _format_version: string
  consumers?: KongConsumer[]
  plugins?: KongPlugin[]
  services?: KongService[]
  [key: string]: unknown
}

export const KONG_PROTOCOLS = ['http', 'https', 'grpc', 'grpcs', 'tcp', 'tls', 'udp'] as const
```

- [ ] **Step 2: Write the failing tests for value-type inference**

```ts
// src/lib/valueType.test.ts
import { describe, it, expect } from 'vitest'
import { inferValueType, isMultilineString } from './valueType'

describe('inferValueType', () => {
  it('classifies primitives', () => {
    expect(inferValueType('minute', 100)).toBe('number')
    expect(inferValueType('enabled', true)).toBe('boolean')
    expect(inferValueType('reopen', null)).toBe('null')
    expect(inferValueType('path', '/dev/stdout')).toBe('string')
  })

  it('classifies a Lua-looking or multi-line string as multiline-string', () => {
    expect(inferValueType('note', 'line one\nline two')).toBe('multiline-string')
    expect(inferValueType('rewrite', 'local ctx = kong.ctx.plugin')).toBe('multiline-string')
  })

  it('classifies arrays by element shape', () => {
    expect(inferValueType('key_names', ['apikey'])).toBe('string-array')
    expect(inferValueType('access', [])).toBe('string-array')
    expect(inferValueType('rows', [{ a: 1 }])).toBe('object-array')
  })

  it('classifies plain objects', () => {
    expect(inferValueType('nested', { a: 1 })).toBe('object')
  })
})

describe('isMultilineString', () => {
  it('flags newline-containing strings regardless of key', () => {
    expect(isMultilineString('anything', 'a\nb')).toBe(true)
  })

  it('flags known script-ish keys even without a newline', () => {
    expect(isMultilineString('header_filter', 'return foo')).toBe(true)
    expect(isMultilineString('access', 'kong.ctx.plugin.x = 1')).toBe(true)
  })

  it('leaves plain short strings alone', () => {
    expect(isMultilineString('path', '/dev/stdout')).toBe(false)
    expect(isMultilineString('policy', 'local')).toBe(false)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/lib/valueType.test.ts`
Expected: FAIL — `./valueType` has no exported member.

- [ ] **Step 4: Write `src/lib/valueType.ts`**

```ts
export type ValueType =
  | 'string'
  | 'multiline-string'
  | 'number'
  | 'boolean'
  | 'null'
  | 'string-array'
  | 'object-array'
  | 'object'

const SCRIPTY_KEY_PATTERN = /^(access|header_filter|body_filter|rewrite|log)$/i
const LUA_LOOKING_PATTERN = /\b(local|function|ngx\.|kong\.)\b/

export function isMultilineString(key: string, value: string): boolean {
  if (value.includes('\n')) return true
  if (SCRIPTY_KEY_PATTERN.test(key)) return true
  return LUA_LOOKING_PATTERN.test(value)
}

export function inferValueType(key: string, value: unknown): ValueType {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'string') {
    return isMultilineString(key, value) ? 'multiline-string' : 'string'
  }
  if (Array.isArray(value)) {
    const firstObject = value.find((item) => typeof item === 'object' && item !== null)
    return firstObject !== undefined ? 'object-array' : 'string-array'
  }
  if (typeof value === 'object') return 'object'
  return 'string'
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/valueType.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 6: Commit**

```bash
git add src/types/kong.ts src/lib/valueType.ts src/lib/valueType.test.ts
git commit -m "feat: add Kong types and plugin-config value-type inference"
```

---

### Task 3: Secret-field detection

**Files:**
- Create: `src/lib/secretFields.ts`
- Test: `src/lib/secretFields.test.ts`

**Interfaces:**
- Produces: `isSecretField(key: string): boolean`, `isCredentialListKey(key: string): boolean` — used by `SecretField.vue` (Task 9), `CredentialEditor.vue` (Task 12), and `DiffField.vue` (Task 14).

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/secretFields.test.ts
import { describe, it, expect } from 'vitest'
import { isSecretField, isCredentialListKey } from './secretFields'

describe('isSecretField', () => {
  it('matches password/key/secret/token substrings, case-insensitively', () => {
    expect(isSecretField('password')).toBe(true)
    expect(isSecretField('key')).toBe(true)
    expect(isSecretField('api_key')).toBe(true)
    expect(isSecretField('Client_Secret')).toBe(true)
    expect(isSecretField('access_token')).toBe(true)
  })

  it('does not match unrelated field names', () => {
    expect(isSecretField('username')).toBe(false)
    expect(isSecretField('host')).toBe(false)
    expect(isSecretField('protocols')).toBe(false)
    expect(isSecretField('enabled')).toBe(false)
  })
})

describe('isCredentialListKey', () => {
  it('matches Kong credential list keys', () => {
    expect(isCredentialListKey('keyauth_credentials')).toBe(true)
    expect(isCredentialListKey('basicauth_credentials')).toBe(true)
  })

  it('does not match plain list keys', () => {
    expect(isCredentialListKey('routes')).toBe(false)
    expect(isCredentialListKey('tags')).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/secretFields.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/lib/secretFields.ts`**

```ts
const SECRET_KEY_PATTERN = /(password|secret|token|key)/i
const CREDENTIAL_LIST_PATTERN = /_credentials$/i

export function isSecretField(key: string): boolean {
  return SECRET_KEY_PATTERN.test(key)
}

export function isCredentialListKey(key: string): boolean {
  return CREDENTIAL_LIST_PATTERN.test(key)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/secretFields.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/secretFields.ts src/lib/secretFields.test.ts
git commit -m "feat: add secret-field detection heuristics"
```

---

### Task 4: YAML parse/serialize wrappers

**Files:**
- Create: `src/lib/yaml.ts`
- Test: `src/lib/yaml.test.ts`

**Interfaces:**
- Consumes: `KongConfig` from `src/types/kong.ts` (Task 2).
- Produces: `parseKongConfig(text: string): KongConfig`, `serializeKongConfig(config: KongConfig): string`, `YamlParseError` — used by `stores/config.ts` (Task 6).

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/yaml.test.ts
import { describe, it, expect } from 'vitest'
import { parseKongConfig, serializeKongConfig, YamlParseError } from './yaml'

const SAMPLE = `_format_version: "3.0"
services:
- name: svc-a
  host: a.internal
  port: 8080
  routes:
  - name: route-a
    paths:
    - /a
upstreams:
- name: unmodeled-upstream
  algorithm: round-robin
`

describe('parseKongConfig', () => {
  it('parses a valid Kong config', () => {
    const config = parseKongConfig(SAMPLE)
    expect(config._format_version).toBe('3.0')
    expect(config.services?.[0].name).toBe('svc-a')
  })

  it('throws YamlParseError on malformed YAML', () => {
    expect(() => parseKongConfig('services: [unclosed')).toThrow(YamlParseError)
  })

  it('throws YamlParseError when the document is not an object', () => {
    expect(() => parseKongConfig('- just\n- a\n- list\n')).toThrow(YamlParseError)
  })
})

describe('round-trip fidelity', () => {
  it('preserves key order and unmodeled top-level keys through load -> dump', () => {
    const config = parseKongConfig(SAMPLE)
    const dumped = serializeKongConfig(config)
    const reparsed = parseKongConfig(dumped)

    expect(reparsed).toEqual(config)
    expect(dumped.indexOf('_format_version')).toBeLessThan(dumped.indexOf('services'))
    expect(dumped.indexOf('services')).toBeLessThan(dumped.indexOf('upstreams'))
    expect(reparsed.upstreams).toEqual(config.upstreams)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/yaml.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/lib/yaml.ts`**

```ts
import yaml from 'js-yaml'
import type { KongConfig } from '../types/kong'

export class YamlParseError extends Error {}

export function parseKongConfig(text: string): KongConfig {
  let parsed: unknown
  try {
    parsed = yaml.load(text)
  } catch (err) {
    throw new YamlParseError(err instanceof Error ? err.message : String(err))
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new YamlParseError('YAML document did not parse to a Kong config object')
  }
  return parsed as KongConfig
}

export function serializeKongConfig(config: KongConfig): string {
  return yaml.dump(config, { sortKeys: false })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/yaml.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/yaml.ts src/lib/yaml.test.ts
git commit -m "feat: add Kong YAML parse/serialize wrappers with round-trip test"
```

---

### Task 5: Diff engine

**Files:**
- Create: `src/lib/diff.ts`
- Test: `src/lib/diff.test.ts`

**Interfaces:**
- Consumes: `KongConfig`, `KongService`, `KongRoute`, `KongConsumer`, `KongPlugin` (Task 2).
- Produces: `diffLeaves(a, b, path?): DiffChange[]`, `diffEntities<T>(listA, listB, naturalKeyField): EntityDiff<T>`, `diffKongConfigs(a: KongConfig, b: KongConfig): KongConfigDiff` — used by `CompareView.vue` and `compare/*.vue` (Task 14).

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/diff.test.ts
import { describe, it, expect } from 'vitest'
import { diffLeaves, diffEntities, diffKongConfigs } from './diff'
import type { KongConfig, KongService } from '../types/kong'

describe('diffLeaves', () => {
  it('returns no changes for deeply equal values', () => {
    expect(diffLeaves({ a: 1, b: [1, 2] }, { a: 1, b: [1, 2] })).toEqual([])
  })

  it('reports changed leaf fields with dotted/bracketed paths', () => {
    const before = { config: { minute: 100, nested: { x: 1 } } }
    const after = { config: { minute: 200, nested: { x: 2 } } }
    const changes = diffLeaves(before, after)
    expect(changes).toEqual(
      expect.arrayContaining([
        { path: 'config.minute', before: 100, after: 200 },
        { path: 'config.nested.x', before: 1, after: 2 },
      ]),
    )
  })

  it('treats different-length arrays as a single leaf change', () => {
    const changes = diffLeaves({ tags: ['a'] }, { tags: ['a', 'b'] })
    expect(changes).toEqual([{ path: 'tags', before: ['a'], after: ['a', 'b'] }])
  })
})

describe('diffEntities', () => {
  it('finds added, removed, and changed entities by natural key', () => {
    const a = [
      { name: 'svc-a', host: 'a.internal' },
      { name: 'svc-b', host: 'b.internal' },
    ]
    const b = [
      { name: 'svc-a', host: 'a.internal.new' },
      { name: 'svc-c', host: 'c.internal' },
    ]
    const result = diffEntities(a, b, 'name')

    expect(result.added).toEqual([{ name: 'svc-c', host: 'c.internal' }])
    expect(result.removed).toEqual([{ name: 'svc-b', host: 'b.internal' }])
    expect(result.changed).toHaveLength(1)
    expect(result.changed[0].key).toBe('svc-a')
    expect(result.changed[0].changes).toEqual([
      { path: 'host', before: 'a.internal', after: 'a.internal.new' },
    ])
  })

  it('buckets entities with no usable natural key as unmatched instead of pairing them', () => {
    const a = [{ host: 'no-name-a' }]
    const b = [{ host: 'no-name-b' }]
    const result = diffEntities(a, b, 'name')

    expect(result.added).toEqual([])
    expect(result.removed).toEqual([])
    expect(result.changed).toEqual([])
    expect(result.unmatchedA).toEqual([{ host: 'no-name-a' }])
    expect(result.unmatchedB).toEqual([{ host: 'no-name-b' }])
  })

  it('handles undefined lists as empty', () => {
    const result = diffEntities(undefined, [{ name: 'only-in-b' }], 'name')
    expect(result.added).toEqual([{ name: 'only-in-b' }])
  })
})

describe('diffKongConfigs', () => {
  it('diffs services, consumers, global plugins, and per-service routes', () => {
    const a: KongConfig = {
      _format_version: '3.0',
      services: [
        {
          name: 'svc-a',
          host: 'a.internal',
          routes: [{ name: 'route-a', paths: ['/a'] }],
        } as KongService,
      ],
      consumers: [{ username: 'alice' }],
      plugins: [{ name: 'rate-limiting', config: { minute: 100 } }],
    }
    const b: KongConfig = {
      _format_version: '3.0',
      services: [
        {
          name: 'svc-a',
          host: 'a.internal',
          routes: [{ name: 'route-a', paths: ['/a', '/a2'] }],
        } as KongService,
      ],
      consumers: [{ username: 'alice' }, { username: 'bob' }],
      plugins: [{ name: 'rate-limiting', config: { minute: 200 } }],
    }

    const diff = diffKongConfigs(a, b)

    expect(diff.services.changed).toHaveLength(0)
    expect(diff.consumers.added).toEqual([{ username: 'bob' }])
    expect(diff.globalPlugins.changed[0].changes).toEqual([
      { path: 'config.minute', before: 100, after: 200 },
    ])
    expect(diff.routesByService.get('svc-a')?.changed[0].changes).toEqual([
      { path: 'paths', before: ['/a'], after: ['/a', '/a2'] },
    ])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/diff.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/lib/diff.ts`**

```ts
import type { KongConfig, KongPlugin, KongRoute, KongService, KongConsumer } from '../types/kong'

export type DiffChange = { path: string; before: unknown; after: unknown }

export type EntityDiff<T> = {
  added: T[]
  removed: T[]
  changed: { key: string; before: T; after: T; changes: DiffChange[] }[]
  unmatchedA: T[]
  unmatchedB: T[]
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((v, i) => deepEqual(v, b[i]))
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a)
    const keysB = Object.keys(b)
    if (keysA.length !== keysB.length) return false
    return keysA.every((k) => keysB.includes(k) && deepEqual(a[k], b[k]))
  }
  return false
}

export function diffLeaves(a: unknown, b: unknown, path = ''): DiffChange[] {
  if (deepEqual(a, b)) return []

  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    const changes: DiffChange[] = []
    for (const key of keys) {
      changes.push(...diffLeaves(a[key], b[key], path ? `${path}.${key}` : key))
    }
    return changes
  }

  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    const changes: DiffChange[] = []
    a.forEach((item, i) => {
      changes.push(...diffLeaves(item, b[i], `${path}[${i}]`))
    })
    return changes
  }

  return [{ path, before: a, after: b }]
}

export function diffEntities<T extends Record<string, unknown>>(
  listA: T[] | undefined,
  listB: T[] | undefined,
  naturalKeyField: string,
): EntityDiff<T> {
  const a = listA ?? []
  const b = listB ?? []

  const mapA = new Map<string, T>()
  const unmatchedA: T[] = []
  for (const entity of a) {
    const key = entity[naturalKeyField]
    if (typeof key === 'string' && key.length > 0) mapA.set(key, entity)
    else unmatchedA.push(entity)
  }

  const mapB = new Map<string, T>()
  const unmatchedB: T[] = []
  for (const entity of b) {
    const key = entity[naturalKeyField]
    if (typeof key === 'string' && key.length > 0) mapB.set(key, entity)
    else unmatchedB.push(entity)
  }

  const added: T[] = []
  const changed: EntityDiff<T>['changed'] = []
  for (const [key, entityB] of mapB) {
    const entityA = mapA.get(key)
    if (!entityA) {
      added.push(entityB)
      continue
    }
    const changes = diffLeaves(entityA, entityB)
    if (changes.length > 0) changed.push({ key, before: entityA, after: entityB, changes })
  }

  const removed: T[] = []
  for (const [key, entityA] of mapA) {
    if (!mapB.has(key)) removed.push(entityA)
  }

  return { added, removed, changed, unmatchedA, unmatchedB }
}

export type KongConfigDiff = {
  services: EntityDiff<KongService>
  consumers: EntityDiff<KongConsumer>
  globalPlugins: EntityDiff<KongPlugin>
  routesByService: Map<string, EntityDiff<KongRoute>>
}

export function diffKongConfigs(a: KongConfig, b: KongConfig): KongConfigDiff {
  const services = diffEntities(a.services, b.services, 'name')
  const consumers = diffEntities(a.consumers, b.consumers, 'username')
  const globalPlugins = diffEntities(a.plugins, b.plugins, 'name')

  const servicesA = new Map((a.services ?? []).map((s) => [s.name, s]))
  const servicesB = new Map((b.services ?? []).map((s) => [s.name, s]))
  const allServiceNames = new Set([...servicesA.keys(), ...servicesB.keys()])

  const routesByService = new Map<string, EntityDiff<KongRoute>>()
  for (const name of allServiceNames) {
    if (typeof name !== 'string') continue
    const svcA = servicesA.get(name)
    const svcB = servicesB.get(name)
    routesByService.set(name, diffEntities(svcA?.routes, svcB?.routes, 'name'))
  }

  return { services, consumers, globalPlugins, routesByService }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/diff.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/diff.ts src/lib/diff.test.ts
git commit -m "feat: add entity-matching diff engine"
```

---

### Task 6: Pinia config store

**Files:**
- Create: `src/stores/config.ts`
- Test: `src/stores/config.test.ts`
- Modify: `package.json` (none — pinia already installed in Task 1)

**Interfaces:**
- Consumes: `parseKongConfig`, `serializeKongConfig` (Task 4); `KongConfig` (Task 2).
- Produces: `useConfigStore()` with state `{ primary, compareTarget, modifiedKeys }`, getters `{ isLoaded, summary }`, actions `{ loadPrimary(fileName, text), loadCompareTarget(fileName, text), markModified(entityKey), isModified(entityKey), exportYaml() }` — used by every view/component from Task 8 onward.

- [ ] **Step 1: Write the failing tests**

```ts
// src/stores/config.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useConfigStore } from './config'

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
  })

  it('starts empty and unloaded', () => {
    const store = useConfigStore()
    expect(store.isLoaded).toBe(false)
  })

  it('loads a primary config and computes summary counts', () => {
    const store = useConfigStore()
    store.loadPrimary('sample.yaml', SAMPLE)

    expect(store.isLoaded).toBe(true)
    expect(store.summary).toEqual({ services: 1, routes: 1, consumers: 1, globalPlugins: 1 })
  })

  it('propagates parse errors instead of silently loading nothing', () => {
    const store = useConfigStore()
    expect(() => store.loadPrimary('bad.yaml', 'services: [unclosed')).toThrow()
    expect(store.isLoaded).toBe(false)
  })

  it('tracks per-entity modified flags', () => {
    const store = useConfigStore()
    store.loadPrimary('sample.yaml', SAMPLE)

    expect(store.isModified('service:svc-a')).toBe(false)
    store.markModified('service:svc-a')
    expect(store.isModified('service:svc-a')).toBe(true)
    expect(store.isModified('service:svc-b')).toBe(false)
  })

  it('exports the current in-memory object, including in-place edits', () => {
    const store = useConfigStore()
    store.loadPrimary('kong-config.yaml', SAMPLE)
    store.primary!.config.services![0].host = 'edited.internal'

    const { fileName, contents } = store.exportYaml()

    expect(fileName).toBe('kong-config-edited.yaml')
    expect(contents).toContain('edited.internal')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/stores/config.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/stores/config.ts`**

```ts
import { defineStore } from 'pinia'
import { parseKongConfig, serializeKongConfig } from '../lib/yaml'
import type { KongConfig } from '../types/kong'

export type LoadedFile = {
  fileName: string
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
      this.primary = { fileName, config }
      this.modifiedKeys = new Set()
    },
    loadCompareTarget(fileName: string, text: string) {
      const config = parseKongConfig(text)
      this.compareTarget = { fileName, config }
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/stores/config.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/stores/config.ts src/stores/config.test.ts
git commit -m "feat: add Pinia config store with load/modify/export actions"
```

---

### Task 7: Router, app shell, and placeholder views

**Files:**
- Create: `src/router/index.ts`
- Create: `src/views/LoadView.vue` (placeholder)
- Create: `src/views/BrowseView.vue` (placeholder)
- Create: `src/views/CompareView.vue` (placeholder)
- Create: `src/components/layout/AppShell.vue`
- Modify: `src/App.vue`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `useConfigStore` (Task 6).
- Produces: three named routes (`load`, `browse`, `compare`) and an `AppShell` layout that later tasks render real content into by editing the placeholder views in place (not recreating them).

- [ ] **Step 1: Write placeholder `src/views/LoadView.vue`**

```vue
<script setup lang="ts"></script>

<template>
  <div class="p-6">
    <h1 class="text-lg font-semibold">Load a Kong config</h1>
  </div>
</template>
```

- [ ] **Step 2: Write placeholder `src/views/BrowseView.vue`**

```vue
<script setup lang="ts"></script>

<template>
  <div class="p-6">
    <h1 class="text-lg font-semibold">Browse</h1>
  </div>
</template>
```

- [ ] **Step 3: Write placeholder `src/views/CompareView.vue`**

```vue
<script setup lang="ts"></script>

<template>
  <div class="p-6">
    <h1 class="text-lg font-semibold">Compare</h1>
  </div>
</template>
```

- [ ] **Step 4: Write `src/router/index.ts`**

```ts
import { createRouter, createWebHistory } from 'vue-router'
import LoadView from '../views/LoadView.vue'
import BrowseView from '../views/BrowseView.vue'
import CompareView from '../views/CompareView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'load', component: LoadView },
    { path: '/browse', name: 'browse', component: BrowseView },
    { path: '/compare', name: 'compare', component: CompareView },
  ],
})
```

- [ ] **Step 5: Write `src/components/layout/AppShell.vue`**

```vue
<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { useConfigStore } from '../../stores/config'

const configStore = useConfigStore()
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <header class="border-b border-slate-200 bg-white px-4 py-3 flex items-center gap-6">
      <span class="font-semibold text-slate-800">Kong Config Viewer</span>
      <nav class="flex gap-4 text-sm">
        <RouterLink to="/" class="text-slate-600 hover:text-slate-900" active-class="text-slate-900 font-medium">
          Load
        </RouterLink>
        <RouterLink
          v-if="configStore.isLoaded"
          to="/browse"
          class="text-slate-600 hover:text-slate-900"
          active-class="text-slate-900 font-medium"
        >
          Browse
        </RouterLink>
        <RouterLink
          v-if="configStore.isLoaded"
          to="/compare"
          class="text-slate-600 hover:text-slate-900"
          active-class="text-slate-900 font-medium"
        >
          Compare
        </RouterLink>
      </nav>
      <div class="ml-auto">
        <slot name="header-actions" />
      </div>
    </header>
    <main class="flex-1">
      <slot />
    </main>
  </div>
</template>
```

- [ ] **Step 6: Modify `src/App.vue`**

```vue
<script setup lang="ts">
import AppShell from './components/layout/AppShell.vue'
</script>

<template>
  <AppShell>
    <RouterView />
  </AppShell>
</template>
```

- [ ] **Step 7: Modify `src/main.ts`**

```ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import './style.css'

createApp(App).use(createPinia()).use(router).mount('#app')
```

- [ ] **Step 8: Manually verify routing**

Run: `npm run dev -- --port 5183 &`
Run: `curl -s http://localhost:5183/ | grep -o 'Kong Config Viewer'`
Expected: prints `Kong Config Viewer`. Then kill the background dev server.

Open `http://localhost:5183/` in a browser, confirm only "Load" appears in the nav (Browse/Compare hidden pre-load), and clicking between manually-typed `/browse` and `/compare` URLs renders each placeholder heading.

- [ ] **Step 9: Commit**

```bash
git add src/router src/views src/components/layout/AppShell.vue src/App.vue src/main.ts
git commit -m "feat: add router, app shell nav, and placeholder views"
```

---

### Task 8: File loading — FileDropZone + real LoadView

**Files:**
- Create: `src/components/FileDropZone.vue`
- Modify: `src/views/LoadView.vue`

**Interfaces:**
- Consumes: `useConfigStore().loadPrimary` (Task 6).
- Produces: `FileDropZone` emits `('file-selected', payload: { fileName: string; text: string })` — reused by `CompareView.vue` in Task 14.

- [ ] **Step 1: Write `src/components/FileDropZone.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue'

defineProps<{ label: string }>()
const emit = defineEmits<{ 'file-selected': [payload: { fileName: string; text: string }] }>()

const isDragOver = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)

function readFile(file: File) {
  const reader = new FileReader()
  reader.onload = () => {
    emit('file-selected', { fileName: file.name, text: String(reader.result ?? '') })
  }
  reader.readAsText(file)
}

function onDrop(event: DragEvent) {
  isDragOver.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) readFile(file)
}

function onInputChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) readFile(file)
}
</script>

<template>
  <div
    class="border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors"
    :class="isDragOver ? 'border-slate-500 bg-slate-100' : 'border-slate-300 bg-white'"
    @dragover.prevent="isDragOver = true"
    @dragleave.prevent="isDragOver = false"
    @drop.prevent="onDrop"
    @click="inputRef?.click()"
  >
    <p class="text-slate-600">{{ label }}</p>
    <p class="text-sm text-slate-400 mt-1">Drag & drop a YAML file, or click to choose one</p>
    <input ref="inputRef" type="file" accept=".yaml,.yml" class="hidden" @change="onInputChange" />
  </div>
</template>
```

- [ ] **Step 2: Modify `src/views/LoadView.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import FileDropZone from '../components/FileDropZone.vue'
import { useConfigStore } from '../stores/config'

const configStore = useConfigStore()
const router = useRouter()
const errorMessage = ref<string | null>(null)

function onFileSelected({ fileName, text }: { fileName: string; text: string }) {
  try {
    configStore.loadPrimary(fileName, text)
    errorMessage.value = null
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err)
  }
}
</script>

<template>
  <div class="p-6 max-w-2xl mx-auto space-y-4">
    <h1 class="text-lg font-semibold">Load a Kong declarative config</h1>

    <FileDropZone label="Load your kong-config.yaml" @file-selected="onFileSelected" />

    <div v-if="errorMessage" class="border border-red-300 bg-red-50 text-red-800 rounded p-3 text-sm">
      Failed to parse YAML: {{ errorMessage }}
    </div>

    <div v-if="configStore.isLoaded" class="border border-slate-200 rounded-lg p-4 bg-white space-y-2">
      <h2 class="font-medium text-slate-800">Loaded: {{ configStore.primary?.fileName }}</h2>
      <ul class="text-sm text-slate-600 grid grid-cols-2 gap-1">
        <li>Services: {{ configStore.summary.services }}</li>
        <li>Routes: {{ configStore.summary.routes }}</li>
        <li>Consumers: {{ configStore.summary.consumers }}</li>
        <li>Global plugins: {{ configStore.summary.globalPlugins }}</li>
      </ul>
      <button
        class="mt-2 px-3 py-1.5 bg-slate-800 text-white text-sm rounded hover:bg-slate-700"
        @click="router.push('/browse')"
      >
        Browse this config
      </button>
    </div>
  </div>
</template>
```

- [ ] **Step 3: Manually verify with the sample fixture**

Run: `npm run dev -- --port 5183 &`, open `http://localhost:5183/` in a browser, drag `fixtures/sample-a.yaml` onto the drop zone.
Expected: summary card shows Services: 2, Routes: 2, Consumers: 1, Global plugins: 1; clicking "Browse this config" navigates to `/browse`.
Then drop a deliberately broken file (e.g. a copy of `fixtures/sample-a.yaml` with a line manually mangled to `services: [unclosed`) and confirm the red error banner appears instead of a crash.
Kill the background dev server when done.

- [ ] **Step 4: Commit**

```bash
git add src/components/FileDropZone.vue src/views/LoadView.vue
git commit -m "feat: implement file loading via drag-and-drop and Load view summary"
```

---

### Task 9: Shared editing primitives

**Files:**
- Create: `src/components/shared/Badge.vue`
- Create: `src/components/shared/TagInput.vue`
- Create: `src/components/shared/SecretField.vue`
- Create: `src/components/shared/DynamicKeyValueEditor.vue`

**Interfaces:**
- Consumes: `inferValueType`, `isMultilineString` (Task 2); `isSecretField` (Task 3).
- Produces: `Badge` (prop `variant: 'modified'|'added'|'removed'|'changed'`), `TagInput` (`v-model` on `string[]`), `SecretField` (`v-model` on `string`), `DynamicKeyValueEditor` (`v-model` on `Record<string, unknown>`) — all reused from Task 10 onward.

- [ ] **Step 1: Write `src/components/shared/Badge.vue`**

```vue
<script setup lang="ts">
withDefaults(defineProps<{ variant?: 'modified' | 'added' | 'removed' | 'changed' }>(), {
  variant: 'modified',
})

const styles: Record<string, string> = {
  modified: 'bg-amber-100 text-amber-800',
  added: 'bg-emerald-100 text-emerald-800',
  removed: 'bg-red-100 text-red-800',
  changed: 'bg-blue-100 text-blue-800',
}
</script>

<template>
  <span class="inline-block text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded" :class="styles[variant]">
    {{ variant }}
  </span>
</template>
```

- [ ] **Step 2: Write `src/components/shared/TagInput.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{ modelValue: string[] | undefined }>()
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()

const draft = ref('')

function commitDraft() {
  const value = draft.value.trim()
  if (!value) return
  emit('update:modelValue', [...(props.modelValue ?? []), value])
  draft.value = ''
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' || event.key === ',') {
    event.preventDefault()
    commitDraft()
  }
}

function removeAt(index: number) {
  const next = [...(props.modelValue ?? [])]
  next.splice(index, 1)
  emit('update:modelValue', next)
}
</script>

<template>
  <div class="flex flex-wrap gap-1.5 items-center border border-slate-300 rounded px-2 py-1.5 bg-white">
    <span
      v-for="(tag, index) in modelValue ?? []"
      :key="`${tag}-${index}`"
      class="flex items-center gap-1 bg-slate-100 text-slate-700 text-xs px-2 py-0.5 rounded"
    >
      {{ tag }}
      <button type="button" class="text-slate-400 hover:text-slate-700" @click="removeAt(index)">×</button>
    </span>
    <input
      v-model="draft"
      type="text"
      placeholder="add tag…"
      class="flex-1 min-w-[6rem] text-sm outline-none"
      @keydown="onKeydown"
      @blur="commitDraft"
    />
  </div>
</template>
```

- [ ] **Step 3: Write `src/components/shared/SecretField.vue`**

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{ modelValue: string | undefined }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const revealed = ref(false)
const masked = computed(() => '•'.repeat(Math.max(8, (props.modelValue ?? '').length)))
</script>

<template>
  <div class="flex items-center gap-2">
    <input
      :type="revealed ? 'text' : 'password'"
      :value="modelValue ?? ''"
      class="flex-1 border border-slate-300 rounded px-2 py-1 text-sm font-mono"
      :placeholder="revealed ? '' : masked"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <button
      type="button"
      class="text-xs text-slate-500 hover:text-slate-800 underline"
      @click="revealed = !revealed"
    >
      {{ revealed ? 'hide' : 'reveal' }}
    </button>
  </div>
</template>
```

- [ ] **Step 4: Write `src/components/shared/DynamicKeyValueEditor.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { inferValueType } from '../../lib/valueType'
import { isSecretField } from '../../lib/secretFields'
import TagInput from './TagInput.vue'
import SecretField from './SecretField.vue'

const props = defineProps<{ modelValue: Record<string, unknown> }>()
const emit = defineEmits<{ 'update:modelValue': [value: Record<string, unknown>] }>()

const newKeyDraft = ref('')

function setField(key: string, value: unknown) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}

function removeField(key: string) {
  const next = { ...props.modelValue }
  delete next[key]
  emit('update:modelValue', next)
}

function addField() {
  const key = newKeyDraft.value.trim()
  if (!key || key in props.modelValue) return
  setField(key, '')
  newKeyDraft.value = ''
}

function onNullableTextInput(key: string, raw: string) {
  setField(key, raw === '' ? null : raw)
}
</script>

<template>
  <div class="space-y-2">
    <div v-for="(value, key) in modelValue" :key="key" class="flex items-start gap-2">
      <label class="w-40 shrink-0 text-xs font-mono text-slate-500 pt-1.5 truncate" :title="String(key)">
        {{ key }}
      </label>

      <div class="flex-1">
        <SecretField
          v-if="isSecretField(String(key)) && typeof value === 'string'"
          :model-value="value"
          @update:model-value="(v) => setField(String(key), v)"
        />
        <input
          v-else-if="inferValueType(String(key), value) === 'string'"
          type="text"
          :value="value as string"
          class="w-full border border-slate-300 rounded px-2 py-1 text-sm"
          @input="setField(String(key), ($event.target as HTMLInputElement).value)"
        />
        <textarea
          v-else-if="inferValueType(String(key), value) === 'multiline-string'"
          :value="value as string"
          rows="4"
          class="w-full border border-slate-300 rounded px-2 py-1 text-sm font-mono"
          @input="setField(String(key), ($event.target as HTMLTextAreaElement).value)"
        />
        <input
          v-else-if="inferValueType(String(key), value) === 'number'"
          type="number"
          :value="value as number"
          class="w-full border border-slate-300 rounded px-2 py-1 text-sm"
          @input="setField(String(key), Number(($event.target as HTMLInputElement).value))"
        />
        <input
          v-else-if="inferValueType(String(key), value) === 'boolean'"
          type="checkbox"
          :checked="value as boolean"
          class="h-4 w-4"
          @change="setField(String(key), ($event.target as HTMLInputElement).checked)"
        />
        <input
          v-else-if="inferValueType(String(key), value) === 'null'"
          type="text"
          value=""
          placeholder="null"
          class="w-full border border-slate-300 rounded px-2 py-1 text-sm text-slate-400"
          @input="onNullableTextInput(String(key), ($event.target as HTMLInputElement).value)"
        />
        <TagInput
          v-else-if="inferValueType(String(key), value) === 'string-array'"
          :model-value="value as string[]"
          @update:model-value="(v) => setField(String(key), v)"
        />
        <div v-else-if="inferValueType(String(key), value) === 'object-array'" class="space-y-2 border-l-2 border-slate-200 pl-3">
          <div v-for="(item, i) in value as Record<string, unknown>[]" :key="i">
            <DynamicKeyValueEditor
              :model-value="item"
              @update:model-value="
                (v) => {
                  const next = [...(value as Record<string, unknown>[])]
                  next[i] = v
                  setField(String(key), next)
                }
              "
            />
          </div>
        </div>
        <div v-else class="border-l-2 border-slate-200 pl-3">
          <DynamicKeyValueEditor
            :model-value="value as Record<string, unknown>"
            @update:model-value="(v) => setField(String(key), v)"
          />
        </div>
      </div>

      <button type="button" class="text-slate-400 hover:text-red-600 text-xs pt-1.5" @click="removeField(String(key))">
        remove
      </button>
    </div>

    <div class="flex items-center gap-2 pt-1">
      <input
        v-model="newKeyDraft"
        type="text"
        placeholder="new key…"
        class="border border-slate-300 rounded px-2 py-1 text-xs w-40"
        @keydown.enter.prevent="addField"
      />
      <button type="button" class="text-xs text-slate-600 hover:text-slate-900 underline" @click="addField">
        add key
      </button>
    </div>
  </div>
</template>
```

- [ ] **Step 5: Manually verify null round-trip and recursion**

Add a temporary test route: for this check only, mount `DynamicKeyValueEditor` from a scratch `.vue` playground is unnecessary — instead verify via the real plugin editor once Task 10 wires it in. For now, run `npx vue-tsc --noEmit` to confirm the recursive self-reference (`DynamicKeyValueEditor` used inside its own template) type-checks cleanly.

Run: `npx vue-tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/shared
git commit -m "feat: add shared Badge/TagInput/SecretField/DynamicKeyValueEditor components"
```

---

### Task 10: Generic plugin editor + Global Plugins tab

**Files:**
- Create: `src/components/shared/PluginEditor.vue`
- Create: `src/components/layout/Sidebar.vue`
- Modify: `src/views/BrowseView.vue`

**Interfaces:**
- Consumes: `DynamicKeyValueEditor`, `TagInput` (Task 9); `KONG_PROTOCOLS` (Task 2); `useConfigStore` (Task 6).
- Produces: `PluginEditor` (`v-model` on a `KongPlugin`, emits nothing else — parent marks "modified" on its own `@update:model-value`) — reused by `RouteCard.vue` (Task 11) and directly by the Global Plugins tab here.

- [ ] **Step 1: Write `src/components/shared/PluginEditor.vue`**

```vue
<script setup lang="ts">
import type { KongPlugin } from '../../types/kong'
import { KONG_PROTOCOLS } from '../../types/kong'
import TagInput from './TagInput.vue'
import DynamicKeyValueEditor from './DynamicKeyValueEditor.vue'

const props = defineProps<{ modelValue: KongPlugin }>()
const emit = defineEmits<{ 'update:modelValue': [value: KongPlugin] }>()

function update<K extends keyof KongPlugin>(key: K, value: KongPlugin[K]) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}

function toggleProtocol(protocol: string, checked: boolean) {
  const current = props.modelValue.protocols ?? []
  const next = checked ? [...current, protocol] : current.filter((p) => p !== protocol)
  update('protocols', next)
}
</script>

<template>
  <div class="border border-slate-200 rounded-lg p-3 bg-white space-y-3">
    <div class="flex items-center justify-between">
      <span class="font-mono text-sm font-medium">{{ modelValue.name }}</span>
      <label class="flex items-center gap-1.5 text-xs text-slate-600">
        <input
          type="checkbox"
          :checked="modelValue.enabled ?? true"
          @change="update('enabled', ($event.target as HTMLInputElement).checked)"
        />
        enabled
      </label>
    </div>

    <div>
      <span class="text-xs text-slate-500 block mb-1">Protocols</span>
      <div class="flex flex-wrap gap-3">
        <label v-for="protocol in KONG_PROTOCOLS" :key="protocol" class="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            :checked="(modelValue.protocols ?? []).includes(protocol)"
            @change="toggleProtocol(protocol, ($event.target as HTMLInputElement).checked)"
          />
          {{ protocol }}
        </label>
      </div>
    </div>

    <div>
      <span class="text-xs text-slate-500 block mb-1">Tags</span>
      <TagInput :model-value="modelValue.tags" @update:model-value="(v) => update('tags', v)" />
    </div>

    <div>
      <span class="text-xs text-slate-500 block mb-1">Config</span>
      <DynamicKeyValueEditor
        :model-value="modelValue.config ?? {}"
        @update:model-value="(v) => update('config', v)"
      />
    </div>
  </div>
</template>
```

- [ ] **Step 2: Write `src/components/layout/Sidebar.vue`**

```vue
<script setup lang="ts">
defineProps<{ tabs: { id: string; label: string }[]; activeTab: string }>()
const emit = defineEmits<{ 'update:activeTab': [id: string] }>()
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="flex border-b border-slate-200">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="flex-1 px-3 py-2 text-sm"
        :class="activeTab === tab.id ? 'border-b-2 border-slate-800 font-medium text-slate-900' : 'text-slate-500'"
        @click="emit('update:activeTab', tab.id)"
      >
        {{ tab.label }}
      </button>
    </div>
    <div class="flex-1 overflow-y-auto">
      <slot />
    </div>
  </div>
</template>
```

- [ ] **Step 3: Modify `src/views/BrowseView.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useConfigStore } from '../stores/config'
import Sidebar from '../components/layout/Sidebar.vue'
import PluginEditor from '../components/shared/PluginEditor.vue'
import Badge from '../components/shared/Badge.vue'

const configStore = useConfigStore()
const activeTab = ref('services')
const pluginSearch = ref('')

const tabs = [
  { id: 'services', label: 'Services' },
  { id: 'consumers', label: 'Consumers' },
  { id: 'plugins', label: 'Global Plugins' },
]

function filteredPlugins() {
  const query = pluginSearch.value.trim().toLowerCase()
  const plugins = configStore.primary?.config.plugins ?? []
  if (!query) return plugins
  return plugins.filter((p) => p.name.toLowerCase().includes(query))
}

function onPluginUpdate(index: number, updated: (typeof filteredPlugins)[number]) {
  const plugins = configStore.primary?.config.plugins ?? []
  const target = filteredPlugins()[index]
  const realIndex = plugins.indexOf(target)
  if (realIndex === -1) return
  plugins[realIndex] = updated
  configStore.markModified(`plugin:global/${updated.name}`)
}
</script>

<template>
  <div class="flex h-[calc(100vh-3.5rem)]">
    <div class="w-72 border-r border-slate-200 bg-white">
      <Sidebar :tabs="tabs" :active-tab="activeTab" @update:active-tab="(id) => (activeTab = id)">
        <div v-if="activeTab === 'plugins'" class="p-3">
          <input
            v-model="pluginSearch"
            type="text"
            placeholder="Search plugins…"
            class="w-full border border-slate-300 rounded px-2 py-1 text-sm mb-2"
          />
          <ul class="space-y-1">
            <li
              v-for="plugin in filteredPlugins()"
              :key="plugin.name"
              class="text-sm px-2 py-1 rounded flex items-center gap-2"
            >
              <span class="font-mono">{{ plugin.name }}</span>
              <Badge v-if="configStore.isModified(`plugin:global/${plugin.name}`)" variant="modified" />
            </li>
          </ul>
          <p v-if="filteredPlugins().length === 0" class="text-xs text-slate-400 mt-2">No global plugins.</p>
        </div>
        <div v-else class="p-3 text-sm text-slate-400">Coming in a later task.</div>
      </Sidebar>
    </div>

    <div class="flex-1 overflow-y-auto p-4">
      <div v-if="activeTab === 'plugins'" class="space-y-3 max-w-2xl">
        <PluginEditor
          v-for="(plugin, index) in filteredPlugins()"
          :key="plugin.name"
          :model-value="plugin"
          @update:model-value="(v) => onPluginUpdate(index, v)"
        />
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Manually verify the Global Plugins tab**

Run: `npm run dev -- --port 5183 &`, load `fixtures/sample-a.yaml` from `/`, navigate to `/browse`, select the "Global Plugins" tab.
Expected: `rate-limiting` plugin appears; editing `config.minute` from `100` to `250` updates the input live and a "modified" badge appears in the sidebar list; searching "auth" filters it out (no match), searching "rate" shows it again.
Kill the background dev server when done.

- [ ] **Step 5: Commit**

```bash
git add src/components/shared/PluginEditor.vue src/components/layout/Sidebar.vue src/views/BrowseView.vue
git commit -m "feat: add generic plugin editor and wire Global Plugins tab"
```

---

### Task 11: Services tab — ServiceList, ServiceDetail, RouteCard

**Files:**
- Create: `src/components/browse/RouteCard.vue`
- Create: `src/components/browse/ServiceDetail.vue`
- Create: `src/components/browse/ServiceList.vue`
- Modify: `src/views/BrowseView.vue`

**Interfaces:**
- Consumes: `PluginEditor` (Task 10); `TagInput`, `Badge` (Task 9); `KONG_PROTOCOLS`, `KongService`, `KongRoute` (Task 2); `useConfigStore` (Task 6).
- Produces: `ServiceList` emits `('select', service: KongService)`; `ServiceDetail`/`RouteCard` are `v-model`-driven, mutating in place.

- [ ] **Step 1: Write `src/components/browse/RouteCard.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import type { KongRoute } from '../../types/kong'
import { KONG_PROTOCOLS } from '../../types/kong'
import TagInput from '../shared/TagInput.vue'
import PluginEditor from '../shared/PluginEditor.vue'

const props = defineProps<{ modelValue: KongRoute; serviceName: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: KongRoute]; modified: [] }>()

const expanded = ref(false)

function update<K extends keyof KongRoute>(key: K, value: KongRoute[K]) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
  emit('modified')
}

function toggleProtocol(protocol: string, checked: boolean) {
  const current = props.modelValue.protocols ?? []
  update('protocols', checked ? [...current, protocol] : current.filter((p) => p !== protocol))
}

function onPluginUpdate(index: number, updated: NonNullable<KongRoute['plugins']>[number]) {
  const plugins = [...(props.modelValue.plugins ?? [])]
  plugins[index] = updated
  update('plugins', plugins)
}
</script>

<template>
  <div class="border border-slate-200 rounded-lg bg-white">
    <button
      type="button"
      class="w-full flex items-center justify-between px-3 py-2 text-left"
      @click="expanded = !expanded"
    >
      <span class="font-mono text-sm">{{ modelValue.name ?? '(unnamed route)' }}</span>
      <span class="text-xs text-slate-400">{{ expanded ? 'collapse' : 'expand' }}</span>
    </button>

    <div v-if="expanded" class="border-t border-slate-100 p-3 space-y-3">
      <div class="grid grid-cols-2 gap-3">
        <label class="text-xs text-slate-500">
          Hosts
          <TagInput :model-value="modelValue.hosts" @update:model-value="(v) => update('hosts', v)" />
        </label>
        <label class="text-xs text-slate-500">
          Paths
          <TagInput :model-value="modelValue.paths" @update:model-value="(v) => update('paths', v)" />
        </label>
        <label class="text-xs text-slate-500">
          Methods
          <TagInput :model-value="modelValue.methods" @update:model-value="(v) => update('methods', v)" />
        </label>
        <label class="text-xs text-slate-500">
          Path handling
          <input
            type="text"
            :value="modelValue.path_handling ?? ''"
            class="w-full border border-slate-300 rounded px-2 py-1 text-sm"
            @input="update('path_handling', ($event.target as HTMLInputElement).value)"
          />
        </label>
      </div>

      <div class="flex gap-4 text-xs">
        <label class="flex items-center gap-1.5">
          <input
            type="checkbox"
            :checked="modelValue.strip_path ?? false"
            @change="update('strip_path', ($event.target as HTMLInputElement).checked)"
          />
          strip_path
        </label>
        <label class="flex items-center gap-1.5">
          <input
            type="checkbox"
            :checked="modelValue.preserve_host ?? false"
            @change="update('preserve_host', ($event.target as HTMLInputElement).checked)"
          />
          preserve_host
        </label>
      </div>

      <div>
        <span class="text-xs text-slate-500 block mb-1">Protocols</span>
        <div class="flex flex-wrap gap-3">
          <label v-for="protocol in KONG_PROTOCOLS" :key="protocol" class="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              :checked="(modelValue.protocols ?? []).includes(protocol)"
              @change="toggleProtocol(protocol, ($event.target as HTMLInputElement).checked)"
            />
            {{ protocol }}
          </label>
        </div>
      </div>

      <div v-if="(modelValue.plugins ?? []).length > 0" class="space-y-2">
        <span class="text-xs text-slate-500 block">Route plugins</span>
        <PluginEditor
          v-for="(plugin, index) in modelValue.plugins"
          :key="plugin.name"
          :model-value="plugin"
          @update:model-value="(v) => onPluginUpdate(index, v)"
        />
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Write `src/components/browse/ServiceDetail.vue`**

```vue
<script setup lang="ts">
import type { KongService, KongRoute } from '../../types/kong'
import TagInput from '../shared/TagInput.vue'
import RouteCard from './RouteCard.vue'

const props = defineProps<{ modelValue: KongService }>()
const emit = defineEmits<{ 'update:modelValue': [value: KongService]; modified: [] }>()

function update<K extends keyof KongService>(key: K, value: KongService[K]) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
  emit('modified')
}

function onRouteUpdate(index: number, updated: KongRoute) {
  const routes = [...(props.modelValue.routes ?? [])]
  routes[index] = updated
  update('routes', routes)
}
</script>

<template>
  <div class="space-y-4 max-w-2xl">
    <h2 class="font-semibold text-slate-800">{{ modelValue.name ?? '(unnamed service)' }}</h2>

    <div class="grid grid-cols-2 gap-3">
      <label class="text-xs text-slate-500">
        Host
        <input
          type="text"
          :value="modelValue.host"
          class="w-full border border-slate-300 rounded px-2 py-1 text-sm"
          @input="update('host', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <label class="text-xs text-slate-500">
        Port
        <input
          type="number"
          :value="modelValue.port"
          class="w-full border border-slate-300 rounded px-2 py-1 text-sm"
          @input="update('port', Number(($event.target as HTMLInputElement).value))"
        />
      </label>
      <label class="text-xs text-slate-500">
        Protocol
        <input
          type="text"
          :value="modelValue.protocol"
          class="w-full border border-slate-300 rounded px-2 py-1 text-sm"
          @input="update('protocol', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <label class="text-xs text-slate-500">
        Path
        <input
          type="text"
          :value="modelValue.path ?? ''"
          class="w-full border border-slate-300 rounded px-2 py-1 text-sm"
          @input="update('path', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <label class="text-xs text-slate-500">
        Connect timeout (ms)
        <input
          type="number"
          :value="modelValue.connect_timeout"
          class="w-full border border-slate-300 rounded px-2 py-1 text-sm"
          @input="update('connect_timeout', Number(($event.target as HTMLInputElement).value))"
        />
      </label>
      <label class="text-xs text-slate-500">
        Read timeout (ms)
        <input
          type="number"
          :value="modelValue.read_timeout"
          class="w-full border border-slate-300 rounded px-2 py-1 text-sm"
          @input="update('read_timeout', Number(($event.target as HTMLInputElement).value))"
        />
      </label>
      <label class="text-xs text-slate-500">
        Write timeout (ms)
        <input
          type="number"
          :value="modelValue.write_timeout"
          class="w-full border border-slate-300 rounded px-2 py-1 text-sm"
          @input="update('write_timeout', Number(($event.target as HTMLInputElement).value))"
        />
      </label>
      <label class="text-xs text-slate-500">
        Retries
        <input
          type="number"
          :value="modelValue.retries"
          class="w-full border border-slate-300 rounded px-2 py-1 text-sm"
          @input="update('retries', Number(($event.target as HTMLInputElement).value))"
        />
      </label>
    </div>

    <label class="flex items-center gap-1.5 text-xs text-slate-600">
      <input
        type="checkbox"
        :checked="modelValue.enabled ?? true"
        @change="update('enabled', ($event.target as HTMLInputElement).checked)"
      />
      enabled
    </label>

    <label class="text-xs text-slate-500 block">
      Tags
      <TagInput :model-value="modelValue.tags" @update:model-value="(v) => update('tags', v)" />
    </label>

    <div v-if="(modelValue.routes ?? []).length > 0" class="space-y-2">
      <h3 class="text-sm font-medium text-slate-700">Routes</h3>
      <RouteCard
        v-for="(route, index) in modelValue.routes"
        :key="route.name ?? index"
        :model-value="route"
        :service-name="modelValue.name ?? ''"
        @update:model-value="(v) => onRouteUpdate(index, v)"
        @modified="emit('modified')"
      />
    </div>
  </div>
</template>
```

- [ ] **Step 3: Write `src/components/browse/ServiceList.vue`**

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import type { KongService } from '../../types/kong'
import { useConfigStore } from '../../stores/config'
import Badge from '../shared/Badge.vue'

const props = defineProps<{ services: KongService[]; selectedName?: string }>()
const emit = defineEmits<{ select: [service: KongService] }>()
const configStore = useConfigStore()

const search = ref('')
const filtered = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return props.services
  return props.services.filter((s) => {
    const haystack = [s.name, s.host, s.path, ...(s.tags ?? [])].filter(Boolean).join(' ').toLowerCase()
    return haystack.includes(query)
  })
})
</script>

<template>
  <div class="p-3">
    <input
      v-model="search"
      type="text"
      placeholder="Search services…"
      class="w-full border border-slate-300 rounded px-2 py-1 text-sm mb-2"
    />
    <ul class="space-y-1">
      <li
        v-for="service in filtered"
        :key="service.name"
        class="text-sm px-2 py-1.5 rounded cursor-pointer flex items-center gap-2"
        :class="service.name === selectedName ? 'bg-slate-200' : 'hover:bg-slate-100'"
        @click="emit('select', service)"
      >
        <span class="font-mono truncate">{{ service.name }}</span>
        <Badge v-if="configStore.isModified(`service:${service.name}`)" variant="modified" />
      </li>
    </ul>
    <p v-if="filtered.length === 0" class="text-xs text-slate-400 mt-2">No matching services.</p>
  </div>
</template>
```

- [ ] **Step 4: Modify `src/views/BrowseView.vue`** — wire the Services tab

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useConfigStore } from '../stores/config'
import Sidebar from '../components/layout/Sidebar.vue'
import PluginEditor from '../components/shared/PluginEditor.vue'
import Badge from '../components/shared/Badge.vue'
import ServiceList from '../components/browse/ServiceList.vue'
import ServiceDetail from '../components/browse/ServiceDetail.vue'
import type { KongService } from '../types/kong'

const configStore = useConfigStore()
const activeTab = ref('services')
const pluginSearch = ref('')
const selectedServiceName = ref<string | undefined>(undefined)

const tabs = [
  { id: 'services', label: 'Services' },
  { id: 'consumers', label: 'Consumers' },
  { id: 'plugins', label: 'Global Plugins' },
]

const services = computed(() => configStore.primary?.config.services ?? [])
const selectedService = computed(() => services.value.find((s) => s.name === selectedServiceName.value))

function onSelectService(service: KongService) {
  selectedServiceName.value = service.name
}

function onServiceModified() {
  if (selectedServiceName.value) configStore.markModified(`service:${selectedServiceName.value}`)
}

function filteredPlugins() {
  const query = pluginSearch.value.trim().toLowerCase()
  const plugins = configStore.primary?.config.plugins ?? []
  if (!query) return plugins
  return plugins.filter((p) => p.name.toLowerCase().includes(query))
}

function onPluginUpdate(index: number, updated: (typeof filteredPlugins)[number]) {
  const plugins = configStore.primary?.config.plugins ?? []
  const target = filteredPlugins()[index]
  const realIndex = plugins.indexOf(target)
  if (realIndex === -1) return
  plugins[realIndex] = updated
  configStore.markModified(`plugin:global/${updated.name}`)
}
</script>

<template>
  <div class="flex h-[calc(100vh-3.5rem)]">
    <div class="w-72 border-r border-slate-200 bg-white shrink-0">
      <Sidebar :tabs="tabs" :active-tab="activeTab" @update:active-tab="(id) => (activeTab = id)">
        <ServiceList
          v-if="activeTab === 'services'"
          :services="services"
          :selected-name="selectedServiceName"
          @select="onSelectService"
        />
        <div v-else-if="activeTab === 'plugins'" class="p-3">
          <input
            v-model="pluginSearch"
            type="text"
            placeholder="Search plugins…"
            class="w-full border border-slate-300 rounded px-2 py-1 text-sm mb-2"
          />
          <ul class="space-y-1">
            <li
              v-for="plugin in filteredPlugins()"
              :key="plugin.name"
              class="text-sm px-2 py-1 rounded flex items-center gap-2"
            >
              <span class="font-mono">{{ plugin.name }}</span>
              <Badge v-if="configStore.isModified(`plugin:global/${plugin.name}`)" variant="modified" />
            </li>
          </ul>
          <p v-if="filteredPlugins().length === 0" class="text-xs text-slate-400 mt-2">No global plugins.</p>
        </div>
        <div v-else class="p-3 text-sm text-slate-400">Coming in a later task.</div>
      </Sidebar>
    </div>

    <div class="flex-1 overflow-y-auto p-4">
      <div v-if="activeTab === 'services'">
        <ServiceDetail
          v-if="selectedService"
          :model-value="selectedService"
          @modified="onServiceModified"
        />
        <p v-else class="text-sm text-slate-400">Select a service from the list.</p>
      </div>

      <div v-else-if="activeTab === 'plugins'" class="space-y-3 max-w-2xl">
        <PluginEditor
          v-for="(plugin, index) in filteredPlugins()"
          :key="plugin.name"
          :model-value="plugin"
          @update:model-value="(v) => onPluginUpdate(index, v)"
        />
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 5: Manually verify the Services tab**

Run: `npm run dev -- --port 5183 &`, load `fixtures/sample-a.yaml`, go to `/browse` → Services, select `billing-service`.
Expected: form shows `host: billing.internal`, `port: 8080`; expanding the `billing-route` card shows hosts/paths/methods and the `key-auth` route plugin; editing the port to `9999` marks `billing-service` with a "modified" badge in the sidebar list; searching "reporting" filters to just `reporting-service`.
Kill the background dev server when done.

- [ ] **Step 6: Commit**

```bash
git add src/components/browse/RouteCard.vue src/components/browse/ServiceDetail.vue src/components/browse/ServiceList.vue src/views/BrowseView.vue
git commit -m "feat: implement Services tab with route cards and route-level plugins"
```

---

### Task 12: Consumers tab — CredentialEditor, ConsumerDetail, ConsumerList

**Files:**
- Create: `src/components/browse/CredentialEditor.vue`
- Create: `src/components/browse/ConsumerDetail.vue`
- Create: `src/components/browse/ConsumerList.vue`
- Modify: `src/views/BrowseView.vue`

**Interfaces:**
- Consumes: `SecretField`, `TagInput`, `Badge` (Task 9); `isSecretField`, `isCredentialListKey` (Task 3); `useConfigStore` (Task 6).
- Produces: same `v-model`/`select`-emit pattern as the Services tab (Task 11), applied to consumers.

- [ ] **Step 1: Write `src/components/browse/CredentialEditor.vue`**

```vue
<script setup lang="ts">
import type { KongConsumer } from '../../types/kong'
import { isSecretField } from '../../lib/secretFields'
import SecretField from '../shared/SecretField.vue'
import TagInput from '../shared/TagInput.vue'

const props = defineProps<{ modelValue: NonNullable<KongConsumer[string]> extends never ? never : Record<string, unknown>[]; listKey: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: Record<string, unknown>[]] }>()

function updateEntry(index: number, key: string, value: unknown) {
  const next = [...props.modelValue]
  next[index] = { ...next[index], [key]: value }
  emit('update:modelValue', next)
}

function removeEntry(index: number) {
  const next = [...props.modelValue]
  next.splice(index, 1)
  emit('update:modelValue', next)
}
</script>

<template>
  <div class="space-y-2">
    <div v-for="(entry, index) in modelValue" :key="index" class="border border-slate-200 rounded p-2 space-y-1.5">
      <div v-for="(value, key) in entry" :key="key" class="flex items-center gap-2">
        <label class="w-24 shrink-0 text-xs font-mono text-slate-500">{{ key }}</label>
        <SecretField
          v-if="isSecretField(String(key)) && typeof value === 'string'"
          :model-value="value"
          @update:model-value="(v) => updateEntry(index, String(key), v)"
        />
        <TagInput
          v-else-if="Array.isArray(value)"
          :model-value="value as string[]"
          @update:model-value="(v) => updateEntry(index, String(key), v)"
        />
        <input
          v-else
          type="text"
          :value="value as string"
          class="flex-1 border border-slate-300 rounded px-2 py-1 text-sm"
          @input="updateEntry(index, String(key), ($event.target as HTMLInputElement).value)"
        />
      </div>
      <button type="button" class="text-xs text-slate-400 hover:text-red-600" @click="removeEntry(index)">
        remove {{ listKey.replace(/_credentials$/, '') }} entry
      </button>
    </div>
    <p v-if="modelValue.length === 0" class="text-xs text-slate-400">No {{ listKey }}.</p>
  </div>
</template>
```

- [ ] **Step 2: Write `src/components/browse/ConsumerDetail.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { KongConsumer } from '../../types/kong'
import { isCredentialListKey } from '../../lib/secretFields'
import TagInput from '../shared/TagInput.vue'
import CredentialEditor from './CredentialEditor.vue'

const props = defineProps<{ modelValue: KongConsumer }>()
const emit = defineEmits<{ 'update:modelValue': [value: KongConsumer]; modified: [] }>()

function update(key: string, value: unknown) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
  emit('modified')
}

const credentialListKeys = computed(() =>
  Object.keys(props.modelValue).filter((key) => isCredentialListKey(key) && Array.isArray(props.modelValue[key])),
)
</script>

<template>
  <div class="space-y-4 max-w-2xl">
    <h2 class="font-semibold text-slate-800">{{ modelValue.username ?? '(unnamed consumer)' }}</h2>

    <div class="grid grid-cols-2 gap-3">
      <label class="text-xs text-slate-500">
        Username
        <input
          type="text"
          :value="modelValue.username ?? ''"
          class="w-full border border-slate-300 rounded px-2 py-1 text-sm"
          @input="update('username', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <label class="text-xs text-slate-500">
        Custom ID
        <input
          type="text"
          :value="modelValue.custom_id ?? ''"
          class="w-full border border-slate-300 rounded px-2 py-1 text-sm"
          @input="update('custom_id', ($event.target as HTMLInputElement).value)"
        />
      </label>
    </div>

    <label class="text-xs text-slate-500 block">
      Tags
      <TagInput :model-value="modelValue.tags" @update:model-value="(v) => update('tags', v)" />
    </label>

    <div v-for="listKey in credentialListKeys" :key="listKey">
      <h3 class="text-sm font-medium text-slate-700 mb-1">{{ listKey }}</h3>
      <CredentialEditor
        :model-value="modelValue[listKey] as Record<string, unknown>[]"
        :list-key="listKey"
        @update:model-value="(v) => update(listKey, v)"
      />
    </div>
  </div>
</template>
```

- [ ] **Step 3: Write `src/components/browse/ConsumerList.vue`**

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import type { KongConsumer } from '../../types/kong'
import { useConfigStore } from '../../stores/config'
import Badge from '../shared/Badge.vue'

const props = defineProps<{ consumers: KongConsumer[]; selectedUsername?: string }>()
const emit = defineEmits<{ select: [consumer: KongConsumer] }>()
const configStore = useConfigStore()

const search = ref('')
const filtered = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return props.consumers
  return props.consumers.filter((c) => {
    const haystack = [c.username, c.custom_id, ...(c.tags ?? [])].filter(Boolean).join(' ').toLowerCase()
    return haystack.includes(query)
  })
})
</script>

<template>
  <div class="p-3">
    <input
      v-model="search"
      type="text"
      placeholder="Search consumers…"
      class="w-full border border-slate-300 rounded px-2 py-1 text-sm mb-2"
    />
    <ul class="space-y-1">
      <li
        v-for="consumer in filtered"
        :key="consumer.username"
        class="text-sm px-2 py-1.5 rounded cursor-pointer flex items-center gap-2"
        :class="consumer.username === selectedUsername ? 'bg-slate-200' : 'hover:bg-slate-100'"
        @click="emit('select', consumer)"
      >
        <span class="font-mono truncate">{{ consumer.username }}</span>
        <Badge v-if="configStore.isModified(`consumer:${consumer.username}`)" variant="modified" />
      </li>
    </ul>
    <p v-if="filtered.length === 0" class="text-xs text-slate-400 mt-2">No matching consumers.</p>
  </div>
</template>
```

- [ ] **Step 4: Modify `src/views/BrowseView.vue`** — wire the Consumers tab (add alongside the existing Services/Plugins wiring)

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useConfigStore } from '../stores/config'
import Sidebar from '../components/layout/Sidebar.vue'
import PluginEditor from '../components/shared/PluginEditor.vue'
import Badge from '../components/shared/Badge.vue'
import ServiceList from '../components/browse/ServiceList.vue'
import ServiceDetail from '../components/browse/ServiceDetail.vue'
import ConsumerList from '../components/browse/ConsumerList.vue'
import ConsumerDetail from '../components/browse/ConsumerDetail.vue'
import type { KongService, KongConsumer } from '../types/kong'

const configStore = useConfigStore()
const activeTab = ref('services')
const pluginSearch = ref('')
const selectedServiceName = ref<string | undefined>(undefined)
const selectedConsumerUsername = ref<string | undefined>(undefined)

const tabs = [
  { id: 'services', label: 'Services' },
  { id: 'consumers', label: 'Consumers' },
  { id: 'plugins', label: 'Global Plugins' },
]

const services = computed(() => configStore.primary?.config.services ?? [])
const selectedService = computed(() => services.value.find((s) => s.name === selectedServiceName.value))

const consumers = computed(() => configStore.primary?.config.consumers ?? [])
const selectedConsumer = computed(() =>
  consumers.value.find((c) => c.username === selectedConsumerUsername.value),
)

function onSelectService(service: KongService) {
  selectedServiceName.value = service.name
}
function onServiceModified() {
  if (selectedServiceName.value) configStore.markModified(`service:${selectedServiceName.value}`)
}

function onSelectConsumer(consumer: KongConsumer) {
  selectedConsumerUsername.value = consumer.username
}
function onConsumerModified() {
  if (selectedConsumerUsername.value) configStore.markModified(`consumer:${selectedConsumerUsername.value}`)
}

function filteredPlugins() {
  const query = pluginSearch.value.trim().toLowerCase()
  const plugins = configStore.primary?.config.plugins ?? []
  if (!query) return plugins
  return plugins.filter((p) => p.name.toLowerCase().includes(query))
}

function onPluginUpdate(index: number, updated: (typeof filteredPlugins)[number]) {
  const plugins = configStore.primary?.config.plugins ?? []
  const target = filteredPlugins()[index]
  const realIndex = plugins.indexOf(target)
  if (realIndex === -1) return
  plugins[realIndex] = updated
  configStore.markModified(`plugin:global/${updated.name}`)
}
</script>

<template>
  <div class="flex h-[calc(100vh-3.5rem)]">
    <div class="w-72 border-r border-slate-200 bg-white shrink-0">
      <Sidebar :tabs="tabs" :active-tab="activeTab" @update:active-tab="(id) => (activeTab = id)">
        <ServiceList
          v-if="activeTab === 'services'"
          :services="services"
          :selected-name="selectedServiceName"
          @select="onSelectService"
        />
        <ConsumerList
          v-else-if="activeTab === 'consumers'"
          :consumers="consumers"
          :selected-username="selectedConsumerUsername"
          @select="onSelectConsumer"
        />
        <div v-else class="p-3">
          <input
            v-model="pluginSearch"
            type="text"
            placeholder="Search plugins…"
            class="w-full border border-slate-300 rounded px-2 py-1 text-sm mb-2"
          />
          <ul class="space-y-1">
            <li
              v-for="plugin in filteredPlugins()"
              :key="plugin.name"
              class="text-sm px-2 py-1 rounded flex items-center gap-2"
            >
              <span class="font-mono">{{ plugin.name }}</span>
              <Badge v-if="configStore.isModified(`plugin:global/${plugin.name}`)" variant="modified" />
            </li>
          </ul>
          <p v-if="filteredPlugins().length === 0" class="text-xs text-slate-400 mt-2">No global plugins.</p>
        </div>
      </Sidebar>
    </div>

    <div class="flex-1 overflow-y-auto p-4">
      <div v-if="activeTab === 'services'">
        <ServiceDetail v-if="selectedService" :model-value="selectedService" @modified="onServiceModified" />
        <p v-else class="text-sm text-slate-400">Select a service from the list.</p>
      </div>

      <div v-else-if="activeTab === 'consumers'">
        <ConsumerDetail v-if="selectedConsumer" :model-value="selectedConsumer" @modified="onConsumerModified" />
        <p v-else class="text-sm text-slate-400">Select a consumer from the list.</p>
      </div>

      <div v-else class="space-y-3 max-w-2xl">
        <PluginEditor
          v-for="(plugin, index) in filteredPlugins()"
          :key="plugin.name"
          :model-value="plugin"
          @update:model-value="(v) => onPluginUpdate(index, v)"
        />
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 5: Manually verify secret masking and edits**

Run: `npm run dev -- --port 5183 &`, load `fixtures/sample-a.yaml`, go to `/browse` → Consumers, select `alice`.
Expected: the `keyauth_credentials` `key` field renders masked (dots) with a "reveal" toggle; clicking reveal shows `abc123key`; editing `custom_id` marks `alice` as modified in the sidebar.
Kill the background dev server when done.

- [ ] **Step 6: Commit**

```bash
git add src/components/browse/CredentialEditor.vue src/components/browse/ConsumerDetail.vue src/components/browse/ConsumerList.vue src/views/BrowseView.vue
git commit -m "feat: implement Consumers tab with masked credential editing"
```

---

### Task 13: Export modal

**Files:**
- Create: `src/components/ExportModal.vue`
- Modify: `src/components/layout/AppShell.vue`

**Interfaces:**
- Consumes: `useConfigStore().exportYaml` (Task 6).
- Produces: `ExportModal` (`v-model:open` boolean) rendered from `AppShell`'s `header-actions` slot usage, available on every route once a config is loaded.

- [ ] **Step 1: Write `src/components/ExportModal.vue`**

```vue
<script setup lang="ts">
import { ref, watch } from 'vue'
import { useConfigStore } from '../stores/config'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const configStore = useConfigStore()

const fileName = ref('')

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) fileName.value = configStore.exportYaml().fileName
  },
)

function confirmExport() {
  const { contents } = configStore.exportYaml()
  const blob = new Blob([contents], { type: 'text/yaml' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName.value || 'kong-config-edited.yaml'
  link.click()
  URL.revokeObjectURL(url)
  emit('close')
}
</script>

<template>
  <div v-if="open" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50" @click.self="emit('close')">
    <div class="bg-white rounded-lg shadow-xl p-5 w-full max-w-md space-y-4">
      <h2 class="font-semibold text-slate-800">Generate new config</h2>
      <label class="text-xs text-slate-500 block">
        Output filename
        <input
          v-model="fileName"
          type="text"
          class="w-full border border-slate-300 rounded px-2 py-1 text-sm mt-1"
        />
      </label>
      <div class="flex justify-end gap-2">
        <button type="button" class="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900" @click="emit('close')">
          Cancel
        </button>
        <button
          type="button"
          class="px-3 py-1.5 bg-slate-800 text-white text-sm rounded hover:bg-slate-700"
          @click="confirmExport"
        >
          Download
        </button>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Modify `src/components/layout/AppShell.vue`** — add the header button + modal

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useConfigStore } from '../../stores/config'
import ExportModal from '../ExportModal.vue'

const configStore = useConfigStore()
const exportModalOpen = ref(false)
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <header class="border-b border-slate-200 bg-white px-4 py-3 flex items-center gap-6">
      <span class="font-semibold text-slate-800">Kong Config Viewer</span>
      <nav class="flex gap-4 text-sm">
        <RouterLink to="/" class="text-slate-600 hover:text-slate-900" active-class="text-slate-900 font-medium">
          Load
        </RouterLink>
        <RouterLink
          v-if="configStore.isLoaded"
          to="/browse"
          class="text-slate-600 hover:text-slate-900"
          active-class="text-slate-900 font-medium"
        >
          Browse
        </RouterLink>
        <RouterLink
          v-if="configStore.isLoaded"
          to="/compare"
          class="text-slate-600 hover:text-slate-900"
          active-class="text-slate-900 font-medium"
        >
          Compare
        </RouterLink>
      </nav>
      <div class="ml-auto">
        <button
          v-if="configStore.isLoaded"
          type="button"
          class="px-3 py-1.5 bg-slate-800 text-white text-sm rounded hover:bg-slate-700"
          @click="exportModalOpen = true"
        >
          Generate new config
        </button>
      </div>
    </header>
    <main class="flex-1">
      <slot />
    </main>
    <ExportModal :open="exportModalOpen" @close="exportModalOpen = false" />
  </div>
</template>
```

- [ ] **Step 3: Manually verify export**

Run: `npm run dev -- --port 5183 &`, load `fixtures/sample-a.yaml`, edit `billing-service`'s port, click "Generate new config" in the header, confirm the filename defaults to `sample-a-edited.yaml`, click "Download".
Expected: a file downloads; open it and confirm the edited port value is present and `_format_version`/`upstreams` are still there untouched.
Kill the background dev server when done.

- [ ] **Step 4: Commit**

```bash
git add src/components/ExportModal.vue src/components/layout/AppShell.vue
git commit -m "feat: add export modal with filename confirmation and Blob download"
```

---

### Task 14: Compare view

**Files:**
- Create: `src/components/compare/DiffField.vue`
- Create: `src/components/compare/DiffEntityList.vue`
- Create: `src/components/compare/DiffSummary.vue`
- Modify: `src/views/CompareView.vue`

**Interfaces:**
- Consumes: `diffKongConfigs`, `EntityDiff` (Task 5); `isSecretField` (Task 3); `FileDropZone` (Task 8); `useConfigStore` (Task 6).
- Produces: fully wired `/compare` route.

- [ ] **Step 1: Write `src/components/compare/DiffField.vue`**

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { isSecretField } from '../../lib/secretFields'

const props = defineProps<{ path: string; before: unknown; after: unknown }>()
const revealed = ref(false)

const lastSegment = computed(() => props.path.split(/[.[]/).filter(Boolean).pop() ?? props.path)
const shouldMask = computed(
  () => isSecretField(lastSegment.value) && typeof props.before === 'string' && typeof props.after === 'string',
)

function display(value: unknown): string {
  if (shouldMask.value && !revealed.value) return '•'.repeat(8)
  return JSON.stringify(value)
}
</script>

<template>
  <div class="flex items-center gap-2 text-xs font-mono">
    <span class="text-slate-500 w-40 shrink-0 truncate" :title="path">{{ path }}</span>
    <span class="text-red-600">{{ display(before) }}</span>
    <span class="text-slate-400">→</span>
    <span class="text-emerald-700">{{ display(after) }}</span>
    <button v-if="shouldMask" type="button" class="text-slate-400 underline" @click="revealed = !revealed">
      {{ revealed ? 'hide' : 'reveal' }}
    </button>
  </div>
</template>
```

- [ ] **Step 2: Write `src/components/compare/DiffEntityList.vue`**

```vue
<script setup lang="ts" generic="T extends Record<string, unknown>">
import type { EntityDiff } from '../../lib/diff'
import DiffField from './DiffField.vue'

defineProps<{ title: string; diff: EntityDiff<T>; entityLabel: (entity: T) => string }>()
</script>

<template>
  <div class="space-y-3">
    <h3 class="font-medium text-slate-800">{{ title }}</h3>

    <div v-if="diff.added.length > 0">
      <h4 class="text-xs uppercase tracking-wide text-emerald-700 mb-1">Added</h4>
      <ul class="text-sm space-y-0.5">
        <li v-for="(entity, i) in diff.added" :key="i" class="font-mono">{{ entityLabel(entity) }}</li>
      </ul>
    </div>

    <div v-if="diff.removed.length > 0">
      <h4 class="text-xs uppercase tracking-wide text-red-700 mb-1">Removed</h4>
      <ul class="text-sm space-y-0.5">
        <li v-for="(entity, i) in diff.removed" :key="i" class="font-mono">{{ entityLabel(entity) }}</li>
      </ul>
    </div>

    <div v-if="diff.changed.length > 0" class="space-y-2">
      <h4 class="text-xs uppercase tracking-wide text-blue-700 mb-1">Changed</h4>
      <div v-for="entry in diff.changed" :key="entry.key" class="border border-slate-200 rounded p-2 space-y-1">
        <p class="font-mono text-sm">{{ entry.key }}</p>
        <DiffField
          v-for="change in entry.changes"
          :key="change.path"
          :path="change.path"
          :before="change.before"
          :after="change.after"
        />
      </div>
    </div>

    <div v-if="diff.unmatchedA.length > 0 || diff.unmatchedB.length > 0">
      <h4 class="text-xs uppercase tracking-wide text-amber-700 mb-1">Unmatched (no natural key)</h4>
      <ul class="text-sm space-y-0.5">
        <li v-for="(entity, i) in diff.unmatchedA" :key="`a-${i}`" class="font-mono">File A: {{ JSON.stringify(entity) }}</li>
        <li v-for="(entity, i) in diff.unmatchedB" :key="`b-${i}`" class="font-mono">File B: {{ JSON.stringify(entity) }}</li>
      </ul>
    </div>

    <p
      v-if="
        diff.added.length === 0 &&
        diff.removed.length === 0 &&
        diff.changed.length === 0 &&
        diff.unmatchedA.length === 0 &&
        diff.unmatchedB.length === 0
      "
      class="text-sm text-slate-400"
    >
      No differences.
    </p>
  </div>
</template>
```

- [ ] **Step 3: Write `src/components/compare/DiffSummary.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { KongConfigDiff } from '../../lib/diff'

const props = defineProps<{ diff: KongConfigDiff }>()

const totals = computed(() => {
  let added = 0
  let removed = 0
  let changed = 0
  const bump = (d: { added: unknown[]; removed: unknown[]; changed: unknown[] }) => {
    added += d.added.length
    removed += d.removed.length
    changed += d.changed.length
  }
  bump(props.diff.services)
  bump(props.diff.consumers)
  bump(props.diff.globalPlugins)
  for (const routeDiff of props.diff.routesByService.values()) bump(routeDiff)
  return { added, removed, changed }
})
</script>

<template>
  <div class="flex gap-4 text-sm">
    <span class="text-emerald-700">+{{ totals.added }} added</span>
    <span class="text-red-700">-{{ totals.removed }} removed</span>
    <span class="text-blue-700">~{{ totals.changed }} changed</span>
  </div>
</template>
```

- [ ] **Step 4: Modify `src/views/CompareView.vue`**

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useConfigStore } from '../stores/config'
import { diffKongConfigs } from '../lib/diff'
import FileDropZone from '../components/FileDropZone.vue'
import DiffSummary from '../components/compare/DiffSummary.vue'
import DiffEntityList from '../components/compare/DiffEntityList.vue'

const configStore = useConfigStore()
const errorMessage = ref<string | null>(null)

function onFileSelected({ fileName, text }: { fileName: string; text: string }) {
  try {
    configStore.loadCompareTarget(fileName, text)
    errorMessage.value = null
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err)
  }
}

const diff = computed(() => {
  if (!configStore.primary || !configStore.compareTarget) return null
  return diffKongConfigs(configStore.primary.config, configStore.compareTarget.config)
})
</script>

<template>
  <div class="p-6 max-w-4xl mx-auto space-y-6">
    <h1 class="text-lg font-semibold">Compare</h1>

    <p class="text-sm text-slate-500">
      File A: <span class="font-mono">{{ configStore.primary?.fileName }}</span> (currently loaded, including
      in-app edits)
    </p>

    <FileDropZone label="Load File B to compare against" @file-selected="onFileSelected" />

    <div v-if="errorMessage" class="border border-red-300 bg-red-50 text-red-800 rounded p-3 text-sm">
      Failed to parse YAML: {{ errorMessage }}
    </div>

    <template v-if="diff">
      <DiffSummary :diff="diff" />
      <DiffEntityList title="Services" :diff="diff.services" :entity-label="(s) => s.name ?? '(unnamed)'" />
      <DiffEntityList
        title="Consumers"
        :diff="diff.consumers"
        :entity-label="(c) => c.username ?? '(unnamed)'"
      />
      <DiffEntityList
        title="Global Plugins"
        :diff="diff.globalPlugins"
        :entity-label="(p) => p.name"
      />
      <div v-for="[serviceName, routeDiff] in diff.routesByService" :key="serviceName">
        <DiffEntityList
          :title="`Routes — ${serviceName}`"
          :diff="routeDiff"
          :entity-label="(r) => r.name ?? '(unnamed)'"
        />
      </div>
    </template>
  </div>
</template>
```

- [ ] **Step 5: Manually verify Compare with the two fixtures**

Run: `npm run dev -- --port 5183 &`, load `fixtures/sample-a.yaml` from `/`, go to `/compare`, drop `fixtures/sample-b.yaml` as File B.
Expected: Services shows `notifications-service` Added, `reporting-service` Removed, `billing-service` Changed (port/protocol); Consumers shows `bob` Added; Global Plugins shows `rate-limiting` Changed (`config.minute` 100→200); the consumer credential `key` values in any Changed rows render masked with a reveal toggle.
Kill the background dev server when done.

- [ ] **Step 6: Commit**

```bash
git add src/components/compare src/views/CompareView.vue
git commit -m "feat: implement Compare view with entity diffing and masked secret fields"
```

---

### Task 15: Full-flow verification against the real config, and polish

**Files:**
- Modify: any file where the manual pass below surfaces a bug (expected candidates: `src/components/browse/*`, `src/lib/diff.ts`, `src/components/shared/DynamicKeyValueEditor.vue`).

**Interfaces:**
- Consumes: everything built in Tasks 1–14.
- Produces: a verified, working app — this task closes out the spec's own "Manual verification" testing-plan item.

- [ ] **Step 1: Run the full automated test suite**

Run: `npm run test`
Expected: all Vitest suites pass (`valueType`, `secretFields`, `yaml`, `diff`, `config` store — 31 tests total across Tasks 2–6).

- [ ] **Step 2: Type-check and build**

Run: `npx vue-tsc -b`
Run: `npm run build`
Expected: both succeed with no TypeScript errors.

- [ ] **Step 3: Full manual flow against the real file**

Run: `npm run dev -- --port 5183 &`, open the app in a browser.

1. Drop the real `kong-config.yaml` (repo root, gitignored) onto the Load view.
   Expected: summary card shows 6 consumers, 45 services, and the correct global-plugin/route counts; no console errors.
2. Go to Browse → Services, pick any service with a route-level plugin (e.g. one with the `file-log` or Lua header/body-filter plugin from the reference file), expand its route, confirm the Lua `header_filter`/`body_filter` strings render in multi-line textareas (not single-line inputs) and are editable.
3. Edit that service's `port`, confirm the "modified" badge appears next to it in the sidebar.
4. Go to Consumers, pick `admin-user` (basicauth), confirm the `password` hash renders masked by default and reveals on toggle; edit `custom_id` on `convo-alpha` and confirm its badge appears.
5. Go to Global Plugins, confirm the plugin list renders and a config edit round-trips (edit a boolean/number field, see it reflected).
6. Click "Generate new config" in the header, accept the default filename, download.
7. Reload the app (fresh `/`), drop the just-exported file back in.
   Expected: it parses cleanly, and the summary counts match what was loaded originally; the edited port/custom_id values are present in the reloaded data (inspect via Browse).
8. Go to Compare, with the freshly-reloaded exported file as File A, drop the *original* `kong-config.yaml` as File B.
   Expected: the diff shows exactly the fields edited in steps 3–5 as "Changed", nothing else — proving round-trip fidelity didn't introduce spurious diffs.
9. Load `fixtures/sample-a.yaml` fresh via `/`, confirm the app doesn't retain any state from the previous file (services/consumers list fully replaced, no stale selection carried over incorrectly — a stale `selectedServiceName` pointing at a no-longer-existent service should just show the "select a service" placeholder, not crash).

Kill the background dev server when done. If any step fails, fix the underlying component/lib file (not a workaround) and re-run the relevant step before proceeding.

- [ ] **Step 4: Confirm the real config file was never written into the repo**

Run: `git status`
Expected: `kong-config.yaml` does not appear (already gitignored); only intentional source changes from this task (if any fixes were needed) are staged/unstaged.

- [ ] **Step 5: Commit any fixes found during verification**

```bash
git add -A -- ':!kong-config.yaml' ':!*.kong.yaml' ':!*-edited.yaml'
git commit -m "fix: address issues found during full-flow verification"
```

(Skip this commit entirely if Step 3 found nothing to fix.)

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-23-kong-config-viewer-app.md`. Please review the plan.
