<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { CREDENTIAL_TYPES, credentialType } from '../../lib/live/credentials'
import type { CredentialTypeId } from '../../lib/live/credentials'
import CredentialSection from './CredentialSection.vue'

defineProps<{ consumerId: string; disabled?: boolean }>()

const active = ref<CredentialTypeId>(CREDENTIAL_TYPES[0].id)
const counts = reactive<Partial<Record<CredentialTypeId, number>>>({})
const activeType = computed(() => credentialType(active.value))
</script>

<template>
  <section class="space-y-3 border-t border-border pt-5">
    <h4 class="section-heading">Credentials</h4>
    <div class="flex flex-wrap gap-1.5" role="tablist">
      <button
        v-for="type in CREDENTIAL_TYPES"
        :key="type.id"
        type="button"
        role="tab"
        :aria-selected="active === type.id"
        :data-testid="`cred-tab-${type.id}`"
        class="pill-tab inline-flex items-center gap-1.5"
        :class="active === type.id ? 'pill-tab-active' : 'pill-tab-inactive'"
        @click="active = type.id"
      >
        {{ type.label }}
        <span
          v-if="counts[type.id] !== undefined"
          class="rounded-full bg-elevated px-1.5 text-[10px] font-semibold tabular-nums text-ink-muted"
        >
          {{ counts[type.id] }}
        </span>
      </button>
    </div>
    <CredentialSection
      :key="`${consumerId}-${active}`"
      :consumer-id="consumerId"
      :type="activeType"
      :disabled="disabled"
      @loaded="(count) => (counts[active] = count)"
    />
  </section>
</template>
