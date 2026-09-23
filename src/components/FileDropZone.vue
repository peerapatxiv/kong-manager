<script setup lang="ts">
import { ref } from 'vue'

defineProps<{ label: string }>()
const emit = defineEmits<{ 'file-selected': [payload: { fileName: string; text: string }] }>()

const isDragOver = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)

function readFile(file: File) {
  const reader = new FileReader()
  reader.onload = () => {
    emit('file-selected', { fileName: file.name, text: String(reader.result ?? '') })
  }
  reader.readAsText(file)
}

function onDrop(event: DragEvent) {
  isDragOver.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) readFile(file)
}

function onInputChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) readFile(file)
}
</script>

<template>
  <div
    class="border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors"
    :class="isDragOver ? 'border-slate-500 bg-slate-100' : 'border-slate-300 bg-white'"
    @dragover.prevent="isDragOver = true"
    @dragleave.prevent="isDragOver = false"
    @drop.prevent="onDrop"
    @click="inputRef?.click()"
  >
    <p class="text-slate-600">{{ label }}</p>
    <p class="text-sm text-slate-400 mt-1">Drag & drop a YAML file, or click to choose one</p>
    <input ref="inputRef" type="file" accept=".yaml,.yml" class="hidden" @change="onInputChange" />
  </div>
</template>
