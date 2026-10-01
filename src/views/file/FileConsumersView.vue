<script setup lang="ts">
import { computed, ref } from 'vue'
import { useConfigStore } from '../../stores/config'
import FileGate from '../../components/file/FileGate.vue'
import LiveWorkspace from '../../components/live/LiveWorkspace.vue'
import LiveListToolbar from '../../components/live/LiveListToolbar.vue'
import ConsumerDetail from '../../components/browse/ConsumerDetail.vue'
import Badge from '../../components/shared/Badge.vue'
import ListRow from '../../components/shared/ListRow.vue'
import EmptyState from '../../components/shared/EmptyState.vue'
import type { KongConsumer } from '../../types/kong'

const configStore = useConfigStore()
const search = ref('')
const selectedUsername = ref<string | undefined>(undefined)

const consumers = computed(() => configStore.primary?.config.consumers ?? [])
const selected = computed(() => consumers.value.find((c) => c.username === selectedUsername.value))
const label = (consumer: KongConsumer) => consumer.username ?? consumer.custom_id ?? ''

const filtered = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return consumers.value
  return consumers.value.filter((c) =>
    [c.username, c.custom_id, ...(c.tags ?? [])].filter(Boolean).join(' ').toLowerCase().includes(query),
  )
})

function onModified() {
  if (selectedUsername.value) configStore.markModified(`consumer:${selectedUsername.value}`)
}

function onUpdate(updated: KongConsumer) {
  const list = configStore.primary?.config.consumers
  const index = list?.findIndex((c) => c.username === selectedUsername.value) ?? -1
  if (!list || index === -1) return
  list[index] = updated
  // The username is editable and is also how the selection finds its consumer: follow a rename.
  if (updated.username !== selectedUsername.value) selectedUsername.value = updated.username
}
</script>

<template>
  <FileGate>
    <LiveWorkspace storage-key="kong-config:file-consumers-panel-width">
      <template #toolbar>
        <LiveListToolbar v-model:search="search" placeholder="Search consumers…" />
      </template>

      <template #list>
        <ul class="space-y-0.5 px-2 pb-3">
          <ListRow
            v-for="consumer in filtered"
            :key="label(consumer)"
            data-testid="file-row"
            :title="label(consumer)"
            :selected="consumer.username === selectedUsername"
            @click="selectedUsername = consumer.username"
          >
            {{ label(consumer) }}
            <template #trail>
              <Badge v-if="configStore.isModified(`consumer:${consumer.username}`)" variant="modified" />
            </template>
          </ListRow>
        </ul>
      </template>

      <template #footer>
        <p v-if="filtered.length === 0" class="px-3 pb-2 text-xs text-ink-muted">No consumers.</p>
      </template>

      <template #detail>
        <ConsumerDetail v-if="selected" :model-value="selected" @update:model-value="onUpdate" @modified="onModified" />
        <EmptyState v-else icon="user" title="Select a consumer from the list to view and edit it." />
      </template>
    </LiveWorkspace>
  </FileGate>
</template>
