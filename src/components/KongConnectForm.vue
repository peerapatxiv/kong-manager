<script setup lang="ts">
import { ref } from 'vue'
import SecretField from './shared/SecretField.vue'
import type { KongAdminAuth } from '../lib/kongAdminApi'

defineProps<{ connecting: boolean }>()
const emit = defineEmits<{ connect: [payload: { baseUrl: string; auth: KongAdminAuth }] }>()

const baseUrl = ref('')
const token = ref<string | undefined>(undefined)
const username = ref('')
const password = ref<string | undefined>(undefined)

function submit() {
  const trimmed = baseUrl.value.trim()
  if (!trimmed) return
  emit('connect', {
    baseUrl: trimmed,
    auth: {
      token: token.value || undefined,
      username: username.value.trim() || undefined,
      password: password.value || undefined,
    },
  })
}
</script>

<template>
  <div class="card space-y-3 p-4">
    <h3 class="text-sm font-medium text-ink">Connect to Kong Admin API</h3>
    <p class="text-xs text-ink-muted">
      Pull the live declarative config from a running Kong instance (DB-less mode).
    </p>
    <label class="block">
      <span class="field-label">Admin API base URL</span>
      <input
        v-model="baseUrl"
        type="text"
        placeholder="http://localhost:8001"
        class="input-field font-mono"
        @keyup.enter="submit"
      />
    </label>
    <label class="block">
      <span class="field-label">Admin token (optional)</span>
      <SecretField v-model="token" />
    </label>
    <label class="block">
      <span class="field-label">Username (optional)</span>
      <input v-model="username" type="text" placeholder="Username" class="input-field" @keyup.enter="submit" />
    </label>
    <label class="block">
      <span class="field-label">Password (optional)</span>
      <SecretField v-model="password" />
    </label>
    <button type="button" class="btn-secondary" :disabled="connecting || !baseUrl.trim()" @click="submit">
      {{ connecting ? 'Connecting…' : 'Connect' }}
    </button>
  </div>
</template>
