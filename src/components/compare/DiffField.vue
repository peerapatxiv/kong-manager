<script setup lang="ts">
import { ref, computed } from 'vue'
import { isSecretField } from '../../lib/secretFields'

const props = defineProps<{ path: string; before: unknown; after: unknown }>()
const revealed = ref(false)

const lastSegment = computed(() => props.path.split(/[.[]/).filter(Boolean).pop() ?? props.path)
const shouldMask = computed(
  () => isSecretField(lastSegment.value) && typeof props.before === 'string' && typeof props.after === 'string',
)

function display(value: unknown): string {
  if (shouldMask.value && !revealed.value) return '•'.repeat(8)
  return JSON.stringify(value)
}
</script>

<template>
  <div class="flex items-center gap-2 text-xs font-mono">
    <span class="text-slate-500 w-40 shrink-0 truncate" :title="path">{{ path }}</span>
    <span class="text-red-600">{{ display(before) }}</span>
    <span class="text-slate-400">→</span>
    <span class="text-emerald-700">{{ display(after) }}</span>
    <button v-if="shouldMask" type="button" class="text-slate-400 underline" @click="revealed = !revealed">
      {{ revealed ? 'hide' : 'reveal' }}
    </button>
  </div>
</template>
