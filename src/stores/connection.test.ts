import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useConnectionStore } from './connection'
import { KongAdminApiError } from '../lib/kongAdmin/http'
import { ReadOnlyError } from '../lib/kongAdmin/entities'

const conn = { baseUrl: 'http://localhost:8001' }

function rootResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body, text: async () => '' }
}

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useConnectionStore', () => {
  it('connects to a database-backed Kong and allows writes', async () => {
    const f = vi
      .fn()
      .mockResolvedValue(rootResponse({ version: '3.4.1', configuration: { database: 'postgres' } }))
    vi.stubGlobal('fetch', f)
    const store = useConnectionStore()

    await store.connect(conn)

    expect(f.mock.calls[0][0]).toBe('http://localhost:8001/')
    expect(store.isConnected).toBe(true)
    expect(store.canWrite).toBe(true)
    expect(store.info).toEqual({ version: '3.4.1', database: 'postgres' })
  })

  it('remembers which plugins the node has installed, sorted by name', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        rootResponse({
          version: '3.5.0',
          configuration: { database: 'postgres' },
          plugins: { available_on_server: { 'rate-limiting': {}, cors: {}, 'key-auth': {} } },
        }),
      ),
    )
    const store = useConnectionStore()
    await store.connect(conn)

    expect(store.availablePlugins).toEqual(['cors', 'key-auth', 'rate-limiting'])
  })

  it('has no installed plugins listed when Kong does not report any, and forgets them on disconnect', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(rootResponse({ version: '3.5.0' })))
    const store = useConnectionStore()
    await store.connect(conn)
    expect(store.availablePlugins).toEqual([])

    store.$patch({ availablePlugins: ['cors'] })
    store.disconnect()
    expect(store.availablePlugins).toEqual([])
  })

  it('renames the open connection, trimming the name, and clears it when the name is empty', () => {
    const store = useConnectionStore()
    store.$patch({ active: { baseUrl: 'http://kong:8001', name: 'Old' }, info: { version: '3.5.0', database: 'postgres' } })

    store.rename('  Kong Prod  ')
    expect(store.active?.name).toBe('Kong Prod')

    store.rename('   ')
    expect(store.active?.name).toBeUndefined()
  })

  it('keeps the rest of the connection when renaming, and ignores a rename with no connection', () => {
    const store = useConnectionStore()
    expect(() => store.rename('x')).not.toThrow()
    expect(store.active).toBeNull()

    store.$patch({ active: { baseUrl: 'http://kong:8001', auth: { username: 'kong' } }, info: { version: '3.5.0', database: 'postgres' } })
    store.rename('Named')
    expect(store.active).toEqual({ baseUrl: 'http://kong:8001', auth: { username: 'kong' }, name: 'Named' })
  })

  it('treats DB-less Kong as connected but read-only, and blocks writes before any request', async () => {
    const f = vi.fn().mockResolvedValue(rootResponse({ version: '3.4.1', configuration: { database: 'off' } }))
    vi.stubGlobal('fetch', f)
    const store = useConnectionStore()
    await store.connect(conn)

    expect(store.isConnected).toBe(true)
    expect(store.canWrite).toBe(false)
    await expect(store.client('services').create({ name: 'a' })).rejects.toBeInstanceOf(ReadOnlyError)
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('does not crash when GET / has no configuration block; database is unknown and writes stay allowed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(rootResponse({ version: '2.8.1' })))
    const store = useConnectionStore()

    await store.connect(conn)

    expect(store.info).toEqual({ version: '2.8.1', database: 'unknown' })
    expect(store.canWrite).toBe(true)
  })

  it('keeps the previous connection when a later connect fails, and rethrows the error', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(rootResponse({ version: '3.4.1', configuration: { database: 'postgres' } }))
      .mockRejectedValueOnce(new Error('connection refused'))
    vi.stubGlobal('fetch', f)
    const store = useConnectionStore()
    await store.connect(conn)

    await expect(store.connect({ baseUrl: 'http://other:8001' })).rejects.toBeInstanceOf(KongAdminApiError)

    expect(store.active).toEqual(conn)
    expect(store.info?.database).toBe('postgres')
  })

  it('leaves the store disconnected when the very first connect fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')))
    const store = useConnectionStore()

    await expect(store.connect(conn)).rejects.toThrow('connection refused')

    expect(store.isConnected).toBe(false)
    expect(store.canWrite).toBe(false)
  })

  it('disconnect clears the connection and info', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(rootResponse({ version: '3.4.1', configuration: { database: 'postgres' } })),
    )
    const store = useConnectionStore()
    await store.connect(conn)

    store.disconnect()

    expect(store.isConnected).toBe(false)
    expect(store.info).toBeNull()
  })

  it('client() throws when not connected, and otherwise targets the active connection', async () => {
    const store = useConnectionStore()
    expect(() => store.client('services')).toThrow(/not connected/i)

    const f = vi
      .fn()
      .mockResolvedValueOnce(rootResponse({ version: '3.4.1', configuration: { database: 'postgres' } }))
      .mockResolvedValueOnce(rootResponse({ data: [] }))
    vi.stubGlobal('fetch', f)
    await store.connect({ baseUrl: 'http://kong.internal:8001', auth: { token: 'abc' } })

    await store.client('services').list()

    expect(f.mock.calls[1][0]).toBe('http://kong.internal:8001/services')
    const headers = (f.mock.calls[1][1] as RequestInit).headers as Record<string, string>
    expect(headers['Kong-Admin-Token']).toBe('abc')
  })
})
