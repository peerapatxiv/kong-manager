<script setup lang="ts">
import { ref, computed } from 'vue'
import type { KongService } from '../../types/kong'
import { useConfigStore } from '../../stores/config'
import Badge from '../shared/Badge.vue'

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
  <div class="p-3">
    <input
      v-model="search"
      type="text"
      placeholder="Search services…"
      class="w-full border border-slate-300 rounded px-2 py-1 text-sm mb-2"
    />
    <ul class="space-y-1">
      <li
        v-for="service in filtered"
        :key="service.name"
        class="text-sm px-2 py-1.5 rounded cursor-pointer flex items-center gap-2"
        :class="service.name === selectedName ? 'bg-slate-200' : 'hover:bg-slate-100'"
        @click="emit('select', service)"
      >
        <span class="font-mono truncate">{{ service.name }}</span>
        <Badge v-if="configStore.isModified(`service:${service.name}`)" variant="modified" />
      </li>
    </ul>
    <p v-if="filtered.length === 0" class="text-xs text-slate-400 mt-2">No matching services.</p>
  </div>
</template>
