<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import FileDropZone from '../components/FileDropZone.vue'
import KongConnectForm from '../components/KongConnectForm.vue'
import StatTile from '../components/shared/StatTile.vue'
import { useConfigStore } from '../stores/config'
import type { KongAdminAuth } from '../lib/kongAdminApi'

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

async function onConnect({ baseUrl, auth }: { baseUrl: string; auth: KongAdminAuth }) {
  connecting.value = true
  connectErrorMessage.value = null
  try {
    await configStore.loadFromKongAdmin(baseUrl, auth)
  } catch (err) {
    connectErrorMessage.value = err instanceof Error ? err.message : String(err)
  } finally {
    connecting.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
    <div>
      <h2 class="text-xl font-bold text-ink">Load a Kong declarative config</h2>
      <p class="mt-1 text-sm text-ink-muted">Drop in a YAML file to browse, edit, and compare its entities.</p>
    </div>

    <FileDropZone label="Load your kong-config.yaml" @file-selected="onFileSelected" />

    <div v-if="errorMessage" class="rounded-xl border border-red-300 bg-red-50 p-3.5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
      Failed to parse YAML: {{ errorMessage }}
    </div>

    <div class="flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-ink-muted">
      <span class="h-px flex-1 bg-border" />
      or
      <span class="h-px flex-1 bg-border" />
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
