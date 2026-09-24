<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { KongConsumer } from '../../types/kong'
import { isCredentialListKey } from '../../lib/secretFields'
import TagInput from '../shared/TagInput.vue'
import CredentialEditor from './CredentialEditor.vue'

const props = defineProps<{ modelValue: KongConsumer }>()
const emit = defineEmits<{ 'update:modelValue': [value: KongConsumer]; modified: [] }>()

function cloneEntity(entity: KongConsumer): KongConsumer {
  return JSON.parse(JSON.stringify(entity))
}

const justSaved = ref(false)

// The working copy every field edits — nothing reaches the parent (and so
// the store) until saveEntity() runs. draftBaseline is the last-committed
// snapshot, used both to detect unsaved edits and to restore on discard.
const draft = ref<KongConsumer>(cloneEntity(props.modelValue))
const draftBaseline = ref<KongConsumer>(cloneEntity(props.modelValue))

const isDirty = computed(() => JSON.stringify(draft.value) !== JSON.stringify(draftBaseline.value))

// Selecting a different consumer should land on a fresh draft — a stale
// draft for the previous entity would otherwise leak through. Our own saves
// round-trip back through this same prop with an unchanged username, so
// this only fires on a real selection change.
watch(
  () => props.modelValue.username,
  () => {
    draft.value = cloneEntity(props.modelValue)
    draftBaseline.value = cloneEntity(props.modelValue)
  },
)

function update(key: string, value: unknown) {
  draft.value = { ...draft.value, [key]: value }
}

function saveEntity() {
  emit('update:modelValue', draft.value)
  emit('modified')
  draftBaseline.value = cloneEntity(draft.value)
  justSaved.value = true
  setTimeout(() => (justSaved.value = false), 1600)
}

function discardEntity() {
  if (isDirty.value && !window.confirm('Discard your unsaved changes?')) return
  draft.value = cloneEntity(draftBaseline.value)
}

const credentialListKeys = computed(() =>
  Object.keys(draft.value).filter((key) => isCredentialListKey(key) && Array.isArray(draft.value[key])),
)
</script>

<template>
  <div class="card max-w-5xl space-y-6 p-6">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 class="font-mono text-lg font-bold text-ink">{{ draft.username ?? '(unnamed consumer)' }}</h2>
        <Transition
          enter-active-class="transition duration-150"
          enter-from-class="opacity-0 -translate-y-0.5"
          leave-active-class="transition duration-150"
          leave-to-class="opacity-0"
        >
          <span
            v-if="justSaved"
            class="mt-1 inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent-secondary dark:bg-accent/20 dark:text-accent"
          >
            <svg viewBox="0 0 16 16" fill="none" class="h-3 w-3">
              <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            Saved
          </span>
          <span v-else-if="isDirty" class="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-ink-muted">
            <span class="h-1.5 w-1.5 rounded-full bg-accent" />
            Unsaved changes
          </span>
        </Transition>
      </div>

      <div class="flex h-9 items-center gap-2">
        <button type="button" class="btn-secondary h-full py-0" :disabled="!isDirty" @click="discardEntity">Discard</button>
        <button type="button" class="btn-primary h-full py-0" :disabled="!isDirty" @click="saveEntity">Save</button>
      </div>
    </div>

    <section class="space-y-3">
      <h3 class="section-heading">Identity</h3>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label>
          <span class="field-label">Username</span>
          <input
            type="text"
            :value="draft.username ?? ''"
            class="input-field"
            @input="update('username', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <label>
          <span class="field-label">Custom ID</span>
          <input
            type="text"
            :value="draft.custom_id ?? ''"
            class="input-field"
            @input="update('custom_id', ($event.target as HTMLInputElement).value)"
          />
        </label>
      </div>
    </section>

    <section class="space-y-2 border-t border-border pt-5">
      <h3 class="section-heading">Tags</h3>
      <TagInput :model-value="draft.tags" @update:model-value="(v) => update('tags', v)" />
    </section>

    <section v-if="credentialListKeys.length > 0" class="space-y-4 border-t border-border pt-5">
      <h3 class="section-heading">Credentials</h3>
      <div v-for="listKey in credentialListKeys" :key="listKey" class="space-y-1.5">
        <p class="font-mono text-xs font-medium text-ink-muted">{{ listKey }}</p>
        <CredentialEditor
          :model-value="draft[listKey] as Record<string, unknown>[]"
          :list-key="listKey"
          @update:model-value="(v) => update(listKey, v)"
        />
      </div>
    </section>
  </div>
</template>
