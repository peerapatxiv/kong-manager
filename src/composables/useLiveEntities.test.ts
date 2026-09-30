import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useLiveEntities, toLiveError } from './useLiveEntities'
import { useConnectionStore } from '../stores/connection'
import { KongAdminApiError } from '../lib/kongAdmin/http'
import { ReadOnlyError } from '../lib/kongAdmin/entities'

function connect(database = 'postgres') {
  const store = useConnectionStore()
  store.$patch({ active: { baseUrl: 'http://kong:8001' }, info: { version: '3.4.0', database } })
}

const json = (body: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('toLiveError', () => {
  it('prefers the Kong message and keeps field errors', () => {
    const err = new KongAdminApiError('Kong Admin API responded 400: ...', {
      status: 400,
      kind: 'validation',
      kongMessage: 'schema violation',
      fields: { host: 'required field missing' },
    })
    expect(toLiveError(err)).toEqual({ message: 'schema violation', fields: { host: 'required field missing' } })
  })

  it('falls back to the error message, and stringifies non-errors', () => {
    expect(toLiveError(new KongAdminApiError('boom'))).toEqual({ message: 'boom' })
    expect(toLiveError(new Error('plain'))).toEqual({ message: 'plain' })
    expect(toLiveError('oops')).toEqual({ message: 'oops' })
  })
})

describe('useLiveEntities', () => {
  it('load() fetches the first page with the tag filter and stores items and next', async () => {
    connect()
    const f = vi.fn().mockResolvedValue(json({ data: [{ id: '1' }], offset: 'o1' }))
    vi.stubGlobal('fetch', f)
    const live = useLiveEntities('services')
    live.tagFilter.value = ['a', 'b']

    await live.load()

    expect(f.mock.calls[0][0]).toBe('http://kong:8001/services?tags=a%2Cb')
    expect(live.items.value).toEqual([{ id: '1' }])
    expect(live.next.value).toBe('o1')
    expect(live.loading.value).toBe(false)
    expect(live.error.value).toBeNull()
  })

  it('loadMore() appends the next page and stops once there is no next offset', async () => {
    connect()
    const f = vi
      .fn()
      .mockResolvedValueOnce(json({ data: [{ id: '1' }], offset: 'o1' }))
      .mockResolvedValueOnce(json({ data: [{ id: '2' }] }))
    vi.stubGlobal('fetch', f)
    const live = useLiveEntities('services')

    await live.load()
    await live.loadMore()
    await live.loadMore()

    expect(f).toHaveBeenCalledTimes(2)
    expect(f.mock.calls[1][0]).toBe('http://kong:8001/services?offset=o1')
    expect(live.items.value.map((i) => i.id)).toEqual(['1', '2'])
    expect(live.next.value).toBeNull()
  })

  it('does not fetch twice when loadMore() is called again while a page is in flight', async () => {
    connect()
    const second = deferred<ReturnType<typeof json>>()
    const f = vi
      .fn()
      .mockResolvedValueOnce(json({ data: [{ id: '1' }], offset: 'o1' }))
      .mockReturnValueOnce(second.promise)
    vi.stubGlobal('fetch', f)
    const live = useLiveEntities('services')
    await live.load()

    const first = live.loadMore()
    const duplicate = live.loadMore()
    second.resolve(json({ data: [{ id: '2' }] }))
    await Promise.all([first, duplicate])

    expect(f).toHaveBeenCalledTimes(2)
    expect(live.items.value.map((i) => i.id)).toEqual(['1', '2'])
  })

  it('ignores a stale response when load() is started again', async () => {
    connect()
    const slow = deferred<ReturnType<typeof json>>()
    const f = vi
      .fn()
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce(json({ data: [{ id: 'fresh' }] }))
    vi.stubGlobal('fetch', f)
    const live = useLiveEntities('services')

    const stale = live.load()
    await live.load()
    slow.resolve(json({ data: [{ id: 'stale' }], offset: 'old' }))
    await stale

    expect(live.items.value).toEqual([{ id: 'fresh' }])
    expect(live.next.value).toBeNull()
    expect(live.loading.value).toBe(false)
  })

  it('create() inserts at the front, save() replaces by id, remove() deletes', async () => {
    connect()
    const f = vi
      .fn()
      .mockResolvedValueOnce(json({ data: [{ id: '1', name: 'a' }] }))
      .mockResolvedValueOnce(json({ id: '2', name: 'b' }, 201))
      .mockResolvedValueOnce(json({ id: '1', name: 'a2' }))
      .mockResolvedValueOnce({ ok: true, status: 204, text: async () => '' })
    vi.stubGlobal('fetch', f)
    const live = useLiveEntities('services')
    await live.load()

    await live.create({ name: 'b' })
    expect(live.items.value.map((i) => i.id)).toEqual(['2', '1'])
    expect(f.mock.calls[1][1]).toMatchObject({ method: 'POST' })

    await live.save('1', { name: 'a2' })
    expect(live.items.value.find((i) => i.id === '1')?.name).toBe('a2')
    expect(f.mock.calls[2][0]).toBe('http://kong:8001/services/1')
    expect(f.mock.calls[2][1]).toMatchObject({ method: 'PATCH' })

    await live.remove('2')
    expect(live.items.value.map((i) => i.id)).toEqual(['1'])
    expect(f.mock.calls[3][1]).toMatchObject({ method: 'DELETE' })
  })

  it('toggleEnabled() PATCHes only the enabled flag', async () => {
    connect()
    const f = vi
      .fn()
      .mockResolvedValueOnce(json({ data: [{ id: '1', enabled: true }] }))
      .mockResolvedValueOnce(json({ id: '1', enabled: false }))
    vi.stubGlobal('fetch', f)
    const live = useLiveEntities('services')
    await live.load()

    await live.toggleEnabled('1', false)

    expect(JSON.parse(f.mock.calls[1][1].body as string)).toEqual({ enabled: false })
    expect(live.items.value[0].enabled).toBe(false)
  })

  it('stores a Kong error with its fields and rethrows from write actions', async () => {
    connect()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () =>
          JSON.stringify({ message: 'schema violation', fields: { host: 'required field missing' } }),
      }),
    )
    const live = useLiveEntities('services')

    await expect(live.create({ name: 'x' })).rejects.toBeInstanceOf(KongAdminApiError)

    expect(live.error.value).toEqual({ message: 'schema violation', fields: { host: 'required field missing' } })
    expect(live.items.value).toEqual([])
  })

  it('reports read-only as an error on DB-less Kong without sending the write', async () => {
    connect('off')
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    const live = useLiveEntities('services')

    await expect(live.create({ name: 'x' })).rejects.toBeInstanceOf(ReadOnlyError)

    expect(live.error.value?.message).toMatch(/read-only/i)
    expect(f).not.toHaveBeenCalled()
  })

  it('load() records an error instead of throwing when not connected', async () => {
    const live = useLiveEntities('services')

    await live.load()

    expect(live.error.value?.message).toMatch(/not connected/i)
    expect(live.loading.value).toBe(false)
  })

  it('passes the parent id (plain or getter) to nested resources', async () => {
    connect()
    const f = vi.fn().mockResolvedValue(json({ data: [] }))
    vi.stubGlobal('fetch', f)
    let parent: string | undefined = 'u1'

    await useLiveEntities('targets', { parentId: 'u0' }).load()
    await useLiveEntities('targets', { parentId: () => parent }).load()
    parent = 'u2'
    await useLiveEntities('targets', { parentId: () => parent }).load()

    expect(f.mock.calls.map((c) => c[0])).toEqual([
      'http://kong:8001/upstreams/u0/targets',
      'http://kong:8001/upstreams/u1/targets',
      'http://kong:8001/upstreams/u2/targets',
    ])
  })

  it('listVia lists through another resource while writes keep using the plain one', async () => {
    connect()
    const f = vi
      .fn()
      .mockResolvedValueOnce(json({ data: [{ id: 'r1' }] }))
      .mockResolvedValueOnce(json({ id: 'r1', name: 'x' }))
    vi.stubGlobal('fetch', f)
    const live = useLiveEntities('routes', {
      listVia: () => ({ resource: 'service_routes', parentId: 'svc 1' }),
    })

    await live.load()
    await live.save('r1', { name: 'x' })

    expect(f.mock.calls[0][0]).toBe('http://kong:8001/services/svc%201/routes')
    expect(f.mock.calls[1][0]).toBe('http://kong:8001/routes/r1')
  })
})
