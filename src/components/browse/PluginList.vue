<script setup lang="ts">
import { ref, computed } from 'vue'
import type { KongPlugin } from '../../types/kong'
import { useConfigStore } from '../../stores/config'
import Badge from '../shared/Badge.vue'
import ListRow from '../shared/ListRow.vue'
import SearchInput from '../shared/SearchInput.vue'

const props = defineProps<{ plugins: KongPlugin[]; selectedName?: string }>()
const emit = defineEmits<{ select: [plugin: KongPlugin] }>()
const configStore = useConfigStore()

const search = ref('')
const filtered = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return props.plugins
  return props.plugins.filter((p) => p.name.toLowerCase().includes(query))
})
</script>

<template>
  <div>
    <div class="sticky top-0 z-10 bg-surface p-3 pb-2">
      <SearchInput v-model="search" placeholder="Search plugins…" />
    </div>
    <ul class="space-y-0.5 px-2 pb-3">
      <ListRow
        v-for="(plugin, index) in filtered"
        :key="`${plugin.name}-${index}`"
        :title="plugin.name"
        :selected="plugin.name === selectedName"
        show-check
        @click="emit('select', plugin)"
      >
        {{ plugin.name }}
        <template #trail>
          <Badge v-if="configStore.isModified(`plugin:global/${plugin.name}`)" variant="modified" />
        </template>
      </ListRow>
    </ul>
    <p v-if="filtered.length === 0" class="px-3 text-xs text-ink-muted">No matching plugins.</p>
  </div>
</template>
