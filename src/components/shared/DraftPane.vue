<script setup lang="ts" generic="T extends object">
import { computed, ref, watch } from 'vue'
import type { Ref } from 'vue'

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

// The owner draws the Save / Discard bar wherever it wants (a pinned footer) from this.
defineExpose({ dirty, justSaved, save, discard })
</script>

<template>
  <slot :draft="draft" :update="update" />
</template>
