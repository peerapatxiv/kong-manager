<script setup lang="ts">
defineProps<{ message?: string }>()
</script>

<template>
  <p v-if="message" class="field-help !text-red-600 dark:!text-red-400">{{ message }}</p>
</template>
