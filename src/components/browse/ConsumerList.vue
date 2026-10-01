<script setup lang="ts">
import { ref, computed } from 'vue'
import type { KongConsumer } from '../../types/kong'
import { useConfigStore } from '../../stores/config'
import Badge from '../shared/Badge.vue'
import ListRow from '../shared/ListRow.vue'
import SearchInput from '../shared/SearchInput.vue'

const props = defineProps<{ consumers: KongConsumer[]; selectedUsername?: string }>()
const emit = defineEmits<{ select: [consumer: KongConsumer] }>()
const configStore = useConfigStore()

const search = ref('')
const filtered = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return props.consumers
  return props.consumers.filter((c) => {
    const haystack = [c.username, c.custom_id, ...(c.tags ?? [])].filter(Boolean).join(' ').toLowerCase()
    return haystack.includes(query)
  })
})
</script>

<template>
  <div>
    <div class="sticky top-0 z-10 bg-surface p-3 pb-2">
      <SearchInput v-model="search" placeholder="Search consumers…" />
    </div>
    <ul class="space-y-0.5 px-2 pb-3">
      <ListRow
        v-for="consumer in filtered"
        :key="consumer.username"
        :title="consumer.username"
        :selected="consumer.username === selectedUsername"
        show-check
        @click="emit('select', consumer)"
      >
        {{ consumer.username }}
        <template #trail>
          <Badge v-if="configStore.isModified(`consumer:${consumer.username}`)" variant="modified" />
        </template>
      </ListRow>
    </ul>
    <p v-if="filtered.length === 0" class="px-3 text-xs text-ink-muted">No matching consumers.</p>
  </div>
</template>
