<script setup lang="ts">
import { ref } from 'vue'
import { inferValueType, isCodeStringArray } from '../../lib/valueType'
import { isSecretField } from '../../lib/secretFields'
import { highlightLua } from '../../lib/luaHighlight'
import TagInput from './TagInput.vue'
import SecretField from './SecretField.vue'
import ToggleSwitch from './ToggleSwitch.vue'

const props = defineProps<{ modelValue: Record<string, unknown> }>()
const emit = defineEmits<{ 'update:modelValue': [value: Record<string, unknown>] }>()

const newKeyDraft = ref('')

// Keys that were null when this editor first saw them stay on the nullable
// text widget for the rest of the edit, even once the user has typed a
// non-empty value into it (which makes inferValueType see a plain string).
// Without this, typing a single character swaps the field to a different
// v-if branch — a different DOM node — dropping keyboard focus after every
// keystroke.
const nullableKeys = ref<Set<string>>(
  new Set(Object.keys(props.modelValue).filter((key) => props.modelValue[key] === null)),
)

function isNullable(key: string): boolean {
  return nullableKeys.value.has(key)
}

function setField(key: string, value: unknown) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}

function removeField(key: string) {
  const next = { ...props.modelValue }
  delete next[key]
  nullableKeys.value.delete(key)
  emit('update:modelValue', next)
}

function addField() {
  const key = newKeyDraft.value.trim()
  if (!key || key in props.modelValue) return
  setField(key, '')
  newKeyDraft.value = ''
}

function onNullableTextInput(key: string, raw: string) {
  setField(key, raw === '' ? null : raw)
}

function updateCodeArrayItem(key: string, items: string[], index: number, text: string) {
  const next = [...items]
  next[index] = text
  setField(key, next)
}

function removeCodeArrayItem(key: string, items: string[], index: number) {
  const next = [...items]
  next.splice(index, 1)
  setField(key, next)
}

function addCodeArrayItem(key: string, items: string[]) {
  setField(key, [...items, ''])
}

// The highlight overlay is a plain sibling <pre>, not a Vue-tracked ref (this
// editor renders an arbitrary number of code items across arbitrary nesting
// depth) — cheaper to reach it relative to the event target than to manage a
// ref array per row.
function syncCodeScroll(event: Event) {
  const textarea = event.target as HTMLTextAreaElement
  const pre = textarea.previousElementSibling as HTMLElement | null
  if (pre) {
    pre.scrollTop = textarea.scrollTop
    pre.scrollLeft = textarea.scrollLeft
  }
}
</script>

<template>
  <div class="divide-y divide-border">
    <div v-for="(value, key) in modelValue" :key="key" class="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
      <label class="w-40 shrink-0 truncate pt-1.5 font-mono text-xs text-ink-muted" :title="String(key)">
        {{ key }}
      </label>

      <div class="flex-1">
        <SecretField
          v-if="isSecretField(String(key)) && typeof value === 'string'"
          :model-value="value"
          @update:model-value="(v) => setField(String(key), v)"
        />
        <input
          v-else-if="isNullable(String(key))"
          type="text"
          value=""
          placeholder="null"
          class="input-field text-ink-muted"
          @input="onNullableTextInput(String(key), ($event.target as HTMLInputElement).value)"
        />
        <input
          v-else-if="inferValueType(String(key), value) === 'string'"
          type="text"
          :value="value as string"
          class="input-field"
          @input="setField(String(key), ($event.target as HTMLInputElement).value)"
        />
        <textarea
          v-else-if="inferValueType(String(key), value) === 'multiline-string'"
          :value="value as string"
          rows="4"
          class="input-field font-mono"
          @input="setField(String(key), ($event.target as HTMLTextAreaElement).value)"
        />
        <input
          v-else-if="inferValueType(String(key), value) === 'number'"
          type="number"
          :value="value as number"
          class="input-field"
          @input="setField(String(key), Number(($event.target as HTMLInputElement).value))"
        />
        <ToggleSwitch
          v-else-if="inferValueType(String(key), value) === 'boolean'"
          :model-value="value as boolean"
          @update:model-value="(v) => setField(String(key), v)"
        />
        <div
          v-else-if="inferValueType(String(key), value) === 'string-array' && isCodeStringArray(String(key), value)"
          class="space-y-2"
        >
          <div
            v-for="(item, i) in value as string[]"
            :key="i"
            class="group relative overflow-hidden rounded-lg border border-border bg-elevated/60"
          >
            <pre
              class="pointer-events-none absolute inset-0 overflow-auto whitespace-pre-wrap break-words px-3 py-2.5 pr-8 font-mono text-xs leading-relaxed"
              aria-hidden="true"
            ><code v-html="highlightLua(item)"></code></pre>
            <textarea
              :value="item"
              rows="4"
              spellcheck="false"
              class="relative w-full resize-y rounded-lg border-0 bg-transparent px-3 py-2.5 pr-8 font-mono text-xs leading-relaxed text-transparent caret-ink outline-none focus:ring-2 focus:ring-accent/30"
              @input="updateCodeArrayItem(String(key), value as string[], i, ($event.target as HTMLTextAreaElement).value)"
              @scroll="syncCodeScroll"
            />
            <button
              type="button"
              aria-label="Remove entry"
              class="absolute right-1.5 top-1.5 rounded p-1 text-ink-muted/60 opacity-0 transition-opacity duration-150 hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 dark:hover:bg-red-950/50 dark:hover:text-red-400"
              @click="removeCodeArrayItem(String(key), value as string[], i)"
            >
              <svg viewBox="0 0 16 16" fill="none" class="h-3.5 w-3.5">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
              </svg>
            </button>
          </div>
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-xs font-medium text-ink-muted transition-colors duration-150 hover:border-accent hover:bg-accent/5 hover:text-accent-secondary"
            @click="addCodeArrayItem(String(key), value as string[])"
          >
            <svg viewBox="0 0 16 16" fill="none" class="h-3 w-3">
              <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
            Add function
          </button>
        </div>
        <TagInput
          v-else-if="inferValueType(String(key), value) === 'string-array'"
          :model-value="value as string[]"
          placeholder="add value…"
          @update:model-value="(v) => setField(String(key), v)"
        />
        <div v-else-if="inferValueType(String(key), value) === 'object-array'" class="space-y-2 border-l-2 border-accent/20 pl-3">
          <div v-for="(item, i) in value as Record<string, unknown>[]" :key="i">
            <DynamicKeyValueEditor
              :model-value="item"
              @update:model-value="
                (v) => {
                  const next = [...(value as Record<string, unknown>[])]
                  next[i] = v
                  setField(String(key), next)
                }
              "
            />
          </div>
        </div>
        <div v-else class="border-l-2 border-accent/20 pl-3">
          <DynamicKeyValueEditor
            :model-value="value as Record<string, unknown>"
            @update:model-value="(v) => setField(String(key), v)"
          />
        </div>
      </div>

      <button
        type="button"
        aria-label="Remove field"
        class="mt-1 shrink-0 rounded p-1 text-ink-muted/60 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50 dark:hover:text-red-400"
        @click="removeField(String(key))"
      >
        <svg viewBox="0 0 16 16" fill="none" class="h-3.5 w-3.5">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
      </button>
    </div>

    <div class="flex items-center gap-2 pt-2">
      <input
        v-model="newKeyDraft"
        type="text"
        placeholder="new key…"
        class="input-field w-40 text-xs"
        @keydown.enter.prevent="addField"
      />
      <button
        type="button"
        class="inline-flex items-center gap-1 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-xs font-medium text-ink-muted transition-colors duration-150 hover:border-accent hover:bg-accent/5 hover:text-accent-secondary"
        @click="addField"
      >
        <svg viewBox="0 0 16 16" fill="none" class="h-3 w-3">
          <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
        Add key
      </button>
    </div>
  </div>
</template>
