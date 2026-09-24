<script setup lang="ts">
withDefaults(defineProps<{ variant?: 'modified' | 'added' | 'removed' | 'changed' }>(), {
  variant: 'modified',
})

const styles: Record<string, string> = {
  modified: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  added: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  removed: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300',
  changed: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
}

const dotStyles: Record<string, string> = {
  modified: 'bg-amber-500',
  added: 'bg-emerald-500',
  removed: 'bg-red-500',
  changed: 'bg-blue-500',
}
</script>

<template>
  <span
    class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
    :class="styles[variant]"
  >
    <span class="h-1.5 w-1.5 rounded-full" :class="dotStyles[variant]" />
    {{ variant }}
  </span>
</template>
