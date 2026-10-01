<script setup lang="ts">
import { computed, ref } from 'vue'
import { useConfigStore } from '../../stores/config'
import { listRoutes } from '../../lib/fileEntities'
import type { RouteEntry } from '../../lib/fileEntities'
import FileGate from '../../components/file/FileGate.vue'
import LiveWorkspace from '../../components/live/LiveWorkspace.vue'
import LiveListToolbar from '../../components/live/LiveListToolbar.vue'
import RouteCard from '../../components/browse/RouteCard.vue'
import Badge from '../../components/shared/Badge.vue'
import DetailHeader from '../../components/shared/DetailHeader.vue'
import DraftBar from '../../components/shared/DraftBar.vue'
import DraftPane from '../../components/shared/DraftPane.vue'
import ListRow from '../../components/shared/ListRow.vue'
import EmptyState from '../../components/shared/EmptyState.vue'
import type { KongRoute } from '../../types/kong'

const configStore = useConfigStore()
const search = ref('')
const selectedId = ref<string | undefined>(undefined)
const pane = ref<{ dirty: boolean; justSaved: boolean; save: () => void; discard: () => void } | null>(null)

const entries = computed(() => (configStore.primary ? listRoutes(configStore.primary.config) : []))
const selected = computed(() => entries.value.find((entry) => entry.id === selectedId.value))

const filtered = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return entries.value
  return entries.value.filter((entry) =>
    [entry.label, entry.serviceName, ...(entry.route.paths ?? []), ...(entry.route.hosts ?? [])]
      .join(' ')
      .toLowerCase()
      .includes(query),
  )
})

function select(entry: RouteEntry) {
  if (entry.id === selectedId.value) return
  if (pane.value?.dirty && !window.confirm('Discard your unsaved changes?')) return
  selectedId.value = entry.id
}

function save(entry: RouteEntry, next: KongRoute) {
  entry.replace(next)
  configStore.markModified(entry.modifiedKey)
}
</script>

<template>
  <FileGate>
    <LiveWorkspace storage-key="kong-config:file-routes-panel-width">
      <template #toolbar>
        <LiveListToolbar v-model:search="search" placeholder="Search routes…" />
      </template>

      <template #list>
        <ul class="space-y-0.5 px-2 pb-3">
          <ListRow
            v-for="entry in filtered"
            :key="entry.id"
            data-testid="file-row"
            :title="entry.label"
            :selected="entry.id === selectedId"
            @click="select(entry)"
          >
            {{ entry.label }}
            <template #trail>
              <Badge v-if="configStore.isModified(entry.modifiedKey)" variant="modified" />
            </template>
          </ListRow>
        </ul>
      </template>

      <template #footer>
        <p v-if="filtered.length === 0" class="px-3 pb-2 text-xs text-ink-muted">No routes.</p>
      </template>

      <template #detail>
        <div v-if="selected" class="max-w-4xl space-y-4">
          <DetailHeader
            :initial="selected.label.charAt(0)"
            :title="selected.label"
            :subtitle="`Service: ${selected.serviceName}`"
          />
          <DraftPane
            ref="pane"
            :model-value="selected.route"
            :reset-key="selected.id"
            @save="(next) => save(selected!, next)"
          >
            <template #default="{ draft, update }">
              <RouteCard :model-value="draft" :service-name="selected.serviceName" default-expanded @update:model-value="update" />
            </template>
          </DraftPane>
        </div>
        <EmptyState v-else icon="route" title="Select a route from the list to view and edit it." />
      </template>

      <template v-if="selected" #detail-footer>
        <DraftBar
          :dirty="pane?.dirty ?? false"
          :just-saved="pane?.justSaved ?? false"
          @save="pane?.save()"
          @discard="pane?.discard()"
        />
      </template>
    </LiveWorkspace>
  </FileGate>
</template>
