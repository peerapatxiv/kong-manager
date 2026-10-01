<script setup lang="ts" generic="T extends object">
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'
import AppIcon from './AppIcon.vue'

const props = defineProps<{ modelValue: T; resetKey: string }>()
const emit = defineEmits<{ save: [value: T] }>()

// The config is plain JSON parsed from YAML, so a JSON round-trip is a safe deep copy (and,
// unlike structuredClone, it copes with Vue's reactive proxies around store data).
const clone = <V,>(value: V): V => JSON.parse(JSON.stringify(value)) as V

const draft = ref(clone(props.modelValue)) as Ref<T>
const baseline = ref(clone(props.modelValue)) as Ref<T>
const justSaved = ref(false)
const dirty = computed(() => JSON.stringify(draft.value) !== JSON.stringify(baseline.value))

// Edits only reach the parent on Save. Picking another entity starts a fresh draft; the same
// entity coming back after our own save does not.
watch(
  () => props.resetKey,
  () => {
    draft.value = clone(props.modelValue)
    baseline.value = clone(props.modelValue)
    justSaved.value = false
  },
)

function update(next: T) {
  draft.value = next
  justSaved.value = false
}

let savedTimer: ReturnType<typeof setTimeout> | undefined
function save() {
  emit('save', clone(draft.value))
  baseline.value = clone(draft.value)
  justSaved.value = true
  clearTimeout(savedTimer)
  savedTimer = setTimeout(() => (justSaved.value = false), 1600)
}

function discard() {
  if (dirty.value && !window.confirm('Discard your unsaved changes?')) return
  draft.value = clone(baseline.value)
}

defineExpose({ dirty })
</script>

<template>
  <div class="space-y-3">
    <div class="sticky top-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-3 bg-bg/95 px-1 py-2 backdrop-blur">
      <span
        v-if="justSaved"
        class="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent-secondary dark:bg-accent/20 dark:text-accent"
      >
        <AppIcon name="check" class="h-3 w-3" />
        Saved
      </span>
      <span v-else-if="dirty" class="inline-flex items-center gap-1 text-[11px] font-medium text-ink-muted">
        <span class="h-1.5 w-1.5 rounded-full bg-accent" />
        Unsaved changes
      </span>
      <span v-else />
      <div class="ml-auto flex items-center gap-2">
        <button type="button" class="btn-secondary" :disabled="!dirty" @click="discard">Discard</button>
        <button type="button" class="btn-primary" :disabled="!dirty" @click="save">Save</button>
      </div>
    </div>
    <slot :draft="draft" :update="update" />
  </div>
</template>
