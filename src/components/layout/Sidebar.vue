<script setup lang="ts">
defineProps<{ tabs: { id: string; label: string }[]; activeTab: string }>()
const emit = defineEmits<{ 'update:activeTab': [id: string] }>()
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="flex border-b border-slate-200">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="flex-1 px-3 py-2 text-sm"
        :class="activeTab === tab.id ? 'border-b-2 border-slate-800 font-medium text-slate-900' : 'text-slate-500'"
        @click="emit('update:activeTab', tab.id)"
      >
        {{ tab.label }}
      </button>
    </div>
    <div class="flex-1 overflow-y-auto">
      <slot />
    </div>
  </div>
</template>
