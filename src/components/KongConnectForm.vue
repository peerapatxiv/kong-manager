<script setup lang="ts">
import { computed, ref } from 'vue'
import SecretField from './shared/SecretField.vue'
import { composeBaseUrl, normalizeHostInput } from '../lib/connectionUrl'
import type { ConnectionProtocol } from '../lib/connectionUrl'
import type { KongAdminAuth } from '../lib/kongAdminApi'

const props = defineProps<{ connecting: boolean }>()
const emit = defineEmits<{
  connect: [payload: { baseUrl: string; auth: KongAdminAuth; name?: string }]
}>()

const protocol = ref<ConnectionProtocol>('http')
const host = ref('')
const name = ref('')
const username = ref('')
const password = ref<string | undefined>(undefined)

const baseUrl = computed(() => composeBaseUrl(protocol.value, host.value))

function currentAuth(): KongAdminAuth {
  return { username: username.value.trim() || undefined, password: password.value || undefined }
}

// A pasted full URL moves its scheme into the dropdown and keeps only the host here.
function onHostInput(event: Event) {
  const next = normalizeHostInput(protocol.value, (event.target as HTMLInputElement).value)
  protocol.value = next.protocol
  host.value = next.host
}

function submit() {
  if (!baseUrl.value || props.connecting) return
  emit('connect', {
    baseUrl: baseUrl.value,
    auth: currentAuth(),
    name: name.value.trim() || undefined,
  })
}
</script>

<template>
  <div class="card overflow-hidden border-t-2 border-t-accent">
    <div class="border-b border-border px-5 py-3">
      <h3 class="text-sm font-bold text-ink">New Connection</h3>
    </div>

    <div class="space-y-4 p-5">
      <div>
        <span class="field-label">Admin API</span>
        <div class="flex">
          <select
            v-model="protocol"
            data-testid="protocol"
            aria-label="Protocol"
            class="input-field !w-auto rounded-r-none border-r-0 bg-elevated/60 font-mono font-medium"
          >
            <option value="http">HTTP</option>
            <option value="https">HTTPS</option>
          </select>
          <input
            :value="host"
            data-testid="host"
            type="text"
            placeholder="127.0.0.1"
            spellcheck="false"
            class="input-field min-w-0 flex-1 rounded-l-none font-mono"
            @input="onHostInput"
            @keyup.enter="submit"
          />
        </div>
      </div>

      <label class="block">
        <span class="field-label">Connection Name</span>
        <input
          v-model="name"
          data-testid="connection-name"
          type="text"
          placeholder="Example: Staging server"
          class="input-field"
          @keyup.enter="submit"
        />
      </label>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label class="block">
          <span class="field-label">Username</span>
          <input
            v-model="username"
            data-testid="username"
            type="text"
            placeholder="Optional"
            class="input-field"
            @keyup.enter="submit"
          />
        </label>
        <label class="block">
          <span class="field-label">Password</span>
          <SecretField v-model="password" placeholder="Optional" />
        </label>
      </div>

      <div data-testid="connect-footer" class="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p class="field-help !mt-0">* All the above information is stored locally.</p>
          <button
            type="button"
            class="btn-primary px-5"
            title="Connect and load the config"
            :disabled="connecting || !baseUrl"
            @click="submit"
          >
            <svg
              v-if="connecting"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              class="h-4 w-4 shrink-0 animate-spin"
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <svg
              v-else
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="h-4 w-4 shrink-0"
            >
              <path d="M12 22v-5" />
              <path d="M9 8V2" />
              <path d="M15 8V2" />
              <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
            </svg>
            {{ connecting ? 'Connecting…' : 'Connect' }}
          </button>
      </div>
    </div>
  </div>
</template>
