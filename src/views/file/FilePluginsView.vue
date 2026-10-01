<script setup lang="ts">
import { computed, ref } from 'vue'
import { useConfigStore } from '../../stores/config'
import { listPlugins } from '../../lib/fileEntities'
import type { PluginEntry } from '../../lib/fileEntities'
import FileGate from '../../components/file/FileGate.vue'
import LiveWorkspace from '../../components/live/LiveWorkspace.vue'
import LiveListToolbar from '../../components/live/LiveListToolbar.vue'
import Badge from '../../components/shared/Badge.vue'
import DetailHeader from '../../components/shared/DetailHeader.vue'
import DraftPane from '../../components/shared/DraftPane.vue'
import ListRow from '../../components/shared/ListRow.vue'
import EmptyState from '../../components/shared/EmptyState.vue'
import PluginEditor from '../../components/shared/PluginEditor.vue'
import type { KongPlugin } from '../../types/kong'

const configStore = useConfigStore()
const search = ref('')
const selectedId = ref<string | undefined>(undefined)
const pane = ref<{ dirty: boolean } | null>(null)

const entries = computed(() => (configStore.primary ? listPlugins(configStore.primary.config) : []))
const selected = computed(() => entries.value.find((entry) => entry.id === selectedId.value))

// Names repeat across levels, so what a plugin applies to is part of what you can search for.
const filtered = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return entries.value
  return entries.value.filter((entry) =>
    [entry.plugin.name, entry.scope.label, ...(entry.plugin.tags ?? [])].join(' ').toLowerCase().includes(query),
  )
})

const appliesTo = (entry: PluginEntry) =>
  entry.scope.kind === 'global' ? 'Applies to everything (global)' : `Applies to ${entry.scope.kind}: ${entry.scope.label}`

function select(entry: PluginEntry) {
  if (entry.id === selectedId.value) return
  if (pane.value?.dirty && !window.confirm('Discard your unsaved changes?')) return
  selectedId.value = entry.id
}

function save(entry: PluginEntry, next: KongPlugin) {
  entry.replace(next)
  configStore.markModified(entry.modifiedKey)
}
</script>

<template>
  <FileGate>
    <LiveWorkspace storage-key="kong-config:file-plugins-panel-width">
      <template #toolbar>
        <LiveListToolbar v-model:search="search" placeholder="Search plugins…" />
      </template>

      <template #list>
        <ul class="space-y-0.5 px-2 pb-3">
          <ListRow
            v-for="entry in filtered"
            :key="entry.id"
            data-testid="file-row"
            :title="entry.plugin.name"
            :selected="entry.id === selectedId"
            @click="select(entry)"
          >
            {{ entry.plugin.name }}
            <template #trail>
              <Badge v-if="configStore.isModified(entry.modifiedKey)" variant="modified" />
            </template>
          </ListRow>
        </ul>
      </template>

      <template #footer>
        <p v-if="filtered.length === 0" class="px-3 pb-2 text-xs text-ink-muted">No plugins.</p>
      </template>

      <template #detail>
        <div v-if="selected" class="max-w-4xl space-y-4">
          <DetailHeader :initial="selected.plugin.name.charAt(0)" :title="selected.plugin.name" :subtitle="appliesTo(selected)" />
          <DraftPane
            ref="pane"
            :model-value="selected.plugin"
            :reset-key="selected.id"
            @save="(next) => save(selected!, next)"
          >
            <template #default="{ draft, update }">
              <PluginEditor :model-value="draft" @update:model-value="update" />
            </template>
          </DraftPane>
        </div>
        <EmptyState v-else icon="plug" title="Select a plugin from the list to view and edit it." />
      </template>
    </LiveWorkspace>
  </FileGate>
</template>
