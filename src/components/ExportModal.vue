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
  <div v-if="open" class="fixed inset-0 bg-black/30 flex items-center justify-center z-50" @click.self="emit('close')">
    <div class="bg-white rounded-lg shadow-xl p-5 w-full max-w-md space-y-4">
      <h2 class="font-semibold text-slate-800">Generate new config</h2>
      <label class="text-xs text-slate-500 block">
        Output filename
        <input
          v-model="fileName"
          type="text"
          class="w-full border border-slate-300 rounded px-2 py-1 text-sm mt-1"
        />
      </label>
      <div class="flex justify-end gap-2">
        <button type="button" class="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900" @click="emit('close')">
          Cancel
        </button>
        <button
          type="button"
          class="px-3 py-1.5 bg-slate-800 text-white text-sm rounded hover:bg-slate-700"
          @click="confirmExport"
        >
          Download
        </button>
      </div>
    </div>
  </div>
</template>
