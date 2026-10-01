// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { usePageCount } from './usePageCount'
import { usePageMetaStore } from '../stores/pageMeta'

beforeEach(() => setActivePinia(createPinia()))

function host(source: () => { count: number | null; approximate?: boolean }) {
  return mount(
    defineComponent({
      setup() {
        usePageCount(source)
        return () => h('div')
      },
    }),
    { global: { plugins: [] } },
  )
}

describe('usePageCount', () => {
  it('publishes the count, and whether it is only what has loaded so far', () => {
    host(() => ({ count: 42, approximate: true }))
    const meta = usePageMetaStore()
    expect(meta.count).toBe(42)
    expect(meta.approximate).toBe(true)
  })

  it('follows the source as it changes', async () => {
    const n = ref(1)
    host(() => ({ count: n.value }))
    const meta = usePageMetaStore()
    n.value = 5
    await Promise.resolve()
    expect(meta.count).toBe(5)
    expect(meta.approximate).toBe(false)
  })

  it('shows nothing while the count is unknown', async () => {
    const n = ref<number | null>(3)
    host(() => ({ count: n.value }))
    const meta = usePageMetaStore()
    n.value = null
    await Promise.resolve()
    expect(meta.count).toBeNull()
  })

  it('clears the count when the page goes away, so it does not linger on the next page', () => {
    const wrapper = host(() => ({ count: 9 }))
    const meta = usePageMetaStore()
    expect(meta.count).toBe(9)
    wrapper.unmount()
    expect(meta.count).toBeNull()
    expect(meta.approximate).toBe(false)
  })
})
