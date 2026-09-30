<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import FileDropZone from '../components/FileDropZone.vue'
import KongConnectForm from '../components/KongConnectForm.vue'
import SavedConnectionsList from '../components/SavedConnectionsList.vue'
import StatTile from '../components/shared/StatTile.vue'
import { useConfigStore } from '../stores/config'
import { useSavedConnectionsStore } from '../stores/savedConnections'
import { useConnectionStore } from '../stores/connection'
import type { KongAdminAuth } from '../lib/kongAdminApi'

const configStore = useConfigStore()
const savedConnectionsStore = useSavedConnectionsStore()
const connectionStore = useConnectionStore()
const router = useRouter()
const errorMessage = ref<string | null>(null)
const connectErrorMessage = ref<string | null>(null)
const connecting = ref(false)
const mode = ref<'connect' | 'file'>('connect')
const formExpanded = ref(true)

function onFileSelected({ fileName, text }: { fileName: string; text: string }) {
  try {
    configStore.loadPrimary(fileName, text)
    errorMessage.value = null
    formExpanded.value = false
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err)
  }
}

type ConnectRequest = {
  baseUrl: string
  auth: KongAdminAuth
  name?: string
}

async function onConnect({ baseUrl, auth, name }: ConnectRequest) {
  connecting.value = true
  connectErrorMessage.value = null
  try {
    await configStore.loadFromKongAdmin(baseUrl, auth)
    savedConnectionsStore.upsert({
      baseUrl,
      username: auth.username,
      password: auth.password,
      name,
    })
    // Probe the node in the background so live editing can be enabled; a failed
    // probe must not affect the config that was just loaded.
    // A failed probe also drops any earlier connection, so live edits can never
    // target a different Kong than the config now on screen.
    void connectionStore.connect({ baseUrl, auth }).catch(() => connectionStore.disconnect())
    formExpanded.value = false
  } catch (err) {
    connectErrorMessage.value = err instanceof Error ? err.message : String(err)
  } finally {
    connecting.value = false
  }
}

function onSelectSaved({ baseUrl, username, password }: { baseUrl: string; username?: string; password?: string }) {
  onConnect({ baseUrl, auth: { username, password } })
}
</script>

<template>
  <div class="space-y-4 p-4 sm:p-6">
    <div>
      <h2 class="text-xl font-bold text-ink">Load a Kong declarative config</h2>
      <p class="mt-1 text-sm text-ink-muted">
        {{
          !formExpanded
            ? 'Browse this config below, or change your source to load something else.'
            : mode === 'connect'
              ? 'Pull the live declarative config from a running Kong instance (DB-less mode), or switch to load a YAML file.'
              : 'Drop in a YAML file to browse, edit, and compare its entities.'
        }}
      </p>
    </div>

    <div
      v-if="formExpanded"
      :class="configStore.isLoaded || mode !== 'connect' ? '' : 'grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6'"
    >
      <div
        data-testid="load-main"
        class="space-y-4"
        :class="{ 'lg:col-span-2': !configStore.isLoaded && mode === 'connect' }"
      >
        <div class="inline-flex gap-1 rounded-xl border border-border bg-surface p-1">
          <button
            type="button"
            class="pill-tab inline-flex items-center gap-1.5"
            :class="mode === 'connect' ? 'pill-tab-active' : 'pill-tab-inactive'"
            @click="mode = 'connect'"
          >
            <svg viewBox="0 0 20 20" fill="none" class="h-3.5 w-3.5">
              <path
                d="M7.5 12.5l5-5M6.5 8.379L5.086 6.964a2.5 2.5 0 113.535-3.535l1.415 1.414M13.5 11.621l1.414 1.415a2.5 2.5 0 11-3.535 3.535l-1.415-1.414"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            Connect to Kong
          </button>
          <button
            type="button"
            class="pill-tab inline-flex items-center gap-1.5"
            :class="mode === 'file' ? 'pill-tab-active' : 'pill-tab-inactive'"
            @click="mode = 'file'"
          >
            <svg viewBox="0 0 20 20" fill="none" class="h-3.5 w-3.5">
              <path
                d="M10 13V4m0 0L6.5 7.5M10 4l3.5 3.5M4 14v1a1 1 0 001 1h10a1 1 0 001-1v-1"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            Upload file
          </button>
        </div>

        <template v-if="mode === 'connect'">
          <KongConnectForm :connecting="connecting" @connect="onConnect" />

          <div
            v-if="connectErrorMessage"
            class="rounded-xl border border-red-300 bg-red-50 p-3.5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
          >
            Failed to connect to Kong Admin API: {{ connectErrorMessage }}
          </div>
        </template>

        <template v-else>
          <div class="card space-y-4 border-t-2 border-t-accent p-5">
            <FileDropZone label="Load your kong-config.yaml" @file-selected="onFileSelected" />
            <p class="field-help">
              Runs entirely in your browser — the file and its secrets never leave your machine.
            </p>
          </div>

          <div v-if="errorMessage" class="rounded-xl border border-red-300 bg-red-50 p-3.5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
            Failed to parse YAML: {{ errorMessage }}
          </div>
        </template>
      </div>

      <div v-if="!configStore.isLoaded && mode === 'connect'" data-testid="saved-column" class="space-y-3 lg:mt-14">
        <SavedConnectionsList @connect="onSelectSaved" />
      </div>
    </div>

    <div v-if="configStore.isLoaded" class="card space-y-5 p-5">
      <div class="flex items-center justify-between gap-2.5">
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
        <button
          v-if="!formExpanded"
          type="button"
          class="shrink-0 text-xs font-medium text-link underline hover:text-accent-hover"
          @click="formExpanded = true"
        >
          Change source
        </button>
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
