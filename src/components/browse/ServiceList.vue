<script setup lang="ts">
import { ref, computed } from 'vue'
import type { KongService } from '../../types/kong'
import { useConfigStore } from '../../stores/config'
import Badge from '../shared/Badge.vue'
import ListRow from '../shared/ListRow.vue'
import SearchInput from '../shared/SearchInput.vue'

const props = defineProps<{ services: KongService[]; selectedName?: string }>()
const emit = defineEmits<{ select: [service: KongService] }>()
const configStore = useConfigStore()

const search = ref('')
const filtered = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return props.services
  return props.services.filter((s) => {
    const haystack = [s.name, s.host, s.path, ...(s.tags ?? [])].filter(Boolean).join(' ').toLowerCase()
    return haystack.includes(query)
  })
})
</script>

<template>
  <div>
    <div class="sticky top-0 z-10 bg-surface p-3 pb-2">
      <SearchInput v-model="search" placeholder="Search services…" />
    </div>
    <ul class="space-y-0.5 px-2 pb-3">
      <ListRow
        v-for="service in filtered"
        :key="service.name"
        :title="service.name"
        :selected="service.name === selectedName"
        show-check
        @click="emit('select', service)"
      >
        {{ service.name }}
        <template #trail>
          <span
            v-if="(service.routes ?? []).length > 0"
            class="inline-flex h-4 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-elevated px-1 text-[10px] font-semibold tabular-nums text-ink-muted"
            :title="`${service.routes!.length} route${service.routes!.length === 1 ? '' : 's'}`"
          >
            {{ service.routes!.length }}
          </span>
          <Badge v-if="configStore.isModified(`service:${service.name}`)" variant="modified" />
        </template>
      </ListRow>
    </ul>
    <p v-if="filtered.length === 0" class="px-3 text-xs text-ink-muted">No matching services.</p>
  </div>
</template>
