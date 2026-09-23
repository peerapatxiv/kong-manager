<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { useConfigStore } from '../../stores/config'

const configStore = useConfigStore()
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <header class="border-b border-slate-200 bg-white px-4 py-3 flex items-center gap-6">
      <span class="font-semibold text-slate-800">Kong Config Viewer</span>
      <nav class="flex gap-4 text-sm">
        <RouterLink to="/" class="text-slate-600 hover:text-slate-900" active-class="text-slate-900 font-medium">
          Load
        </RouterLink>
        <RouterLink
          v-if="configStore.isLoaded"
          to="/browse"
          class="text-slate-600 hover:text-slate-900"
          active-class="text-slate-900 font-medium"
        >
          Browse
        </RouterLink>
        <RouterLink
          v-if="configStore.isLoaded"
          to="/compare"
          class="text-slate-600 hover:text-slate-900"
          active-class="text-slate-900 font-medium"
        >
          Compare
        </RouterLink>
      </nav>
      <div class="ml-auto">
        <slot name="header-actions" />
      </div>
    </header>
    <main class="flex-1">
      <slot />
    </main>
  </div>
</template>
