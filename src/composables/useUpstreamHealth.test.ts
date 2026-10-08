import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useUpstreamHealth } from './useUpstreamHealth'
import { useConnectionStore } from '../stores/connection'

const json = (body: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
  headers: new Headers(),
})

const health = (target: string, state = 'HEALTHY') => json({ data: [{ target, weight: 100, health: state }] })

beforeEach(() => {
  setActivePinia(createPinia())
  useConnectionStore().$patch({ active: { baseUrl: 'http://kong:8001' }, info: { version: '3.5.0', database: 'postgres' } })
})
afterEach(() => vi.unstubAllGlobals())

describe('useUpstreamHealth', () => {
  it('loads health for the selected upstream and stamps the time', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => health('a:80')))
    const id = ref<string | undefined>('u1')
    const result = useUpstreamHealth(() => id.value)
    await flushPromises()

    expect(result.health.value).toEqual([{ target: 'a:80', weight: 100, health: 'HEALTHY' }])
    expect(result.updatedAt.value).toBeInstanceOf(Date)
    expect(result.error.value).toBeNull()
    expect(result.loading.value).toBe(false)
  })

  it('reloads when the upstream changes, and clears when there is none', async () => {
    const fetchMock = vi.fn(async (url: string) => health(url.includes('/u2/') ? 'b:80' : 'a:80'))
    vi.stubGlobal('fetch', fetchMock)
    const id = ref<string | undefined>('u1')
    const result = useUpstreamHealth(() => id.value)
    await flushPromises()

    id.value = 'u2'
    await nextTick()
    await flushPromises()
    expect(result.health.value[0].target).toBe('b:80')

    id.value = undefined
    await nextTick()
    await flushPromises()
    expect(result.health.value).toEqual([])
    expect(result.updatedAt.value).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('keeps a failure in `error` and leaves the rows empty', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ message: 'boom' }, 500)))
    const result = useUpstreamHealth(() => 'u1')
    await flushPromises()

    expect(result.error.value).toContain('boom')
    expect(result.health.value).toEqual([])
    expect(result.loading.value).toBe(false)
  })

  it('treats a garbage body as no rows, without an error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json('nope')))
    const result = useUpstreamHealth(() => 'u1')
    await flushPromises()

    expect(result.health.value).toEqual([])
    expect(result.error.value).toBeNull()
  })

  it('drops a slow response for an upstream that is no longer selected', async () => {
    const release: Record<string, () => void> = {}
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const which = url.includes('/u1/') ? 'u1' : 'u2'
        if (which === 'u1') await new Promise<void>((resolve) => (release.u1 = resolve))
        return health(which === 'u1' ? 'old:80' : 'new:80')
      }),
    )
    const id = ref<string | undefined>('u1')
    const result = useUpstreamHealth(() => id.value)
    await flushPromises()

    id.value = 'u2'
    await nextTick()
    await flushPromises()
    release.u1()
    await flushPromises()

    expect(result.health.value.map((row) => row.target)).toEqual(['new:80'])
  })

  it('refresh() asks again', async () => {
    const fetchMock = vi.fn(async () => health('a:80'))
    vi.stubGlobal('fetch', fetchMock)
    const result = useUpstreamHealth(() => 'u1')
    await flushPromises()
    await result.refresh()

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
