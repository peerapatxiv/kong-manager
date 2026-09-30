import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  createEntityClient,
  guardWrites,
  ReadOnlyError,
  ENTITY_RESOURCES,
  type EntityResourceName,
} from './entities'

const conn = { baseUrl: 'http://localhost:8001' }

function mockFetch(body: unknown = {}) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => '',
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const urlOf = (f: ReturnType<typeof vi.fn>, i = 0) => f.mock.calls[i][0] as string
const initOf = (f: ReturnType<typeof vi.fn>, i = 0) => f.mock.calls[i][1] as RequestInit

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createEntityClient', () => {
  it('lists with size, offset and comma-joined tags, and returns the next offset', async () => {
    const f = mockFetch({ data: [{ id: '1' }], offset: 'abc' })

    const page = await createEntityClient(conn, 'services').list({ size: 5, offset: 'xyz', tags: ['a', 'b'] })

    expect(urlOf(f)).toBe('http://localhost:8001/services?size=5&offset=xyz&tags=a%2Cb')
    expect(initOf(f).method).toBe('GET')
    expect(page).toEqual({ data: [{ id: '1' }], next: 'abc' })
  })

  it('sends no tags parameter for an empty tags array, and next is null on the last page', async () => {
    const f = mockFetch({ data: [], next: null })

    const page = await createEntityClient(conn, 'routes').list({ tags: [] })

    expect(urlOf(f)).toBe('http://localhost:8001/routes')
    expect(page).toEqual({ data: [], next: null })
  })

  it('listAll follows the offset across pages until Kong stops returning one', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: [{ id: '1' }], offset: 'o1' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: [{ id: '2' }], offset: 'o2' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: [{ id: '3' }] }) })
    vi.stubGlobal('fetch', f)

    const all = await createEntityClient(conn, 'consumers').listAll({ size: 1 })

    expect(all).toEqual([{ id: '1' }, { id: '2' }, { id: '3' }])
    expect(f).toHaveBeenCalledTimes(3)
    expect(urlOf(f, 0)).toBe('http://localhost:8001/consumers?size=1')
    expect(urlOf(f, 1)).toBe('http://localhost:8001/consumers?size=1&offset=o1')
    expect(urlOf(f, 2)).toBe('http://localhost:8001/consumers?size=1&offset=o2')
  })

  it('URL-encodes ids and names so they cannot break the path', async () => {
    const f = mockFetch({})

    await createEntityClient(conn, 'services').get('my svc/1%')

    expect(urlOf(f)).toBe('http://localhost:8001/services/my%20svc%2F1%25')
  })

  it('create POSTs, update PATCHes and upsert PUTs, each with a JSON body', async () => {
    const f = mockFetch({})
    const client = createEntityClient(conn, 'services')

    await client.create({ name: 'a' })
    await client.update('a', { host: 'h' })
    await client.upsert('a', { name: 'a', host: 'h' })

    expect(initOf(f, 0).method).toBe('POST')
    expect(urlOf(f, 0)).toBe('http://localhost:8001/services')
    expect(JSON.parse(initOf(f, 0).body as string)).toEqual({ name: 'a' })
    expect(initOf(f, 1).method).toBe('PATCH')
    expect(urlOf(f, 1)).toBe('http://localhost:8001/services/a')
    expect(initOf(f, 2).method).toBe('PUT')
    expect(urlOf(f, 2)).toBe('http://localhost:8001/services/a')
  })

  it('remove DELETEs and resolves on a 204 with no body to parse', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, status: 204, text: async () => '' })
    vi.stubGlobal('fetch', f)

    await expect(createEntityClient(conn, 'plugins').remove('p1')).resolves.toBeUndefined()

    expect(initOf(f).method).toBe('DELETE')
    expect(urlOf(f)).toBe('http://localhost:8001/plugins/p1')
  })

  it('builds nested paths from the parent id, encoded', async () => {
    const f = mockFetch({ data: [] })

    await createEntityClient(conn, 'targets', 'up 1').list()

    expect(urlOf(f)).toBe('http://localhost:8001/upstreams/up%201/targets')
  })

  it('throws at creation when a nested resource has no parent id', () => {
    expect(() => createEntityClient(conn, 'targets')).toThrow(/parentId/)
  })
})

describe('ENTITY_RESOURCES', () => {
  it('has all nine collections, each with a defaults object free of "__none__" sentinels', () => {
    const names = Object.keys(ENTITY_RESOURCES).sort()
    expect(names).toEqual(
      ['ca_certificates', 'certificates', 'consumers', 'plugins', 'routes', 'services', 'snis', 'targets', 'upstreams'].sort(),
    )
    for (const name of names as EntityResourceName[]) {
      expect(typeof ENTITY_RESOURCES[name].defaults).toBe('object')
      expect(JSON.stringify(ENTITY_RESOURCES[name].defaults)).not.toContain('__none__')
    }
  })

  it('ports Primate defaults: service retries 5, target weight 100, route https redirect 426', () => {
    expect(ENTITY_RESOURCES.services.defaults).toMatchObject({ retries: 5, protocol: 'http', port: 80 })
    expect(ENTITY_RESOURCES.targets.defaults).toMatchObject({ target: '', weight: 100 })
    expect(ENTITY_RESOURCES.routes.defaults).toMatchObject({ https_redirect_status_code: 426, strip_path: true })
    expect(ENTITY_RESOURCES.targets.nested).toBe(true)
    expect(ENTITY_RESOURCES.services.nested).toBe(false)
  })
})

describe('guardWrites', () => {
  it('rejects every write with ReadOnlyError and sends no request, but still allows reads', async () => {
    const f = mockFetch({ data: [], id: '1' })
    const guarded = guardWrites(createEntityClient(conn, 'services'), () => false)

    await expect(guarded.create({ name: 'a' })).rejects.toBeInstanceOf(ReadOnlyError)
    await expect(guarded.update('a', {})).rejects.toBeInstanceOf(ReadOnlyError)
    await expect(guarded.upsert('a', {})).rejects.toBeInstanceOf(ReadOnlyError)
    await expect(guarded.remove('a')).rejects.toBeInstanceOf(ReadOnlyError)
    expect(f).not.toHaveBeenCalled()

    await guarded.list()
    await guarded.get('a')
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('reads canWrite lazily, at call time', async () => {
    const f = mockFetch({})
    let writable = false
    const guarded = guardWrites(createEntityClient(conn, 'services'), () => writable)

    await expect(guarded.create({ name: 'a' })).rejects.toBeInstanceOf(ReadOnlyError)
    writable = true
    await guarded.create({ name: 'a' })

    expect(f).toHaveBeenCalledTimes(1)
  })
})
