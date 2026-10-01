import { onBeforeUnmount, watchEffect } from 'vue'
import { usePageMetaStore } from '../stores/pageMeta'

export type PageCount = { count: number | null; approximate?: boolean }

/** Shows `source()` as the count beside the page title for as long as the page is open. */
export function usePageCount(source: () => PageCount) {
  const meta = usePageMetaStore()
  watchEffect(() => {
    const { count, approximate } = source()
    if (count === null) meta.clear()
    else meta.set(count, approximate ?? false)
  })
  onBeforeUnmount(() => meta.clear())
}
