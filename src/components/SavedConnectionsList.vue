<script setup lang="ts">
import { useSavedConnectionsStore } from '../stores/savedConnections'
import type { SavedConnection } from '../lib/savedConnections'

const savedConnectionsStore = useSavedConnectionsStore()
const emit = defineEmits<{ connect: [payload: { baseUrl: string; username?: string; password?: string }] }>()

function select(conn: SavedConnection) {
  emit('connect', { baseUrl: conn.baseUrl, username: conn.username, password: conn.password })
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
          <svg viewBox="0 0 20 20" fill="none" class="h-4 w-4">
            <rect x="3" y="4" width="14" height="4.5" rx="1.2" stroke="currentColor" stroke-width="1.5" />
            <rect x="3" y="11.5" width="14" height="4.5" rx="1.2" stroke="currentColor" stroke-width="1.5" />
            <path d="M6 6.25h.01M6 13.75h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
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
          <svg viewBox="0 0 20 20" fill="none" class="h-4 w-4">
            <path
              d="M4 6h12M8 6V4.5a1 1 0 011-1h2a1 1 0 011 1V6m2 0-.7 9.1a1.5 1.5 0 01-1.5 1.4H7.2a1.5 1.5 0 01-1.5-1.4L5 6"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      </li>
    </ul>
    <p v-else class="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-ink-muted">
      No connections are saved!
    </p>

    <p class="field-help">Stored in your browser, including passwords — click a connection to reconnect instantly.</p>
  </div>
</template>
