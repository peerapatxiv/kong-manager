<script setup lang="ts">
import { computed, onMounted } from 'vue'
import AppIcon from '../shared/AppIcon.vue'
import DashboardBars from './DashboardBars.vue'
import DashboardTile from './DashboardTile.vue'
import { useLiveDashboard } from '../../composables/useLiveDashboard'
import { countRouteProtocols, summarizeServices, topPlugins } from '../../lib/live/dashboard'
import { useConnectionStore } from '../../stores/connection'

const connection = useConnectionStore()
const { services, routes, consumers, plugins, node, updatedAt, loading, refresh } = useLiveDashboard()

const serviceSummary = computed(() => (services.value.data ? summarizeServices(services.value.data) : null))
const protocolRows = computed(() => countRouteProtocols(routes.value.data ?? []))
const pluginRows = computed(() => topPlugins(plugins.value.data ?? []).map((row) => ({ label: row.name, count: row.count })))
const enabledPercent = computed(() =>
  serviceSummary.value && serviceSummary.value.total > 0 ? (serviceSummary.value.enabled / serviceSummary.value.total) * 100 : 0,
)

const updatedLabel = computed(() => updatedAt.value?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
const target = computed(() => connection.active?.name || connection.active?.baseUrl.replace(/^https?:\/\//i, '') || '')
const requests = computed(() => (node.value.data?.totalRequests ?? 0).toLocaleString('en-US'))

onMounted(refresh)
</script>

<template>
  <section class="space-y-4" data-testid="live-dashboard">
    <div class="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h3 class="text-base font-bold text-ink">Dashboard</h3>
        <p class="text-xs text-ink-muted">A live overview of {{ target }}</p>
      </div>
      <div class="flex items-center gap-3">
        <span v-if="updatedLabel" class="text-xs text-ink-muted">Updated {{ updatedLabel }}</span>
        <button type="button" class="btn-secondary btn-sm" data-testid="dashboard-refresh" :disabled="loading" @click="refresh">
          <AppIcon name="refresh" class="h-3.5 w-3.5" :class="loading ? 'animate-spin' : ''" />
          Refresh
        </button>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <DashboardTile data-testid="tile-services" label="Services" icon="server" :section="services" to="/live/services" />
      <DashboardTile data-testid="tile-routes" label="Routes" icon="route" :section="routes" to="/live/routes" />
      <DashboardTile data-testid="tile-consumers" label="Consumers" icon="user" :section="consumers" to="/live/consumers" />
      <DashboardTile data-testid="tile-plugins" label="Plugins" icon="plug" :section="plugins" />
    </div>

    <div class="grid gap-4 lg:grid-cols-3">
      <div class="card space-y-3 p-4" data-testid="card-services">
        <p class="section-heading">Services</p>
        <template v-if="serviceSummary && serviceSummary.total > 0">
          <div class="flex h-2.5 overflow-hidden rounded-full bg-elevated">
            <div class="h-full bg-accent transition-all duration-300" :style="{ width: `${enabledPercent}%` }" />
          </div>
          <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
            <span class="inline-flex items-center gap-1.5">
              <span class="h-2 w-2 rounded-full bg-accent" />
              {{ serviceSummary.enabled }} enabled
            </span>
            <span class="inline-flex items-center gap-1.5">
              <span class="h-2 w-2 rounded-full bg-ink-muted/40" />
              {{ serviceSummary.disabled }} disabled
            </span>
          </div>
        </template>
        <p v-else-if="services.error" class="text-sm text-ink-muted">Unavailable</p>
        <p v-else class="text-sm text-ink-muted">{{ services.loading ? 'Loading…' : 'No services yet' }}</p>
      </div>

      <div class="card space-y-3 p-4" data-testid="card-routes">
        <p class="section-heading">Routes by protocol</p>
        <DashboardBars :rows="protocolRows" :empty-text="routes.loading ? 'Loading…' : routes.error ? 'Unavailable' : 'No routes yet'" />
      </div>

      <div class="card space-y-3 p-4" data-testid="card-plugins">
        <p class="section-heading">Most used plugins</p>
        <DashboardBars :rows="pluginRows" :empty-text="plugins.loading ? 'Loading…' : plugins.error ? 'Unavailable' : 'No plugins yet'" />
      </div>
    </div>

    <div v-if="node.data" class="card grid grid-cols-2 gap-4 p-4 lg:grid-cols-4" data-testid="card-node">
      <div>
        <p class="section-heading">Kong</p>
        <p class="mt-1 font-semibold text-ink">{{ connection.info?.version ?? '–' }}</p>
      </div>
      <div>
        <p class="section-heading">Database</p>
        <p class="mt-1 flex items-center gap-1.5 font-semibold text-ink">
          {{ connection.info?.database ?? '–' }}
          <span
            v-if="node.data.databaseReachable !== undefined"
            class="inline-flex items-center gap-1 text-xs font-medium"
            :class="node.data.databaseReachable ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'"
          >
            <span class="h-1.5 w-1.5 rounded-full" :class="node.data.databaseReachable ? 'bg-emerald-500' : 'bg-red-500'" />
            {{ node.data.databaseReachable ? 'reachable' : 'unreachable' }}
          </span>
        </p>
      </div>
      <div>
        <p class="section-heading">Requests handled</p>
        <p class="mt-1 font-semibold tabular-nums text-ink">{{ node.data.totalRequests === undefined ? '–' : requests }}</p>
      </div>
      <div>
        <p class="section-heading">Active connections</p>
        <p class="mt-1 font-semibold tabular-nums text-ink">{{ node.data.activeConnections ?? '–' }}</p>
      </div>
    </div>
  </section>
</template>
