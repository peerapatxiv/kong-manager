<script setup lang="ts">
import AppIcon from '../shared/AppIcon.vue'
import SidebarLink from './SidebarLink.vue'
import type { IconName } from '../shared/AppIcon.vue'
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useConfigStore } from '../../stores/config'
import { useConnectionStore } from '../../stores/connection'
import { readTextFile } from '../../lib/readTextFile'
import { useTheme } from '../../lib/theme'

const configStore = useConfigStore()
const connectionStore = useConnectionStore()
const emit = defineEmits<{ navigate: [] }>()
const { theme, toggleTheme } = useTheme()

const fileInputRef = ref<HTMLInputElement | null>(null)
const changeError = ref<string | null>(null)

function triggerChangeFile() {
  if (configStore.modifiedKeys.size > 0 && !window.confirm('You have unsaved edits — load a different file anyway?')) {
    return
  }
  fileInputRef.value?.click()
}

async function onChangeFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    configStore.loadPrimary(file.name, await readTextFile(file))
    changeError.value = null
  } catch (err) {
    changeError.value = err instanceof Error ? err.message : String(err)
  }
}

const liveLinks: { to: string; label: string; icon: IconName }[] = [
  { to: '/live/services', label: 'Services', icon: 'server' },
  { to: '/live/routes', label: 'Routes', icon: 'route' },
  { to: '/live/consumers', label: 'Consumers', icon: 'user' },
]

// One mode at a time, as on the Load page: a loaded config means file browsing, a live
// connection without one means live editing.
const showLive = computed(() => connectionStore.isConnected && !configStore.isLoaded)
const showFileLinks = computed(() => configStore.isLoaded || !connectionStore.isConnected)

const liveHost = computed(() => {
  const baseUrl = connectionStore.active?.baseUrl
  if (!baseUrl) return ''
  try {
    return new URL(baseUrl).host
  } catch {
    return baseUrl
  }
})
</script>

<template>
  <aside class="flex h-full w-56 shrink-0 flex-col border-r border-border bg-surface">
    <div class="flex items-center gap-2.5 px-5 py-5">
      <span
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-sm font-bold text-accent-on"
      >
        K
      </span>
      <div class="leading-tight">
        <p class="font-bold text-ink">Manager</p>
        <p class="text-[11px] text-ink-muted">Kong Admin</p>
      </div>
    </div>

    <nav class="flex flex-col gap-0.5 px-3">
      <p class="section-heading px-2.5 pb-1 pt-1">Workspace</p>
      <SidebarLink to="/" label="Overview" icon="home" @navigate="emit('navigate')" />
      <template v-if="showFileLinks">
        <SidebarLink
          to="/browse"
          label="Browse"
          icon="list"
          :locked="!configStore.isLoaded"
          locked-title="Load a config first"
          @navigate="emit('navigate')"
        />
        <SidebarLink
          to="/compare"
          label="Compare"
          icon="compare"
          :locked="!configStore.isLoaded"
          locked-title="Load a config first"
          @navigate="emit('navigate')"
        />
      </template>

      <template v-if="showLive">
        <p class="section-heading px-2.5 pb-1 pt-5">Live</p>
        <div
          class="mx-1 mb-1 flex items-center gap-2.5 rounded-lg bg-elevated/60 px-2.5 py-2"
          data-testid="live-connection"
          :title="connectionStore.active?.baseUrl"
        >
          <span class="h-2 w-2 shrink-0 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20" />
          <span class="min-w-0 leading-tight">
            <span v-if="connectionStore.active?.name" class="block truncate text-xs font-semibold text-ink">
              {{ connectionStore.active.name }}
            </span>
            <span class="block truncate font-mono text-[11px] text-ink-muted">{{ liveHost }}</span>
          </span>
        </div>
        <SidebarLink
          v-for="link in liveLinks"
          :key="link.to"
          :to="link.to"
          :label="link.label"
          :icon="link.icon"
          @navigate="emit('navigate')"
        />
      </template>
    </nav>

    <div class="mt-auto">
      <div class="border-t border-border p-3">
        <button
          type="button"
          role="switch"
          :aria-checked="theme === 'dark'"
          class="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-ink-muted transition-colors duration-150 hover:bg-elevated hover:text-ink"
          @click="toggleTheme"
        >
          <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-elevated text-ink-muted">
            <AppIcon name="moon" class="h-4 w-4" />
          </span>
          <span class="flex-1 text-left font-medium">Dark mode</span>
          <span
            aria-hidden="true"
            class="relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors duration-150"
            :class="theme === 'dark' ? 'bg-accent' : 'bg-border'"
          >
            <span
              class="h-3 w-3 rounded-full bg-surface shadow-sm transition-transform duration-150"
              :class="theme === 'dark' ? 'translate-x-3.5' : 'translate-x-0.5'"
            />
          </span>
        </button>
      </div>

      <div class="border-t border-border px-5 py-3.5">
        <div class="flex items-center justify-between gap-2">
          <p class="text-[11px] font-medium uppercase tracking-wide text-ink-muted">Config</p>
          <button
            v-if="configStore.isLoaded"
            type="button"
            class="text-[11px] font-medium text-link hover:text-accent-hover"
            @click="triggerChangeFile"
          >
            Change
          </button>
        </div>
        <p
          class="mt-0.5 truncate font-mono text-xs text-ink-muted"
          :title="configStore.primary?.fileName"
        >
          {{ configStore.primary?.fileName ?? 'No config loaded' }}
        </p>
        <p v-if="changeError" class="mt-1 text-[11px] leading-snug text-red-600 dark:text-red-400">
          Failed to parse YAML: {{ changeError }}
        </p>
        <input ref="fileInputRef" type="file" accept=".yaml,.yml" class="hidden" @change="onChangeFileSelected" />
      </div>
    </div>
  </aside>
</template>
