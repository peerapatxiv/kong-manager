<script setup lang="ts">
defineProps<{ tabs: { id: string; label: string }[]; activeTab: string }>()
const emit = defineEmits<{ 'update:activeTab': [id: string] }>()
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex gap-1 overflow-x-auto border-b border-border p-2">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        class="pill-tab whitespace-nowrap"
        :class="activeTab === tab.id ? 'pill-tab-active' : 'pill-tab-inactive'"
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
