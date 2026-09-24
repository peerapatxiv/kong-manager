<script setup lang="ts">
import { ref, computed } from 'vue'
import type { KongPlugin } from '../../types/kong'
import { useConfigStore } from '../../stores/config'
import Badge from '../shared/Badge.vue'
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
      <li
        v-for="(plugin, index) in filtered"
        :key="`${plugin.name}-${index}`"
        :title="plugin.name"
        class="flex cursor-pointer items-center gap-2 rounded-lg border-l-2 py-1.5 pl-2 pr-2 text-sm transition-colors duration-150"
        :class="
          plugin.name === selectedName
            ? 'border-accent bg-accent/10 font-medium text-link'
            : 'border-transparent text-ink-muted hover:bg-elevated'
        "
        @click="emit('select', plugin)"
      >
        <span class="min-w-0 flex-1 truncate font-mono">{{ plugin.name }}</span>
        <Badge v-if="configStore.isModified(`plugin:global/${plugin.name}`)" variant="modified" />
        <svg
          v-if="plugin.name === selectedName"
          class="h-3.5 w-3.5 shrink-0 text-accent-secondary"
          viewBox="0 0 16 16"
          fill="none"
        >
          <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </li>
    </ul>
    <p v-if="filtered.length === 0" class="px-3 text-xs text-ink-muted">No matching plugins.</p>
  </div>
</template>
