<script setup lang="ts">
import FileGate from '../../components/file/FileGate.vue'
import FileDashboard from '../../components/file/FileDashboard.vue'
</script>

<template>
  <FileGate>
    <div class="p-4 sm:p-6">
      <FileDashboard />
    </div>
  </FileGate>
</template>
