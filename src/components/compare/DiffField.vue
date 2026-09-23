<script setup lang="ts">
import { ref, computed } from 'vue'
import { isSecretField, isCredentialListKey } from '../../lib/secretFields'

const props = defineProps<{ path: string; before: unknown; after: unknown }>()
const revealed = ref(false)

const pathSegments = computed(() => props.path.split(/[.[]/).filter(Boolean))
const lastSegment = computed(() => pathSegments.value[pathSegments.value.length - 1] ?? props.path)
// Mask on the field's own name, or if any ancestor in the path is a *_credentials
// list — regardless of whether before/after happen to both be strings (an added,
// removed, or newly-present secret field has an undefined/array counterpart, not
// a matching string, and must still be masked).
const shouldMask = computed(
  () => isSecretField(lastSegment.value) || pathSegments.value.some((segment) => isCredentialListKey(segment)),
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
