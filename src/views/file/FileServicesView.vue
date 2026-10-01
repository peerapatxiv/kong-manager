<script setup lang="ts">
import { computed, ref } from 'vue'
import { useConfigStore } from '../../stores/config'
import FileGate from '../../components/file/FileGate.vue'
import LiveWorkspace from '../../components/live/LiveWorkspace.vue'
import LiveListToolbar from '../../components/live/LiveListToolbar.vue'
import ServiceDetail from '../../components/browse/ServiceDetail.vue'
import Badge from '../../components/shared/Badge.vue'
import ListRow from '../../components/shared/ListRow.vue'
import EmptyState from '../../components/shared/EmptyState.vue'
import type { KongService } from '../../types/kong'

const configStore = useConfigStore()
const search = ref('')
const selectedName = ref<string | undefined>(undefined)

const services = computed(() => configStore.primary?.config.services ?? [])
const selected = computed(() => services.value.find((s) => s.name === selectedName.value))
const label = (service: KongService) => service.name ?? service.host
const routeCount = (service: KongService) => service.routes?.length ?? 0
const routeCountTitle = (count: number) => (count === 1 ? '1 route' : `${count} routes`)

const filtered = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return services.value
  return services.value.filter((s) =>
    [s.name, s.host, s.path, ...(s.tags ?? [])].filter(Boolean).join(' ').toLowerCase().includes(query),
  )
})

function onModified() {
  if (selectedName.value) configStore.markModified(`service:${selectedName.value}`)
}

function onUpdate(updated: KongService) {
  const list = configStore.primary?.config.services
  const index = list?.findIndex((s) => s.name === selectedName.value) ?? -1
  if (!list || index === -1) return
  list[index] = updated
  // The name is editable and is also how the selection finds its service: follow a rename.
  if (updated.name !== selectedName.value) selectedName.value = updated.name
}
</script>

<template>
  <FileGate>
    <LiveWorkspace storage-key="kong-config:file-services-panel-width">
      <template #toolbar>
        <LiveListToolbar v-model:search="search" placeholder="Search services…" />
      </template>

      <template #list>
        <ul class="space-y-0.5 px-2 pb-3">
          <ListRow
            v-for="service in filtered"
            :key="service.name ?? service.host"
            data-testid="file-row"
            :title="label(service)"
            :selected="service.name === selectedName"
            @click="selectedName = service.name"
          >
            {{ label(service) }}
            <template #trail>
              <span
                v-if="routeCount(service) > 0"
                data-testid="route-count"
                class="inline-flex h-4 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-elevated px-1 text-[10px] font-semibold tabular-nums text-ink-muted"
                :title="routeCountTitle(routeCount(service))"
              >
                {{ routeCount(service) }}
              </span>
              <Badge v-if="configStore.isModified(`service:${service.name}`)" variant="modified" />
            </template>
          </ListRow>
        </ul>
      </template>

      <template #footer>
        <p v-if="filtered.length === 0" class="px-3 pb-2 text-xs text-ink-muted">No services.</p>
      </template>

      <template #detail>
        <ServiceDetail v-if="selected" :model-value="selected" @update:model-value="onUpdate" @modified="onModified" />
        <EmptyState v-else icon="server" title="Select a service from the list to view and edit it." />
      </template>
    </LiveWorkspace>
  </FileGate>
</template>
