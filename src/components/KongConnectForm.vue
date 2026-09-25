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
  <div class="card space-y-4 p-4">
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

    <div class="space-y-3 border-t border-border pt-3">
      <p class="section-heading">Authentication (optional)</p>
      <label class="block">
        <span class="field-label">Admin token</span>
        <SecretField v-model="token" />
      </label>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label class="block">
          <span class="field-label">Username</span>
          <input v-model="username" type="text" placeholder="Username" class="input-field" @keyup.enter="submit" />
        </label>
        <label class="block">
          <span class="field-label">Password</span>
          <SecretField v-model="password" />
        </label>
      </div>
      <p class="field-help">Not saved — you'll re-enter these next time you connect.</p>
    </div>

    <div class="flex justify-end pt-1">
      <button
        type="button"
        class="btn-primary w-full sm:w-auto"
        :disabled="connecting || !baseUrl.trim()"
        @click="submit"
      >
        {{ connecting ? 'Connecting…' : 'Connect' }}
      </button>
    </div>
  </div>
</template>
