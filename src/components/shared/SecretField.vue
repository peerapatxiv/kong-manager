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
      class="input-field flex-1 font-mono"
      :placeholder="revealed ? '' : masked"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <button
      type="button"
      class="text-xs text-link hover:text-accent-hover underline"
      @click="revealed = !revealed"
    >
      {{ revealed ? 'hide' : 'reveal' }}
    </button>
  </div>
</template>
