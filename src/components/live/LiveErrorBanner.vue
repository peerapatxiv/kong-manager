<script setup lang="ts">
import { computed } from 'vue'
import type { LiveError } from '../../composables/useLiveEntities'

const props = defineProps<{ messages?: string[]; error?: LiveError | null }>()

const fieldLines = computed(() =>
  Object.entries(props.error?.fields ?? {}).map(
    ([field, problem]) => `${field}: ${typeof problem === 'string' ? problem : JSON.stringify(problem)}`,
  ),
)
const visible = computed(() => (props.messages?.length ?? 0) > 0 || Boolean(props.error))
</script>

<template>
  <div
    v-if="visible"
    role="alert"
    class="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
  >
    <p v-for="message in messages ?? []" :key="message">{{ message }}</p>
    <template v-if="error">
      <p>{{ error.message }}</p>
      <ul v-if="fieldLines.length > 0" class="mt-1 list-disc pl-5 text-xs">
        <li v-for="line in fieldLines" :key="line">{{ line }}</li>
      </ul>
    </template>
  </div>
</template>
