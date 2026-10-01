<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import { ref, computed } from 'vue'

const props = defineProps<{ modelValue: string | undefined; placeholder?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const revealed = ref(false)
const masked = computed(() => '•'.repeat(Math.max(8, (props.modelValue ?? '').length)))
</script>

<template>
  <div class="relative">
    <input
      :type="revealed ? 'text' : 'password'"
      :value="modelValue ?? ''"
      class="input-field pr-10 font-mono"
      :placeholder="revealed ? '' : (placeholder ?? masked)"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <button
      type="button"
      :aria-label="revealed ? 'Hide value' : 'Reveal value'"
      :aria-pressed="revealed"
      :title="revealed ? 'Hide value' : 'Reveal value'"
      class="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-ink-muted transition-colors duration-150 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40"
      @click="revealed = !revealed"
    >
      <AppIcon name="eye-off" v-if="revealed" class="h-4 w-4" />
      <AppIcon name="eye" v-else class="h-4 w-4" />
    </button>
  </div>
</template>
