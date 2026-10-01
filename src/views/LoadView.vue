<script setup lang="ts">
import FileDashboard from '../components/file/FileDashboard.vue'
import LiveDashboard from '../components/live/LiveDashboard.vue'
import AppIcon from '../components/shared/AppIcon.vue'
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import FileDropZone from '../components/FileDropZone.vue'
import KongConnectForm from '../components/KongConnectForm.vue'
import SavedConnectionsList from '../components/SavedConnectionsList.vue'
import { useConfigStore } from '../stores/config'
import { useSavedConnectionsStore } from '../stores/savedConnections'
import { useConnectionStore } from '../stores/connection'
import type { KongAdminAuth } from '../lib/kongAdminApi'
import { describeConnectError } from '../lib/connectError'
import type { KongNodeInfo } from '../stores/connection'

const configStore = useConfigStore()
const savedConnectionsStore = useSavedConnectionsStore()
const connectionStore = useConnectionStore()
const errorMessage = ref<string | null>(null)
const connectErrorMessage = ref<string | null>(null)
const connecting = ref(false)
const mode = ref<'connect' | 'file'>('connect')
// Coming back to this page with a config or connection already in place should show
// it, not a blank form; Disconnect or Remove config brings the form back.
const formExpanded = ref(!(configStore.isLoaded || connectionStore.isConnected))

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
    // Ask the node what it is first. A database-backed Kong has no /config endpoint
    // (that is DB-less only), so it goes straight to live editing instead of failing.
    let info: KongNodeInfo | null = null
    try {
      await connectionStore.connect({ baseUrl, auth, name })
      info = connectionStore.info
    } catch {
      // A failed probe also drops any earlier connection, so live edits can never
      // target a different Kong than the one on screen. /config may still work.
      connectionStore.disconnect()
    }
    const databaseBacked = info !== null && info.database !== 'off' && info.database !== 'unknown'
    if (!databaseBacked) await configStore.loadFromKongAdmin(baseUrl, auth)
    savedConnectionsStore.upsert({ baseUrl, username: auth.username, password: auth.password, name })
    formExpanded.value = false
  } catch (err) {
    connectErrorMessage.value = describeConnectError(err, baseUrl)
  } finally {
    connecting.value = false
  }
}

// A live connection with no file loaded: the page is about that connection, not a config to load.
const fileSummary = computed(() => configStore.isLoaded && !formExpanded.value)
const liveSummary = computed(() => connectionStore.isConnected && !configStore.isLoaded && !formExpanded.value)

// The connection can also end from the sidebar; the page then needs its connect form back.
watch(
  () => connectionStore.isConnected,
  (connected) => {
    if (!connected && !configStore.isLoaded) formExpanded.value = true
  },
)

function removeConfig() {
  if (configStore.modifiedKeys.size > 0 && !window.confirm('You have unsaved edits — remove this config anyway?')) {
    return
  }
  configStore.clear()
  formExpanded.value = true
}

function disconnect() {
  connectionStore.disconnect()
  if (!configStore.isLoaded) formExpanded.value = true
}

function onSelectSaved({
  baseUrl,
  username,
  password,
  name,
}: {
  baseUrl: string
  username?: string
  password?: string
  name?: string
}) {
  onConnect({ baseUrl, auth: { username, password }, name })
}
</script>

<template>
  <div class="space-y-4 p-4 sm:p-6">
    <div>
      <h2 class="text-xl font-bold text-ink">{{ liveSummary ? 'Live Kong connection' : fileSummary ? 'Your Kong config' : 'Load a Kong declarative config' }}</h2>
      <p class="mt-1 text-sm text-ink-muted">
        {{
          liveSummary
            ? 'You are connected. Use the Live links in the sidebar, or check the dashboard below.'
            : fileSummary
              ? 'Everything below comes from this file. Use the File pages in the sidebar to browse and edit it.'
              : !formExpanded
              ? 'Browse this config below, or change your source to load something else.'
              : mode === 'connect'
                ? 'Pull the live declarative config from a running Kong instance (DB-less mode), or switch to load a YAML file.'
                : 'Drop in a YAML file to browse, edit, and compare its entities.'
        }}
      </p>
    </div>

    <div
      v-if="connectionStore.isConnected && !configStore.isLoaded"
      data-testid="live-connected"
      class="card space-y-4 p-5"
    >
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex min-w-0 items-center gap-3.5">
          <span class="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent-secondary">
            <AppIcon name="plug" class="h-5 w-5" />
            <span class="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-surface" />
          </span>
          <div class="min-w-0">
            <h3 class="truncate font-bold text-ink">
              Connected: <span class="font-mono">{{ connectionStore.active?.baseUrl }}</span>
            </h3>
            <p v-if="connectionStore.active?.name" class="truncate text-sm text-ink-muted">{{ connectionStore.active.name }}</p>
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <button type="button" class="btn-danger-outline btn-sm" @click="disconnect">
            <AppIcon name="x" class="h-3.5 w-3.5" />
            Disconnect
          </button>
        </div>
      </div>

      <div class="flex flex-wrap gap-2 text-xs font-medium" data-testid="live-badges">
        <span class="rounded-full bg-elevated px-2.5 py-1 text-ink">Kong {{ connectionStore.info?.version }}</span>
        <span class="rounded-full bg-elevated px-2.5 py-1 text-ink">{{ connectionStore.info?.database }}</span>
        <span
          class="rounded-full px-2.5 py-1"
          :class="connectionStore.canWrite ? 'bg-accent/15 text-accent-secondary dark:text-accent' : 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'"
        >
          {{ connectionStore.canWrite ? 'Read & write' : 'Read-only' }}
        </span>
      </div>
    </div>

    <LiveDashboard v-if="connectionStore.isConnected && !configStore.isLoaded" />

    <div v-if="configStore.isLoaded" class="card space-y-5 p-5">
      <div class="flex items-center justify-between gap-2.5">
        <div class="flex items-center gap-2.5">
          <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent-secondary">
            <AppIcon name="check" class="h-3.5 w-3.5" />
          </span>
          <h3 class="font-bold text-ink">
            Loaded: <span class="font-mono">{{ configStore.primary?.fileName }}</span>
          </h3>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <button v-if="connectionStore.isConnected" type="button" class="btn-danger-outline btn-sm" @click="disconnect">
            <AppIcon name="x" class="h-3.5 w-3.5" />
            Disconnect
          </button>
          <button type="button" class="btn-danger-outline btn-sm" @click="removeConfig">
            <AppIcon name="trash" class="h-3.5 w-3.5" />
            Remove config
          </button>
        </div>
      </div>

      <div v-if="connectionStore.isConnected" class="flex flex-wrap gap-2">
        <RouterLink to="/live/services" class="btn-secondary">Open live services</RouterLink>
      </div>
    </div>

    <FileDashboard v-if="configStore.isLoaded" />

    <div v-if="formExpanded" class="space-y-4">
      <div v-if="configStore.isLoaded" class="flex items-center justify-between gap-2">
        <h3 class="section-heading">Load a different source</h3>
        <button type="button" class="btn-secondary btn-sm" @click="formExpanded = false">
          <AppIcon name="x" class="h-3.5 w-3.5" />
          Cancel
        </button>
      </div>

        <div class="inline-flex gap-1 rounded-xl border border-border bg-surface p-1">
          <button
            type="button"
            class="pill-tab inline-flex items-center gap-1.5"
            :class="mode === 'connect' ? 'pill-tab-active' : 'pill-tab-inactive'"
            @click="mode = 'connect'"
          >
            <AppIcon name="link" class="h-3.5 w-3.5" />
            Connect to Kong
          </button>
          <button
            type="button"
            class="pill-tab inline-flex items-center gap-1.5"
            :class="mode === 'file' ? 'pill-tab-active' : 'pill-tab-inactive'"
            @click="mode = 'file'"
          >
            <AppIcon name="upload" class="h-3.5 w-3.5" />
            Upload file
          </button>
        </div>

      <div :class="configStore.isLoaded || mode !== 'connect' ? '' : 'grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6'">
      <div
        data-testid="load-main"
        class="space-y-4"
        :class="{ 'lg:col-span-2': !configStore.isLoaded && mode === 'connect' }"
      >
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

      <div v-if="!configStore.isLoaded && mode === 'connect'" data-testid="saved-column" class="space-y-3">
        <SavedConnectionsList @connect="onSelectSaved" />
      </div>
      </div>
    </div>
  </div>
</template>
