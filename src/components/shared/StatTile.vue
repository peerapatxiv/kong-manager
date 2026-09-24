<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string
    value: string | number
    tone?: 'accent' | 'emerald' | 'red' | 'blue' | 'amber'
    compact?: boolean
  }>(),
  { tone: 'accent', compact: false },
)

const toneStyles: Record<string, string> = {
  accent: 'bg-accent/15 text-accent-secondary dark:bg-accent/20 dark:text-accent',
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300',
  red: 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-300',
  blue: 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300',
}

const dotStyles: Record<string, string> = {
  accent: 'bg-accent',
  emerald: 'bg-emerald-500',
  red: 'bg-red-500',
  blue: 'bg-blue-500',
  amber: 'bg-amber-500',
}
</script>

<template>
  <div
    class="card flex items-center transition-shadow duration-150 hover:shadow-md"
    :class="compact ? 'gap-2.5 p-2.5' : 'gap-3.5 p-4'"
  >
    <div
      class="flex shrink-0 items-center justify-center"
      :class="[compact ? 'h-7 w-7 rounded-lg' : 'h-10 w-10 rounded-xl', toneStyles[tone]]"
    >
      <slot name="icon">
        <span class="h-2 w-2 rounded-full" :class="dotStyles[tone]" />
      </slot>
    </div>
    <p class="text-sm text-ink-muted" :class="compact ? 'flex items-baseline gap-1.5' : ''">
      {{ label }}:
      <span
        class="font-bold leading-tight text-ink"
        :class="compact ? 'text-base' : 'block text-2xl'"
      >{{ value }}</span>
    </p>
  </div>
</template>
