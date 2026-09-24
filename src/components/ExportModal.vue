<script setup lang="ts">
import { ref, watch } from 'vue'
import { useConfigStore } from '../stores/config'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const configStore = useConfigStore()

const fileName = ref('')

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) fileName.value = configStore.exportYaml().fileName
  },
)

function confirmExport() {
  const { contents } = configStore.exportYaml()
  const blob = new Blob([contents], { type: 'text/yaml' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName.value || 'kong-config-edited.yaml'
  link.click()
  URL.revokeObjectURL(url)
  emit('close')
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <div class="card w-full max-w-md space-y-4 p-6">
      <h2 class="text-lg font-semibold text-ink">Generate new config</h2>
      <label class="block text-xs text-ink-muted">
        Output filename
        <input v-model="fileName" type="text" class="input-field mt-1 font-mono" />
      </label>
      <div class="flex justify-end gap-2 pt-1">
        <button type="button" class="btn-secondary" @click="emit('close')">Cancel</button>
        <button type="button" class="btn-primary" @click="confirmExport">Download</button>
      </div>
    </div>
  </div>
</template>
