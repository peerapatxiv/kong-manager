import { defineStore } from 'pinia'

/**
 * What the current page wants shown next to its title: how many things it lists. A page sets
 * it while it is open and clears it when it goes, so the header never shows a stale number.
 */
export const usePageMetaStore = defineStore('pageMeta', {
  state: () => ({
    count: null as number | null,
    /** True while only part of a long list has loaded, so the real total is higher. */
    approximate: false,
  }),
  actions: {
    set(count: number, approximate = false) {
      this.count = count
      this.approximate = approximate
    },
    clear() {
      this.count = null
      this.approximate = false
    },
  },
})
