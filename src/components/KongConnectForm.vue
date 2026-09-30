<script setup lang="ts">
import { ref } from 'vue'
import SecretField from './shared/SecretField.vue'
import type { KongAdminAuth } from '../lib/kongAdminApi'

defineProps<{ connecting: boolean }>()
const emit = defineEmits<{ connect: [payload: { baseUrl: string; auth: KongAdminAuth }] }>()

const baseUrl = ref('')
const username = ref('')
const password = ref<string | undefined>(undefined)

function submit() {
  const trimmed = baseUrl.value.trim()
  if (!trimmed) return
  emit('connect', {
    baseUrl: trimmed,
    auth: {
      username: username.value.trim() || undefined,
      password: password.value || undefined,
    },
  })
}
</script>

<template>
  <div class="card space-y-4 border-t-2 border-t-accent p-5">
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

    <div class="space-y-2.5 rounded-lg bg-elevated/60 p-3">
      <p class="section-heading">Authentication</p>
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
      <p class="field-help">Saved locally after a successful connect — see Saved Connections.</p>
    </div>

    <div class="flex justify-end">
      <button
        type="button"
        class="btn-primary w-full sm:w-auto"
        :disabled="connecting || !baseUrl.trim()"
        @click="submit"
      >
        <svg v-if="connecting" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="h-4 w-4 shrink-0 animate-spin">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-4 w-4 shrink-0">
          <path d="M12 22v-5" />
          <path d="M9 8V2" />
          <path d="M15 8V2" />
          <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
        </svg>
        {{ connecting ? 'Connecting…' : 'Connect' }}
      </button>
    </div>
  </div>
</template>
