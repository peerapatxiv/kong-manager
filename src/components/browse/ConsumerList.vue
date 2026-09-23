<script setup lang="ts">
import { ref, computed } from 'vue'
import type { KongConsumer } from '../../types/kong'
import { useConfigStore } from '../../stores/config'
import Badge from '../shared/Badge.vue'

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
  <div class="p-3">
    <input
      v-model="search"
      type="text"
      placeholder="Search consumers…"
      class="w-full border border-slate-300 rounded px-2 py-1 text-sm mb-2"
    />
    <ul class="space-y-1">
      <li
        v-for="consumer in filtered"
        :key="consumer.username"
        class="text-sm px-2 py-1.5 rounded cursor-pointer flex items-center gap-2"
        :class="consumer.username === selectedUsername ? 'bg-slate-200' : 'hover:bg-slate-100'"
        @click="emit('select', consumer)"
      >
        <span class="font-mono truncate">{{ consumer.username }}</span>
        <Badge v-if="configStore.isModified(`consumer:${consumer.username}`)" variant="modified" />
      </li>
    </ul>
    <p v-if="filtered.length === 0" class="text-xs text-slate-400 mt-2">No matching consumers.</p>
  </div>
</template>
