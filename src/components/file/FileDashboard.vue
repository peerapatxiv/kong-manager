<script setup lang="ts">
import { computed } from 'vue'
import DashboardBars from '../live/DashboardBars.vue'
import DashboardTile from '../live/DashboardTile.vue'
import ServiceStatusBar from '../live/ServiceStatusBar.vue'
import { summarizeFile } from '../../lib/fileEntities'
import { useConfigStore } from '../../stores/config'

const configStore = useConfigStore()

// Everything here comes straight from the loaded file, so there is nothing to fetch or refresh.
const summary = computed(() => summarizeFile(configStore.primary?.config ?? { _format_version: '' }))
const pluginRows = computed(() => summary.value.topPlugins.map((row) => ({ label: row.name, count: row.count })))
const edits = computed(() => configStore.modifiedKeys.size)
const origin = computed(() => (configStore.primary?.origin === 'kong-admin' ? 'Pulled from Kong' : 'Uploaded file'))
</script>

<template>
  <section class="space-y-4" data-testid="file-dashboard">
    <div>
      <h3 class="text-base font-bold text-ink">Dashboard</h3>
      <p class="text-xs text-ink-muted">An overview of {{ configStore.primary?.fileName }}</p>
    </div>

    <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <DashboardTile data-testid="tile-services" label="Services" icon="server" :count="summary.services" to="/file/services" />
      <DashboardTile data-testid="tile-routes" label="Routes" icon="route" :count="summary.routes" to="/file/routes" />
      <DashboardTile data-testid="tile-consumers" label="Consumers" icon="user" :count="summary.consumers" to="/file/consumers" />
      <DashboardTile data-testid="tile-plugins" label="Plugins" icon="plug" :count="summary.plugins" to="/file/plugins" />
    </div>

    <div class="grid gap-4 lg:grid-cols-3">
      <div class="card space-y-3 p-4" data-testid="card-services">
        <p class="section-heading">Services</p>
        <ServiceStatusBar v-if="summary.serviceStatus.total > 0" :summary="summary.serviceStatus" />
        <p v-else class="text-sm text-ink-muted">No services yet</p>
      </div>

      <div class="card space-y-3 p-4" data-testid="card-routes">
        <p class="section-heading">Routes by protocol</p>
        <DashboardBars :rows="summary.protocols" empty-text="No routes yet" />
      </div>

      <div class="card space-y-3 p-4" data-testid="card-plugins">
        <p class="section-heading">Most used plugins</p>
        <DashboardBars :rows="pluginRows" empty-text="No plugins yet" />
      </div>
    </div>

    <div class="card grid grid-cols-2 gap-4 p-4 lg:grid-cols-4" data-testid="card-file">
      <div class="min-w-0">
        <p class="section-heading">File</p>
        <p class="mt-1 truncate font-semibold text-ink" :title="configStore.primary?.fileName">{{ configStore.primary?.fileName }}</p>
      </div>
      <div>
        <p class="section-heading">Format version</p>
        <p class="mt-1 font-semibold text-ink">{{ configStore.primary?.config._format_version || '–' }}</p>
      </div>
      <div>
        <p class="section-heading">Source</p>
        <p class="mt-1 font-semibold text-ink">{{ origin }}</p>
      </div>
      <div>
        <p class="section-heading">Changes</p>
        <p class="mt-1 flex items-center gap-1.5 font-semibold text-ink">
          <template v-if="edits > 0">
            <span class="h-1.5 w-1.5 rounded-full bg-accent" />
            {{ edits }} edited
          </template>
          <template v-else>No edits</template>
        </p>
      </div>
    </div>
  </section>
</template>
