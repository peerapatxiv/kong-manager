<script setup lang="ts">
import { ref, computed } from 'vue'
import { highlightYaml } from '../../lib/yamlHighlight'
import { parseYamlEntity, dumpYamlEntity } from '../../lib/yaml'

const props = withDefaults(defineProps<{ modelValue: string; invalid?: boolean }>(), { invalid: false })
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const preRef = ref<HTMLElement | null>(null)
const gutterRef = ref<HTMLElement | null>(null)
const copied = ref(false)

const highlighted = computed(() => highlightYaml(props.modelValue))
const lineCount = computed(() => props.modelValue.split('\n').length)

function syncScroll() {
  const el = textareaRef.value
  if (!el) return
  if (preRef.value) {
    preRef.value.scrollTop = el.scrollTop
    preRef.value.scrollLeft = el.scrollLeft
  }
  if (gutterRef.value) gutterRef.value.scrollTop = el.scrollTop
}

async function copy() {
  if (navigator.clipboard) await navigator.clipboard.writeText(props.modelValue)
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}

function format() {
  try {
    const parsed = parseYamlEntity(props.modelValue)
    emit('update:modelValue', dumpYamlEntity(parsed))
  } catch {
    // Leave the draft untouched — the error banner elsewhere already tells the
    // user why it can't be reformatted yet.
  }
}
</script>

<template>
  <div
    class="overflow-hidden rounded-lg border"
    :class="invalid ? 'border-red-300 dark:border-red-800' : 'border-border'"
  >
    <div class="flex items-center justify-between border-b border-border bg-elevated px-3 py-1.5">
      <span class="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">YAML</span>
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="rounded px-2 py-1 text-xs font-medium text-ink-muted hover:bg-accent/10 hover:text-ink"
          @click="format"
        >
          Format
        </button>
        <button
          type="button"
          class="rounded px-2 py-1 text-xs font-medium text-ink-muted hover:bg-accent/10 hover:text-ink"
          @click="copy"
        >
          {{ copied ? 'Copied' : 'Copy' }}
        </button>
      </div>
    </div>

    <div class="relative flex h-[min(75vh,44rem)] min-h-[20rem] bg-surface text-xs leading-relaxed">
      <div
        ref="gutterRef"
        class="select-none overflow-hidden bg-elevated/60 px-2 py-2.5 text-right font-mono text-ink-muted/60"
        aria-hidden="true"
      >
        <div v-for="n in lineCount" :key="n">{{ n }}</div>
      </div>

      <div class="relative flex-1">
        <pre
          ref="preRef"
          class="pointer-events-none absolute inset-0 overflow-auto whitespace-pre-wrap break-words px-3 py-2.5 font-mono"
          aria-hidden="true"
        ><code v-html="highlighted"></code></pre>
        <textarea
          ref="textareaRef"
          :value="modelValue"
          spellcheck="false"
          aria-label="Edit YAML configuration"
          class="absolute inset-0 h-full w-full resize-none overflow-auto whitespace-pre-wrap break-words bg-transparent px-3 py-2.5 font-mono text-transparent caret-ink outline-none"
          @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
          @scroll="syncScroll"
        />
      </div>
    </div>
  </div>
</template>
