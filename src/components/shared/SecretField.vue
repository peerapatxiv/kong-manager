<script setup lang="ts">
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
      <svg v-if="revealed" viewBox="0 0 20 20" fill="none" class="h-4 w-4">
        <path
          d="M3 3l14 14M8.2 8.3a2.5 2.5 0 003.5 3.5M6 6.2C4.3 7.3 3 8.9 2.2 10c1.4 2.3 4.2 5 7.8 5 1.3 0 2.5-.4 3.5-.9M9.6 5.05c.14-.03.27-.05.4-.05 3.6 0 6.4 2.7 7.8 5-.5.8-1.2 1.7-2.1 2.4"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <svg v-else viewBox="0 0 20 20" fill="none" class="h-4 w-4">
        <path
          d="M2.2 10C3.6 7.7 6.4 5 10 5s6.4 2.7 7.8 5c-1.4 2.3-4.2 5-7.8 5s-6.4-2.7-7.8-5z"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linejoin="round"
        />
        <circle cx="10" cy="10" r="2.5" stroke="currentColor" stroke-width="1.5" />
      </svg>
    </button>
  </div>
</template>
