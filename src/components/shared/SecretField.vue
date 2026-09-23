<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{ modelValue: string | undefined }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const revealed = ref(false)
const masked = computed(() => '•'.repeat(Math.max(8, (props.modelValue ?? '').length)))
</script>

<template>
  <div class="flex items-center gap-2">
    <input
      :type="revealed ? 'text' : 'password'"
      :value="modelValue ?? ''"
      class="flex-1 border border-slate-300 rounded px-2 py-1 text-sm font-mono"
      :placeholder="revealed ? '' : masked"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <button
      type="button"
      class="text-xs text-slate-500 hover:text-slate-800 underline"
      @click="revealed = !revealed"
    >
      {{ revealed ? 'hide' : 'reveal' }}
    </button>
  </div>
</template>
