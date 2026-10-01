<script lang="ts">
const ICONS = {
  home: ['M10 3l7 5.5V17a1 1 0 01-1 1h-4v-5H8v5H4a1 1 0 01-1-1V8.5L10 3z'],
  list: [
    'M4 4h12a1 1 0 011 1v1.2a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1z',
    'M4 9h12a1 1 0 011 1v1.2a1 1 0 01-1 1H4a1 1 0 01-1-1V10a1 1 0 011-1z',
    'M4 14h6a1 1 0 011 1v1.2a1 1 0 01-1 1H4a1 1 0 01-1-1V15a1 1 0 011-1z',
  ],
  compare: ['M7 3v14M7 3L4 6M7 3l3 3', 'M13 17V3M13 17l3-3M13 17l-3-3'],
  server: [
    'M4 5h12a1 1 0 011 1v1.2a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1z',
    'M4 10h12a1 1 0 011 1v1.2a1 1 0 01-1 1H4a1 1 0 01-1-1V11a1 1 0 011-1z',
    'M6 15.5h.01M9 15.5h5',
  ],
  route: [
    'M5 13a2 2 0 100 4 2 2 0 000-4zM15 3a2 2 0 100 4 2 2 0 000-4z',
    'M7 15h4.5a3 3 0 003-3V9a3 3 0 00-3-3H10',
  ],
  user: ['M10 9a3 3 0 100-6 3 3 0 000 6z', 'M4 17a6 6 0 0112 0'],
  plug: ['M7 3v3M13 3v3M5 7h10v3a5 5 0 01-5 5 5 5 0 01-5-5V7zM10 15v3'],
  link: [
    'M7.5 12.5l5-5M6.5 8.379L5.086 6.964a2.5 2.5 0 113.535-3.535l1.415 1.414M13.5 11.621l1.414 1.415a2.5 2.5 0 11-3.535 3.535l-1.415-1.414',
  ],
  upload: ['M10 13V4m0 0L6.5 7.5M10 4l3.5 3.5M4 14v1a1 1 0 001 1h10a1 1 0 001-1v-1'],
  trash: [
    'M4 6h12M8 6V4.5a1 1 0 011-1h2a1 1 0 011 1V6m2 0-.7 9.1a1.5 1.5 0 01-1.5 1.4H7.2a1.5 1.5 0 01-1.5-1.4L5 6',
  ],
  eye: [
    'M2.2 10C3.6 7.7 6.4 5 10 5s6.4 2.7 7.8 5c-1.4 2.3-4.2 5-7.8 5s-6.4-2.7-7.8-5z',
    'M10 7.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z',
  ],
  'eye-off': [
    'M3 3l14 14M8.2 8.3a2.5 2.5 0 003.5 3.5M6 6.2C4.3 7.3 3 8.9 2.2 10c1.4 2.3 4.2 5 7.8 5 1.3 0 2.5-.4 3.5-.9M9.6 5.05c.14-.03.27-.05.4-.05 3.6 0 6.4 2.7 7.8 5-.5.8-1.2 1.7-2.1 2.4',
  ],
  search: ['M9 3a6 6 0 100 12A6 6 0 009 3z', 'M17 17l-3.5-3.5'],
  x: ['M5 5l10 10M15 5L5 15'],
  plus: ['M10 4.4v11.2M4.4 10h11.2'],
  check: ['M4.4 10.6l3.7 3.7 7.5-8.7'],
  'chevron-right': ['M7.5 5l5 5-5 5'],
  'chevron-down': ['M5 7.5l5 5 5-5'],
  menu: ['M3 5h14M3 10h14M3 15h14'],
  dashboard: [
    'M4.5 3.5h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4a1 1 0 011-1z',
    'M12.5 3.5h3a1 1 0 011 1v2a1 1 0 01-1 1h-3a1 1 0 01-1-1v-2a1 1 0 011-1z',
    'M12.5 10.5h3a1 1 0 011 1v4a1 1 0 01-1 1h-3a1 1 0 01-1-1v-4a1 1 0 011-1z',
    'M4.5 12.5h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1v-2a1 1 0 011-1z',
  ],
  refresh: ['M16.5 10a6.5 6.5 0 11-2-4.7', 'M16.5 3.5v3.2h-3.2'],
  moon: ['M17 11.2A7 7 0 018.8 3 7 7 0 1017 11.2z'],
  lock: [
    'M6.5 9h7A1.5 1.5 0 0115 10.5v4a1.5 1.5 0 01-1.5 1.5h-7A1.5 1.5 0 015 14.5v-4A1.5 1.5 0 016.5 9z',
    'M7.5 9V6.5a2.5 2.5 0 015 0V9',
  ],
  warning: [
    'M10 6.9v4.1M10 14.1h.01',
    'M3.1 16.9h13.8a1.25 1.25 0 001.1-1.9l-6.9-11.9a1.25 1.25 0 00-2.2 0L2 15a1.25 1.25 0 001.1 1.9z',
  ],
} as const

export type IconName = keyof typeof ICONS
</script>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ name: IconName }>()
const paths = computed<readonly string[] | undefined>(() => ICONS[props.name])
</script>

<template>
  <svg
    v-if="paths"
    viewBox="0 0 20 20"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path v-for="d in paths" :key="d" :d="d" />
  </svg>
</template>
