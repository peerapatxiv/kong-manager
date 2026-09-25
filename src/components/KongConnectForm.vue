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
    <div class="flex items-start gap-2.5">
      <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent-secondary">
        <svg viewBox="0 0 20 20" fill="none" class="h-3.5 w-3.5">
          <path
            d="M7.5 12.5l5-5M6.5 8.379L5.086 6.964a2.5 2.5 0 113.535-3.535l1.415 1.414M13.5 11.621l1.414 1.415a2.5 2.5 0 11-3.535 3.535l-1.415-1.414"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </span>
      <div>
        <h3 class="text-sm font-semibold text-ink">Connect to Kong Admin API</h3>
        <p class="text-xs text-ink-muted">Pull the live declarative config from a running Kong instance (DB-less mode).</p>
      </div>
    </div>

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
        class="btn-secondary w-full sm:w-auto"
        :disabled="connecting || !baseUrl.trim()"
        @click="submit"
      >
        {{ connecting ? 'Connecting…' : 'Connect' }}
      </button>
    </div>
  </div>
</template>
