<script setup lang="ts">
import { ref, watch } from 'vue'
import { useConfigStore } from '../stores/config'
import SecretField from './shared/SecretField.vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const configStore = useConfigStore()

const baseUrl = ref('')
const username = ref('')
const password = ref<string | undefined>(undefined)
const confirming = ref(false)
const pushing = ref(false)
const errorMessage = ref<string | null>(null)
const success = ref(false)

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    baseUrl.value = configStore.primary?.origin === 'kong-admin' ? configStore.primary.baseUrl ?? '' : ''
    username.value = ''
    password.value = undefined
    confirming.value = false
    errorMessage.value = null
    success.value = false
  },
  { immediate: true },
)

function requestConfirm() {
  if (!baseUrl.value.trim()) return
  confirming.value = true
}

async function confirmPush() {
  pushing.value = true
  errorMessage.value = null
  try {
    await configStore.pushToKongAdmin(baseUrl.value.trim(), {
      username: username.value.trim() || undefined,
      password: password.value || undefined,
    })
    success.value = true
    confirming.value = false
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err)
  } finally {
    pushing.value = false
  }
}

function close() {
  emit('close')
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
    @click.self="close"
  >
    <div class="card w-full max-w-md space-y-4 p-6">
      <h2 class="text-lg font-semibold text-ink">Push to Kong</h2>

      <template v-if="success">
        <p class="text-sm text-ink">Config pushed to <span class="font-mono">{{ baseUrl }}</span>.</p>
        <div class="flex justify-end pt-1">
          <button type="button" class="btn-primary" @click="close">Done</button>
        </div>
      </template>

      <template v-else>
        <label class="block">
          <span class="field-label">Admin API base URL</span>
          <input v-model="baseUrl" type="text" placeholder="http://localhost:8001" class="input-field font-mono" />
        </label>
        <label class="block">
          <span class="field-label">Username (optional)</span>
          <input v-model="username" type="text" placeholder="Username" class="input-field" />
        </label>
        <label class="block">
          <span class="field-label">Password (optional)</span>
          <SecretField v-model="password" />
        </label>

        <div v-if="!confirming" class="flex justify-end gap-2 pt-1">
          <button type="button" class="btn-secondary" @click="close">Cancel</button>
          <button type="button" class="btn-primary" :disabled="!baseUrl.trim()" @click="requestConfirm">
            Push to Kong
          </button>
        </div>

        <div v-else class="space-y-3">
          <div class="rounded-xl border border-red-300 bg-red-50 p-3.5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
            This replaces the entire declarative config on <span class="font-mono">{{ baseUrl }}</span>. This cannot
            be undone from here.
          </div>
          <div
            v-if="errorMessage"
            class="rounded-xl border border-red-300 bg-red-50 p-3.5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
          >
            {{ errorMessage }}
          </div>
          <div class="flex justify-end gap-2">
            <button type="button" class="btn-secondary" :disabled="pushing" @click="confirming = false">Back</button>
            <button type="button" class="btn-primary" :disabled="pushing" @click="confirmPush">
              {{ pushing ? 'Pushing…' : 'Confirm push' }}
            </button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
