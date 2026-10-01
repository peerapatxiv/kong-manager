# UI Consistency Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every screen use one icon set and four shared layout pieces so the app looks like one system.

**Architecture:** Add `AppIcon`, `ListRow`, `EmptyState` and `DetailHeader` under `src/components/shared/`. Replace the ~50 hand-copied inline SVGs and the duplicated list-row, empty-state and detail-header markup with them. Behaviour, routes, stores and test ids do not change.

**Tech Stack:** Vue 3 (`<script setup>`), Tailwind 3, Vitest + `@vue/test-utils` (jsdom), `vue-tsc`.

**Spec:** `docs/superpowers/specs/2026-10-01-ui-consistency-design.md`

## Global Constraints

- Run tests with `npx vitest run`; type-check with `npx vue-tsc -b`. Both must pass before every commit.
- Existing `data-testid` attributes and visible text strings must not change (tests rely on them).
- Icons are 20x20 viewBox, `stroke="currentColor"`, `stroke-width="1.5"`, round caps and joins. Size is always set by the caller's class (`h-4 w-4` etc.).
- Colours use the existing tokens (`accent`, `link`, `ink-muted`, `elevated`, `border`); no new hex values.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Spec deviations (decided while planning)

- **No `PageHeader`.** The page title and the "Push to Kong" / "Generate new config" actions already live once, in `AppShell.vue`. A shared header component would have one user, so it is dropped.
- **Chips keep `rounded-md`.** The 6 `rounded-md` uses are small tag/method chips (`TagInput`, `MethodPicker`, `PluginEditor`, `ValueListEditor`). Controls and rows use `rounded-lg`, cards `rounded-xl`, chips `rounded-md`. This is documented in Task 6 rather than changed.
- **Exempt from `AppIcon`:** the connect/spinner plug icon in `KongConnectForm.vue` (24x24, spins, 2px stroke) stays inline.

## Review Focus

- A selected row must still show the accent bar and `text-link`; the Browse lists must still show the check mark and "modified" badge.
- Long names must still truncate inside `ListRow` (no horizontal overflow at `lg:w-80`).
- `ListRow` clicks, `title` and `data-testid` must still reach the `<li>` (the Live view tests click `[data-testid="consumer-row"]`).
- `AppIcon` with an unknown name must render nothing, not throw.
- Dark mode: every new piece uses tokens only, so it must read in both themes.

---

### Task 1: `AppIcon`

**Files:**
- Create: `src/components/shared/AppIcon.vue`
- Test: `src/components/shared/AppIcon.test.ts`

**Interfaces:**
- Produces: `export type IconName`; component props `{ name: IconName }`; attributes (`class`) fall through to the `<svg>`.

- [ ] **Step 1: Write the failing test**

```ts
// src/components/shared/AppIcon.test.ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AppIcon from './AppIcon.vue'

describe('AppIcon', () => {
  it('draws a 20x20 stroke icon that takes its colour and size from the caller', () => {
    const wrapper = mount(AppIcon, { props: { name: 'user' }, attrs: { class: 'h-4 w-4' } })
    const svg = wrapper.find('svg')

    expect(svg.attributes('viewBox')).toBe('0 0 20 20')
    expect(svg.attributes('stroke')).toBe('currentColor')
    expect(svg.attributes('stroke-width')).toBe('1.5')
    expect(svg.attributes('aria-hidden')).toBe('true')
    expect(svg.classes()).toEqual(expect.arrayContaining(['h-4', 'w-4']))
    expect(svg.findAll('path').length).toBeGreaterThan(0)
  })

  it('renders every named icon with at least one path', () => {
    const names = [
      'home', 'list', 'compare', 'server', 'route', 'user', 'plug', 'link', 'upload', 'trash',
      'eye', 'eye-off', 'search', 'x', 'plus', 'check', 'chevron-right', 'menu', 'moon', 'lock', 'warning',
    ] as const
    for (const name of names) {
      expect(mount(AppIcon, { props: { name } }).findAll('path').length, name).toBeGreaterThan(0)
    }
  })

  it('renders nothing for an unknown name instead of throwing', () => {
    const wrapper = mount(AppIcon, { props: { name: 'nope' as never } })
    expect(wrapper.find('svg').exists()).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/components/shared/AppIcon.test.ts`
Expected: FAIL, cannot resolve `./AppIcon.vue`.

- [ ] **Step 3: Implement**

```vue
<!-- src/components/shared/AppIcon.vue -->
<script lang="ts">
const ICONS = {
  home: ['M10 3l7 5.5V17a1 1 0 01-1 1h-4v-5H8v5H4a1 1 0 01-1-1V8.5L10 3z'],
  list: [
    'M4 4h12a1 1 0 011 1v1.2a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1z',
    'M4 9h12a1 1 0 011 1v1.2a1 1 0 01-1 1H4a1 1 0 01-1-1V10a1 1 0 011-1z',
    'M4 14h6a1 1 0 011 1v1.2a1 1 0 01-1 1H4a1 1 0 01-1-1V15a1 1 0 011-1z',
  ],
  compare: ['M7 3v14M7 3L4 6M7 3l3 3', 'M13 17V3M13 17l3-3M13 17l-3-3'],
  server: [
    'M4 5h12a1 1 0 011 1v1.2a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1z',
    'M4 10h12a1 1 0 011 1v1.2a1 1 0 01-1 1H4a1 1 0 01-1-1V11a1 1 0 011-1z',
    'M6 15.5h.01M9 15.5h5',
  ],
  route: [
    'M5 13a2 2 0 100 4 2 2 0 000-4zM15 3a2 2 0 100 4 2 2 0 000-4z',
    'M7 15h4.5a3 3 0 003-3V9a3 3 0 00-3-3H10',
  ],
  user: ['M10 9a3 3 0 100-6 3 3 0 000 6z', 'M4 17a6 6 0 0112 0'],
  plug: ['M7 3v3M13 3v3M5 7h10v3a5 5 0 01-5 5 5 5 0 01-5-5V7zM10 15v3'],
  link: [
    'M7.5 12.5l5-5M6.5 8.379L5.086 6.964a2.5 2.5 0 113.535-3.535l1.415 1.414M13.5 11.621l1.414 1.415a2.5 2.5 0 11-3.535 3.535l-1.415-1.414',
  ],
  upload: ['M10 13V4m0 0L6.5 7.5M10 4l3.5 3.5M4 14v1a1 1 0 001 1h10a1 1 0 001-1v-1'],
  trash: [
    'M4 6h12M8 6V4.5a1 1 0 011-1h2a1 1 0 011 1V6m2 0-.7 9.1a1.5 1.5 0 01-1.5 1.4H7.2a1.5 1.5 0 01-1.5-1.4L5 6',
  ],
  eye: [
    'M2.2 10C3.6 7.7 6.4 5 10 5s6.4 2.7 7.8 5c-1.4 2.3-4.2 5-7.8 5s-6.4-2.7-7.8-5z',
    'M10 7.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z',
  ],
  'eye-off': [
    'M3 3l14 14M8.2 8.3a2.5 2.5 0 003.5 3.5M6 6.2C4.3 7.3 3 8.9 2.2 10c1.4 2.3 4.2 5 7.8 5 1.3 0 2.5-.4 3.5-.9M9.6 5.05c.14-.03.27-.05.4-.05 3.6 0 6.4 2.7 7.8 5-.5.8-1.2 1.7-2.1 2.4',
  ],
  search: ['M9 3a6 6 0 100 12A6 6 0 009 3z', 'M17 17l-3.5-3.5'],
  x: ['M5 5l10 10M15 5L5 15'],
  plus: ['M10 4.4v11.2M4.4 10h11.2'],
  check: ['M4.4 10.6l3.7 3.7 7.5-8.7'],
  'chevron-right': ['M7.5 5l5 5-5 5'],
  menu: ['M3 5h14M3 10h14M3 15h14'],
  moon: ['M17 11.2A7 7 0 018.8 3 7 7 0 1017 11.2z'],
  lock: [
    'M6.5 9h7A1.5 1.5 0 0115 10.5v4a1.5 1.5 0 01-1.5 1.5h-7A1.5 1.5 0 015 14.5v-4A1.5 1.5 0 016.5 9z',
    'M7.5 9V6.5a2.5 2.5 0 015 0V9',
  ],
  warning: [
    'M10 6.9v4.1M10 14.1h.01',
    'M3.1 16.9h13.8a1.25 1.25 0 001.1-1.9l-6.9-11.9a1.25 1.25 0 00-2.2 0L2 15a1.25 1.25 0 001.1 1.9z',
  ],
} as const

export type IconName = keyof typeof ICONS
</script>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ name: IconName }>()
const paths = computed<readonly string[] | undefined>(() => ICONS[props.name])
</script>

<template>
  <svg
    v-if="paths"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path v-for="d in paths" :key="d" :d="d" />
  </svg>
</template>
```

- [ ] **Step 4: Run it to see it pass, then look at the icons**

Run: `npx vitest run src/components/shared/AppIcon.test.ts` — Expected: PASS (3 tests).

Then render every icon to a PNG and look at it. Write `/private/tmp/claude-501/-Users-peerapat-padtawaro-Documents-kong-manager/e7566fdf-4743-41e5-ae11-38c0c4881685/scratchpad/icons.html` with the paths above in a grid of `<svg viewBox="0 0 20 20" width="64">` and run
`"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --screenshot=icons.png --window-size=900,400 file://$PWD/icons.html`, then open `icons.png`. Fix any path that looks broken (the `route` and `warning` icons were redrawn by hand, so check those first).

- [ ] **Step 5: Commit**

```bash
git add src/components/shared/AppIcon.vue src/components/shared/AppIcon.test.ts
git commit -m "feat: add AppIcon with one 20x20 stroke icon set"
```

---

### Task 2: `ListRow`, `EmptyState`, `DetailHeader`

**Files:**
- Create: `src/components/shared/ListRow.vue`, `EmptyState.vue`, `DetailHeader.vue` (all in `src/components/shared/`)
- Test: `ListRow.test.ts`, `EmptyState.test.ts`, `DetailHeader.test.ts` (same folder)

**Interfaces:**
- Consumes: `AppIcon` and `IconName` from Task 1.
- Produces:
  - `ListRow` props `{ selected?: boolean; showCheck?: boolean; initial?: string }`, slots `default` (label), `trail`. Renders an `<li>`; `class`, `title`, `data-testid` and `@click` fall through to it.
  - `EmptyState` props `{ icon: IconName; title: string; hint?: string }`, default slot for an action.
  - `DetailHeader` props `{ initial: string; title: string; subtitle?: string }`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/components/shared/ListRow.test.ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ListRow from './ListRow.vue'

describe('ListRow', () => {
  it('shows the accent bar and green text only when selected', async () => {
    const wrapper = mount(ListRow, { slots: { default: 'alpha' } })
    expect(wrapper.classes()).toContain('border-transparent')

    await wrapper.setProps({ selected: true })
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['border-accent', 'text-link']))
  })

  it('passes click, title and data-testid through to the row', async () => {
    const onClick = vi.fn()
    const wrapper = mount(ListRow, {
      attrs: { title: 'alpha', 'data-testid': 'row', onClick },
      slots: { default: 'alpha' },
    })
    expect(wrapper.element.tagName).toBe('LI')
    expect(wrapper.attributes('data-testid')).toBe('row')
    expect(wrapper.attributes('title')).toBe('alpha')
    await wrapper.trigger('click')
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('shows the check only when asked and selected, and an initial avatar when given one', () => {
    const plain = mount(ListRow, { props: { selected: true }, slots: { default: 'a' } })
    expect(plain.find('svg').exists()).toBe(false)

    const checked = mount(ListRow, { props: { selected: true, showCheck: true }, slots: { default: 'a' } })
    expect(checked.find('svg').exists()).toBe(true)

    const avatar = mount(ListRow, { props: { initial: 'k' }, slots: { default: 'kong' } })
    expect(avatar.text()).toContain('k')
    expect(avatar.text()).toContain('kong')
  })

  it('truncates a long label instead of overflowing', () => {
    const wrapper = mount(ListRow, { slots: { default: 'x'.repeat(200) } })
    expect(wrapper.find('span.truncate').exists()).toBe(true)
  })
})
```

```ts
// src/components/shared/EmptyState.test.ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import EmptyState from './EmptyState.vue'

describe('EmptyState', () => {
  it('shows the icon, the title, the hint and an action slot', () => {
    const wrapper = mount(EmptyState, {
      props: { icon: 'user', title: 'Select a consumer from the list, or create a new one.', hint: 'Nothing here yet' },
      slots: { default: '<button>New</button>' },
    })
    expect(wrapper.find('svg').exists()).toBe(true)
    expect(wrapper.text()).toContain('Select a consumer from the list, or create a new one.')
    expect(wrapper.text()).toContain('Nothing here yet')
    expect(wrapper.find('button').exists()).toBe(true)
  })

  it('omits the hint when there is none', () => {
    const wrapper = mount(EmptyState, { props: { icon: 'list', title: 'Empty' } })
    expect(wrapper.findAll('p')).toHaveLength(1)
  })
})
```

```ts
// src/components/shared/DetailHeader.test.ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DetailHeader from './DetailHeader.vue'

describe('DetailHeader', () => {
  it('shows the avatar initial, the title and the subtitle', () => {
    const wrapper = mount(DetailHeader, { props: { initial: 'k', title: 'kong-admin', subtitle: 'abc-123' } })
    expect(wrapper.text()).toContain('k')
    expect(wrapper.text()).toContain('kong-admin')
    expect(wrapper.text()).toContain('abc-123')
  })

  it('omits the subtitle line when there is none', () => {
    const wrapper = mount(DetailHeader, { props: { initial: '+', title: 'New consumer' } })
    expect(wrapper.findAll('p')).toHaveLength(1)
  })
})
```

Add `import { vi } from 'vitest'` to the `ListRow` test's import line (it uses `vi.fn`).

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/components/shared/ListRow.test.ts src/components/shared/EmptyState.test.ts src/components/shared/DetailHeader.test.ts`
Expected: FAIL, components not found.

- [ ] **Step 3: Implement**

```vue
<!-- src/components/shared/ListRow.vue -->
<script setup lang="ts">
import AppIcon from './AppIcon.vue'

withDefaults(defineProps<{ selected?: boolean; showCheck?: boolean; initial?: string }>(), {
  selected: false,
  showCheck: false,
  initial: undefined,
})
</script>

<template>
  <li
    class="flex cursor-pointer items-center gap-2 rounded-lg border-l-2 py-1.5 pl-2 pr-2 text-sm transition-colors duration-150"
    :class="
      selected
        ? 'border-accent bg-accent/10 font-medium text-link'
        : 'border-transparent text-ink-muted hover:bg-elevated'
    "
  >
    <span
      v-if="initial !== undefined"
      aria-hidden="true"
      class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold uppercase"
      :class="selected ? 'bg-accent text-accent-on' : 'bg-elevated text-ink-muted'"
    >
      {{ initial }}
    </span>
    <span class="min-w-0 flex-1 truncate font-mono"><slot /></span>
    <slot name="trail" />
    <AppIcon v-if="showCheck && selected" name="check" class="h-3.5 w-3.5 shrink-0 text-accent-secondary" />
  </li>
</template>
```

```vue
<!-- src/components/shared/EmptyState.vue -->
<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import type { IconName } from './AppIcon.vue'

defineProps<{ icon: IconName; title: string; hint?: string }>()
</script>

<template>
  <div class="flex h-full min-h-[16rem] flex-col items-center justify-center gap-3 text-center">
    <span class="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-link">
      <AppIcon :name="icon" class="h-6 w-6" />
    </span>
    <p class="text-sm text-ink-muted">{{ title }}</p>
    <p v-if="hint" class="text-xs text-ink-muted/70">{{ hint }}</p>
    <slot />
  </div>
</template>
```

```vue
<!-- src/components/shared/DetailHeader.vue -->
<script setup lang="ts">
defineProps<{ initial: string; title: string; subtitle?: string }>()
</script>

<template>
  <div class="flex items-center gap-3">
    <span
      aria-hidden="true"
      class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-base font-semibold uppercase text-accent-on"
    >
      {{ initial }}
    </span>
    <div class="min-w-0">
      <p class="truncate font-semibold text-ink">{{ title }}</p>
      <p v-if="subtitle" class="truncate font-mono text-xs text-ink-muted">{{ subtitle }}</p>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/components/shared && npx vue-tsc -b`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/shared/ListRow.* src/components/shared/EmptyState.* src/components/shared/DetailHeader.*
git commit -m "feat: add ListRow, EmptyState and DetailHeader shared components"
```

---

### Task 3: Sidebar, Load and shared inputs use `AppIcon`

**Files (modify):** `src/components/layout/AppSidebar.vue`, `src/components/layout/AppShell.vue`, `src/views/LoadView.vue`, `src/components/FileDropZone.vue`, `src/components/SavedConnectionsList.vue`, `src/components/shared/SearchInput.vue`, `src/components/shared/SecretField.vue`, `src/components/shared/TagInput.vue`, `src/components/shared/MethodPicker.vue`, `src/components/shared/DynamicKeyValueEditor.vue`, `src/components/browse/CredentialEditor.vue`, `src/components/KongConnectForm.vue` (leave its plug/spinner SVGs).

**Interfaces:** Consumes `AppIcon` (Task 1). Produces nothing new.

Each replacement keeps the SVG's existing size class. In every file add `import AppIcon from '<relative>/shared/AppIcon.vue'` (use `./AppIcon.vue` inside `shared/`).

- [ ] **Step 1: Sidebar.** In `AppSidebar.vue` replace:
  - Load svg with `<AppIcon name="home" class="h-4 w-4 shrink-0" />`.
  - Both Browse svgs (the link and the locked span) with `<AppIcon name="list" class="h-4 w-4 shrink-0" />`.
  - Both Compare svgs with `<AppIcon name="compare" class="h-4 w-4 shrink-0" />`.
  - Both lock svgs (`ml-auto h-3.5 w-3.5`) with `<AppIcon name="lock" class="ml-auto h-3.5 w-3.5 shrink-0" />`.
  - The moon svg with `<AppIcon name="moon" class="h-4 w-4" />`.
  - In the script, add an `icon` field to `liveLinks` (`'server'`, `'route'`, `'user'`), delete the `paths` arrays and the long comment above them, and render `<AppIcon :name="link.icon" class="h-4 w-4 shrink-0" />` in the `v-for` link. Type it as `{ to: string; label: string; icon: IconName }[]` (import `type IconName`).
- [ ] **Step 2: Shell and Load.** `AppShell.vue` menu svg → `<AppIcon name="menu" class="h-5 w-5" />`. In `LoadView.vue`: the two `M3.5 8.5l3 3 6-7` checks → `<AppIcon name="check" class="h-3.5 w-3.5" />`; the summary tile icons → `list` / `route` / `user` / `plug` with their current `h-4 w-4`; the Connect tab → `link` (`h-3.5 w-3.5`); the Upload tab → `upload` (`h-3.5 w-3.5`); the expand chevron (`LoadView` has none, `RouteCard` does: Task 4).
- [ ] **Step 3: Components.** `FileDropZone` → `upload h-5 w-5`; `SavedConnectionsList` server icons (two) → `server h-4 w-4`, trash → `trash h-4 w-4`; `SearchInput` search icon → keep its classes (`pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted`) on `<AppIcon name="search" …/>`, clear button svg → `x h-4 w-4`; `SecretField` → `eye-off` / `eye` (`h-4 w-4`) with `v-if` / `v-else`; `TagInput`, `MethodPicker` plus svgs → `plus h-3 w-3 shrink-0 text-ink-muted`; `DynamicKeyValueEditor` x svgs (two) → `x h-3.5 w-3.5`, plus svgs (two) → `plus h-3 w-3`; `CredentialEditor` x → `x h-3.5 w-3.5`.
- [ ] **Step 4: Verify.** Run `npx vue-tsc -b && npx vitest run`. Expected: all pass (the existing tests do not look inside the SVGs). Run `grep -rn "<svg" src/components/layout src/views/LoadView.vue src/components/FileDropZone.vue src/components/SavedConnectionsList.vue src/components/shared` — expected: only `AppIcon.vue`.
- [ ] **Step 5: Look at it.** `npx vite build --mode proxy --outDir dist-local`, hard-refresh http://localhost:4173/kong-manager/, check Load, the sidebar (light and dark) and the search / password-eye icons.
- [ ] **Step 6: Commit** — `git add -A src && git commit -m "refactor: sidebar, Load and shared inputs use AppIcon"`

---

### Task 4: Browse and Compare use `AppIcon`, `ListRow`, `EmptyState`

**Files (modify):** `src/components/browse/ServiceList.vue`, `ConsumerList.vue`, `PluginList.vue`, `ServiceDetail.vue`, `ConsumerDetail.vue`, `RouteCard.vue`, `src/views/BrowseView.vue`, `src/views/CompareView.vue`.

**Interfaces:** Consumes `AppIcon`, `ListRow`, `EmptyState` (Tasks 1–2).

- [ ] **Step 1: The three lists.** Replace each `<li …>…</li>` with `ListRow`. For `ServiceList.vue`:

```vue
<ListRow
  v-for="service in filtered"
  :key="service.name"
  :title="service.name"
  :selected="service.name === selectedName"
  show-check
  @click="emit('select', service)"
>
  {{ service.name }}
  <template #trail>
    <span
      v-if="(service.routes ?? []).length > 0"
      class="inline-flex h-4 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-elevated px-1 text-[10px] font-semibold tabular-nums text-ink-muted"
      :title="`${service.routes!.length} route${service.routes!.length === 1 ? '' : 's'}`"
    >
      {{ service.routes!.length }}
    </span>
    <Badge v-if="configStore.isModified(`service:${service.name}`)" variant="modified" />
  </template>
</ListRow>
```

`ConsumerList.vue` and `PluginList.vue` do the same with their own key, `selected` expression (`consumer.username === selectedUsername`, `plugin.name === selectedName`), label and `Badge`. Keep `<ul class="space-y-0.5 px-2 pb-3">`. Import `ListRow from '../shared/ListRow.vue'`.

- [ ] **Step 2: Checks and chevrons.** `ServiceDetail.vue` and `ConsumerDetail.vue` check svgs → `<AppIcon name="check" class="h-3 w-3" />`. `RouteCard.vue` chevron → `<AppIcon name="chevron-right" class="h-3.5 w-3.5 shrink-0 text-ink-muted transition-transform duration-150" :class="expanded ? 'rotate-90' : ''" />`. `CompareView.vue`: warning svg → `<AppIcon name="warning" class="h-3.5 w-3.5 shrink-0" />`, check → `<AppIcon name="check" class="h-4 w-4" />`.
- [ ] **Step 3: BrowseView.** Stat tile icons → `list` / `route` / `user` / `plug` (`h-3.5 w-3.5`); the three empty panels (`h-full min-h-[16rem] …`) → `<EmptyState icon="list" title="Select a service from the list to view and edit it." />`, `icon="user"` with the consumer text, `icon="plug"` with the plugin text. Keep the three titles' existing wording exactly as it is in the file.
- [ ] **Step 4: Verify.** `npx vue-tsc -b && npx vitest run`. If a Browse test fails because it looked for the old `<li>` classes or text, update the test to the new markup but keep what it asserts. `grep -rn "<svg" src/components/browse src/views/BrowseView.vue src/views/CompareView.vue` should print nothing.
- [ ] **Step 5: Look at it.** Rebuild, hard-refresh, load a YAML file, check Browse (all three tabs, selected state, modified badge) and Compare, in light and dark.
- [ ] **Step 6: Commit** — `git add -A src && git commit -m "refactor: Browse and Compare use AppIcon, ListRow and EmptyState"`

---

### Task 5: Live Services, Routes and Consumers

**Files (modify):** `src/views/live/LiveServicesView.vue`, `LiveRoutesView.vue`, `LiveConsumersView.vue`.

**Interfaces:** Consumes `ListRow`, `EmptyState`, `DetailHeader`.

- [ ] **Step 1: Rows.** In each view replace the `<li data-testid="…-row" …>` with `ListRow`, keeping the testid, `@click="select(item)"`, and the trailing control. `LiveServicesView`:

```vue
<ListRow
  v-for="service in filtered"
  :key="service.id"
  data-testid="service-row"
  :title="label(service)"
  :selected="service.id === selectedId"
  @click="select(service)"
>
  {{ label(service) }}
  <template #trail>
    <fieldset :disabled="!connection.canWrite" class="contents" @click.stop>
      <ToggleSwitch
        :model-value="service.enabled !== false"
        @update:model-value="(value) => toggle(service, value)"
      />
    </fieldset>
  </template>
</ListRow>
```

`LiveConsumersView` uses `:initial="label(consumer).charAt(0)"` and no trail; `LiveRoutesView` keeps whatever trailing control its `<li>` has today (read it first and move it into `#trail`).
- [ ] **Step 2: Detail header.** In `LiveConsumersView` replace the inline avatar block with `<DetailHeader :initial="creating ? '+' : (form.username || form.custom_id || '?').charAt(0)" :title="creating ? 'New consumer' : form.username || form.custom_id || 'Consumer'" :subtitle="!creating && selectedId ? selectedId : undefined" />`. In `LiveServicesView` and `LiveRoutesView` wrap `ServiceForm` / `RouteForm` in `<div class="card space-y-5 p-5">` with a `DetailHeader` above it (title from `form.name` / `form.name`, `'New service'` / `'New route'` while creating, subtitle the selected id), the same way the consumers view does.
- [ ] **Step 3: Empty states.** Replace the three "Select a … from the list, or create a new one." blocks with `<EmptyState icon="server|route|user" title="Select a service from the list, or create a new one." />` (same wording for route and consumer).
- [ ] **Step 4: Verify.** `npx vue-tsc -b && npx vitest run`. `grep -n "<svg" src/views/live/*.vue` prints nothing.
- [ ] **Step 5: Look at it.** Rebuild, hard-refresh, connect to the Kong (VPN on, :4173 page), open Live Services, Routes and Consumers in light and dark; create-form, selected, long-name and empty states.
- [ ] **Step 6: Commit** — `git add -A src && git commit -m "refactor: Live screens use ListRow, EmptyState and DetailHeader"`

---

### Task 6: Final sweep

**Files:** whatever the greps below find; `docs/superpowers/specs/2026-10-01-ui-consistency-design.md` (note the deviations).

- [ ] **Step 1: Find leftovers.** Run `grep -rn "<svg" src --include='*.vue'` — expected: `AppIcon.vue` and the `KongConnectForm.vue` plug/spinner only. Run `grep -rn "border-accent bg-accent/10" src --include='*.vue'` — expected: `ListRow.vue` and `AppSidebar.vue` (the sidebar's nav link has its own shape). Migrate anything else.
- [ ] **Step 2: Radius.** Confirm remaining `rounded-md` uses are only the chips listed in "Spec deviations".
- [ ] **Step 3: Spec.** Edit the spec's section 2 and 3 so they say what was built (no `PageHeader`; chips keep `rounded-md`).
- [ ] **Step 4: Full check.** `npx vue-tsc -b && npx vitest run && npx vite build` — all must pass.
- [ ] **Step 5: Browser pass.** Walk Load, Browse, Compare, Live Services/Routes/Consumers in light and dark. Note anything off and fix it before committing.
- [ ] **Step 6: Commit** — `git add -A && git commit -m "polish: final sweep for the UI consistency pass"`
