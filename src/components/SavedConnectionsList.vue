<script setup lang="ts">
import AppIcon from './shared/AppIcon.vue'
import { useSavedConnectionsStore } from '../stores/savedConnections'
import type { SavedConnection } from '../lib/savedConnections'

const savedConnectionsStore = useSavedConnectionsStore()
const emit = defineEmits<{ connect: [payload: { baseUrl: string; username?: string; password?: string; name?: string }] }>()

function select(conn: SavedConnection) {
  emit('connect', { baseUrl: conn.baseUrl, username: conn.username, password: conn.password, name: conn.name })
}

function displayName(conn: SavedConnection): string {
  return conn.name || conn.baseUrl.replace(/^https?:\/\//i, '')
}

function createdOn(conn: SavedConnection): string {
  return conn.createdAt ? new Date(conn.createdAt).toLocaleDateString() : '-'
}
</script>

<template>
  <div class="card space-y-2 p-3">
    <p class="section-heading">Saved Connections</p>

    <ul v-if="savedConnectionsStore.connections.length > 0" class="space-y-1.5">
      <li
        v-for="conn in savedConnectionsStore.connections"
        :key="conn.id"
        class="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border px-2.5 py-2 transition-colors duration-150 hover:border-accent hover:bg-accent/5"
        title="Connect"
        @click="select(conn)"
      >
        <span
          data-testid="connection-icon"
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent-secondary"
        >
          <AppIcon name="server" class="h-4 w-4" />
        </span>
        <div class="min-w-0 flex-1">
          <p class="flex items-center gap-1.5">
            <strong class="truncate text-sm font-semibold text-ink">{{ displayName(conn) }}</strong>
          </p>
          <p class="truncate font-mono text-xs text-ink-muted">{{ conn.baseUrl }}</p>
          <p class="text-[11px] text-ink-muted">Created on: {{ createdOn(conn) }}</p>
          <p v-if="conn.username" class="truncate text-[11px] text-ink-muted">{{ conn.username }}</p>
        </div>
        <button
          type="button"
          aria-label="Delete saved connection"
          title="Delete connection"
          class="shrink-0 text-ink-muted hover:text-red-600 dark:hover:text-red-400"
          @click.stop="savedConnectionsStore.remove(conn.id)"
        >
          <AppIcon name="trash" class="h-4 w-4" />
        </button>
      </li>
    </ul>
    <div
      v-else
      data-testid="saved-empty"
      class="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-6 text-center"
    >
      <span class="flex h-9 w-9 items-center justify-center rounded-full bg-elevated text-ink-muted">
        <AppIcon name="server" class="h-4 w-4" />
      </span>
      <p class="text-sm font-medium text-ink">No connections are saved!</p>
      <p class="text-xs text-ink-muted">Connect once and it will be saved here.</p>
    </div>

    <p class="field-help">Stored in your browser, including passwords — click a connection to reconnect instantly.</p>
  </div>
</template>
