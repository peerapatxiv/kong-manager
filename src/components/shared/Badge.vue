<script setup lang="ts">
withDefaults(defineProps<{ variant?: 'modified' | 'added' | 'removed' | 'changed' }>(), {
  variant: 'modified',
})

const styles: Record<string, string> = {
  modified: 'bg-amber-100 text-amber-800',
  added: 'bg-emerald-100 text-emerald-800',
  removed: 'bg-red-100 text-red-800',
  changed: 'bg-blue-100 text-blue-800',
}
</script>

<template>
  <span class="inline-block text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded" :class="styles[variant]">
    {{ variant }}
  </span>
</template>
