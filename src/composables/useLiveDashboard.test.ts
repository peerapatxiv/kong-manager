import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useLiveDashboard } from './useLiveDashboard'
import { useConnectionStore } from '../stores/connection'

const json = (body: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
  headers: new Headers(),
})

type Handler = (url: URL) => ReturnType<typeof json> | Promise<ReturnType<typeof json>>

function stubKong(handler: Handler) {
  const calls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input)
      calls.push(url.pathname + url.search)
      return handler(url)
    }),
  )
  return calls
}

const DATA: Record<string, unknown[]> = {
  '/services': [{ id: 's1', enabled: true }, { id: 's2', enabled: false }],
  '/routes': [{ id: 'r1', protocols: ['https'] }],
  '/consumers': [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }],
  '/plugins': [{ id: 'p1', name: 'cors' }],
}

function ok(url: URL) {
  if (url.pathname === '/status') return json({ database: { reachable: true }, server: { total_requests: 10, connections_active: 2 } })
  return json({ data: DATA[url.pathname] ?? [], offset: null })
}

beforeEach(() => {
  setActivePinia(createPinia())
  useConnectionStore().$patch({ active: { baseUrl: 'http://kong:8001' }, info: { version: '3.5.0', database: 'postgres' } })
})
afterEach(() => vi.unstubAllGlobals())

describe('useLiveDashboard', () => {
  it('loads the four lists and the node status', async () => {
    stubKong(ok)
    const dash = useLiveDashboard()
    await dash.refresh()

    expect(dash.services.value.data).toHaveLength(2)
    expect(dash.routes.value.data).toHaveLength(1)
    expect(dash.consumers.value.data).toHaveLength(3)
    expect(dash.plugins.value.data).toHaveLength(1)
    expect(dash.node.value.data).toEqual({ databaseReachable: true, totalRequests: 10, activeConnections: 2 })
    expect(dash.updatedAt.value).toBeInstanceOf(Date)
    expect(dash.loading.value).toBe(false)
  })

  it('asks for large pages and follows the offset until the list ends', async () => {
    const calls = stubKong((url) => {
      if (url.pathname === '/services') {
        return url.searchParams.get('offset')
          ? json({ data: [{ id: 's3' }], offset: null })
          : json({ data: [{ id: 's1' }, { id: 's2' }], offset: 'next-page' })
      }
      return ok(url)
    })
    const dash = useLiveDashboard()
    await dash.refresh()

    expect(dash.services.value.data).toHaveLength(3)
    expect(calls.filter((c) => c.startsWith('/services')).every((c) => c.includes('size=1000'))).toBe(true)
  })

  it('keeps one list\'s failure to its own section', async () => {
    stubKong((url) => (url.pathname === '/plugins' ? json({ message: 'boom' }, 500) : ok(url)))
    const dash = useLiveDashboard()
    await dash.refresh()

    expect(dash.plugins.value.error).toContain('boom')
    expect(dash.plugins.value.data).toBeNull()
    expect(dash.services.value.error).toBeNull()
    expect(dash.services.value.data).toHaveLength(2)
  })

  it('leaves the node empty, without breaking anything, when /status is unavailable', async () => {
    stubKong((url) => (url.pathname === '/status' ? json({ message: 'forbidden' }, 403) : ok(url)))
    const dash = useLiveDashboard()
    await dash.refresh()

    expect(dash.node.value.data).toBeNull()
    expect(dash.routes.value.data).toHaveLength(1)
  })

  it('shows loading while requests are in flight', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    stubKong(async (url) => {
      await gate
      return ok(url)
    })
    const dash = useLiveDashboard()
    const pending = dash.refresh()
    expect(dash.loading.value).toBe(true)
    expect(dash.services.value.loading).toBe(true)
    release()
    await pending
    expect(dash.loading.value).toBe(false)
  })

  it('ignores a slow earlier refresh once a newer one has finished', async () => {
    let call = 0
    const slow = { release: () => {} }
    stubKong(async (url) => {
      if (url.pathname === '/consumers') {
        call += 1
        if (call === 1) {
          await new Promise<void>((r) => (slow.release = r))
          return json({ data: [{ id: 'old' }], offset: null })
        }
        return json({ data: [{ id: 'new-1' }, { id: 'new-2' }], offset: null })
      }
      return ok(url)
    })
    const dash = useLiveDashboard()
    const first = dash.refresh()
    await dash.refresh()
    slow.release()
    await first

    expect(dash.consumers.value.data).toHaveLength(2)
  })

  it('does not throw when there is no connection, and reports it per section', async () => {
    useConnectionStore().disconnect()
    stubKong(ok)
    const dash = useLiveDashboard()
    await expect(dash.refresh()).resolves.toBeUndefined()
    expect(dash.services.value.error).toContain('Not connected')
  })
})
