<script setup lang="ts">
import { ref } from 'vue'
import { readTextFile } from '../lib/readTextFile'

defineProps<{ label: string }>()
const emit = defineEmits<{ 'file-selected': [payload: { fileName: string; text: string }] }>()

const isDragOver = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)

async function readFile(file: File) {
  emit('file-selected', { fileName: file.name, text: await readTextFile(file) })
}

function onDrop(event: DragEvent) {
  isDragOver.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) readFile(file)
}

function onInputChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) readFile(file)
  ;(event.target as HTMLInputElement).value = ''
}
</script>

<template>
  <div
    class="cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-colors"
    :class="
      isDragOver
        ? 'border-accent bg-accent/10'
        : 'border-border bg-surface hover:border-accent hover:bg-accent/5'
    "
    @dragover.prevent="isDragOver = true"
    @dragleave.prevent="isDragOver = false"
    @drop.prevent="onDrop"
    @click="inputRef?.click()"
  >
    <div
      class="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent-secondary"
    >
      <svg viewBox="0 0 20 20" fill="none" class="h-5 w-5">
        <path
          d="M10 13V4m0 0L6.5 7.5M10 4l3.5 3.5M4 14v1a1 1 0 001 1h10a1 1 0 001-1v-1"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </div>
    <p class="font-medium text-ink">{{ label }}</p>
    <p class="mt-1 text-sm text-ink-muted">Drag & drop a YAML file, or click to choose one</p>
    <input ref="inputRef" type="file" accept=".yaml,.yml" class="hidden" @change="onInputChange" />
  </div>
</template>
