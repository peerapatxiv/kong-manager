<script lang="ts">
export type SelectOption<T extends string | number = string | number> = { value: T; label: string }
</script>

<script setup lang="ts" generic="T extends string | number">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import AppIcon from './AppIcon.vue'

const props = withDefaults(
  defineProps<{
    modelValue: T
    options: SelectOption<T>[]
    placeholder?: string
    disabled?: boolean
    searchable?: boolean
    ariaLabel?: string
    buttonClass?: string
  }>(),
  { placeholder: 'Select…', disabled: false, searchable: false, ariaLabel: undefined, buttonClass: '' },
)
const emit = defineEmits<{ 'update:modelValue': [value: T] }>()

let counter = 0
const listId = `app-select-${++counter}-${Math.random().toString(36).slice(2, 7)}`

const root = ref<HTMLElement | null>(null)
const buttonEl = ref<HTMLButtonElement | null>(null)
const searchEl = ref<HTMLInputElement | null>(null)
const listEl = ref<HTMLElement | null>(null)

const open = ref(false)
const openUp = ref(false)
const query = ref('')
const activeIndex = ref(0)

const filtered = computed(() => {
  const needle = query.value.trim().toLowerCase()
  return needle ? props.options.filter((o) => o.label.toLowerCase().includes(needle)) : props.options
})

const selected = computed(() => props.options.find((o) => o.value === props.modelValue))
// A value that is not among the options (for example a service that is not loaded yet) is
// shown as-is rather than hidden, so the form never looks emptier than it is.
const shownLabel = computed(() => {
  if (selected.value) return selected.value.label
  if (props.modelValue !== '' && props.modelValue !== undefined) return String(props.modelValue)
  return props.placeholder
})
const hasValue = computed(() => selected.value !== undefined || (props.modelValue !== '' && props.modelValue !== undefined))

function onOutsidePointer(event: Event) {
  if (root.value && !root.value.contains(event.target as Node)) close(false)
}

function scrollActiveIntoView() {
  void nextTick(() => {
    const el = listEl.value?.querySelector('[data-active="true"]') as HTMLElement | null
    el?.scrollIntoView?.({ block: 'nearest' })
  })
}

function openPanel() {
  if (props.disabled || open.value) return
  query.value = ''
  const index = props.options.findIndex((o) => o.value === props.modelValue)
  activeIndex.value = Math.max(0, index)
  const rect = root.value?.getBoundingClientRect()
  if (rect) {
    const below = window.innerHeight - rect.bottom
    openUp.value = below < 300 && rect.top > below
  }
  open.value = true
  document.addEventListener('pointerdown', onOutsidePointer)
  void nextTick(() => {
    if (props.searchable) searchEl.value?.focus()
    else listEl.value?.focus()
    scrollActiveIntoView()
  })
}

function close(refocus: boolean) {
  if (!open.value) return
  open.value = false
  document.removeEventListener('pointerdown', onOutsidePointer)
  if (refocus) void nextTick(() => buttonEl.value?.focus())
}

function choose(option: SelectOption<T>) {
  emit('update:modelValue', option.value)
  close(true)
}

function move(to: number) {
  if (filtered.value.length === 0) return
  activeIndex.value = Math.min(filtered.value.length - 1, Math.max(0, to))
  scrollActiveIntoView()
}

function onButtonKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    openPanel()
  }
}

function onPanelKeydown(event: KeyboardEvent) {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      move(activeIndex.value + 1)
      break
    case 'ArrowUp':
      event.preventDefault()
      move(activeIndex.value - 1)
      break
    case 'Home':
      event.preventDefault()
      move(0)
      break
    case 'End':
      event.preventDefault()
      move(filtered.value.length - 1)
      break
    case 'Enter': {
      event.preventDefault()
      const option = filtered.value[activeIndex.value]
      if (option) choose(option)
      break
    }
    case 'Escape':
      event.preventDefault()
      close(true)
      break
    case 'Tab':
      close(false)
      break
  }
}

function onSearchInput() {
  activeIndex.value = 0
}

onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutsidePointer))
</script>

<template>
  <div ref="root" class="relative" :data-value="String(modelValue)">
    <button
      ref="buttonEl"
      type="button"
      role="combobox"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-controls="listId"
      :aria-label="ariaLabel"
      :disabled="disabled"
      class="input-field flex items-center gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60"
      :class="[buttonClass, open ? '!border-accent ring-2 ring-accent/30' : '']"
      @click="open ? close(true) : openPanel()"
      @keydown="onButtonKeydown"
    >
      <span class="min-w-0 flex-1 truncate" :class="hasValue ? '' : 'text-ink-muted'">{{ shownLabel }}</span>
      <AppIcon
        name="chevron-down"
        class="h-4 w-4 shrink-0 text-ink-muted transition-transform duration-150"
        :class="open ? 'rotate-180' : ''"
      />
    </button>

    <div
      v-if="open"
      class="absolute left-0 z-50 w-max min-w-full max-w-[min(28rem,90vw)] overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
      :class="openUp ? 'bottom-full mb-1' : 'top-full mt-1'"
      @keydown="onPanelKeydown"
    >
      <div v-if="searchable" class="border-b border-border p-2">
        <input
          ref="searchEl"
          v-model="query"
          type="text"
          class="input-field text-xs"
          placeholder="Search…"
          aria-label="Search options"
          @input="onSearchInput"
        />
      </div>
      <ul
        :id="listId"
        ref="listEl"
        role="listbox"
        tabindex="-1"
        class="max-h-64 overflow-y-auto p-1 outline-none"
      >
        <li
          v-for="(option, index) in filtered"
          :key="option.value"
          role="option"
          :aria-selected="option.value === modelValue"
          :data-active="index === activeIndex"
          :title="option.label"
          class="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors duration-100"
          :class="[
            index === activeIndex ? 'bg-elevated text-ink' : 'text-ink-muted',
            option.value === modelValue ? 'font-medium !text-link' : '',
          ]"
          @mousemove="activeIndex = index"
          @click="choose(option)"
        >
          <span class="min-w-0 flex-1 truncate">{{ option.label }}</span>
          <AppIcon v-if="option.value === modelValue" name="check" class="h-3.5 w-3.5 shrink-0 text-accent-secondary" />
        </li>
        <li v-if="filtered.length === 0" class="px-3 py-2 text-xs text-ink-muted">No matches</li>
      </ul>
    </div>
  </div>
</template>
